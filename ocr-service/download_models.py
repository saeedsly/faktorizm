# -*- coding: utf-8 -*-
"""
دریافت وزن‌های موتورهای OCR برای اجرای آفلاین.

این اسکریپت فقط یک‌بار و روی دستگاه متصل به اینترنت اجرا می‌شود؛ خود سرویس
OCR هیچ‌وقت دانلود نمی‌کند. اگر دستگاه به Hugging Face دسترسی ندارد، فایل‌ها
را جای دیگر دانلود و در مسیر گفته‌شده کپی کنید.

نمونه‌ها:
    python download_models.py --falcon          # tiiuae/Falcon-OCR (~۱ گیگابایت)
    python download_models.py --falcon --repo tiiuae/Falcon-OCR-Arabic
    python download_models.py --check           # فقط بررسی وضعیت فعلی
    python download_models.py --v6 path/to/det.onnx   # کپی مدل تشخیص PP-OCRv6

دربارهٔ Falcon-OCR-Arabic: TII تا اکتبر ۲۰۲۶ وزن‌های نسخهٔ عربی را منتشر نکرده
و فقط دمو دارد. وزن‌های پایهٔ `tiiuae/Falcon-OCR` (Apache-2.0) در دسترس است و
همین اسکریپت آن را می‌آورد. اگر روزی نسخهٔ عربی منتشر شد، فقط `--repo` را
عوض کنید؛ سرویس خودش آن را اولویت اول می‌کند.
"""
import argparse
import os
import shutil
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get('OCR_MODEL_DIR', os.path.join(BASE_DIR, 'models'))
FALCON_DIR = os.environ.get('OCR_FALCON_DIR', os.path.join(MODEL_DIR, 'falcon-ocr'))
DEFAULT_REPO = os.environ.get('OCR_FALCON_REPO', 'tiiuae/Falcon-OCR')

OK = '✓'
NO = '·'


def check():
    print('مسیر مدل‌ها:', MODEL_DIR)
    det = [f for f in os.listdir(MODEL_DIR) if 'det' in f.lower()] if os.path.isdir(MODEL_DIR) else []
    rec = [f for f in os.listdir(MODEL_DIR) if 'rec' in f.lower()] if os.path.isdir(MODEL_DIR) else []
    print(f'  {OK if det else NO} تشخیص: {", ".join(det) or "پیدا نشد"}')
    print(f'  {OK if rec else NO} شناسایی: {", ".join(rec) or "پیدا نشد"}')
    has_v6 = any('v6' in f.lower() for f in det)
    print(f'  {OK if has_v6 else NO} PP-OCRv6 (تشخیص): { "موجود" if has_v6 else "نیست؛ از v5 استفاده می‌شود"}')
    weights = []
    if os.path.isdir(FALCON_DIR):
        weights = [f for f in os.listdir(FALCON_DIR) if f.endswith(('.safetensors', '.bin', '.onnx'))]
    print(f'  {OK if weights else NO} Falcon-OCR: {", ".join(weights) or f"در {FALCON_DIR} نیست"}')
    try:
        import transformers  # noqa: F401
        print(f'  {OK} transformers نصب است')
    except Exception:  # noqa: BLE001
        print(f'  {NO} transformers نصب نیست (requirements-falcon.txt)')


def fetch_falcon(repo, target):
    try:
        from huggingface_hub import snapshot_download
    except Exception:  # noqa: BLE001
        print('huggingface_hub نصب نیست. اجرا کنید:')
        print('  pip install -U huggingface_hub')
        return 1
    os.makedirs(target, exist_ok=True)
    print(f'دریافت {repo} به {target} ...')
    try:
        snapshot_download(
            repo_id=repo,
            local_dir=target,
            allow_patterns=['*.json', '*.safetensors', '*.txt', '*.py', '*.model', '*.png', '*.md'],
        )
    except Exception as exc:  # noqa: BLE001
        print(f'دریافت ناموفق: {type(exc).__name__}: {exc}')
        print('اگر مدل خصوصی یا منتشرنشده است، فایل‌ها را دستی در این مسیر بگذارید:')
        print(' ', target)
        return 1
    print(f'{OK} وزن‌ها در {target} آماده شد. سرویس را دوباره اجرا کنید.')
    return 0


def copy_v6(source):
    if not os.path.isfile(source):
        print(f'فایل پیدا نشد: {source}')
        return 1
    os.makedirs(MODEL_DIR, exist_ok=True)
    name = os.path.basename(source)
    if 'v6' not in name.lower():
        name = 'PP-OCRv6_mobile_det.onnx'
    target = os.path.join(MODEL_DIR, name)
    shutil.copy2(source, target)
    print(f'{OK} مدل تشخیص کپی شد: {target}')
    print('سرویس خودکار این فایل را به v5 ترجیح می‌دهد.')
    return 0


def export_hint():
    print()
    print('برای ساختن ONNX تشخیص PP-OCRv6 (روی دستگاه متصل):')
    print('  pip install "paddleocr==3.7.0" "paddle2onnx" paddlepaddle')
    print('  python -c "from paddleocr import PaddleOCR; PaddleOCR(lang=\'arabic\', '
          'ocr_version=\'PP-OCRv6\')"   # دانلود وزن‌ها')
    print('سپس فایل det را با paddle2onnx به ONNX تبدیل و با --v6 کپی کنید.')
    print('یادآوری: PP-OCRv6 خودش شناسایی عربی ندارد؛ رکونایزر عربی از PP-OCRv5 می‌آید.')
    print()


def main():
    parser = argparse.ArgumentParser(description='دریافت مدل‌های OCR برای حالت آفلاین')
    parser.add_argument('--check', action='store_true', help='بررسی وضعیت مدل‌های موجود')
    parser.add_argument('--falcon', action='store_true', help='دریافت وزن‌های Falcon-OCR')
    parser.add_argument('--repo', default=DEFAULT_REPO, help='شناسهٔ مخزن Hugging Face')
    parser.add_argument('--target', default=FALCON_DIR, help='مسیر مقصد وزن‌ها')
    parser.add_argument('--v6', metavar='FILE', help='کپی فایل ONNX تشخیص PP-OCRv6')
    args = parser.parse_args()

    if args.v6:
        return copy_v6(args.v6)
    if args.falcon:
        code = fetch_falcon(args.repo, args.target)
        check()
        return code
    check()
    export_hint()
    return 0


if __name__ == '__main__':
    sys.exit(main())
