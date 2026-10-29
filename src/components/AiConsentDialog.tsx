import { useEffect, useState } from 'react';
import { ShieldAlert, CloudUpload, Lock } from 'lucide-react';
import { subscribeConsent, resolveConsent } from '@/lib/ocr/aiConsent';
import type { ConsentRequest } from '@/lib/ocr/aiConsent';

/**
 * گفت‌وگوی تأیید ارسال تصویر به سرویس ابری.
 * هر بار که کاربر موتور ابری را روشن کرده باشد، پیش از ارسال نمایش داده می‌شود.
 */
export default function AiConsentDialog() {
  const [request, setRequest] = useState<ConsentRequest | null>(null);

  useEffect(() => subscribeConsent(setRequest), []);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <ShieldAlert size={22} />
          </span>
          <div>
            <h2 id="ai-consent-title" className="text-base font-bold">ارسال تصویر به سرویس ابری</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              برای دقیق‌ترین خوانش، تصویر این سند به {request.providerLabel} فرستاده می‌شود.
            </p>
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl bg-muted p-4 text-sm">
          <p className="font-semibold leading-6">
            فایل: <span className="font-normal text-muted-foreground">{request.fileName}</span>
          </p>
          <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
            <CloudUpload size={15} className="mt-1 shrink-0" />
            تصویر فقط برای همین خوانش ارسال می‌شود و از طرف برنامه ذخیره یا بازفرستاده نمی‌شود.
          </p>
          <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
            <Lock size={15} className="mt-1 shrink-0" />
            کلید API شما روی همین دستگاه می‌ماند. اگر سند حساس است، گزینه «فقط محلی» را انتخاب کنید.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => resolveConsent(true)}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            ارسال کن و بخوان
          </button>
          <button
            onClick={() => resolveConsent(false)}
            className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold transition-colors hover:bg-muted"
          >
            فقط محلی (آفلاین)
          </button>
        </div>
      </div>
    </div>
  );
}
