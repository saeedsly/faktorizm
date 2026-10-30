import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { processFile } from '../lib/ocr/pipeline';
import type { ProcessOptions, ProcessResult } from '../lib/ocr/pipeline';
import { requestAiConsent } from '../lib/ocr/aiConsent';
import { getSettings, db } from '../lib/db';
import { logActivity } from '../lib/activity';
import { uid } from '../lib/utils';
import { payableOf } from '../lib/invoices';
import { learnFromInvoice, getVendor, toVendorHint } from '../lib/vendors';
import { logAudit } from '../lib/invoices/workflow';
import { findDuplicates } from '../lib/ocr/fingerprint';
import type { OcrJob, Invoice } from '../lib/types';

export interface EnqueueOptions {
  priority?: number;
  category?: string;
  costCenter?: string;
}

interface QueueItem {
  id: string;
  file: File;
  jobId: string;
  priority: number;
  options: EnqueueOptions;
}

export interface QueueStats {
  total: number;
  done: number;
  failed: number;
  active: number;
  queued: number;
  avgSeconds: number;
  remainingSeconds: number;
}

const JOB_STORE_LIMIT = 40;

export function useOcrQueue() {
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [paused, setPaused] = useState(false);
  const running = useRef(false);
  const queue = useRef<QueueItem[]>([]);
  const files = useRef(new Map<string, File>());
  const pausedRef = useRef(false);

  const patch = useCallback((id: string, p: Partial<OcrJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }, []);

  /** بازیابی صف ذخیره‌شده پس از بستن مرورگر */
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = await db.queue.orderBy('addedAt').toArray();
        if (!alive || !saved.length) return;
        const restoredFiles = saved.map((row) => {
          const file = new File([row.data], row.name, { type: row.type });
          files.current.set(row.id, file);
          return { row, file };
        });
        const newJobs: OcrJob[] = restoredFiles.map(({ row }) => ({
          id: uid('job_'),
          fileName: row.name,
          fileType: row.type,
          size: row.size,
          thumbnail: '',
          status: 'queued',
          progress: 0,
          message: 'بازیابی‌شده از صف قبلی',
          priority: row.priority,
        }));
        setJobs((prev) => [...newJobs, ...prev].slice(0, JOB_STORE_LIMIT));
        queue.current.push(...restoredFiles.map(({ row, file }, i) => ({
          id: row.id, file, jobId: newJobs[i].id, priority: row.priority, options: {} as EnqueueOptions,
        })));
        await db.queue.clear();
        void tick();
      } catch {
        /* صف قبلی قابل بازیابی نبود */
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tick = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        if (pausedRef.current) break;
        const item = queue.current.shift()!;
        const { file, jobId } = item;
        const t0 = Date.now();
        patch(jobId, { status: 'preparing', message: 'شروع پردازش', startedAt: t0, stages: [] });
        try {
          const settings = await getSettings();
          const vendor = await getVendor(await guessIssuer(file));
          const processOptions: ProcessOptions = {
            hint: toVendorHint(vendor),
            category: item.options.category,
            costCenter: item.options.costCenter || vendor?.costCenter,
            onAiConsent: ({ fileName, providerLabel }) =>
              requestAiConsent({ fileName, providerLabel, filesCount: 1 }),
          };
          const result: ProcessResult = await processFile(file, settings, (stage, progress) => {
            const status = progress > 0.5 ? 'recognizing' : 'preparing';
            patch(jobId, { status, progress, message: stage });
            patch(jobId, { stages: [{ stage, at: Date.now() }] });
          }, processOptions);

          await saveResult(result, file, jobId);
        } catch (err) {
          patch(jobId, {
            status: 'error', message: err instanceof Error ? err.message : 'خطای ناشناخته',
            finishedAt: Date.now(),
          });
          logActivity('خطای پردازش سند', 'system', `سند «${file.name}»: ${String(err)}`);
        } finally {
          files.current.delete(item.id);
          await db.queue.delete(item.id).catch(() => undefined);
        }
      }
    } finally {
      running.current = false;
    }
  }, [patch]);

  const saveResult = useCallback(async (result: ProcessResult, file: File, jobId: string) => {
    const invoice = result.invoice;
    await db.invoices.put(invoice);
    await logAudit(invoice.id, 'سند اسکن و خوانده شد', {
      note: `اطمینان ${result.confidence}٪ — ${result.source === 'hybrid' ? 'ترکیبی' : 'محلی'}`,
    });
    await learnFromInvoice(invoice, result.invoice.ocrWarnings ? [] : []);
    logActivity('اسکن و استخراج فاکتور', 'invoice',
      `سند «${file.name}» با اطمینان ${result.confidence}٪ خوانده شد`, invoice.id);

    // تشخیص تکراری در برابر اسناد موجود
    const existing = await db.invoices.filter((row) => !row.deletedAt && row.id !== invoice.id).toArray();
    const dupes = findDuplicates([
      ...existing.map((row) => ({
        id: row.id, number: row.number, issuerName: row.issuerName,
        date: row.date, total: payableOf(row),
      })),
      { id: invoice.id, number: invoice.number, issuerName: invoice.issuerName, date: invoice.date, total: payableOf(invoice) },
    ]).filter((pair) => pair.a.id === invoice.id || pair.b.id === invoice.id);

    const duplicateOf = dupes.length
      ? existing.find((row) => row.id === (dupes[0].a.id === invoice.id ? dupes[0].b.id : dupes[0].a.id))
      : undefined;
    if (duplicateOf) {
      invoice.ocrWarnings = [...(invoice.ocrWarnings ?? []),
        `این سند شبیه سند «${duplicateOf.number}» (${duplicateOf.issuerName}) است: ${dupes[0].reason}.`];
      await db.invoices.put(invoice);
    }

    patch(jobId, {
      status: 'done', progress: 100,
      message: result.fromCache
        ? 'از حافظه محلی بازیابی شد'
        : result.source === 'hybrid' ? 'با موتور ابری و محلی خوانده شد' : 'با موفقیت استخراج شد',
      invoice, thumbnail: result.preview || result.meta.thumbnail,
      finishedAt: Date.now(), source: result.source,
    });

    // اسناد چندگانه: بقیه اسناد هم به عنوان پیش‌نویس ذخیره می‌شوند
    if (result.documents && result.documents.length > 1) {
      const extras = result.documents.slice(1).map((doc) => doc.invoice);
      for (const extra of extras) {
        await db.invoices.put({ ...extra, status: 'draft', note: 'از فایل چندسندی استخراج شد' });
      }
      patch(jobId, {
        message: `${result.documents.length} سند از این فایل جدا شد`,
      });
    }
  }, [patch]);

  const enqueue = useCallback((incoming: File[], options: EnqueueOptions = {}) => {
    const newJobs: OcrJob[] = incoming.map((file) => ({
      id: uid('job_'),
      fileName: file.name,
      fileType: file.type,
      size: file.size,
      thumbnail: '',
      status: 'queued',
      progress: 0,
      message: options.priority ? 'در صف (با اولویت)' : 'در صف پردازش',
      priority: options.priority ?? 0,
    }));
    setJobs((prev) => [...newJobs, ...prev].slice(0, JOB_STORE_LIMIT));
    incoming.forEach((file, i) => {
      const id = uid('qf_');
      files.current.set(id, file);
      queue.current.push({
        id, file, jobId: newJobs[i].id,
        priority: options.priority ?? 0,
        options,
      });
      // ذخیره در IndexedDB تا بستن مرورگر صف را از بین نبرد
      void db.queue.put({
        id, name: file.name, type: file.type, size: file.size,
        priority: options.priority ?? 0, addedAt: new Date().toISOString(),
        data: file,
      }).catch(() => undefined);
    });
    // مرتب‌سازی بر اساس اولویت (بیشتر زودتر)
    queue.current.sort((a, b) => b.priority - a.priority);
    void tick();
  }, [tick]);

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((j) => !['done', 'error'].includes(j.status)));
  }, []);

  /** فایل اصلی را نگه داشته‌ایم؛ پس تلاش دوباره واقعاً ممکن است */
  const retryJob = useCallback((job: OcrJob) => {
    const entry = Array.from(files.current.entries()).find(([, f]) => f.name === job.fileName);
    if (!entry) {
      setJobs((prev) => prev.map((j) => (j.id === job.id
        ? { ...j, message: 'فایل اصلی در دسترس نیست؛ دوباره آپلود کنید' }
        : j)));
      return;
    }
    patch(job.id, { status: 'queued', progress: 0, message: 'در انتظار تلاش دوباره', error: undefined });
    queue.current.unshift({ id: entry[0], file: entry[1], jobId: job.id, priority: 99, options: {} });
    void tick();
  }, [patch, tick]);

  const cancelJob = useCallback((id: string) => {
    queue.current = queue.current.filter((q) => q.jobId !== id);
    setJobs((prev) => prev.map((j) => (j.id === id
      ? { ...j, status: 'error', message: 'پردازش لغو شد', finishedAt: Date.now() }
      : j)));
  }, []);

  /** تغییر اولویت یک کار در صف */
  const reprioritize = useCallback((id: string, priority: number) => {
    const item = queue.current.find((q) => q.jobId === id);
    if (item) item.priority = priority;
    queue.current.sort((a, b) => b.priority - a.priority);
    patch(id, { priority, message: priority > 0 ? 'در صف (با اولویت)' : 'در صف پردازش' });
  }, [patch]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    void tick();
  }, [tick]);

  const getInvoice = useCallback((id: string): Invoice | undefined =>
    jobs.find((j) => j.id === id)?.invoice, [jobs]);

  const stats: QueueStats = useMemo(() => {
    const done = jobs.filter((j) => j.status === 'done');
    const durations = done
      .filter((j) => j.startedAt && j.finishedAt)
      .map((j) => (j.finishedAt! - j.startedAt!) / 1000);
    const avgSeconds = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const queued = jobs.filter((j) => ['queued', 'preparing', 'recognizing'].includes(j.status)).length;
    return {
      total: jobs.length,
      done: done.length,
      failed: jobs.filter((j) => j.status === 'error').length,
      active: jobs.filter((j) => ['preparing', 'recognizing'].includes(j.status)).length,
      queued,
      avgSeconds,
      remainingSeconds: queued * avgSeconds,
    };
  }, [jobs]);

  return {
    jobs, enqueue, removeJob, clearFinished, retryJob, cancelJob,
    reprioritize, pause, resume, paused, getInvoice, stats,
  };
}

/** نام فروشنده را از نام فایل حدس می‌زند تا دانش فروشنده زودتر اعمال شود */
async function guessIssuer(file: File): Promise<string> {
  const base = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  if (base.length < 3) return '';
  return base;
}
