# -*- coding: utf-8 -*-
"""
خط لوله خوانش فاکتور — موتور انتخابی خودکار (Falcon-OCR-Arabic یا PP-OCR) با
ترکیب چند نسخه تصویر.

چرا ترکیب؟ در تصاویر تار و کم‌نور، هر نسخه پردازش‌شده بخشی از متن را بهتر
می‌خواند: نسخه تیز نویسه‌ها را بهتر می‌بیند، نسخه باینری خطوط کم‌کنتراست را
بازمی‌کند و نسخه اصل بافت طبیعی را حفظ می‌کند. ما هر سه را می‌خوانیم، جعبه‌های
هم‌مکان را با هم تطبیق می‌دهیم و برای هر ناحیه متنی، بهترین قرائت را برمی‌داریم.
نتیجه: پوشش بالاتر و رقم‌های مطمئن‌تر برای مبالغ.

همه‌چیز محلی است: مدل‌ها از پوشه models و پردازش با PIL/NumPy.

انتخاب موتور با `engines.py` انجام می‌شود (Falcon اولویت دارد، بعد PP-OCRv6،
بعد PP-OCRv5). خروجی نهایی پیش از تحویل از `validate.py` می‌گذرد: هیچ عددی
بدون تأیید حسابداری و آستانهٔ اطمینان به داده مالی تبدیل نمی‌شود.
"""
import io
import os
import time

import numpy as np
from PIL import Image, ImageFilter, ImageOps

import re

from engines import select, selection_error
from table import extract_items
from textfix import postprocess_line
from validate import validate

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get('OCR_MODEL_DIR', os.path.join(BASE_DIR, 'models'))

MIN_WIDTH = int(os.environ.get('OCR_MIN_WIDTH', '1700'))
MAX_WIDTH = int(os.environ.get('OCR_MAX_WIDTH', '3000'))
# از این امتیاز به بالا، خوانش قابل‌اعتماد است و نسخه‌های تکمیلی لازم نیست
GOOD_ENOUGH = float(os.environ.get('OCR_GOOD_ENOUGH', '0.87'))

_engine = None


def get_engine():
    """موتور فعال (خودکار انتخاب می‌شود؛ یک‌بار بارگذاری و کش می‌شود)."""
    global _engine
    if _engine is None:
        _engine = select()
    return _engine


def engine_error():
    return selection_error()


def engine_info():
    engine = get_engine()
    if engine is None:
        return {'id': None, 'label': None, 'error': selection_error()}
    try:
        return engine.info()
    except Exception:  # noqa: BLE001
        return {'id': getattr(engine, 'id', None), 'label': getattr(engine, 'label', None)}


# ---------------------------------------------------------------- پیش‌پردازش

def _to_gray(img):
    return ImageOps.grayscale(img.convert('RGB'))


def _resize_for_ocr(gray):
    """بزرگ‌نمایی هوشمند: عرض را به بازه مطلوب می‌رساند، بدون شکستن نسبت."""
    w, h = gray.size
    target = min(max(MIN_WIDTH, w), MAX_WIDTH)
    if target <= w * 1.02:
        return gray
    scale = target / w
    return gray.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def _unsharp(gray, radius=2.0, percent=190, threshold=3):
    return gray.filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=threshold))


def _estimate_skew(gray):
    """تخمین کجی با واریانس پروفایل افقی؛ دقت ۰٫۱ درجه در بازه ±۴ درجه."""
    small = gray.copy()
    small.thumbnail((760, 760))
    best_angle, best_score = 0.0, -1.0
    for angle in np.arange(-4.0, 4.01, 1.0):
        rot = np.asarray(small.rotate(angle, resample=Image.BILINEAR, fillcolor=255), dtype=np.float32)
        score = float(np.var(np.diff((255 - rot).sum(axis=1))))
        if score > best_score:
            best_score, best_angle = score, float(angle)
    if abs(best_angle) < 0.3:
        return 0.0
    fine, best_score = best_angle, -1.0
    for angle in np.arange(best_angle - 0.9, best_angle + 0.91, 0.1):
        rot = np.asarray(small.rotate(angle, resample=Image.BILINEAR, fillcolor=255), dtype=np.float32)
        score = float(np.var(np.diff((255 - rot).sum(axis=1))))
        if score > best_score:
            best_score, fine = score, float(angle)
    return round(fine, 1)


