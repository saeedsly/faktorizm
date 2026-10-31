# -*- coding: utf-8 -*-
"""
آداپتور Falcon-OCR (TII) — مدل ۲۷۰ میلیون پارامتری سند‌خوان با معماری
early-fusion (یک ترانسفورمر، بدون کدگذار بینایی جدا).

رابط رسمی مدل (`tiiuae/Falcon-OCR` روی Hugging Face، مجوز Apache-2.0):

    model = AutoModelForCausalLM.from_pretrained("tiiuae/Falcon-OCR", trust_remote_code=True)
    texts = model.generate(image, category="table")   # جدول HTML
    texts = model.generate(image, category="text")    # متن ساده

این آداپتور همان رابط را صدا می‌زند و خروجی متنی/HTML را به «جعبه‌های ساختگی»
تبدیل می‌کند تا لایهٔ فهم جدول (`table.py`) بدون تغییر روی آن هم کار کند.

نکتهٔ مهم دربارهٔ Falcon-OCR-**Arabic**: TII تا امروز (اکتبر ۲۰۲۶) وزن‌های نسخهٔ
عربی را منتشر نکرده و فقط دمو/playground دارد؛ توضیح رسمی مدل پایه در دسترس
است. پس اگر وزن‌های عربی روی دستگاه نبود، این موتور «آماده نیست» گزارش می‌شود و
رجیستری خودکار سراغ PP-OCR می‌رود. برای استفاده از وزن‌های پایه (چندزبانه)
مسیر مدل را در `OCR_FALCON_DIR` بگذارید.

دربارهٔ اطمینان: `generate` امتیاز توکن نمی‌دهد، بنابراین سقف اطمینان این موتور
به‌صورت محافظه‌کارانه ۰٫۸۲ است تا خروجی هرگز بدون بازبینی «تأییدشده» نشود
(قابل تغییر با OCR_FALCON_TRUST).
"""
import html
import os
import re
from html.parser import HTMLParser

BOX_HEIGHT = 20.0
COL_WIDTH = 120.0

_TABLE_LINE = re.compile(r'^\s*\|.*\|\s*$')
_SEPARATOR = re.compile(r'^\s*\|?[\s:\-|]+\|?\s*$')
_NUMBER = re.compile(r'[0-9۰-۹٠-٩]')

# سقف اطمینان پیش‌فرض؛ با OCR_FALCON_TRUST=1 می‌توان بالا برد
TRUST_CAP = 0.82 if os.environ.get('OCR_FALCON_TRUST') != '1' else 0.95


class FalconOcrEngine:
    kind = 'falcon'

    def __init__(self, model_dir):
        self.id = 'falcon-ocr'
        self.label = 'Falcon-OCR (TII, 270M)'
        self.model_dir = model_dir
        self.error = None
        self._model = None
        self._torch = None
        try:
            import torch
            from transformers import AutoModelForCausalLM
        except Exception as exc:  # noqa: BLE001
            self.error = f'torch/transformers نصب نیست: {exc}'
            return
        self._torch = torch
        dtype = getattr(torch, os.environ.get('OCR_FALCON_DTYPE', 'float32'), torch.float32)
        try:
            self._model = AutoModelForCausalLM.from_pretrained(
                model_dir,
                trust_remote_code=True,
                torch_dtype=dtype,
                low_cpu_mem_usage=True,
                local_files_only=True,
            )
            self._model.eval()
        except Exception as exc:  # noqa: BLE001
            self.error = f'{type(exc).__name__}: {exc}'
            self._model = None

    def ready(self):
        return self._model is not None

    def info(self):
        return {
            'id': self.id,
            'label': self.label,
            'path': os.path.basename(self.model_dir),
            'params': '270M',
            'trustCap': TRUST_CAP,
        }

    # ------------------------------------------------------------------ خوانش
    def _call(self, image, category):
        """فراخوانی رسمی مدل؛ خروجی همیشه رشته است."""
        if not self.ready():
            raise RuntimeError(self.error or 'falcon engine not ready')
        with self._torch.no_grad():
            out = self._model.generate(image, category=category)
        if isinstance(out, (list, tuple)):
            return str(out[0]) if out else ''
        return str(out)

    def recognize(self, image):
        """تصویر PIL → (فهرست (text, score, box), فراداده)."""
        if not self.ready():
            raise RuntimeError(self.error or 'falcon engine not ready')

        table_text = ''
        plain_text = ''
        errors = []
        # جدول برای اقلام، متن ساده برای سربرگ/جمع‌بندی
        for category, target in (('table', 'table'), ('text', 'text')):
            try:
                value = self._call(image, category)
            except Exception as exc:  # noqa: BLE001 — دستهٔ بعدی امتحان می‌شود
                errors.append(f'{category}: {type(exc).__name__}: {exc}')
                continue
            if target == 'table':
                table_text = value
            else:
                plain_text = value

        if not table_text and not plain_text:
            raise RuntimeError('; '.join(errors) or 'falcon خروجی نداد')

        rows = text_to_rows(plain_text, table_text, score=TRUST_CAP)
        meta = {
            'raw': (plain_text or table_text)[:6000],
            'rows': len(rows),
            'confidence': TRUST_CAP,
            'categories': {'table': bool(table_text), 'text': bool(plain_text)},
        }
        if errors:
            meta['errors'] = errors
        return rows, meta

    def reread(self, image, box, padding=0.06):  # noqa: ARG002 — Falcon جعبه نمی‌دهد
        return None


