# -*- coding: utf-8 -*-
"""
رجیستری موتورهای OCR — انتخاب خودکار بهترین موتور در دسترس.

سه موتور پشتیبانی می‌شود:

1) `falcon-ocr-arabic` — مدل Falcon-OCR-Arabic (TII، ۲۷۰ میلیون پارامتر) که
   مستقیماً تصویر را می‌بیند و متن/جدول را برمی‌گرداند. اگر وزن‌های مدل و
   کتابخانه transformers روی دستگاه موجود باشند، اولویت اول است.
2) `ppocrv6-arabic` — تشخیص جعبه با PP-OCRv6 (PaddleOCR 3.7) و شناسایی با
   رکونایزر عربی PP-OCRv5. دلیل ترکیب: خانواده PP-OCRv6 پنجاه زبان لاتین/آسیای
   شرقی را پوشش می‌دهد و عربی در آن نیست؛ پس رکونایزر عربی همان v5 می‌ماند
   ولی تشخیص جعبه از v6 (دقت بالاتر روی رسید چروک) می‌آید.
3) `ppocrv5-arabic` — موتور فعلی (تشخیص و شناسایی v5) به‌عنوان پشتیبان نهایی.

انتخاب با متغیر محیطی `OCR_ENGINE` کنترل می‌شود:
    auto (پیش‌فرض) | falcon | ppocrv6 | ppocrv5

هیچ‌کدام از این موتورها در زمان اجرا از اینترنت دانلود نمی‌شود؛ فایل‌ها باید
از قبل در پوشه models باشند (اسکریپت fetch در scripts/).
"""
import glob
import sys
import importlib.util
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get('OCR_MODEL_DIR', os.path.join(BASE_DIR, 'models'))

# پارامترهای تشخیص؛ با اسکریپت calibrate.py روی رسیدهای خودتان تنظیم کنید
# پیش‌فرض‌ها همان مقادیر آزمون‌شدهٔ نسخهٔ قبل است؛ تغییر را با calibrate.py
# روی عکس‌های خودتان بسنجید (در پوشهٔ scripts/ocr-bench هم تصویر مرجع هست).
DET_THRESH = float(os.environ.get('OCR_DET_THRESH', '0.20'))
DET_BOX_THRESH = float(os.environ.get('OCR_DET_BOX_THRESH', '0.40'))
DET_SIDE = int(os.environ.get('OCR_DET_SIDE', '1600'))

PRIORITY = ['falcon', 'ppocrv6', 'ppocrv5']


def _first_existing(patterns):
    for pattern in patterns:
        hits = sorted(glob.glob(os.path.join(MODEL_DIR, pattern)))
        if hits:
            return hits[0]
    return None


def _has_module(name):
    return importlib.util.find_spec(name) is not None


def _det_paths():
    """فایل تشخیص: اول v6، بعد v5."""
    return _first_existing([
        'PP-OCRv6*det*.onnx', '*v6*det*.onnx',
        'PP-OCRv5_mobile_det.onnx', '*det*.onnx',
    ])


def _arabic_rec_paths():
    """رکونایزر عربی (v5) + دیکشنری؛ نسخه v6 عربی وجود ندارد."""
    return (
        _first_existing(['arabic_PP-OCRv*_rec.onnx', '*arabic*rec*.onnx']),
        _first_existing(['arabic_dict.txt', '*arabic*dict*.txt']),
    )


def _cls_path():
    return _first_existing(['cls.onnx', '*cls*.onnx'])


# پوشه‌های ممکن وزن‌های Falcon — download_models.py هر کدام را بسازد، همین‌جا
# پیدا می‌شود. قبلاً فقط «falcon-ocr-arabic» بررسی می‌شد و اسکریپت دانلود در
# «falcon-ocr» می‌ریخت؛ نتیجه: موتور هرگز پیدا نمی‌شد.
FALCON_DIRS = [
    os.environ.get('OCR_FALCON_DIR'),
    os.path.join(MODEL_DIR, 'falcon-ocr-arabic'),
    os.path.join(MODEL_DIR, 'falcon-ocr'),
    os.path.join(BASE_DIR, 'falcon-ocr-arabic'),
    os.path.join(BASE_DIR, 'falcon-ocr'),
]


def falcon_dir():
    """نخستین پوشهٔ موجود که وزن مدل دارد (یا مسیر پیش‌فرض برای پیام راهنما)."""
    for path in FALCON_DIRS:
        if not path:
            continue
        if os.path.isdir(path) and _falcon_weights(path):
            return path
    return FALCON_DIRS[1]


def _falcon_weights(path):
    return sorted(
        [f for f in os.listdir(path) if f.endswith(('.safetensors', '.bin', '.onnx'))]
    ) if os.path.isdir(path) else []


