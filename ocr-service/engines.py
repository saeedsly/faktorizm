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


def detect_falcon():
    """آیا Falcon-OCR-Arabic قابل استفاده است؟"""
    model_dir = os.environ.get('OCR_FALCON_DIR', os.path.join(MODEL_DIR, 'falcon-ocr-arabic'))
    has_weights = bool(
        glob.glob(os.path.join(model_dir, '*.safetensors'))
        or glob.glob(os.path.join(model_dir, '*.bin'))
        or glob.glob(os.path.join(model_dir, '*.onnx'))
    )
    if not has_weights or not _has_module('transformers'):
        return None
    return {
        'id': 'falcon-ocr-arabic',
        'label': 'Falcon-OCR-Arabic (TII)',
        'path': model_dir,
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
