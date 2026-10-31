import { useEffect, useState } from 'react';
import {
  Camera, AlertTriangle, CheckCircle2, Gauge, ScanLine, Sparkles, Trash2,
  ChevronUp, Pause, Play, RotateCcw, X, Clock, Layers, FileText, ArrowRight,
} from 'lucide-react';
import { Button, Card, CardTitle, Badge, Progress, EmptyState, ConfidenceBar } from '@/components/ui/primitives';
import { photoQuality, autoCropCanvas } from '@/lib/ocr/autocrop';
import type { PhotoQuality } from '@/lib/ocr/autocrop';
import { loadBitmap, bitmapToCanvas, makeThumbnail } from '@/lib/ocr/preprocess';
import { formatNumber, formatMoney, toFaDigits, cn } from '@/lib/utils';
import { payableOf } from '@/lib/invoices';
import type { OcrJob } from '@/lib/types';
import type { QueueStats } from '@/hooks/useOcrQueue';

/* ------------------------------------------------------- سنجش عکس ورودی */

export interface StagedFile {
  id: string;
  file: File;
  priority: boolean;
  quality?: PhotoQuality;
  thumbnail?: string;
  checking: boolean;
}

/** نشان وضعیت لایهٔ تأیید خوانش: سبز / نارنجی / قرمز */
const VERIFY_META: Record<string, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'تأییدشده', tone: 'bg-accent-soft text-accent', icon: CheckCircle2 },
  review: { label: 'بازبینی اختیاری', tone: 'bg-warning-soft text-warning', icon: AlertTriangle },
  unsafe: { label: 'قابل تأیید نیست', tone: 'bg-danger-soft text-danger', icon: AlertTriangle },
};

const QUALITY_META: Record<PhotoQuality['verdict'], { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  good: { label: 'کیفیت مناسب', tone: 'bg-accent-soft text-accent', icon: CheckCircle2 },
  fair: { label: 'قابل قبول', tone: 'bg-warning-soft text-warning', icon: AlertTriangle },
  poor: { label: 'کیفیت پایین', tone: 'bg-danger-soft text-danger', icon: AlertTriangle },
};

/** سنجش کیفیت و برش خودکار یک فایل تصویری (پیش از پردازش) */
export async function inspectImage(file: File): Promise<{ quality: PhotoQuality; thumbnail: string; cropped: boolean }> {
  const bitmap = await loadBitmap(file);
  const canvas = bitmapToCanvas(bitmap, 1400);
  bitmap.close?.();
  const cropped = autoCropCanvas(canvas);
  return {
    quality: photoQuality(canvas),
    thumbnail: makeThumbnail(cropped.canvas, 240),
    cropped: cropped.cropped,
  };
}

/* ------------------------------------------------------- سنجش کیفیت */