# ---------------------------------------------------------------- تبدیل خروجی

class _TableParser(HTMLParser):
    """جدول HTML خروجی مدل → فهرست ردیف‌ها (با پشتیبانی colspan ساده)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []
        elif tag == 'br' and self._cell is not None:
            self._cell.append(' ')

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self._cell is not None and self._row is not None:
            self._row.append(''.join(self._cell))
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if any(cell.strip() for cell in self._row):
                self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def _clean_cell(cell):
    text = html.unescape(re.sub(r'<[^>]+>', ' ', cell))
    text = text.replace('**', '').replace('`', '')
    return re.sub(r'\s+', ' ', text).strip()


def html_rows(text):
    if '<t' not in text.lower():
        return []
    parser = _TableParser()
    try:
        parser.feed(text)
    except Exception:  # noqa: BLE001 — HTML ناقص؛ به مسیر متنی برمی‌گردیم
        return []
    rows = []
    for row in parser.rows:
        cells = [_clean_cell(cell) for cell in row]
        cells = [cell for cell in cells if cell]
        if len(cells) >= 2:
            rows.append(cells)
    return rows


def table_rows(text):
    """جدول مارک‌داون داخل پاسخ مدل را به فهرست ردیف‌های خانه‌دار تبدیل می‌کند."""
    rows = []
    for line in text.splitlines():
        if not _TABLE_LINE.match(line) or _SEPARATOR.match(line):
            continue
        cells = [_clean_cell(cell) for cell in line.strip().strip('|').split('|')]
        cells = [cell for cell in cells if cell]
        if len(cells) >= 2:
            rows.append(cells)
    return rows


def text_to_rows(plain_text, table_text='', score=0.82):
    """
    خروجی مدل را به جعبه تبدیل می‌کند.

    هر خانهٔ جدول با مختصات ستون/سطر خودش جعبه می‌گیرد تا تعیین نقش اعداد
    (تعداد، قیمت واحد، مبلغ) با معادلهٔ ردیف انجام شود. متن سربرگ هم به‌صورت
    جعبه‌های تمام‌عرض اضافه می‌شود.
    """
    out = []
    parsed = html_rows(table_text) or table_rows(table_text) or table_rows(plain_text)

    plain_lines = [_clean_cell(line) for line in (plain_text or '').splitlines()]
    plain_lines = [line for line in plain_lines if line and not _TABLE_LINE.match(line)]

    if parsed:
        # جدول زیر بلوک متن سربرگ می‌آید تا جعبه‌های متن آزاد با ردیف‌های جدول
        # در یک سطر نیفتند (وگرنه عنوان و اعداد سربرگ با اقلام قاطی می‌شوند).
        table_top = 20.0 + len(plain_lines) * BOX_HEIGHT * 1.4 + 40.0
        for row_index, cells in enumerate(parsed):
            y = table_top + row_index * BOX_HEIGHT * 1.4
            for col_index, cell in enumerate(cells):
                # ستون‌ها از راست به چپ؛ همان ترتیب سند فارسی/عربی
                x_right = 1000.0 - col_index * COL_WIDTH
                x_left = x_right - COL_WIDTH
                box = [[x_left, y], [x_right, y], [x_right, y + BOX_HEIGHT], [x_left, y + BOX_HEIGHT]]
                # خانهٔ بدون رقم کمی پایین‌تر امتیاز می‌گیرد (متن آزاد جدول نیست)
                cell_score = score if _NUMBER.search(cell) or len(cell) > 3 else score * 0.9
                out.append((cell, cell_score, box))

    y = 20.0
    for line in plain_lines:
        box = [[0.0, y], [1000.0, y], [1000.0, y + BOX_HEIGHT], [0.0, y + BOX_HEIGHT]]
        line_score = score if (_NUMBER.search(line) or len(line) > 3) else score * 0.85
        out.append((line, line_score, box))
        y += BOX_HEIGHT * 1.4
    return out
