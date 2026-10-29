import { useCallback, useRef, useState } from 'react';
import { processFile } from '../lib/ocr/pipeline';
import type { ProcessOptions } from '../lib/ocr/pipeline';
import { requestAiConsent } from '../lib/ocr/aiConsent';
import { getSettings } from '../lib/db';
import { db } from '../lib/db';
import { logActivity } from '../lib/activity';
import { uid } from '../lib/utils';
import type { OcrJob, Invoice } from '../lib/types';

export function useOcrQueue() {
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const running = useRef(false);
  const queue = useRef<{ file: File; jobId: string }[]>([]);

  const patch = (id: string, p: Partial<OcrJob>) =>
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const enqueue = useCallback((files: File[]) => {
    const newJobs: OcrJob[] = files.map((file) => ({
      id: uid('job_'),
      fileName: file.name,
      fileType: file.type,
      size: file.size,
      thumbnail: '',
      status: 'queued',
      progress: 0,
      message: 'در صف پردازش',
    }));
    setJobs((prev) => [...newJobs, ...prev]);
    queue.current.push(...files.map((file, i) => ({ file, jobId: newJobs[i].id })));
    void tick();
  }, []);

  const tick = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const { file, jobId } = queue.current.shift()!;
        patch(jobId, { status: 'preparing', message: 'شروع پردازش', startedAt: Date.now() });
        try {
          const settings = await getSettings();
          const processOptions: ProcessOptions = {
            onAiConsent: ({ fileName, providerLabel }) =>
              requestAiConsent({ fileName, providerLabel, filesCount: 1 }),
          };
          const result = await processFile(file, settings, (stage, progress) => {
            patch(jobId,
              progress > 0.5 ? { status: 'recognizing', progress, message: stage }
                : { status: 'preparing', progress, message: stage });
          }, processOptions);
          await db.invoices.put(result.invoice);
          logActivity('اسکن و استخراج فاکتور', 'invoice',
            `سند «${file.name}» با اطمینان ${result.confidence}٪ خوانده شد`, result.invoice.id);
          patch(jobId, {
            status: 'done', progress: 100,
            message: result.source === 'hybrid' ? 'با موتور ابری و محلی خوانده شد' : 'با موفقیت استخراج شد',
            invoice: result.invoice, thumbnail: result.preview || result.meta.thumbnail, finishedAt: Date.now(),
          });
        } catch (err) {
          patch(jobId, {
            status: 'error', message: err instanceof Error ? err.message : 'خطای ناشناخته',
            finishedAt: Date.now(),
          });
          logActivity('خطای پردازش سند', 'system', `سند «${file.name}»: ${String(err)}`);
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  const removeJob = useCallback((id: string) => setJobs((prev) => prev.filter((j) => j.id !== id)), []);
  const clearFinished = useCallback(
    () => setJobs((prev) => prev.filter((j) => j.status === 'queued' || j.status === 'preparing' || j.status === 'recognizing')),
    [],
  );
  const retryJob = useCallback((job: OcrJob) => {
    // بازسازی فایل از روی سند ذخیره‌شده ممکن نیست؛ لیست را برای آپلود مجدد پاک می‌کند
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
  }, []);

  const getInvoice = (id: string): Invoice | undefined => jobs.find((j) => j.id === id)?.invoice;

  return { jobs, enqueue, removeJob, clearFinished, retryJob, getInvoice };
}
