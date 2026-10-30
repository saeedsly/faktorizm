import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  UploadCloud, Camera, FileText, Image as ImageIcon, ShieldCheck, Zap, FileCheck2,
  ScanLine, Layers, Wrench, Sparkles, Keyboard, FileSpreadsheet, Info, HardDriveDownload,
  CloudUpload, Cpu, Settings2, AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { AI_PROVIDERS, keysOf } from '@/lib/ocr/aiEngine';
import { PROVIDERS, FREE_BADGE } from '@/lib/ocr/providers';
import PageHeader from '@/components/PageHeader';
import CameraCapture from '@/components/CameraCapture';
import { Button, Card, CardTitle, EmptyState, Tabs, Badge, Select, Input, Label } from '@/components/ui/primitives';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import { StagedList, QueuePanel, CacheCard, inspectImage, type StagedFile } from '@/components/ocr/OcrPanels';
import { cacheStats, clearAllCaches, usageSummary } from '@/lib/ocr/cache';
import { uid, formatNumber, toFaDigits, cn as cn2 } from '@/lib/utils';
import { db } from '@/lib/db';
import { exportBackup, validateBackup } from '@/lib/exporters/documents';

export default function Scan() {
  const navigate = useNavigate();
  const { settings, update } = useAppStore();
  const [tab, setTab] = useState('scan');
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [category, setCategory] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [costCenters, setCostCenters] = useState<string[]>([]);
  const [cache, setCache] = useState<{ ocrEntries: number; aiEntries: number; bytes: number } | null>(null);
  const [usage, setUsage] = useState<{ today: number; week: number; month: number; chars: number } | null>(null);

  const {
    jobs, enqueue, removeJob, clearFinished, retryJob, cancelJob,
    reprioritize, pause, resume, paused, stats,
  } = useOcrQueue();

  const refreshTools = useCallback(async () => {
    const [c, u] = await Promise.all([cacheStats(), usageSummary()]);
    setCache(c);
    setUsage(u);
  }, []);

  useEffect(() => { void refreshTools(); }, [refreshTools, jobs.length]);

  // دسته‌ها و مرکزهای هزینه از اسناد قبلی برای انتخاب سریع
  useEffect(() => {
    void (async () => {
      const rows = await db.invoices.toArray();
      setCategories(Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).slice(0, 30));
      setCostCenters(Array.from(new Set(rows.map((r) => r.costCenter).filter((v): v is string => !!v))).slice(0, 30));
    })();
  }, [jobs.length]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const files = Array.from(list).filter((f) =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
      || /\.(jpe?g|png|webp|bmp|gif|pdf|hei[cf]|tiff?|avif)$/i.test(f.name));
    if (!files.length) {
      toast.error('فرمت پشتیبانی نمی‌شود', { description: 'تصویر (JPG، PNG، WEBP، BMP، HEIC، TIFF) یا PDF بدهید.' });
      return;
    }
    const items: StagedFile[] = files.map((file) => ({
      id: uid('stg_'), file, priority: false, checking: file.type.startsWith('image/'),
    }));
    setStaged((prev) => [...prev, ...items]);
    toast.success(`${formatNumber(files.length)} فایل آماده بررسی شد`, {
      description: 'کیفیت عکس‌ها سنجیده می‌شود؛ بعد «شروع پردازش» را بزنید.',
    });

    // سنجش کیفیت عکس‌ها بی‌درنگ
    items.forEach(async (item) => {
      if (!item.file.type.startsWith('image/')) {
        setStaged((prev) => prev.map((s) => (s.id === item.id ? { ...s, checking: false } : s)));
        return;
      }
      try {
        const result = await inspectImage(item.file);
        setStaged((prev) => prev.map((s) => (s.id === item.id
          ? { ...s, checking: false, quality: result.quality, thumbnail: result.thumbnail }
          : s)));
      } catch {
        setStaged((prev) => prev.map((s) => (s.id === item.id ? { ...s, checking: false } : s)));
      }
    });
  }, []);

  // چسباندن عکس از کلیپ‌بورد (Ctrl+V) — سریع‌ترین راه برای اسکرین‌شات فاکتور
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const pasted = items
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => !!file);
      if (!pasted.length) return;
      event.preventDefault();
      addFiles(pasted);
      toast.success(`${formatNumber(pasted.length)} تصویر از کلیپ‌بورد اضافه شد`);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const inspectAll = useCallback(async () => {
    for (const item of staged) {
      if (item.quality || !item.file.type.startsWith('image/')) continue;
      try {
        const result = await inspectImage(item.file);
        setStaged((prev) => prev.map((s) => (s.id === item.id
          ? { ...s, checking: false, quality: result.quality, thumbnail: result.thumbnail }
          : s)));
      } catch { /* فایل تصویری نبود */ }
    }
    toast.success('کیفیت همه عکس‌ها سنجیده شد');
  }, [staged]);

  const startProcessing = useCallback(() => {
    if (!staged.length) return;
    const priorityFiles = staged.filter((s) => s.priority).map((s) => s.file);
    const normalFiles = staged.filter((s) => !s.priority).map((s) => s.file);
    if (priorityFiles.length) enqueue(priorityFiles, { priority: 50, category: category || undefined, costCenter: costCenter || undefined });
    if (normalFiles.length) enqueue(normalFiles, { category: category || undefined, costCenter: costCenter || undefined });
    setStaged([]);
    setTab('queue');
  }, [staged, enqueue, category, costCenter]);

  const doneCount = jobs.filter((j) => j.status === 'done').length;
  const activeCount = stats.active;

  const tabDefs = useMemo(() => [
    { id: 'scan', label: 'اسکن و آپلود', icon: <ScanLine size={15} /> },
    { id: 'queue', label: 'صف پردازش', icon: <Layers size={15} />, count: jobs.filter((j) => !['done', 'error'].includes(j.status)).length || undefined },
    { id: 'tools', label: 'ابزارها و حافظه', icon: <Wrench size={15} /> },
  ], [jobs]);

  return (
    <div>
      <PageHeader
        title="اسکن و استخراج هوشمند"
        subtitle="عکس، اسکن یا PDF فاکتور را وارد کنید تا خودکار خوانده و فیلدها استخراج شود"
        icon={<UploadCloud size={22} />}
        actions={(
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => navigate('/invoices?tab=review')}>
                <FileCheck2 size={15} /> {toFaDigits(doneCount)} سند آماده بازبینی
              </Button>
            )}
            {activeCount > 0 && (
              <Badge className="bg-primary-soft text-primary">
                {toFaDigits(activeCount)} در حال پردازش
              </Badge>
            )}
          </div>
        )}
      />

      <div className="mb-5">
        <Tabs tabs={tabDefs} active={tab} onChange={setTab} />
      </div>

      {tab === 'scan' && (
        <div className="space-y-5">
          <input
            id="scan-file-input"
            type="file"
            multiple
            accept="image/*,application/pdf,.heic,.heif,.tif,.tiff"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
          />

          <Card className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className={cn2(settings.ocrEngine === 'local'
                  ? 'icon-tile h-10 w-10 bg-muted text-muted-foreground'
                  : 'icon-tile h-10 w-10 bg-primary-soft text-primary')}>
                  {settings.ocrEngine === 'local' ? <Cpu size={18} /> : <CloudUpload size={18} />}
                </span>
                <div>
                  <p className="text-sm font-bold">
                    موتور خوانش: {settings.ocrEngine === 'local' ? 'آفلاین و محلی' : settings.ocrEngine === 'ai' ? 'ابرِ هوش مصنوعی (فقط ابری)' : 'ترکیبی (محلی + ابری)'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-5">
                    {settings.ocrEngine === 'local'
                      ? 'همه‌چیز روی همین دستگاه پردازش می‌شود؛ ارقام مخدوش و فاکتورهای شلوغ ممکن است دقیق خوانده نشوند.'
                      : settings.ocrEngine === 'ai'
                        ? `${PROVIDERS[settings.aiProvider]?.label ?? 'سرویس ابری'} · مدل ${settings.aiModel || PROVIDERS[settings.aiProvider]?.defaultModel} — خوانش مستقیم تصویر بدون OCR محلی.`
                        : 'خوانش محلی و ابری هم‌زمان اجرا می‌شوند و بهترین مقدار هر فیلد انتخاب می‌شود.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {settings.ocrEngine !== 'local' && (
                  <span className={`chip !text-[10px] ${FREE_BADGE[PROVIDERS[settings.aiProvider].free].tone}`}>
                    {FREE_BADGE[PROVIDERS[settings.aiProvider].free].label}
                  </span>
                )}
                {settings.ocrEngine !== 'ai' && (
                  <Button size="sm" onClick={() => {
                    void update({ ocrEngine: 'ai' });
                    toast.success('حالت ابری فعال شد', {
                      description: keysOf(settings).length || PROVIDERS[settings.aiProvider].keyless
                        ? 'اسناد بعدی مستقیم با مدل بینایی خوانده می‌شوند.'
                        : 'برای شروع، کلید رایگان را در تنظیمات بگذارید (ثبت‌نام بدون کارت بانکی).',
                    });
                  }}>
                    <Sparkles size={15} /> خوانش ابری (دقیق‌تر)
                  </Button>
                )}
                {settings.ocrEngine !== 'local' && (
                  <Button size="sm" variant="outline" onClick={() => { void update({ ocrEngine: 'local' }); toast.message('حالت آفلاین فعال شد'); }}>
                    <Cpu size={15} /> فقط محلی
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
                  <Settings2 size={15} /> تنظیمات
                </Button>
              </div>
            </div>
            {settings.ocrEngine !== 'local' && !keysOf(settings).length && !PROVIDERS[settings.aiProvider].keyless && (
              <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[11px] leading-5 text-warning flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  کلید API وارد نشده است؛ تا وقتی کلید نگذارید سندها با موتور محلی خوانده می‌شوند.
                  {' '}کلید {PROVIDERS[settings.aiProvider].label} رایگان است و با ثبت‌نام بدون کارت بانکی ساخته می‌شود.
                  {' '}
                  <button onClick={() => navigate('/settings')} className="font-bold underline">وارد کردن کلید در تنظیمات</button>
                </span>
              </div>
            )}
          </Card>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
            className={`card relative overflow-hidden cursor-pointer transition-all p-10 lg:p-12 text-center group ${
              dragging ? 'ring-2 ring-primary scale-[1.01]' : 'hover:border-primary/50'
            }`}
            onClick={() => document.getElementById('scan-file-input')?.click()}
          >
            <div className="absolute inset-0 opacity-[.04] bg-[radial-gradient(circle_at_50%_0%,var(--primary),transparent_60%)]" />
            <span className={`icon-tile h-20 w-20 rounded-3xl mx-auto mb-5 gradient-brand text-white shadow-xl shadow-primary/30 transition-transform group-hover:scale-105 ${dragging ? 'animate-pulse-ring' : ''}`}>
              <UploadCloud size={34} />
            </span>
            <h3 className="text-lg font-extrabold mb-2">فایل‌ها را اینجا رها کنید یا کلیک کنید</h3>
            <p className="text-sm text-muted-foreground mb-6">
              JPG، PNG، WEBP، BMP، HEIC (آیفون)، TIFF و PDF چندصفحه‌ای — قاب سند خودکار پیدا و پرسپکتیو تصحیح می‌شود
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={(e) => { e.stopPropagation(); document.getElementById('scan-file-input')?.click(); }}>
                <ImageIcon size={17} /> انتخاب فایل
              </Button>
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); setCameraOpen(true); }}>
                <Camera size={17} /> اسکن با دوربین
              </Button>
              <Button variant="ghost" onClick={(e) => { e.stopPropagation(); }}>
                <Keyboard size={16} /> Ctrl+V برای چسباندن تصویر
              </Button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-7">
              {[
                'OCR آفلاین فارسی', 'سنجش کیفیت عکس', 'برش خودکار قاب',
                'تشخیص چند سند در یک فایل', 'کش پردازش تکراری', 'پردازش اولویت‌دار',
              ].map((t) => (
                <span key={t} className="chip bg-muted text-muted-foreground">
                  <ShieldCheck size={12} className="text-accent" /> {t}
                </span>
              ))}
            </div>
          </div>

          {staged.length > 0 && (
            <Card className="!p-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>دسته‌بندی این اسناد (اختیاری)</Label>
                  <Input list="scan-categories" placeholder="مثلاً خرید کالا" value={category} onChange={(e) => setCategory(e.target.value)} />
                  <datalist id="scan-categories">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <Label>مرکز هزینه / پروژه (اختیاری)</Label>
                  <Input list="scan-cost" placeholder="مثلاً شعبه مرکزی" value={costCenter} onChange={(e) => setCostCenter(e.target.value)} />
                  <datalist id="scan-cost">
                    {costCenters.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="flex items-end">
                  <p className="text-[11px] text-muted-foreground leading-6 flex gap-1.5">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    این دو مقدار روی همه اسناد این دوره اعمال می‌شود و بعداً هم قابل تغییر است.
                  </p>
                </div>
              </div>
            </Card>
          )}

          <StagedList
            items={staged}
            onRemove={(id) => setStaged((prev) => prev.filter((s) => s.id !== id))}
            onTogglePriority={(id) => setStaged((prev) => prev.map((s) => (s.id === id ? { ...s, priority: !s.priority } : s)))}
            onStart={startProcessing}
            onInspectAll={inspectAll}
          />

          {!staged.length && (
            <div className="grid md:grid-cols-3 gap-4 stagger">
              {[
                { icon: Zap, title: 'کیفیت تصویر', desc: 'برنامه تاری، کم‌نوری و بازتاب نور را پیش از خوانش می‌سنجد و می‌گوید چه‌کار کنید.', tone: 'bg-warning-soft text-warning' },
                { icon: ScanLine, title: 'قاب خودکار', desc: 'گوشه‌های کاغذ پیدا و پرسپکتیو اصلاح می‌شود؛ سند صاف و مستطیلی خوانده می‌شود.', tone: 'bg-info-soft text-info' },
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
          )}

          <Card>
            <CardTitle icon={<Keyboard size={18} />} title="ترفندهای گرفتن عکس بهتر"
              sub="با رعایت همین چند نکته، دقت خوانش به‌طور محسوس بالا می‌رود" />
            <div className="grid sm:grid-cols-2 gap-2 text-xs leading-6 text-muted-foreground">
              {[
                'کاغذ را روی سطح تیره و صاف بگذارید تا لبه‌هایش پیدا باشد.',
                'چهار گوشه سند داخل کادر عکس باشد؛ برش خودکار روی همین تکیه می‌کند.',
                'از بازتاب نور مستقیم چراغ روی کاغذ جلوگیری کنید.',
                'برای رسید حرارتی، نور ملایم بهتر از فلاش است.',
                'سند را موازی با دوربین بگیرید؛ کجی بیش از ۱۵ درجه خطا می‌آورد.',
                'برای PDF چندصفحه‌ای، هر صفحه را جدا اسکن کنید تا صفحات قاطی نشوند.',
              ].map((tip) => (
                <p key={tip} className="flex gap-2">
                  <Sparkles size={13} className="shrink-0 mt-1 text-primary" /> {tip}
                </p>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'queue' && (
        <QueuePanel
          jobs={jobs}
          stats={stats}
          paused={paused}
          onPause={pause}
          onResume={resume}
          onCancel={cancelJob}
          onRetry={retryJob}
          onRemove={removeJob}
          onBoost={(id) => reprioritize(id, 50)}
          onOpen={(job) => navigate(`/invoices/${job.invoice!.id}`)}
          onClear={clearFinished}
        />
      )}

      {tab === 'tools' && (
        <div className="space-y-5">
          <CacheCard
            stats={cache}
            usage={usage}
            onRefresh={() => void refreshTools()}
            onClear={async () => {
              await clearAllCaches();
              await refreshTools();
              toast.success('حافظه خوانش پاک شد', { description: 'پردازش بعدی از صفر و با دقت کامل انجام می‌شود.' });
            }}
          />

          <Card>
            <CardTitle icon={<FileSpreadsheet size={18} />} title="پردازش گروهی حرفه‌ای"
              sub="چند ده سند را یک‌جا بدهید؛ برنامه به ترتیب اولویت پردازش می‌کند" />
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted/60 p-3 leading-6">
                <p className="font-bold mb-1">اولویت‌گذاری</p>
                <p className="text-xs text-muted-foreground">
                  در فهرست فایل‌های آماده، هر فایلی را «اولویت‌دار» کنید تا زودتر خوانده شود؛
                  در صف هم می‌توانید ترتیب را عوض کنید.
                </p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3 leading-6">
                <p className="font-bold mb-1">مقاوم در برابر قطع شدن</p>
                <p className="text-xs text-muted-foreground">
                  فایل‌های در صف در حافظه مرورگر نگه داشته می‌شوند؛ اگر صفحه بسته و دوباره باز شود،
                  صف بازیابی می‌شود.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle icon={<HardDriveDownload size={18} />} title="پشتیبان و بازگردانی"
              sub="همه اسناد، طرف‌حساب‌ها و کالاها در یک فایل JSON" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const [invoices, contacts, products] = await Promise.all([
                    db.invoices.toArray(), db.contacts.toArray(), db.products.toArray(),
                  ]);
                  exportBackup({ invoices, contacts, products });
                  toast.success('فایل پشتیبان ساخته شد');
                }}
              >
                <FileText size={14} /> خروجی پشتیبان
              </Button>
              <label className="inline-flex relative">
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const result = validateBackup(await file.text());
                    if (!result.ok || !result.data) {
                      toast.error('فایل پشتیبان معتبر نیست', { description: result.error });
                      return;
                    }
                    await db.transaction('rw', db.invoices, db.contacts, db.products, async () => {
                      await db.invoices.bulkPut(result.data!.invoices);
                      if (result.data!.contacts?.length) await db.contacts.bulkPut(result.data!.contacts);
                      if (result.data!.products?.length) await db.products.bulkPut(result.data!.products);
                    });
                    toast.success('پشتیبان بازیابی شد', {
                      description: `${formatNumber(result.data.invoices.length)} سند بازگردانده شد.`,
                    });
                    setTab('queue');
                  }}
                />
                <span className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-xl border border-border bg-card hover:bg-muted cursor-pointer">
                  <FileText size={14} /> بازگردانی از فایل
                </span>
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-6">
              بازیابی، اسناد هم‌شناسه را به‌روزرسانی می‌کند و اسناد جدید را اضافه می‌کند؛ چیزی حذف نمی‌شود.
            </p>
          </Card>

          {!jobs.length && (
            <EmptyState icon={<Layers size={26} />} title="هنوز سندی پردازش نشده"
              desc="از زبانه «اسکن و آپلود» شروع کنید." />
          )}
        </div>
      )}

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(f) => {
          addFiles([f]);
          setCameraOpen(false);
          toast.success('عکس گرفته شد؛ کیفیتش بررسی می‌شود');
        }}
      />
    </div>
  );
}
