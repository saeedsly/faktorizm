# -*- coding: utf-8 -*-
"""
آداپتور RapidOCR برای PP-OCRv6 (تشخیص) + رکونایزر عربی PP-OCRv5.

RapidOCR هم تشخیص و هم شناسایی را با ONNX Runtime اجرا می‌کند و امکان می‌دهد
فایل هر مرحله جدا داده شود؛ به همین دلیل می‌توان تشخیص نسل جدید (جعبه‌های
دقیق‌تر روی رسید چروک) را با رکونایزر عربی (که هنوز در v6 منتشر نشده) ترکیب کرد.
"""
import os

import numpy as np

from engines import MODEL_DIR, det_params

# رکونایزر چندزبانهٔ PP-OCRv6 (چینی/انگلیسی/۴۶ زبان لاتین) که همراه بستهٔ
# rapidocr نصب می‌شود. برای «خوانش دوم» کادرهای عددی/لاتین استفاده می‌شود.
MULTI_REC_NAME = 'PP-OCRv6_rec_small.onnx'


def find_multi_rec():
    """
    مسیر رکونایزر چندزبانه را پیدا می‌کند.

    ترتیب: متغیر محیطی → پوشهٔ models خودمان → بستهٔ نصب‌شدهٔ rapidocr.
    هیچ دانلودی انجام نمی‌شود؛ اگر پیدا نشد، خوانش دوم خاموش می‌ماند.
    """
    explicit = os.environ.get('OCR_MULTI_REC')
    if explicit and os.path.isfile(explicit):
        return explicit
    local = os.path.join(MODEL_DIR, MULTI_REC_NAME)
    if os.path.isfile(local):
        return local
    try:
        import rapidocr  # noqa: WPS433 — عمداً تنبل

        bundled = os.path.join(os.path.dirname(rapidocr.__file__), 'models', MULTI_REC_NAME)
        if os.path.isfile(bundled):
            return bundled
    except Exception:  # noqa: BLE001
        return None
    return None


class RapidOcrEngine:
    kind = 'rapid'

    def __init__(self, spec, overrides=None):
        self.spec = spec
        self.overrides = overrides or {}
        self.id = spec['id']
        self.label = spec['label']
        self.error = None
        self._engine = None
        self._multi = None
        self._multi_checked = False
        try:
            from rapidocr import RapidOCR
        except Exception as exc:  # noqa: BLE001
            self.error = f'rapidocr در دسترس نیست: {exc}'
            return
        tuned = {**det_params(), **{k: v for k, v in self.overrides.items() if k in det_params()}}
        params = {
            'Det.model_path': spec['det'],
            'Rec.model_path': spec['rec'],
            'Rec.rec_keys_path': spec['keys'],
            # عرض بیشتر برای مبالغ بلند فاکتور تا رقم‌ها بریده نشوند
            'Rec.rec_img_shape': [3, 48, 640],
            'Det.limit_side_len': tuned['limit_side_len'],
            'Det.limit_type': 'max',
            'Det.thresh': tuned['thresh'],
            'Det.box_thresh': tuned['box_thresh'],
            'Det.unclip_ratio': float(os.environ.get('OCR_DET_UNCLIP', '1.8')),
            'Global.log_level': 'error',
        }
        if spec.get('cls'):
            params['Cls.model_path'] = spec['cls']
        try:
            self._engine = RapidOCR(params=params)
        except Exception as exc:  # noqa: BLE001
            self.error = f'{type(exc).__name__}: {exc}'

    def ready(self):
        return self._engine is not None

    def _multi_engine(self):
        """موتور خوانش دوم (PP-OCRv6 multi) — یک‌بار ساخته و کش می‌شود."""
        if self._multi_checked:
            return self._multi
        self._multi_checked = True
        if os.environ.get('OCR_SECOND_READER', '1') == '0':
            return None
        path = find_multi_rec()
        if not path:
            return None
        try:
            from rapidocr import RapidOCR

            self._multi = RapidOCR(params={
                'Det.model_path': self.spec['det'],
                'Rec.model_path': path,
                'Rec.rec_img_shape': [3, 48, 640],
                'Det.limit_side_len': 960,
                'Global.log_level': 'error',
            })
        except Exception:  # noqa: BLE001 — خوانش دوم اختیاری است
            self._multi = None
        return self._multi

    def second_opinion(self, image, box, padding=0.12):
        """
        خوانش دوم یک کادر با رکونایزر چندزبانه.

        رکونایزر فارسی روی خط‌های عددی/لاتین («1404/05/12»، «ThinkPad E14»)
        ضعیف است؛ این موتور همان کادر را دقیق می‌خواند. خروجی: (متن، اطمینان)
        یا None.
        """
        engine = self._multi_engine()
        if engine is None:
            return None
        x1, y1, x2, y2 = box
        w = max(x2 - x1, 1)
        h = max(y2 - y1, 1)
        crop_box = (
            int(max(0, x1 - padding * w)),
            int(max(0, y1 - padding * h)),
            int(min(image.width, x2 + padding * w)),
            int(min(image.height, y2 + padding * h)),
        )
        crop = image.crop(crop_box)
        if crop.width < 8 or crop.height < 6:
            return None
        arr = np.asarray(crop.convert('RGB'))[:, :, ::-1].copy()
        try:
            out = engine(arr, use_det=False, use_cls=False, use_rec=True)
        except Exception:  # noqa: BLE001
            return None
        if not getattr(out, 'txts', None):
            return None
        return str(out.txts[0]), float(out.scores[0])

    def info(self):
        return {
            'id': self.id,
            'label': self.label,
            'det': os.path.basename(self.spec['det']),
            'rec': os.path.basename(self.spec['rec']),
            'params': {**det_params(), **self.overrides},
        }

    def recognize(self, image):
        """تصویر PIL → (فهرست (text, score, box), فراداده)."""
        if self._engine is None:
            raise RuntimeError(self.error or 'engine not ready')
        arr = np.asarray(image.convert('RGB'))[:, :, ::-1].copy()  # RGB → BGR
        result = self._engine(arr, use_det=True, use_cls=True, use_rec=True)
        rows = []
        if not getattr(result, 'txts', None):
            return rows, {}
        for box, text, score in zip(result.boxes, result.txts, result.scores):
            pts = [[float(p[0]), float(p[1])] for p in box]
            rows.append((str(text), float(score), pts))
        return rows, {}

    def reread(self, image, box, padding=0.06):
        """خوانش دوباره یک برش با حاشیه؛ برای جعبه‌هایی که لبه رقم را بریده‌اند."""
        if self._engine is None:
            return None
        x1, y1, x2, y2 = box
        pad = max(int((x2 - x1) * padding), 2)
        crop = image.crop((max(0, x1 - pad), max(0, y1 - pad), min(image.width, x2 + pad), min(image.height, y2 + pad)))
        if crop.width < 8 or crop.height < 8:
            return None
        arr = np.asarray(crop.convert('RGB'))[:, :, ::-1].copy()
        try:
            result = self._engine(arr, use_det=False, use_cls=False, use_rec=True)
        except Exception:  # noqa: BLE001
            return None
        if not getattr(result, 'txts', None):
            return None
        return str(result.txts[0]), float(result.scores[0])
