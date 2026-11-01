# لینک‌های دانلود بستهٔ فاکتوریزم

> تاریخ ساخت: ۲۰۲۶-۱۱-۰۱ · کامیت: `4c79c9f`

---

## ۱) لینک اصلی — یک فایل زیپ کامل (تست‌شده از سمت سرور)

این آدرس روی `codeload.github.com` است، یعنی **بدون** هیچ ریدایرکتی به
`raw.githubusercontent.com` (که در شبکهٔ شما بسته است):

```
https://codeload.github.com/saeedsly/faktorizm/zip/refs/heads/arena/b3a2f281-faktorizm
```

- حجم: حدود ۱۸۴ مگابایت · نوع فایل: zip
- بعد از دانلود و Extract، در پوشهٔ `downloads/` هر دو بسته را دارید:
  - `faktorizm-xampp.zip` (۴۲ مگابایت — بستهٔ کامل)
  - `faktorizm-htdocs.zip` (۲۹ مگابایت — بستهٔ سبک)

اگر این آدرس باز نشد، این یکی را امتحان کنید (همان فایل، مسیر دیگر):

```
https://github.com/saeedsly/faktorizm/archive/refs/heads/arena/b3a2f281-faktorizm.zip
```

---

## ۲) لینک سبک — تکه‌های ۱۴ مگابایتی از CDN

هر تکه زیر سقف ۲۰ مگابایت است. هر چهار تکهٔ زیر را دانلود کنید و کنارِ
`join.bat` در یک پوشه بگذارید، بعد `join.bat` را اجرا کنید؛ خودش
`faktorizm-xampp.zip` را می‌سازد.

**بستهٔ کامل (۴ تکه):**

```
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/xampp.part0.bin
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/xampp.part1.bin
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/xampp.part2.bin
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/xampp.part3.bin
```

**بستهٔ سبک (۳ تکه):**

```
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/htdocs.part0.bin
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/htdocs.part1.bin
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/htdocs.part2.bin
```

**ابزار چسباندن و بررسی سلامت:**

```
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/join.bat
https://cdn.jsdelivr.net/gh/saeedsly/faktorizm@4c79c9f/downloads/parts/SHA256SUMS
```

اگر `cdn.jsdelivr.net` در دسترس نبود، همین مسیرها را با این دامنه‌ها هم می‌توان
گرفت: `fastly.jsdelivr.net` · `gcore.jsdelivr.net` · `testingcf.jsdelivr.net`

---

## ۳) لینک تک‌فایلی سبک‌تر (بدون تکه‌کردن)

```
https://raw.githack.com/saeedsly/faktorizm/4c79c9f/downloads/faktorizm-xampp.zip
https://raw.githack.com/saeedsly/faktorizm/4c79c9f/downloads/faktorizm-htdocs.zip
```

---

## بررسی سلامت فایل بعد از دانلود

```
faktorizm-xampp.zip   b1d900cc3614065aa95521d53fc273ca8c9de50c2b2ca32e04c9b00f63862222
faktorizm-htdocs.zip  7d787a7ae1240c26a7bd92ce5394191f030e740757913605cb740b1676f87e78
```

روی ویندوز: `certutil -hashfile faktorizm-xampp.zip SHA256`

---

## نصب سریع بستهٔ کامل

1. زیپ را در مسیر ساده و بدون حروف فارسی Extract کنید (مثلاً `C:\faktorizm-xampp`).
2. XAMPP → مقابل **MySQL** دکمهٔ Start.
3. Node.js LTS و Python 3.11 (تیک *Add python.exe to PATH*).
4. `setup.bat` → تا «نصب کامل شد» صبر کنید.
5. `start.bat` → مرورگر روی `http://localhost:8787`.
