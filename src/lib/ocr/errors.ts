/**
 * تبدیل خطاهای فنی موتور به پیام قابل فهم برای کاربر
 *
 * پیام‌های خام موتورهای بسته‌بندی‌شده (مثل «Cannot destructure property 'x' …»)
 * برای کاربر معنا ندارند و ترسناک‌اند. این تابع علت واقعی را در لاگ نگه می‌دارد
 * و در رابط کاربری جمله فارسی روشن نشان می‌دهد.
 */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const text = raw.toLowerCase();

  if (/destructure|undefined|cannot read|is not a function|null is not an object/.test(text)) {
    return 'خواندن تصویر نیمه‌کاره ماند. یک بار دیگر تلاش کنید؛ اگر تکرار شد، عکس را کمی صاف‌تر و با نور بیشتر بگیرید.';
  }
  if (/memory|allocation|array buffer|too large/.test(text)) {
    return 'حجم تصویر برای پردازش زیاد است؛ آن را کوچک‌تر کنید یا صفحه‌به‌صفحه اسکن کنید.';
  }
  if (/network|fetch|failed to load|timeout/.test(text)) {
    return 'ارتباط با سرویس خوانش برقرار نشد؛ حالت آفلاین را انتخاب کنید یا اتصال را بررسی کنید.';
  }
  if (/permission|denied|not allowed/.test(text)) {
    return 'دسترسی به فایل ممکن نشد؛ فایل را دوباره از همین دستگاه انتخاب کنید.';
  }
  if (/pdf/.test(text)) {
    return 'این فایل PDF خوانده نشد؛ اگر اسکن تصویری است، از آن عکس بگیرید یا نسخه تصویری بسازید.';
  }
  return raw.trim() || 'پردازش سند ناموفق بود؛ دوباره تلاش کنید.';
}
