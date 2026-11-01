import { useCallback, useEffect, useState } from 'react';
import {
  Cpu, ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2, XCircle, Loader2,
  BookOpen, FlaskConical, Terminal,
} from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { checkServerOcr, engineDiagnostics, resetServerOcrCache } from '@/lib/ocr/serverEngine';
import type { EngineDiagnostics, EngineReport } from '@/lib/ocr/serverEngine';
import { toFaDigits } from '@/lib/utils';

/**
 * وضعیت واقعی موتورهای OCR.
 *
 * سه موتور ممکن است خواندن را انجام دهند:
 *   Falcon-OCR (دقیق‌ترین) → PP-OCR عربی (سریع و قوی) → Tesseract درون مرورگر (همیشه هست)
 *
 * این کارت به‌جای یک برچسب مبهم، برای هر موتور می‌گوید «آماده است» یا «چرا آماده
 * نیست»، بنابراین کاربر می‌داند Tesseract یعنی موتور قوی نصب نشده و راهش چیست.
 */
export default function OcrEngineStatus({ compact = false }: { compact?: boolean }) {
  const [diag, setDiag] = useState<EngineDiagnostics | null>(null);
  const [busy, setBusy] = useState(true);
  const [webUp, setWebUp] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    resetServerOcrCache();
    const [report, web] = await Promise.all([engineDiagnostics(), checkServerOcr()]);
    setDiag(report);
    setWebUp(web);
    setBusy(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // حالت استاتیک (نسخهٔ سبک Apache): اصلاً سرویس محلی وجود ندارد، پس نشان دادن
  // ردیف Falcon/PP-OCR با پیام «سرویس اجرا نشده» گمراه‌کننده بود.
  const engines: EngineReport[] = diag?.mode === 'static'
    ? [{ id: 'tesseract-browser', label: 'Tesseract (درون مرورگر)', ready: true, reason: null }]
    : diag?.engines?.length
      ? diag.engines
      : [
        { id: 'falcon-ocr-arabic', label: 'Falcon-OCR-Arabic', ready: false, reason: 'سرویس موتور قوی اجرا نشده است' },
        { id: 'ppocrv5-arabic', label: 'PP-OCR (عربی)', ready: false, reason: 'سرویس موتور قوی اجرا نشده است' },
        { id: 'tesseract-browser', label: 'Tesseract (درون مرورگر)', ready: true, reason: null },
      ];

  const activeId = diag?.engineAvailable
    ? (diag.engineId || engines.find((e) => e.ready)?.id || null)
    : 'tesseract-browser';
  const activeLabel = diag?.engineAvailable
    ? (diag.engineLabel || engines.find((e) => e.ready)?.label)
    : (diag?.mode === 'static'
      ? 'Tesseract 7 — درون‌مرورگر (این بسته سرویس محلی ندارد)'
      : 'Tesseract 7 — درون‌مرورگر');

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Cpu size={13} className="text-primary" /> موتور خواندن (OCR)
        </p>
        <Button size="sm" variant="outline" className="!h-7 !px-2 !text-[11px]" onClick={refresh} disabled={busy}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} بررسی دوباره
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={webUp ? 'bg-accent-soft text-accent !text-[10px]' : 'bg-primary-soft text-primary !text-[10px]'}>
          {webUp ? <ShieldCheck size={10} className="inline mr-1" /> : <AlertTriangle size={10} className="inline mr-1" />}
          فعال: {activeLabel}
        </Badge>
        {diag?.dictionary?.words ? (
          <Badge className="bg-muted text-muted-foreground !text-[10px]">
            <BookOpen size={10} className="inline mr-1" />
            واژه‌نامه: {toFaDigits(diag.dictionary.words)} واژه
          </Badge>
        ) : null}
        {diag?.python?.version ? (
          <Badge className="bg-muted text-muted-foreground !text-[10px]">
            <Terminal size={10} className="inline mr-1" />
            <span dir="ltr">Python {diag.python.version}</span>
          </Badge>
        ) : null}
      </div>

      <div className="space-y-1.5">
        {engines.map((engine) => (
          <div key={engine.id} className="flex items-start gap-2 rounded-lg bg-card/70 border border-border px-2 py-1.5">
            {engine.ready
              ? <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-accent" />
              : <XCircle size={13} className="mt-0.5 shrink-0 text-danger" />}
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-5">
                {engine.label}
                {engine.id === activeId && (
                  <span className="mr-1.5 text-[10px] font-normal text-accent">— همین حالا فعال</span>
                )}
              </p>
              {!engine.ready && engine.reason && (
                <p className="text-[10px] leading-5 text-danger">{engine.reason}</p>
              )}
              {!compact && engine.hint && (
                <p className="text-[10px] leading-5 text-muted-foreground">{engine.hint}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!webUp && (
        <div className="rounded-lg bg-primary-soft/60 p-2 space-y-1">
          <p className="text-[11px] font-bold text-primary flex items-center gap-1">
            <FlaskConical size={11} />
            {diag?.mode === 'static' ? 'این نسخه فقط موتور مرورگر دارد' : 'موتور قوی روشن نیست — دو راه دارید'}
          </p>
          {diag?.mode === 'static' ? (
            <>
              <p className="text-[11px] leading-5 text-muted-foreground">
                این بستهٔ سبک است (فقط Apache، بدون Node و پایتون)، برای همین تنها موتور در دسترس
                Tesseract درون مرورگر است. خواندن انجام می‌شود و نتیجه با برچسب «بازبینی» ثبت می‌شود؛
                عدد ساختگی ساخته نمی‌شود.
              </p>
              <p className="text-[11px] leading-5 text-muted-foreground">
                برای موتور قوی (Falcon و PP-OCR) یکی از بسته‌های <b>Node</b> یا <b>XAMPP</b> را نصب کنید؛
                همان‌ها سرویس محلی را همراه دارند. نسخهٔ ابری (OCR.Space) در همین بسته هم کار می‌کند:
                کلید را در کادر بالا بگذارید و «آزمون واقعی کلید» را بزنید.
              </p>
            </>
          ) : (
            <>
              <ol className="text-[11px] leading-5 text-muted-foreground list-decimal pr-4 space-y-0.5">
                <li>
                  <code dir="ltr">setup.bat</code> را یک بار و بعد <code dir="ltr">start.bat</code> را اجرا کنید؛
                  سرویس پایتون خودکار بالا می‌آید.
                </li>
                <li>
                  برای دقیق‌ترین خوانش (Falcon): <code dir="ltr">falcon-setup.bat</code> را اجرا کنید
                  (یک‌بار، حدود ۱٫۱ گیگابایت دانلود).
                </li>
                <li>
                  اگر مطمئن نیستید چه چیزی کم است: <code dir="ltr">check-engines.bat</code> را بزنید و متن خروجی را بفرستید.
                </li>
              </ol>
              <p className="text-[10px] leading-5 text-muted-foreground">
                تا آن موقع، خواندن با موتور مرورگر انجام می‌شود و نتیجه همیشه با برچسب «بازبینی» ثبت می‌شود؛ عدد ساختگی ساخته نمی‌شود.
              </p>
            </>
          )}
        </div>
      )}

      {webUp && diag?.files && (
        <p className="text-[10px] leading-5 text-muted-foreground">
          مدل‌های فعال:
          {' '}<span dir="ltr">{diag.files.det ?? '—'}</span>
          {' + '}<span dir="ltr">{diag.files.rec ?? '—'}</span>
          {diag.files.dict ? <> · واژه‌نامهٔ <span dir="ltr">{diag.files.dict}</span></> : null}
        </p>
      )}

      {diag?.falcon && !diag.falcon.ready && diag.falcon.reason && webUp && (
        <p className="text-[10px] leading-5 text-muted-foreground">
          Falcon: {diag.falcon.reason}
        </p>
      )}
    </div>
  );
}
