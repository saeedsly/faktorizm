# -*- coding: utf-8 -*-
"""
آداپتور RapidOCR برای PP-OCRv6 (تشخیص) + رکونایزر عربی PP-OCRv5.

RapidOCR هم تشخیص و هم شناسایی را با ONNX Runtime اجرا می‌کند و امکان می‌دهد
فایل هر مرحله جدا داده شود؛ به همین دلیل می‌توان تشخیص نسل جدید (جعبه‌های
دقیق‌تر روی رسید چروک) را با رکونایزر عربی (که هنوز در v6 منتشر نشده) ترکیب کرد.
"""
import os

import numpy as np

from engines import det_params


class RapidOcrEngine:
    kind = 'rapid'

    def __init__(self, spec, overrides=None):
        self.spec = spec
        self.overrides = overrides or {}
        self.id = spec['id']
        self.label = spec['label']
        self.error = None
        self._engine = None
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
