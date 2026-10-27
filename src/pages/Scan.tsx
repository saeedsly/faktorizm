import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  UploadCloud, Camera, FileText, Image as ImageIcon, Trash2, PencilLine, CheckCircle2,
  AlertCircle, Loader2, X, ShieldCheck, Zap, FileCheck2,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import CameraCapture from '@/components/CameraCapture';
import { Button, Progress, EmptyState } from '@/components/ui/primitives';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { formatNumber, truncate } from '@/lib/utils';

export default function Scan() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const { jobs, enqueue, removeJob, clearFinished } = useOcrQueue();
  const navigate = useNavigate();

  const acceptFiles = useCallback((list: FileList | File[]) => {
    const files = Array.from(list).filter((f) =>
      f.type.startsWith('image/') || f.type === 'application/pdf' || /\.(jpe?g|png|webp|bmp|gif|pdf)$/i.test(f.name));
    if (!files.length) {
      toast.error('فرمت پشتیبانی نمی‌شود', { description: 'فقط تصویر (JPG, PNG, WEBP) یا PDF' });
      return;
    }
    enqueue(files);
    toast.success(`${formatNumber(files.length)} سند به صف اضافه شد`, { description: 'پردازش به‌صورت خودکار شروع شد' });
  }, [enqueue]);

  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const activeCount = jobs.filter((j) => ['queued', 'preparing', 'recognizing', 'parsing'].includes(j.status)).length;

  return (
    <div>
      <PageHeader
        title="اسکن و استخراج هوشمند"
        subtitle="عکس، اسکن یا PDF فاکتور را وارد کنید تا خودکار خوانده و فیلدها استخراج شود"
        icon={<UploadCloud size={22} />}
        actions={
          jobs.length > 0 ? (
            <Button variant="outline" size="sm" onClick={clearFinished}>
              <Trash2 size={15} /> پاک کردن موارد تمام‌شده
            </Button>
          ) : undefined
        }
      />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) acceptFiles(e.target.files); e.target.value = ''; }}
      />

      {/* ناحیه آپلود */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`card relative overflow-hidden cursor-pointer transition-all p-10 lg:p-14 text-center group ${
          dragging ? 'ring-2 ring-primary scale-[1.01]' : 'hover:border-primary/50'
        }`}
      >
        <div className="absolute inset-0 opacity-[.04] bg-[radial-gradient(circle_at_50%_0%,var(--primary),transparent_60%)]" />
        <span className={`icon-tile h-20 w-20 rounded-3xl mx-auto mb-5 gradient-brand text-white shadow-xl shadow-primary/30 transition-transform group-hover:scale-105 ${dragging ? 'animate-pulse-ring' : ''}`}>
          <UploadCloud size={34} />
        </span>
        <h3 className="text-lg font-extrabold mb-2">
          فایل‌ها را اینجا رها کنید یا کلیک کنید
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          پشتیبانی از JPG، PNG، WEBP، BMP و PDF چندصفحه‌ای — امکان انتخاب همزمان چند فایل
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
            <ImageIcon size={17} /> انتخاب فایل
          </Button>
          <Button variant="outline" onClick={(e) => { e.stopPropagation(); setCameraOpen(true); }}>
            <Camera size={17} /> اسکن با دوربین
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-7">
          {['OCR آفلاین فارسی', 'پیش‌پردازش خودکار', 'استخراج مالیات و اقلام', 'پردازش گروهی'].map((t) => (
            <span key={t} className="chip bg-muted text-muted-foreground"><ShieldCheck size={12} className="text-accent" /> {t}</span>
          ))}
        </div>
      </div>

      {/* راهنمای سریع */}
      <div className="grid md:grid-cols-3 gap-4 mt-6 stagger">
        {[
          { icon: Zap, title: 'کیفیت تصویر', desc: 'تصویر واضح و بدون تار بودن، دقت استخراج را به‌شدت بالا می‌برد.', tone: 'bg-warning-soft text-warning' },
          { icon: FileText, title: 'رسیدهای حرارتی', desc: 'رسید صندوق و فاکتور حرارتی را صاف روی سطح بگیرید و عکس بزنید.', tone: 'bg-info-soft text-info' },
          { icon: FileCheck2, title: 'بازبینی هوشمند', desc: 'فیلدهای کم‌اطمینان با رنگ هشدار مشخص می‌شوند تا فقط همان‌ها را چک کنید.', tone: 'bg-accent-soft text-accent' },
        ].map((tip) => (
          <div key={tip.title} className="card p-5 flex gap-3.5">
            <span className={`icon-tile h-11 w-11 shrink-0 ${tip.tone}`}><tip.icon size={20} /></span>
            <div>
              <h4 className="font-bold text-sm mb-1">{tip.title}</h4>
              <p className="text-xs leading-6 text-muted-foreground">{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* صف پردازش */}
      {jobs.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-extrabold flex items-center gap-2">
              <Loader2 size={18} className="text-primary" />
              صف پردازش
              <span className="chip bg-primary-soft text-primary">{formatNumber(jobs.length)}</span>
            </h3>
            {activeCount > 0 && <span className="text-xs text-muted-foreground">{formatNumber(activeCount)} سند در حال پردازش</span>}
            {doneCount > 0 && <span className="text-xs text-accent font-semibold">{formatNumber(doneCount)} سند آماده شد</span>}
          </div>

          <div className="space-y-3">
            {jobs.map((job) => (
              <div key={job.id} className="card !p-4 flex items-center gap-4 animate-slide-up">
                <div className="h-14 w-14 rounded-xl bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                  {job.thumbnail || job.invoice?.thumbnail ? (
                    <img src={job.thumbnail || job.invoice?.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <FileText size={22} className="text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-sm truncate">{truncate(job.fileName, 42)}</p>
                    {job.status === 'done' && <CheckCircle2 size={16} className="text-accent shrink-0" />}
                    {job.status === 'error' && <AlertCircle size={16} className="text-danger shrink-0" />}
                  </div>
                  {job.status === 'error' ? (
                    <p className="text-xs text-danger">{job.message}</p>
                  ) : job.status === 'done' ? (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-accent font-semibold">استخراج شد</span>
                      <span>اطمینان OCR: {formatNumber(job.invoice?.ocrConfidence ?? 0)}٪</span>
                      <span className="hidden sm:inline">{job.invoice?.items.length} قلم کالا</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Progress value={job.progress * 100} tone={job.progress > .6 ? 'accent' : 'primary'} />
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap w-32 truncate">{job.message}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {job.status === 'done' && job.invoice && (
                    <Button size="sm" onClick={() => navigate(`/invoices/${job.invoice!.id}`)}>
                      <PencilLine size={14} /> بازبینی و ثبت
                    </Button>
                  )}
                  <button
                    onClick={() => removeJob(job.id)}
                    className="icon-tile h-9 w-9 text-muted-foreground hover:bg-danger-soft hover:text-danger transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<UploadCloud size={28} />}
            title="هنوز سندی پردازش نشده است"
            desc="اولین فاکتور، رسید حرارتی یا PDF خود را آپلود کنید تا نتیجه استخراج خودکار را همین‌جا ببینید."
          />
        </div>
      )}

      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={(f) => {
        enqueue([f]);
        toast.success('عکس دوربین به صف اضافه شد');
      }} />
    </div>
  );
}