export function PhotoQualityCard({ quality }: { quality: PhotoQuality }) {
  const meta = QUALITY_META[quality.verdict];
  const Icon = meta.icon;
  return (
    <div className={cn('rounded-xl p-3.5 text-xs leading-6', meta.tone)}>
      <div className="flex items-center gap-2 font-bold mb-1">
        <Icon size={15} /> {meta.label}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 opacity-90 mb-1">
        <span>تیزی: {toFaDigits(quality.sharpness)}</span>
        <span>روشنایی: {toFaDigits(quality.brightness)}٪</span>
        <span>بازتاب: {toFaDigits(quality.glare)}٪</span>
      </div>
      {quality.hints.length > 0 && (
        <ul className="list-disc pr-4 space-y-0.5">
          {quality.hints.map((hint) => <li key={hint}>{hint}</li>)}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------- فایل‌های آماده */

export function StagedList({ items, onRemove, onTogglePriority, onStart, onInspectAll, busy }: {
  items: StagedFile[];
  onRemove: (id: string) => void;
  onTogglePriority: (id: string) => void;
  onStart: () => void;
  onInspectAll: () => void;
  busy?: boolean;
}) {
  const [preview, setPreview] = useState<StagedFile | null>(null);
  if (!items.length) return null;
  const poor = items.filter((i) => i.quality?.verdict === 'poor').length;

  return (
    <Card className="animate-slide-up">
      <CardTitle
        icon={<ScanLine size={18} />}
        title="فایل‌های آماده پردازش"
        sub={poor
          ? `${toFaDigits(poor)} فایل کیفیت پایین دارد؛ پیش از شروع، عکس بهتری بگیرید`
          : 'کیفیت عکس‌ها بررسی شد و آماده‌اند'}
        action={(
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onInspectAll}>
              <Sparkles size={14} /> بازبینی کیفیت
            </Button>
            <Button size="sm" onClick={onStart} loading={busy}>
              شروع پردازش {toFaDigits(items.length)} فایل
            </Button>
          </div>
        )}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => {
          const meta = item.quality ? QUALITY_META[item.quality.verdict] : null;
          return (
            <div key={item.id} className="rounded-xl border border-border bg-card p-2.5 flex gap-2.5">
              <button
                onClick={() => setPreview(item)}
                className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center"
                title="بزرگ‌نمایی"
              >
                {item.thumbnail
                  ? <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                  : <FileText size={20} className="text-muted-foreground" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate" title={item.file.name}>{item.file.name}</p>
                <p className="text-[11px] text-muted-foreground mb-1">
                  {(item.file.size / 1024 / 1024).toFixed(1)} مگابایت
                  {item.checking && ' · در حال بررسی…'}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {meta && <Badge className={cn('!text-[10px]', meta.tone)}>{meta.label}</Badge>}
                  <button
                    onClick={() => onTogglePriority(item.id)}
                    title="پردازش زودتر"
                    className={cn('chip !text-[10px] gap-1',
                      item.priority ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground')}
                  >
                    <ChevronUp size={11} /> {item.priority ? 'اولویت‌دار' : 'عادی'}
                  </button>
                  <button onClick={() => onRemove(item.id)} className="text-muted-foreground hover:text-danger" title="حذف">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative card max-w-3xl w-full p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-sm truncate">{preview.file.name}</p>
              <button onClick={() => setPreview(null)} className="icon-tile h-8 w-8"><X size={16} /></button>
            </div>
            {preview.thumbnail && <img src={preview.thumbnail} alt="" className="w-full rounded-xl" />}
            {preview.quality && <div className="mt-3"><PhotoQualityCard quality={preview.quality} /></div>}
          </div>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- صف پردازش */

export function QueuePanel({ jobs, stats, paused, onPause, onResume, onCancel, onRetry, onRemove, onBoost, onOpen, onClear }: {
  jobs: OcrJob[];
  stats: QueueStats;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: (id: string) => void;
  onRetry: (job: OcrJob) => void;
  onRemove: (id: string) => void;
  onBoost: (id: string) => void;
  onOpen: (job: OcrJob) => void;
  onClear: () => void;
}) {
  if (!jobs.length) {
    return (
      <EmptyState
        icon={<Layers size={26} />}
        title="صف پردازش خالی است"
        desc="فایل‌ها را از زبانه «اسکن» اضافه کنید تا اینجا مرحله‌به‌مرحله پیشرفتشان را ببینید."
      />
    );
  }

  const active = jobs.filter((j) => ['preparing', 'recognizing'].includes(j.status));

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Gauge size={17} className="text-primary" />
            {toFaDigits(stats.done)} از {toFaDigits(stats.total)} سند آماده
          </div>
          <Badge className="bg-primary-soft text-primary">
            در انتظار: {toFaDigits(stats.queued)}
          </Badge>
          {stats.failed > 0 && <Badge className="bg-danger-soft text-danger">خطا: {toFaDigits(stats.failed)}</Badge>}
          {stats.avgSeconds > 0 && (
            <Badge className="bg-muted text-muted-foreground">
              <Clock size={11} /> میانگین {toFaDigits(stats.avgSeconds)} ثانیه هر سند
            </Badge>
          )}
          {stats.remainingSeconds > 0 && (
            <Badge className="bg-info-soft text-info">
              تخمین پایان: {toFaDigits(Math.ceil(stats.remainingSeconds / 60))} دقیقه
            </Badge>
          )}
          <div className="mr-auto flex items-center gap-2">
            {active.length > 0 && (
              paused
                ? <Button size="sm" variant="success" onClick={onResume}><Play size={14} /> ادامه</Button>
                : <Button size="sm" variant="outline" onClick={onPause}><Pause size={14} /> توقف موقت</Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClear}><Trash2 size={14} /> پاک کردن تمام‌شده‌ها</Button>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {jobs.map((job) => {
          const running = ['preparing', 'recognizing'].includes(job.status);
          const elapsed = job.startedAt ? Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000) : 0;
          return (
            <div key={job.id} className="card !p-4 flex items-center gap-4 animate-slide-up">
              <div className="h-14 w-14 rounded-xl bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                {job.thumbnail || job.invoice?.thumbnail
                  ? <img src={job.thumbnail || job.invoice?.thumbnail} alt="" className="h-full w-full object-cover" />
                  : <FileText size={20} className="text-muted-foreground" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-sm truncate">{job.fileName}</p>
                  {job.priority ? <Badge className="bg-primary-soft text-primary !text-[10px]">اولویت‌دار</Badge> : null}
                  {job.status === 'done' && <CheckCircle2 size={15} className="text-accent shrink-0" />}
                  {job.status === 'error' && <AlertTriangle size={15} className="text-danger shrink-0" />}
                </div>

                {job.status === 'error' ? (
                  <p className="text-xs text-danger">{job.message}</p>
                ) : job.status === 'done' ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-accent">آماده بازبینی</span>
                    <ConfidenceBar value={job.invoice?.ocrConfidence ?? 0} size="xs" />
                    {(() => {
                      const status = job.invoice?.verification?.status;
                      if (!status) return null;
                      const meta = VERIFY_META[status];
                      const engineLabel = job.invoice?.verification?.engineLabel;
                      return (
                        <Badge className={`${meta.tone} !text-[10px]`}>
                          <meta.icon size={10} /> {meta.label}
                          {engineLabel ? <span className="opacity-70">· {engineLabel}</span> : null}
                        </Badge>
                      );
                    })()}
                    <span>{toFaDigits(job.invoice?.items.length ?? 0)} قلم</span>
                    {job.invoice && (
                      <span className="font-semibold text-foreground/80">
                        {formatMoney(payableOf(job.invoice), job.invoice.currency)}
                      </span>
                    )}
                    <span>{toFaDigits(elapsed)} ثانیه</span>
                    {(job.invoice?.ocrWarnings?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-warning font-semibold">
                        <AlertTriangle size={12} /> {toFaDigits(job.invoice!.ocrWarnings!.length)} هشدار
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Progress value={job.progress * 100} tone={job.progress > 0.6 ? 'accent' : 'primary'} />
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap w-36 truncate">{job.message}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {job.status === 'done' && job.invoice && (
                  <Button size="sm" onClick={() => onOpen(job)}>
                    بازبینی <ArrowRight size={13} className="rotate-180" />
                  </Button>
                )}
                {job.status === 'queued' && (
                  <>
                    <button onClick={() => onBoost(job.id)} title="بالا بردن اولویت" className="icon-tile h-8 w-8 text-primary hover:bg-primary-soft">
                      <ChevronUp size={15} />
                    </button>
                    <button onClick={() => onCancel(job.id)} title="لغو" className="icon-tile h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger">
                      <X size={15} />
                    </button>
                  </>
                )}
                {job.status === 'error' && (
                  <button onClick={() => onRetry(job)} title="تلاش دوباره" className="icon-tile h-8 w-8 text-primary hover:bg-primary-soft">
                    <RotateCcw size={15} />
                  </button>
                )}
                {running && (
                  <button onClick={() => onCancel(job.id)} title="لغو" className="icon-tile h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger">
                    <X size={15} />
                  </button>
                )}
                <button onClick={() => onRemove(job.id)} title="حذف از فهرست" className="icon-tile h-8 w-8 text-muted-foreground hover:bg-muted">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- کش و مصرف */

export function CacheCard({ stats, usage, onClear, onRefresh }: {
  stats: { ocrEntries: number; aiEntries: number; bytes: number } | null;
  usage: { today: number; week: number; month: number; chars: number } | null;
  onClear: () => void;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardTitle
        icon={<Gauge size={18} />}
        title="حافظه خوانش و مصرف سرویس ابری"
        sub="نتیجه اسناد تکراری از حافظه محلی خوانده می‌شود؛ برای فایل تکراری، موتور دوباره اجرا نمی‌شود"
        action={<Button size="sm" variant="ghost" onClick={onRefresh}>به‌روزرسانی</Button>}
      />
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground mb-1">کش خوانش محلی</p>
          <p className="font-extrabold">{toFaDigits(stats?.ocrEntries ?? 0)} سند</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            پاسخ‌های ابری کش‌شده: {toFaDigits(stats?.aiEntries ?? 0)} · حجم تقریبی {toFaDigits(Math.round((stats?.bytes ?? 0) / 1024))} کیلوبایت
          </p>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground mb-1">مصرف سرویس ابری (با کلید خودتان)</p>
          <p className="font-extrabold">{toFaDigits(usage?.today ?? 0)} تماس امروز</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            این هفته {toFaDigits(usage?.week ?? 0)} · این ماه {toFaDigits(usage?.month ?? 0)} · {toFaDigits(usage?.chars ?? 0)} نویسه ارسالی
          </p>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" variant="danger" onClick={onClear}>
          <Trash2 size={14} /> پاک کردن حافظه
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- انتخاب سند از فایل چندسندی */

export function DocumentPicker({ documents, onPick }: {
  documents: { index: number; label: string; invoice: { items: unknown[]; total: number }; confidence: number }[];
  onPick: (index: number) => void;
}) {
  return (
    <Card>
      <CardTitle icon={<Layers size={18} />} title="چند سند در یک فایل پیدا شد"
        sub="یکی را انتخاب کنید؛ بقیه به‌صورت پیش‌نویس ذخیره شده‌اند" />
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.index} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <span className="icon-tile h-9 w-9 bg-primary-soft text-primary text-xs font-extrabold">
              {toFaDigits(doc.index + 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{doc.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {(doc.invoice.items as unknown[]).length} قلم · {formatNumber(doc.invoice.total)} · اطمینان {toFaDigits(doc.confidence)}٪
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPick(doc.index)}>انتخاب</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function QualitySummary({ quality }: { quality?: PhotoQuality }) {
  const [state, setState] = useState<PhotoQuality | undefined>(quality);
  useEffect(() => setState(quality), [quality]);
  if (!state) return null;
  return <PhotoQualityCard quality={state} />;
}

export function CameraHint() {
  return (
    <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Camera size={13} /> کادر سند را پر کنید تا گوشه‌ها خودکار پیدا و پرسپکتیو تصحیح شود.
    </p>
  );
}