def falcon_status():
    """
    وضعیت کامل Falcon-OCR — برای اینکه رابط کاربری بتواند بگوید *چرا* آماده نیست.

    سه شرط لازم است: وزن مدل، کتابخانهٔ transformers، و torch.
    """
    path = falcon_dir()
    weights = _falcon_weights(path)
    has_torch = _has_module('torch')
    has_transformers = _has_module('transformers')
    if weights and has_torch and has_transformers:
        reason, reason_en = None, None
    elif not weights:
        reason = f'وزن مدل در {path} نیست (یک‌بار falcon-setup.bat را اجرا کنید)'
        reason_en = f'model weights missing in {path} (run falcon-setup.bat once)'
    elif not has_transformers:
        reason = 'کتابخانهٔ transformers نصب نیست (requirements-falcon.txt)'
        reason_en = 'transformers is not installed (requirements-falcon.txt)'
    else:
        reason = 'کتابخانهٔ torch نصب نیست (requirements-falcon.txt)'
        reason_en = 'torch is not installed (requirements-falcon.txt)'
    return {
        'id': 'falcon-ocr-arabic',
        'label': 'Falcon-OCR-Arabic (TII)',
        'dir': path,
        'weights': weights[:3],
        'hasWeights': bool(weights),
        'hasTorch': has_torch,
        'hasTransformers': has_transformers,
        'ready': bool(weights) and has_torch and has_transformers,
        'reason': reason,
        'reasonEn': reason_en,
    }


def detect_falcon():
    """آیا Falcon-OCR-Arabic قابل استفاده است؟"""
    status = falcon_status()
    if not status['ready']:
        return None
    return {
        'id': status['id'],
        'label': status['label'],
        'path': status['dir'],
        'kind': 'falcon',
    }


def detect_rapid(prefer_v6=True):
    """موتور RapidOCR با تشخیص v6 (اگر بود) و رکونایزر عربی."""
    det = _det_paths()
    rec, keys = _arabic_rec_paths()
    cls = _cls_path()
    if not det or not rec or not _has_module('rapidocr'):
        return None
    is_v6 = 'v6' in os.path.basename(det).lower()
    if prefer_v6 and not is_v6:
        return None
    return {
        'id': 'ppocrv6-arabic' if is_v6 else 'ppocrv5-arabic',
        'label': ('PP-OCRv6 det + Arabic rec' if is_v6 else 'PP-OCRv5 (arabic)'),
        'det': det,
        'rec': rec,
        'keys': keys,
        'cls': cls,
        'kind': 'rapid',
    }


def _wrap(spec):
    """ساخت شیء موتور از مشخصات."""
    if spec is None:
        return None
    if spec['kind'] == 'falcon':
        from falcon import FalconOcrEngine
        return FalconOcrEngine(spec['path'])
    from rapid import RapidOcrEngine  # noqa: WPS433 — وارد کردن تنبل

    return RapidOcrEngine(spec)


def available():
    """فهرست موتورهای قابل استفاده به ترتیب اولویت (برای /health)."""
    found = []
    falcon = detect_falcon()
    if falcon:
        found.append({'id': falcon['id'], 'label': falcon['label'], 'ready': True})
    v6 = detect_rapid(prefer_v6=True)
    if v6:
        found.append({'id': v6['id'], 'label': v6['label'], 'ready': True})
    v5 = detect_rapid(prefer_v6=False)
    if v5:
        found.append({'id': v5['id'], 'label': v5['label'], 'ready': True})
    return found


_cached = None
_cached_error = None
_cached_id = None


def select(preferred=None):
    """
    موتور فعال را برمی‌گرداند.
    preferred: auto | falcon | ppocrv6 | ppocrv5 | شناسه کامل
    """
    global _cached, _cached_error, _cached_id
    preferred = (preferred or os.environ.get('OCR_ENGINE', 'auto') or 'auto').strip().lower()
    if _cached is not None and _cached_id == preferred:
        return _cached
    if _cached_error is not None and _cached_id == preferred:
        return None

    order = PRIORITY if preferred == 'auto' else [preferred]
    last_error = None
    for name in order:
        spec = None
        try:
            if name in ('falcon', 'falcon-ocr-arabic'):
                spec = detect_falcon()
                if spec is None:
                    last_error = 'Falcon-OCR-Arabic در دسترس نیست (وزن مدل یا transformers نیست)'
                    continue
            elif name in ('ppocrv6', 'ppocrv6-arabic'):
                spec = detect_rapid(prefer_v6=True)
                if spec is None:
                    last_error = 'PP-OCRv6 det در دسترس نیست (فایل onnx یا rapidocr نیست)'
                    continue
            elif name in ('ppocrv5', 'ppocrv5-arabic'):
                spec = detect_rapid(prefer_v6=False)
                if spec is None:
                    last_error = 'PP-OCRv5 در دسترس نیست (فایل onnx یا rapidocr نیست)'
                    continue
            else:
                last_error = f'موتور ناشناخته: {name}'
                continue

            engine = _wrap(spec)
            if engine is None or not engine.ready():
                last_error = f'{name}: بارگذاری ناموفق ({getattr(engine, "error", "-")})'
                continue
            _cached, _cached_error, _cached_id = engine, None, preferred
            return engine
        except Exception as exc:  # noqa: BLE001 — هر خطایی یعنی برو سراغ بعدی
            last_error = f'{name}: {type(exc).__name__}: {exc}'

    _cached, _cached_error, _cached_id = None, last_error or 'هیچ موتور OCR یافت نشد', preferred
    return None


