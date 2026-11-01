import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FlaskConical, Upload, Loader2, CheckCircle2, XCircle, Trophy, Clock,
  FileText, ListChecks, RefreshCw, Crown,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, CardTitle, Button, Badge } from '@/components/ui/primitives';
import { useAppStore } from '@/lib/store';
import { prepareLabImage, runAllEngines, scoreOf } from '@/lib/ocr/lab';
import type { EngineRunResult, LabImage } from '@/lib/ocr/lab';
import { toFaDigits } from '@/lib/utils';

/**
 * آزمایشگاه خوانش — یک فاکتور، همهٔ موتورها.
 *
 * چرا این صفحه؟ کاربر باید با فاکتورهای *خودش* ببیند کدام موتور بهتر می‌خواند؛
 * ادعای «فلان موتور دقیق‌تر است» بدون سندِ خود کاربر بی‌معناست.
 */
export default function EngineLab() {
  const settings = useAppStore((s) => s.settings);
  const [image, setImage] = useState<LabImage | null>(null);
  const [preview, setPreview] = useState('');
  const [results, setResults] = useState<EngineRunResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [open, setOpen] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(async (file: File) => {
    try {
      const prepared = await prepareLabImage(file);
      setImage(prepared);
      setPreview(URL.createObjectURL(file));
      setResults([]);
    } catch (err) {
      toast.error('تصویر خوانده نشد', { description: err instanceof Error ? err.message : '' });
    }
  }, []);

  const run = async () => {
    if (!image) return;
    setBusy(true);
    setResults([]);
    try {
      const all = await runAllEngines(image, settings, { onStep: setStep });
      setResults(all);
      const best = [...all].filter((r) => r.ok).sort((a, b) => scoreOf(b) - scoreOf(a))[0];
      if (best) toast.success(`بهترین نتیجه در این تصویر: ${best.label}`);
      else toast.error('هیچ موتوری نتیجه نداد — خطای هر موتور را ببینید');
    } catch (err) {
      toast.error('اجرای آزمایشگاه شکست خورد', { description: err instanceof Error ? err.message : '' });
    } finally {
      setBusy(false);
      setStep('');
    }
  };

  const bestId = results.length
    ? [...results].filter((r) => r.ok).sort((a, b) => scoreOf(b) - scoreOf(a))[0]?.id
    : undefined;

  return (
    <div>
      <PageHeader
        title="آزمایشگاه خوانش"
        subtitle="یک فاکتور واقعی بدهید؛ همهٔ موتورهای نصب‌شده همان تصویر را می‌خوانند تا خودتان مقایسه کنید"
        icon={<FlaskConical size={22} />}
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-5">
        <Card>
          <CardTitle title="تصویر آزمایش" sub="بهتر است یک فاکتور واقعی و کمی کج/عکس‌دار باشد" icon={<Upload size={18} />} />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pick(file);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border border-dashed border-border p-4 text-center hover:border-primary/50 transition"
          >
            {preview ? (
              <img src={preview} alt="پیش‌نمایش" className="mx-auto max-h-56 rounded-lg" />
            ) : (
              <div className="py-8 text-sm text-muted-foreground">
                <Upload className="mx-auto mb-2" size={22} />
                تصویر فاکتور را انتخاب کنید
              </div>
            )}
          </button>

          <div className="mt-3 space-y-2">
            <Button className="w-full" onClick={run} disabled={!image || busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> در حال خواندن…</> : <><FlaskConical size={16} /> خواندن با همهٔ موتورها</>}
            </Button>
            {busy && step && <p className="text-[11px] text-muted-foreground text-center">{step}</p>}
            {results.length > 0 && (
              <Button variant="outline" className="w-full" onClick={run} disabled={busy}>
                <RefreshCw size={15} /> اجرای دوباره
              </Button>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-6 text-muted-foreground">
            هیچ داده‌ای به‌جز سرویس ابری (اگر روشن باشد) از دستگاه بیرون نمی‌رود؛
            موتورهای محلی روی همین رایانه کار می‌کنند.
          </p>
        </Card>

        <div className="space-y-3">
          {results.length === 0 && !busy && (
            <Card>
              <p className="text-sm text-muted-foreground leading-7">
                نتیجه‌ها اینجا کنار هم می‌آیند: متن خوانده‌شده، درصد اطمینان، تعداد ردیف کالا، زمان و خطای واقعی.
                موتوری که بالاتر بیاید، برای فاکتورهای شما مناسب‌تر است.
              </p>
              <ul className="mt-3 text-[11px] text-muted-foreground space-y-1 list-disc pr-5 leading-6">
                <li>محلی (پایتون): PP-OCR عربی و Falcon — نیازمند <code dir="ltr">setup.bat</code> و <code dir="ltr">start.bat</code></li>
                <li>مرورگر: Tesseract — همیشه هست، نتیجه‌اش همیشه بازبینی است</li>
                <li>ابری: OCR.Space — نیازمند کلید معتبر (۳۶ نویسه)</li>
              </ul>
            </Card>
          )}

          {results.map((r) => {
            const isBest = r.id === bestId;
            const expanded = open === r.id;
            return (
              <Card key={`${r.id}-${r.where}`} className={isBest ? 'ring-2 ring-accent/40' : ''}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {r.ok ? <CheckCircle2 size={16} className="text-accent" /> : <XCircle size={16} className="text-danger" />}
                    <p className="font-bold text-sm">{r.label}</p>
                    {isBest && (
                      <Badge className="bg-accent-soft text-accent !text-[10px]">
                        <Crown size={10} className="inline mr-1" /> بهترین در این تصویر
                      </Badge>
                    )}
                    <Badge className="bg-muted text-muted-foreground !text-[10px]">
                      {r.where === 'server' ? 'محلی (سرور)' : r.where === 'browser' ? 'مرورگر' : 'ابری'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock size={11} /> {toFaDigits((r.elapsedMs / 1000).toFixed(1))} ثانیه</span>
                    {r.ok && <span className="flex items-center gap-1"><ListChecks size={11} /> {toFaDigits(r.items)} ردیف</span>}
                    {r.ok && <span className="font-bold text-foreground">{toFaDigits(Math.round(r.confidence))}٪</span>}
                  </div>
                </div>

                {!r.ok && (
                  <p className="mt-2 text-[11px] leading-6 text-danger">{r.error || 'این موتور نتیجه نداد'}</p>
                )}
                {r.note && <p className="mt-1 text-[11px] leading-6 text-muted-foreground">{r.note}</p>}

                {r.ok && (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="!h-7 !px-2 !text-[11px]"
                        onClick={() => setOpen(expanded ? '' : r.id)}
                      >
                        <FileText size={11} /> {expanded ? 'بستن متن' : 'دیدن متن خوانده‌شده'}
                      </Button>
                      <span className="text-[10px] text-muted-foreground">
                        {toFaDigits(r.lines)} خط · امتیاز {toFaDigits(scoreOf(r))}
                      </span>
                    </div>
                    {expanded && (
                      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-6 whitespace-pre-wrap" dir="rtl">
                        {r.text.trim() || '(متن خالی)'}
                      </pre>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
