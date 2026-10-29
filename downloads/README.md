# بسته‌های نصبی فاکتوریزم

## ۱) faktorizm-htdocs.zip — برای ویندوز ۷ و هر سیستم قدیمی (توصیه‌شده)
نسخه کاملا آفلاین مرورگری؛ بدون نیاز به Node. فقط فایل‌ها را در پوشه htdocs کپی کنید.
- دانلود: https://github.com/saeedsly/faktorizm/raw/arena/b3a2f281-faktorizm/downloads/faktorizm-htdocs.zip
- نصب: پوشه `faktorizm` را در `C:\xampp\htdocs` کپی و آدرس `http://localhost/faktorizm/` را باز کنید.
- قابلیت‌ها: OCR آفلاین، فاکتور، طرف حساب، کالا، گزارش و خروجی اکسل (داده داخل مرورگر).

## ۲) faktorizm-xampp.zip — نسخه کامل سروری (ویندوز ۱۰ به بالا / سرور)
با Node.js و MySQL؛ شامل احراز هویت، نقش‌ها، لایسنس، تیکت و API.
- دانلود: https://github.com/saeedsly/faktorizm/raw/arena/b3a2f281-faktorizm/downloads/faktorizm-xampp.zip
- نیازمندی: Node.js 22 و MySQL (XAMPP). روی ویندوز ۷ قابل اجرا نیست چون Node 22 پشتیبانی نمی‌کند.
- موتور OCR: سرویس محلی پایتون RapidOCR PP-OCRv5 (عربی/فارسی) با مدل‌های بسته‌بندی‌شده و کاملا آفلاین؛ نصب Python 3.11 اختیاری است و در نبود آن، برنامه خودکار با موتور مرورگری Tesseract کار می‌کند.
- نصب: `setup.bat` سپس `start.bat` و باز کردن `http://localhost:8787`.

ورود اولیه نسخه سروری: `admin@faktorizm.ir` / `Admin@1405`.
