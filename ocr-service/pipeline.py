# -*- coding: utf-8 -*-
"""
خط لوله خوانش فاکتور — PP-OCRv5 (RapidOCR) با ترکیب چند نسخه تصویر.

چرا ترکیب؟ در تصاویر تار و کم‌نور، هر نسخه پردازش‌شده بخشی از متن را بهتر
می‌خواند: نسخه تیز نویسه‌ها را بهتر می‌بیند، نسخه باینری خطوط کم‌کنتراست را
بازمی‌کند و نسخه اصل بافت طبیعی را حفظ می‌کند. ما هر سه را می‌خوانیم، جعبه‌های
هم‌مکان را با هم تطبیق می‌دهیم و برای هر ناحیه متنی، بهترین قرائت را برمی‌داریم.
نتیجه: پوشش بالاتر و رقم‌های مطمئن‌تر برای مبالغ.

همه‌چیز محلی است: مدل‌ها از پوشه models و پردازش با PIL/NumPy.
"""
import io
import os
import time

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from textfix import postprocess_line

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get('OCR_MODEL_DIR', os.path.join(BASE_DIR, 'models'))

MIN_WIDTH = int(os.environ.get('OCR_MIN_WIDTH', '1700'))
MAX_WIDTH = int(os.environ.get('OCR_MAX_WIDTH', '3000'))
# از این امتیاز به بالا، خوانش قابل‌اعتماد است و نسخه‌های تکمیلی لازم نیست
GOOD_ENOUGH = float(os.environ.get('OCR_GOOD_ENOUGH', '0.87'))

_engine = None
_engine_error = None


def get_engine():
    """موتور RapidOCR با تنظیمات بهینه فاکتور (یک‌بار بارگذاری می‌شود)."""
    global _engine, _engine_error
    if _engine is None and _engine_error is None:
        try:
            from rapidocr import RapidOCR

            _engine = RapidOCR(params={
                'Det.model_path': os.path.join(MODEL_DIR, 'PP-OCRv5_mobile_det.onnx'),
                'Cls.model_path': os.path.join(MODEL_DIR, 'cls.onnx'),
                'Rec.model_path': os.path.join(MODEL_DIR, 'arabic_PP-OCRv5_mobile_rec.onnx'),
                'Rec.rec_keys_path': os.path.join(MODEL_DIR, 'arabic_dict.txt'),
                # عرض بیشتر برای مبالغ بلند فاکتور تا رقم‌ها بریده نشوند
                'Rec.rec_img_shape': [3, 48, 640],
                # حفظ جزئیات اسکن‌های بزرگ؛ مقدار کوچک ستون‌ها را ادغام می‌کند
                'Det.limit_side_len': int(os.environ.get('OCR_DET_SIDE', '1600')),
                'Det.limit_type': 'max',
                'Det.thresh': 0.2,
                'Det.box_thresh': 0.4,
                'Det.unclip_ratio': 1.8,
                'Global.log_level': 'error',
            })
        except Exception as exc:  # noqa: BLE001 — خطا به لایه بالاتر گزارش می‌شود
            _engine_error = f'{type(exc).__name__}: {exc}'
    return _engine


def engine_error():
    return _engine_error


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
        'text': str(text),
        'score': float(score),
        'box': [[float(x), float(y)] for x, y in box],
        'ymin': min(ys), 'ymax': max(ys),
        'xmin': min(xs), 'xmax': max(xs),
        'cy': (min(ys) + max(ys)) / 2.0,
        'h': max(ys) - min(ys),
    }


def recognize_items(img):
    """خوانش یک تصویر PIL → فهرست جعبه‌های متنی خام."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError(_engine_error or 'OCR engine not ready')
    arr = np.asarray(img.convert('RGB'))[:, :, ::-1].copy()  # RGB → BGR برای RapidOCR
    # پرچم‌ها هر بار صریح داده می‌شوند؛ RapidOCR حالت فراخوانی قبلی را نگه می‌دارد
    result = engine(arr, use_det=True, use_cls=True, use_rec=True)
    if not result.txts:
        return []
    return [_to_item(b, t, s) for b, t, s in zip(result.boxes, result.txts, result.scores)]


def _digit_count(text):
    return sum(ch.isdigit() for ch in text.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')))


def reread_items(img, items, pad_x=0.06, pad_y=0.22):
    """بازخوانی هر جعبه از تصویر باکیفیت با حاشیه کوچک.

    جعبه‌های تشخیص گاهی لبه رقم‌ها را می‌برند؛ برش مجدد از تصویر اصلی این نقص را
    جبران می‌کند. انتخاب بین دو قرائت محافظه‌کارانه است تا رقم از دست نرود.
    """
    engine = get_engine()
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
        crop = np.asarray(img.crop(box).convert('RGB'))[:, :, ::-1].copy()
        try:
            result = engine(crop, use_det=False, use_cls=False, use_rec=True)
        except Exception:  # noqa: BLE001 — بازخوانی اختیاری است
            continue
        if not result.txts:
            continue
        new_text, new_score = str(result.txts[0]), float(result.scores[0])
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
            item['text'] = new_text
            item['score'] = new_score
            improved += 1
    return items, improved


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
            texts = [postprocess_line(i['text']) for i in ordered]
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
    """خوانش کامل: نسخه‌های تصویر به ترتیب کیفیت، توقف زودهنگام و بازخوانی هدفمند."""
    started = time.perf_counter()
    variants, angle = build_variants(image_bytes)
    need = 1 if not use_variants else len(variants)
    if abs(angle) < 1.0:
        variants = [v for v in variants if v[0] != 'کجی‌اصلاح‌شده']
    # نسخه «اصل» کمکی نمی‌کند؛ تیز و باینری دو روی یک سکه‌اند
    variants = [v for v in variants if v[0] in ('تیز', 'باینری')]

    results = []
    trace = []
    for name, variant in variants[:need]:
        items = recognize_items(variant)
        lines = reconstruct_rows(items)
        score = _score(lines)
        trace.append((name, round(score, 3), len(items)))
        results.append({'name': name, 'items': items, 'lines': lines, 'score': score, 'image': variant})
        if score >= GOOD_ENOUGH:
            break

    if not results:
        return {'lines': [], 'text': '', 'confidence': 0, 'elapsedMs': 0, 'variant': '-', 'skew': angle, 'variants': []}

    results.sort(key=lambda r: r['score'], reverse=True)
    best = results[0]

    # بازخوانی هدفمند: فقط جعبه‌های کم‌اطمینان (اکثر تصاویر به این مرحله نیاز ندارند)
    weak = [i for i in best['items'] if i['score'] < 0.86]
    if weak:
        best['items'], improved = reread_items(best['image'], best['items'])
        if improved:
            lines = reconstruct_rows(best['items'])
            if _score(lines) >= best['score'] * 0.98:
                best = dict(best, lines=lines, name=best['name'] + '+بازخوانی')
                trace.append(('بازخوانی', round(_score(lines), 3), improved))

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
    total_chars = max(sum(len(line['text']) for line in lines), 1)
    confidence = round(
        sum(line['confidence'] * max(len(line['text']), 1) for line in lines) / total_chars * 100, 1)
    return {
        'lines': lines,
        'text': text,
        'confidence': confidence,
        'elapsedMs': round((time.perf_counter() - started) * 1000),
        'variant': best['name'],
        'skew': angle,
        'variants': trace,
    }