def _sauvola(gray, k=0.2):
    """آستانه‌گذاری محلی Sauvola با تصویر انتگرالی (مقاوم به سایه و نور ناهموار)."""
    arr = np.asarray(gray, dtype=np.float32)
    h, w = arr.shape
    win = max(15, (min(h, w) // 40) | 1)
    pad = win // 2
    padded = np.pad(arr, pad, mode='reflect')
    integral = np.pad(padded.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    integral2 = np.pad((padded ** 2).cumsum(0).cumsum(1), ((1, 0), (1, 0)))

    def box_sum(img):
        return (img[win:, win:] - img[:-win, win:] - img[win:, :-win] + img[:-win, :-win])[:h, :w]

    area = float(win * win)
    mean = box_sum(integral) / area
    var = np.maximum(box_sum(integral2) / area - mean ** 2, 0)
    threshold = mean * (1 + k * (np.sqrt(var) / 128.0 - 1))
    return Image.fromarray(((arr > threshold) * 255).astype(np.uint8), mode='L')


def build_variants(image_bytes):
    """نسخه‌های بهبودیافته تصویر؛ خروجی (فهرست (نام، تصویر)، کجی)."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img).convert('RGB')
    up = _resize_for_ocr(_to_gray(img))

    sharp = _unsharp(ImageOps.autocontrast(up, cutoff=1))
    variants = [('تیز', sharp), ('اصل', up)]

    angle = _estimate_skew(sharp)
    if abs(angle) >= 0.3:
        variants.append(('کجی‌اصلاح‌شده', ImageOps.autocontrast(
            sharp.rotate(angle, resample=Image.BICUBIC, fillcolor=255), cutoff=1)))

    variants.append(('باینری', _sauvola(_median(sharp))))
    return variants, angle


def _median(img):
    return img.filter(ImageFilter.MedianFilter(size=3))


# ---------------------------------------------------------------- خوانش

def _to_item(box, text, score):
    ys = [p[1] for p in box]
    xs = [p[0] for p in box]
    return {
        'text': postprocess_line(str(text)),
        'score': float(score),
        'box': [[float(x), float(y)] for x, y in box],
        'ymin': min(ys), 'ymax': max(ys),
        'xmin': min(xs), 'xmax': max(xs),
        'cy': (min(ys) + max(ys)) / 2.0,
        'h': max(ys) - min(ys),
    }


def recognize_items(img):
    """خوانش یک تصویر PIL → فهرست جعبه‌های متنی خام (مستقل از موتور)."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError(selection_error() or 'OCR engine not ready')
    rows, _meta = engine.recognize(img)
    return [_to_item(box, text, score) for text, score, box in rows]


def _digit_count(text):
    return sum(ch.isdigit() for ch in text.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')))


def reread_items(img, items, pad_x=0.06, pad_y=0.22):
    """بازخوانی هر جعبه از تصویر باکیفیت با حاشیه کوچک.

    جعبه‌های تشخیص گاهی لبه رقم‌ها را می‌برند؛ برش مجدد از تصویر اصلی این نقص را
    جبران می‌کند. انتخاب بین دو قرائت محافظه‌کارانه است تا رقم از دست نرود.
    موتورهایی که جعبه نمی‌دهند (Falcon) از این مرحله رد می‌شوند.
    """
    engine = get_engine()
    if engine is None or not hasattr(engine, 'reread'):
        return items, 0
    improved = 0
    for item in items:
        w = max(item['xmax'] - item['xmin'], 1.0)
        h = max(item['ymax'] - item['ymin'], 1.0)
        box = (
            int(max(0, item['xmin'] - pad_x * w)),
            int(max(0, item['ymin'] - pad_y * h)),
            int(min(img.width, item['xmax'] + pad_x * w + 2)),
            int(min(img.height, item['ymax'] + pad_y * h + 2)),
        )
        if box[2] - box[0] < 8 or box[3] - box[1] < 8:
            continue
        try:
            reread = engine.reread(img, box)
        except Exception:  # noqa: BLE001 — بازخوانی اختیاری است
            continue
        if not reread:
            continue
        new_text, new_score = str(reread[0]), float(reread[1])
        old_text, old_score = item['text'], item['score']
        old_digits, new_digits = _digit_count(old_text), _digit_count(new_text)

        take = False
        if new_score > old_score + 0.08:
            take = True
        elif old_score < 0.72 and new_score >= old_score:
            take = True
        # اگر خوانش جدید رقم بیشتری دارد و اطمینانش معقول است، برنده است
        if new_digits > old_digits and new_score >= old_score - 0.15:
            take = True
        # هرگز قرائتی که رقم از دست داده جایگزین نمی‌شود
        if new_digits < old_digits and len(old_text.strip()) >= 4 and old_score >= 0.5:
            take = False
        if take and new_text.strip():
            item['text'] = postprocess_line(new_text)
            item['score'] = new_score
            improved += 1
    return items, improved


# ------------------------------------------------------------ خوانش دوم
_FA_LETTERS = re.compile(r'[\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF]')
_ANY_DIGITS = re.compile(r'[0-9۰-۹٠-٩]')


def _fa_count(text):
    return len(_FA_LETTERS.findall(text or ''))


def _digit_count(text):
    return len(_ANY_DIGITS.findall(text or ''))


# برچسب‌هایی که بعدشان در فاکتور عدد می‌آید. اگر برچسب دیده شود ولی رقمی
# خوانده نشود، یعنی رکونایزر شماره را انداخته است؛ همان کادر باید دوباره
# با رکونایزر چندزبانه خوانده شود («شماره فاکتور: 14032287» ← «شماره فاکتور»).
NUMBER_LABELS = ('تلفن', 'شماره', 'کد', 'شناسه', 'تاریخ', 'پلاک', 'ملی',
                 'اقتصادی', 'پستی', 'شبا', 'حساب', 'فکس', 'موبایل', 'همراه')


def _has_number_label(text):
    return any(label in (text or '') for label in NUMBER_LABELS)


def _fa_tokens(text):
    return [tok.strip('،:.؛()|') for tok in (text or '').split()
            if len(_FA_LETTERS.findall(tok)) >= 3]


def _covers(primary, secondary):
    """آیا خوانش دوم همهٔ واژه‌های فارسی اولی را دارد؟"""
    tokens = _fa_tokens(primary)
    if not tokens:
        return False
    joined = (secondary or '').replace('\u200c', '')
    return all(tok.replace('\u200c', '') in joined for tok in tokens)


def _has_summary_word(text):
    words = ('قابل', 'جمع', 'مالیات', 'تخفیف', 'عوارض', 'مانده', 'پیش پرداخت',
             'ارزش افزوده', 'نهایی')
    return any(word in (text or '') for word in words)


def needs_second_opinion(item):
    """
    کادرهایی که رکونایزر فارسی معمولاً در آن‌ها می‌لنگد:
    * اطمینان پایین (خط عددی یا متن لاتین)
    * خطی که تقریباً نویسهٔ فارسی ندارد (تاریخ، کد، مدل لاتین)
    * هر کادری که رقم دارد؛ رقم‌ها همان چیزی‌اند که نباید اشتباه خوانده شوند
      («1404/05/12» در خوانش اول به «/404/05» تبدیل می‌شد)
    """
    text = item['text']
    if _ANY_DIGITS.search(text):
        return True
    # برچسب عددی بدون هیچ رقم ⇒ احتمالاً رقم از دست رفته است
    if _has_number_label(text):
        return True
    if item['score'] < 0.90:
        return True
    return _fa_count(text) < 3


def merge_readings(primary, primary_score, secondary, secondary_score):
    """
    انتخاب/ترکیب دو خوانش یک کادر.

    قاعده‌ها محافظه‌کارانه‌اند: خوانش دوم فقط وقتی جای اولی را می‌گیرد که
    اطمینانش آشکارا بالاتر و اولی مشکوک باشد؛ وقتی اولی متن فارسی سالم دارد
    و دومی فقط رقم/لاتین است، دومی به انتهای خط اضافه می‌شود («کد اقتصادی» +
    شمارهٔ دقیق) و هیچ واژهٔ فارسی‌ای دور ریخته نمی‌شود.
    """
    primary = (primary or '').strip()
    secondary = (secondary or '').strip()
    if not secondary:
        return primary, primary_score
    if not primary:
        return secondary, secondary_score

    p_fa, s_fa = _fa_count(primary), _fa_count(secondary)
    p_d, s_d = _digit_count(primary), _digit_count(secondary)

    # ۰) خوانش دوم همهٔ واژه‌های اولی را دارد و رقم بیشتری هم دارد
    #    («شماره فاکتور» ← «14032287 :شماره فاکتور»): هیچ متنی از دست نمی‌رود،
    #    فقط رقمِ جاافتاده اضافه می‌شود.
    if s_d > p_d and secondary_score >= 0.75 and _covers(primary, secondary):
        return secondary, secondary_score

    # ۱) خوانش اول عملاً شکست خورده و دومی مطمئن است
    #    اگر هر دو فارسی دارند، متن اولی حفظ می‌شود؛ رکونایزر چندزبانه در
    #    فارسی اطمینان بالا می‌دهد ولی نویسه‌های بی‌ربط می‌سازد.
    if primary_score < 0.6 and secondary_score >= 0.8 and (p_fa < 2 or s_fa < 2):
        return secondary, secondary_score

    # ۲) کادر عددی/لاتین: رقمی که کامل‌تر و مطمئن‌تر است برنده است
    if p_fa < 2 and s_fa < 2:
        truncation = (s_d >= p_d + 2 and secondary_score >= 0.9
                      and secondary_score >= primary_score - 0.05)
        if truncation or secondary_score > primary_score + 0.15:
            return secondary, secondary_score
        if s_d > p_d and secondary_score >= max(0.5, primary_score - 0.2):
            return secondary, secondary_score
        return primary, primary_score

    # ۳) متن فارسی سالم + رقم کامل‌تر از خوانش دوم
    #    اگر خط اولیه هیچ رقمی ندارد، الصاق رقم تنهای خوانش دوم فقط وقتی مجاز
    #    است که خود خط، برچسب عددی/جمع داشته باشد («تلفن»، «مبلغ قابل»)؛
    #    وگرنه یعنی رقمِ کادر همسایه به این خط چسبانده می‌شود = ساختن داده.
    numeric_like = p_d > 0 or _has_number_label(primary) or _has_summary_word(primary)
    if p_fa >= 2 and s_d > p_d and numeric_like and secondary_score >= 0.78 \
            and (s_fa == 0 or s_d >= p_d + 3):
        if secondary.replace(' ', '') in primary.replace(' ', ''):
            return primary, primary_score
        # رقم‌های ناقص/غلط خوانش اول دور ریخته می‌شوند تا دو عدد متناقض نماند
        if s_d >= p_d + 3:
            words = ' '.join(t for t in primary.split() if not _ANY_DIGITS.search(t))
            merged = f'{words} {secondary}'.strip()
            return merged, max(primary_score, secondary_score)
        return f'{primary} {secondary}', max(primary_score, secondary_score)

    # ۴) خوانش دوم هم فارسی دارد: فقط وقتی اولی تقریباً فارسی نداشته باشد
    #    (رکونایزر چندزبانه در فارسی ضعیف است و نباید متن سالم را عوض کند)
    if s_fa >= 2 and p_fa < 2 and secondary_score > primary_score + 0.1:
        return secondary, secondary_score
    return primary, primary_score


def apply_second_opinions(img, items, limit=None):
    """برای کادرهای مشکوک، خوانش دوم گرفته و بهترین قرائت را نگه می‌دارد."""
    engine = get_engine()
    if engine is None or not hasattr(engine, 'second_opinion'):
        return items, 0
    changed = 0
    for item in items:
        if not needs_second_opinion(item):
            continue
        if limit is not None and changed >= limit:
            break
        box = (int(item['xmin']), int(item['ymin']), int(item['xmax']), int(item['ymax']))
        try:
            reading = engine.second_opinion(img, box)
        except Exception:  # noqa: BLE001 — خوانش دوم اختیاری است
            continue
        if not reading:
            continue
        text, score = postprocess_line(str(reading[0])), float(reading[1])
        if not text.strip():
            continue
        merged, merged_score = merge_readings(item['text'], item['score'], text, score)
        if merged != item['text']:
            # متن ترکیبی دوباره از واژه‌نامه/عبارت‌ها می‌گذرد («مالیات بر وزم»)
            merged = postprocess_line(merged)
            item['text'] = merged
            item['score'] = merged_score
            changed += 1
    return items, changed


def _iou(a, b):
    x1, y1 = max(a['xmin'], b['xmin']), max(a['ymin'], b['ymin'])
    x2, y2 = min(a['xmax'], b['xmax']), min(a['ymax'], b['ymax'])
    if x2 <= x1 or y2 <= y1:
        return 0.0
    inter = (x2 - x1) * (y2 - y1)
    area_a = (a['xmax'] - a['xmin']) * (a['ymax'] - a['ymin'])
    area_b = (b['xmax'] - b['xmin']) * (b['ymax'] - b['ymin'])
    return inter / max(area_a + area_b - inter, 1e-6)


def fuse_items(item_groups, replace_margin=0.06, dup_iou=0.35):
    """ادغام جعبه‌های هم‌مکان چند نسخه.

    نسخه‌ها به ترتیب کیفیت پاس داده می‌شوند؛ هر جعبه‌ای که با جعبه‌ای پذیرفته‌شده
    هم‌مکان باشد فقط در صورتی جایگزین می‌شود که به‌طور محسوس مطمئن‌تر باشد.
    این کار از تکرار متن و از بُردن قرائت ضعیف نسخه باینری جلوگیری می‌کند.
    """
    fused = []
    for items in item_groups:
        for item in items:
            match, match_iou = None, 0.0
            for existing in fused:
                iou = _iou(existing, item)
                if iou > match_iou:
                    match, match_iou = existing, iou
            if match is not None and match_iou >= dup_iou:
                if item['score'] > match['score'] + replace_margin:
                    match.update(text=item['text'], score=item['score'], box=item['box'])
                continue
            fused.append(dict(item))
    return fused


def _split_row(row_items):
    """یک ردیف بصری را به قطعه‌های ستونی می‌شکند (شکاف افقی بزرگ = ستون تازه)."""
    ordered = sorted(row_items, key=lambda i: i['xmin'])
    chunks = [[ordered[0]]]
    for prev, cur in zip(ordered, ordered[1:]):
        height = max(min(prev['h'], cur['h']), 8.0)
        gap = cur['xmin'] - prev['xmax']
        if gap > height * 1.6:
            chunks.append([cur])
        else:
            chunks[-1].append(cur)
    return chunks


def reconstruct_rows(items):
    """جعبه‌ها → ردیف‌های جدول با ترتیب راست‌به‌چپ و متن تصحیح‌شده."""
    items = sorted(items, key=lambda i: (i['ymin'], -i['xmin']))
    rows = []
    for it in items:
        placed = False
        for row in rows:
            overlap = min(it['ymax'], row['ymax']) - max(it['ymin'], row['ymin'])
            ref_h = max(min(it['h'], row['h_ref']), 1.0)
            same_height = max(it['h'], row['h_ref']) / max(min(it['h'], row['h_ref']), 1.0) <= 1.7
            if overlap / ref_h > 0.45 and same_height:
                row['items'].append(it)
                row['ymin'] = min(row['ymin'], it['ymin'])
                row['ymax'] = max(row['ymax'], it['ymax'])
                row['h_ref'] = max(row['h_ref'], it['h'])
                placed = True
                break
        if not placed:
            rows.append({'ymin': it['ymin'], 'ymax': it['ymax'], 'h_ref': it['h'], 'items': [it]})

    lines = []
    for row in sorted(rows, key=lambda r: r['ymin']):
        chunks = _split_row(row['items'])
        # هر ستون از راست به چپ؛ ستون‌ها با علامت «|» از هم جدا می‌شوند تا
        # لایه استخراج فیلدها بتواند مبلغ و شرح را به هم نچسباند
        chunk_texts = []
        for chunk in chunks:
            ordered = sorted(chunk, key=lambda i: -i['xmin'])
            texts = [i['text'] for i in ordered]
            texts = [t for t in texts if t]
            if texts:
                chunk_texts.append(' '.join(texts))
        if not chunk_texts:
            continue
        chunk_texts.reverse()  # ستون راست اول خوانده می‌شود == ترتیب اول در فهرست
        scores = [i['score'] for i in row['items']]
        # بدون جداکننده ستونی: لایه استخراج فیلدها ترتیب «شرح، تعداد، مبلغ واحد،
        # مبلغ کل» را از همین ترتیب راست‌به‌چپ می‌فهمد
        lines.append({
            'text': ' '.join(chunk_texts),
            'confidence': round(sum(scores) / len(scores), 4),
            'boxes': [i['box'] for i in row['items']],
        })
    return lines


def _score(lines):
    """امتیاز کیفیت خوانش: اطمینان وزنی با پوشش نویسه."""
    if not lines:
        return 0.0
    chars = sum(len(line['text']) for line in lines)
    if chars < 20:
        return 0.0
    mean = sum(line['confidence'] * max(len(line['text']), 1) for line in lines) / chars
    coverage = min(1.0, chars / 300.0)
    return mean * (0.6 + 0.4 * coverage)


def recognize_bytes(image_bytes, use_variants=True):
    """
    خوانش کامل: نسخه‌های تصویر به ترتیب کیفیت، توقف زودهنگام، بازخوانی هدفمند و
    در پایان لایهٔ تأیید (validate.py) که تعیین می‌کند خروجی قابل‌اعتماد است یا نه.
    """
    started = time.perf_counter()
    engine = get_engine()
    if engine is None:
        raise RuntimeError(selection_error() or 'OCR engine not ready')
    info = engine_info()
    variants, angle = build_variants(image_bytes)
    need = 1 if not use_variants else len(variants)
    if abs(angle) < 1.0:
        variants = [v for v in variants if v[0] != 'کجی‌اصلاح‌شده']

    # موتورهای سرتاسری (Falcon) خودشان ساختار سند را می‌فهمند؛ ترکیب چند نسخه
    # فقط هزینه است، پس یک نسخهٔ تیز می‌خوانند.
    end_to_end = getattr(engine, 'kind', 'rapid') != 'rapid'
    if end_to_end:
        variants = [v for v in variants if v[0] == 'تیز'] or variants[:1]
    else:
        # نسخه «اصل» کمکی نمی‌کند؛ تیز و باینری دو روی یک سکه‌اند
        variants = [v for v in variants if v[0] in ('تیز', 'باینری')]

    results = []
    trace = []
    engine_meta = {}
    for name, variant in variants[:need]:
        try:
            if end_to_end:
                raw_rows, engine_meta = engine.recognize(variant)
                items = [_to_item(box, text, score) for text, score, box in raw_rows]
            else:
                items = recognize_items(variant)
        except Exception as exc:  # noqa: BLE001 — موتور بعدی/نسخه بعدی
            trace.append((name, 'خطا', f'{type(exc).__name__}: {exc}'))
            continue
        lines = reconstruct_rows(items)
        score = _score(lines)
        if end_to_end and engine_meta.get('confidence'):
            # امتیاز واقعی مدل، نه برآورد از پوشش نویسه
            score = min(score, float(engine_meta['confidence']) * 1.05) \
                if score else float(engine_meta['confidence'])
        trace.append((name, round(score, 3), len(items)))
        results.append({'name': name, 'items': items, 'lines': lines, 'score': score, 'image': variant})
        if score >= GOOD_ENOUGH:
            break

    if not results:
        empty = {
            'lines': [], 'text': '', 'confidence': 0, 'elapsedMs': round((time.perf_counter() - started) * 1000),
            'variant': '-', 'skew': angle, 'variants': trace, 'items': [], 'totals': {},
            'engine': info,
        }
        return validate(empty)

    results.sort(key=lambda r: r['score'], reverse=True)
    best = results[0]

    if not end_to_end:
        # بازخوانی هدفمند: فقط جعبه‌های کم‌اطمینان (اکثر تصاویر به این مرحله نیاز ندارند)
        weak = [i for i in best['items'] if i['score'] < 0.86]
        if weak:
            best['items'], improved = reread_items(best['image'], best['items'])
            if improved:
                lines = reconstruct_rows(best['items'])
                if _score(lines) >= best['score'] * 0.98:
                    best = dict(best, lines=lines, name=best['name'] + '+بازخوانی')
                    trace.append(('بازخوانی', round(_score(lines), 3), improved))

        # خوانش دوم با رکونایزر چندزبانه: خط‌های عددی و لاتین
        best['items'], extra_fixes = apply_second_opinions(best['image'], best['items'])
        if extra_fixes:
            lines = reconstruct_rows(best['items'])
            if _score(lines) >= best['score'] * 0.98:
                best = dict(best, lines=lines, name=best['name'] + '+خوانش‌دوم')
                trace.append(('خوانش‌دوم', round(_score(lines), 3), extra_fixes))

        # اگر هنوز ضعیف است، نسخه دیگر ترکیب می‌شود (نه جایگزین)
        if len(results) > 1:
            runner = results[1]
            if best['score'] < GOOD_ENOUGH and runner['score'] >= best['score'] * 0.94:
                fused = fuse_items([best['items'], runner['items']])
                merged = reconstruct_rows(fused)
                if _score(merged) >= best['score'] * 0.99:
                    best = dict(best, lines=merged, name=f"{best['name']}+{runner['name']}")

    lines = best['lines']
    text = '\n'.join(line['text'] for line in lines)

    # فهم ساختار جدول از موقعیت خانه‌ها (مستقل از قالب هر فاکتور)
    structured_items, totals = extract_items(best['items'])
    total_chars = max(sum(len(line['text']) for line in lines), 1)
    confidence = round(
        sum(line['confidence'] * max(len(line['text']), 1) for line in lines) / total_chars * 100, 1)
    result = {
        'lines': lines,
        'text': text,
        'confidence': confidence,
        'elapsedMs': round((time.perf_counter() - started) * 1000),
        'variant': best['name'],
        'skew': angle,
        'variants': trace,
        'items': structured_items,
        'totals': totals,
        'engine': info,
    }
    if engine_meta:
        result['engineMeta'] = {k: v for k, v in engine_meta.items() if k != 'raw'}
    return validate(result)
