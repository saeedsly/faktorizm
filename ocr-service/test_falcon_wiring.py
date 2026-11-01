# -*- coding: utf-8 -*-
"""
آزمون سیم‌کشی Falcon-OCR بدون دانلود وزن‌ها.

چرا لازم بود: مسیر پوشهٔ وزن‌ها در `download_models.py` با مسیری که
`engines.detect_falcon()` می‌گشت یکی نبود؛ نتیجه اینکه وزن‌ها دانلود می‌شدند
ولی موتور هرگز فعال نمی‌شد و کاربر همیشه Tesseract می‌دید. این آزمون با
وزن‌های قلابی و torch/transformers قلابی بررسی می‌کند که:

۱) وزن در پوشهٔ دانلود دیده می‌شود،
۲) موتور «آماده» گزارش می‌شود،
۳) رجیستری واقعاً سراغش می‌رود (نه اینکه بی‌صدا رد شود)،
۴) اگر بارگذاری شکست بخورد، به PP-OCR برمی‌گردد و دلیلش را می‌گوید.

اجرا: python test_falcon_wiring.py
"""
import os
import sys
import tempfile

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FAILS = []


def check(name, got, want):
    ok = got == want
    print(('  ✓ ' if ok else '  ✗ ') + name + ('' if ok else f' → {got!r} (انتظار {want!r})'))
    if not ok:
        FAILS.append(name)


def main():
    tmp = tempfile.mkdtemp(prefix='falcon-wiring-')
    model_dir = os.path.join(tmp, 'falcon-ocr-arabic')
    os.makedirs(model_dir, exist_ok=True)
    # وزن قلابی: فقط برای اینکه شناسایی، پوشه را «پر» ببیند
    open(os.path.join(model_dir, 'model.safetensors'), 'wb').write(b'stub')

    # torch/transformers قلابی: نه سنگین‌اند نه دانلود می‌کنند
    stubs = os.path.join(tmp, 'stubs')
    os.makedirs(stubs, exist_ok=True)
    open(os.path.join(stubs, 'torch.py'), 'w').write(
        'float32 = "float32"\nfloat16 = "float16"\nclass cuda:\n    @staticmethod\n    def is_available(): return False\n'
    )
    open(os.path.join(stubs, 'transformers.py'), 'w').write(
        'class AutoModelForCausalLM:\n'
        '    @staticmethod\n'
        '    def from_pretrained(*a, **k):\n'
        '        raise RuntimeError("stub: weights are not real")\n'
    )

    os.environ['OCR_FALCON_DIR'] = model_dir
    sys.path.insert(0, stubs)
    sys.path.insert(0, BASE_DIR)

    import engines  # noqa: WPS433 — بعد از تنظیم محیط

    check('پوشهٔ وزن‌ها پیدا شد', engines.falcon_status()['dir'], model_dir)
    check('وزن دیده شد', engines.falcon_status()['hasWeights'], True)
    check('Falcon «آماده» گزارش می‌شود', engines.falcon_status()['ready'], True)
    check('detect_falcon مشخصات می‌دهد', (engines.detect_falcon() or {}).get('id'), 'falcon-ocr-arabic')

    # رجیستری باید سراغ Falcon برود و فقط پس از شکست بارگذاری، عقب‌نشینی کند
    engines._cached, engines._cached_error, engines._cached_id = None, None, None
    engine = engines.select('falcon')
    check('بارگذاری قلابی ناموفق است', engine, None)
    error = engines.selection_error() or ''
    check('خطا مربوط به بارگذاری وزن است (نه «پیدا نشد»)', 'stub' in error or 'weights' in error, True)
    check('پیام خطا «فایل نیست» نیست', 'در دسترس نیست' in error, False)

    # حالت auto: با شکست Falcon باید PP-OCR یا پیام روشن بیاید، نه سکوت
    engines._cached, engines._cached_error, engines._cached_id = None, None, None
    auto = engines.select('auto')
    if auto is not None:
        check('حالت auto موتور جایگزین داد', auto.id in ('ppocrv5-arabic', 'ppocrv6-arabic'), True)
    else:
        check('حالت auto دلیل شکست را می‌گوید', bool(engines.selection_error()), True)

    print()
    print(f'{6 + 4 - len(FAILS)}/{6 + 4} بررسی موفق' if not FAILS else f'{len(FAILS)} بررسی ناموفق')
    return 1 if FAILS else 0


if __name__ == '__main__':
    sys.exit(main())
