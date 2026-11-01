// اندازهٔ واقعی هر فایل از خود سرور خوانده می‌شود؛ هیچ عددی از پیش نوشته نشده.
document.querySelectorAll('[data-size-for]').forEach(async (badge) => {
  try {
    const res = await fetch(badge.dataset.sizeFor, { method: 'HEAD' });
    const bytes = Number(res.headers.get('content-length'));
    if (!bytes) throw new Error('no length');
    badge.textContent = (bytes / 1048576).toFixed(1) + ' مگابایت';
  } catch {
    badge.textContent = 'آمادهٔ دانلود';
  }
});
