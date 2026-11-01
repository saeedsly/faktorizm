import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, ShieldCheck, AlertTriangle, RefreshCw, PlugZap, Loader2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui/primitives';
import { useAppStore } from '@/lib/store';
import { HAS_PRESET_KEY, keyStatus, restorePresetKey } from '@/lib/db';
import { keysOf, providerInfo } from '@/lib/ocr/providers';
import { testAiConnection } from '@/lib/ocr/aiEngine';
import { BUILD_ID, BUILD_LABEL } from '@/lib/version';
import { toFaDigits } from '@/lib/utils';

/**
 * نوار وضعیت خوانش ابری — یک نگاه کافی است:
 * کلید هست یا نه، از کدام سرویس، و اگر نبود با یک کلیک برگردد.
 */
export default function CloudKeyStatus() {
  const [probe, setProbe] = useState<{ state: 'idle' | 'busy' | 'ok' | 'fail'; message?: string }>({ state: 'idle' });
  const settings = useAppStore((st) => st.settings);
  const load = useAppStore((st) => st.load);
  const info = providerInfo(settings.aiProvider);
  const status = keyStatus(settings);
  const cloudOn = settings.ocrEngine !== 'local';

  const restore = async () => {
    const ok = await restorePresetKey();
    await load();
    if (ok) toast.success('کلید آماده روی همین دستگاه ثبت شد');
    else toast.error('کلید آماده‌ای در این بسته نیست');
  };

  const runProbe = async () => {
    setProbe({ state: 'busy' });
    const res = await testAiConnection({
      provider: settings.aiProvider,
      apiKey: keysOf(settings)[0] ?? '',
      keys: keysOf(settings),
      baseUrl: settings.aiBaseUrl,
      model: settings.aiModel,
    });
    setProbe({ state: res.ok ? 'ok' : 'fail', message: res.error });
    if (res.ok) toast.success(`کلید سالم است — ${info.label}`);
    else toast.error(res.error ?? 'کلید یا اتصال مشکل دارد');
  };

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <KeyRound size={13} className="text-primary" /> وضعیت خوانش ابری
        </p>
        <span className="text-[10px] text-muted-foreground"><span dir="ltr">{BUILD_ID}</span></span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge className={cloudOn ? 'bg-accent-soft text-accent !text-[10px]' : 'bg-muted text-muted-foreground !text-[10px]'}>
          {cloudOn ? 'موتور ابری روشن' : 'موتور محلی'}
        </Badge>
        <Badge className="bg-primary-soft text-primary !text-[10px]">{info.label}</Badge>
        <Badge className="bg-muted text-muted-foreground !text-[10px]">
          <span dir="ltr">{settings.aiModel?.trim() || info.defaultModel || '—'}</span>
        </Badge>
        {status.hasKey ? (
          <Badge className="bg-accent-soft text-accent !text-[10px]">
            <ShieldCheck size={10} className="inline mr-1" />
            کلید ثبت شده{status.tail ? ` …${status.tail}` : ''}
            {status.isPreset && ' (آماده)'}
          </Badge>
        ) : (
          <Badge className="bg-danger-soft text-danger !text-[10px]">
            <AlertTriangle size={10} className="inline mr-1" /> کلید ثبت نشده
          </Badge>
        )}
      </div>

      {!status.hasKey && HAS_PRESET_KEY && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-danger-soft/50 p-2">
          <p className="text-[11px] text-danger leading-5">
            این بسته کلید آماده دارد ولی روی این مرورگر ثبت نشده. یک کلیک کافی است.
          </p>
          <Button size="sm" variant="outline" className="!h-8 !px-2 !text-[11px]" onClick={restore}>
            <RefreshCw size={11} /> ثبت کلید آماده
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="!h-8 !px-2 !text-[11px]"
          onClick={runProbe} disabled={probe.state === 'busy' || !status.hasKey}>
          {probe.state === 'busy'
            ? <><Loader2 size={11} className="animate-spin" /> در حال آزمون…</>
            : <><PlugZap size={11} /> آزمون واقعی کلید</>}
        </Button>
        {probe.state === 'ok' && (
          <span className="text-[11px] font-bold text-accent flex items-center gap-1">
            <ShieldCheck size={11} /> کلید سالم است
          </span>
        )}
        {probe.state === 'fail' && (
          <span className="text-[11px] font-bold text-danger">
            {probe.message || 'کلید یا اتصال مشکل دارد'}
          </span>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-5">
        {BUILD_LABEL} · اگر بعد از به‌روزرسانی بسته، نسخهٔ قبلی را می‌بینید، یک بار
        <span className="font-bold"> Ctrl+Shift+R </span>
        بزنید (کش مرورگر). تعداد کلیدهای ثبت‌شده: {toFaDigits(status.hasKey ? 1 : 0)}
      </p>
    </div>
  );
}
