/**
 * تأیید کاربر پیش از ارسال تصویر به سرویس ابری.
 *
 * برخلاف تنظیمات، این تأیید هر بار و برای همان دسته فایل گرفته می‌شود تا
 * هیچ تصویری بی‌اطلاع کاربر از دستگاه خارج نشود.
 */
type Resolver = (approved: boolean) => void;

export interface ConsentRequest {
  fileName: string;
  providerLabel: string;
  filesCount: number;
  /** نام مدل انتخاب‌شده؛ برای شفافیت در تأیید ارسال */
  model?: string;
  /** حالت خوانش: «فقط ابری» یا «ترکیبی» */
  mode?: 'ai' | 'hybrid';
  resolve: Resolver;
}

let pending: ConsentRequest | null = null;
const listeners = new Set<(req: ConsentRequest | null) => void>();

function emit() {
  listeners.forEach((listener) => listener(pending));
}

export function subscribeConsent(listener: (req: ConsentRequest | null) => void): () => void {
  listeners.add(listener);
  listener(pending);
  return () => listeners.delete(listener);
}

/** درخواست تأیید؛ تا پاسخ کاربر معلق می‌ماند */
export function requestAiConsent(options: {
  fileName: string;
  providerLabel: string;
  filesCount?: number;
  model?: string;
  mode?: 'ai' | 'hybrid';
}): Promise<boolean> {
  if (pending) {
    // اگر پرسشی باز است، همان پاسخ برای بقیه صف استفاده می‌شود
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    pending = {
      fileName: options.fileName,
      providerLabel: options.providerLabel,
      filesCount: options.filesCount ?? 1,
      model: options.model,
      mode: options.mode,
      resolve: (approved) => {
        pending = null;
        emit();
        resolve(approved);
      },
    };
    emit();
  });
}

export function resolveConsent(approved: boolean) {
  pending?.resolve(approved);
}