def selection_error():
    return _cached_error


def det_params():
    """پارامترهای تشخیص برای RapidOCR (قابل کالیبراسیون با متغیر محیطی)."""
    return {
        'thresh': DET_THRESH,
        'box_thresh': DET_BOX_THRESH,
        'limit_side_len': DET_SIDE,
    }


def _dict_words():
    """شمار واژه‌های واژه‌نامهٔ فارسی (برای گزارش وضعیت)."""
    try:
        import persian_dict  # noqa: WPS433 — تنبل

        return len(persian_dict.WORDS)
    except Exception:  # noqa: BLE001
        return 0


def diagnostics():
    """
    گزارش کامل «چه چیزی هست و چه چیزی نیست».

    رابط کاربری همین را نشان می‌دهد؛ بدون این گزارش کاربر فقط می‌دید
    «موتور فعال: Tesseract» و نمی‌دانست چرا موتور قوی نیامده است.
    """
    det = _det_paths()
    rec, keys = _arabic_rec_paths()
    falcon = falcon_status()
    rapid_ready = bool(det and rec and _has_module('rapidocr') and _has_module('onnxruntime'))
    rapid_reason = rapid_reason_en = None
    if not det:
        rapid_reason = 'فایل مدل تشخیص (det.onnx) نیست'
        rapid_reason_en = 'detector model file (det.onnx) is missing'
    elif not rec:
        rapid_reason = 'فایل رکونایزر عربی (rec.onnx) نیست'
        rapid_reason_en = 'arabic recognizer file (rec.onnx) is missing'
    elif not _has_module('onnxruntime'):
        rapid_reason = 'onnxruntime نصب نیست'
        rapid_reason_en = 'onnxruntime is not installed'
    elif not _has_module('rapidocr'):
        rapid_reason = 'rapidocr نصب نیست (setup.bat مرحلهٔ ۳)'
        rapid_reason_en = 'rapidocr is not installed (run setup.bat)'

    engines = [
        {
            'id': 'falcon-ocr-arabic',
            'label': 'Falcon-OCR-Arabic',
            'ready': falcon['ready'],
            'reason': falcon['reason'],
            'reasonEn': falcon['reasonEn'],
            'hint': 'دقیق‌ترین موتور برای جدول و متن فارسی — نصب یک‌باره با falcon-setup.bat',
        },
        {
            'id': 'ppocrv6-arabic' if (det and 'v6' in os.path.basename(det).lower()) else 'ppocrv5-arabic',
            'label': 'PP-OCR (عربی)',
            'ready': rapid_ready,
            'reason': rapid_reason,
            'reasonEn': rapid_reason_en,
            'hint': 'موتور محلی پیشنهادی: تشخیص جعبه + رکونایزر عربی PP-OCRv5',
        },
        {
            'id': 'tesseract-browser',
            'label': 'Tesseract (درون مرورگر)',
            'ready': True,
            'reason': None,
            'reasonEn': None,
            'hint': 'همیشه در دسترس؛ پشتیبان نهایی بدون نیاز به پایتون',
        },
    ]

    return {
        'modelsDir': MODEL_DIR,
        'files': {
            'det': os.path.basename(det) if det else None,
            'rec': os.path.basename(rec) if rec else None,
            'cls': os.path.basename(_cls_path()) if _cls_path() else None,
            'dict': os.path.basename(keys) if keys else None,
        },
        'python': {
            'executable': sys.executable,
            'version': '%d.%d.%d' % sys.version_info[:3],
            'onnxruntime': _has_module('onnxruntime'),
            'rapidocr': _has_module('rapidocr'),
            'torch': falcon['hasTorch'],
            'transformers': falcon['hasTransformers'],
        },
        'falcon': falcon,
        'dictionary': {'words': _dict_words()},
        'engines': engines,
    }
