# -*- coding: utf-8 -*-
"""
کالیبراسیون پارامترهای تشخیص روی عکس‌های واقعی خودتان (فاز ۳ نقشهٔ راه).

بدون برچسب هم می‌شود نتیجه را سنجید: معیار اصلی «چند عدد مالی خوانده شد و
با چه اطمینانی» است. عدد مالی حیاتی‌ترین بخش رسید است و از دست رفتن یک رقم
بدتر از خوانده‌نشدن یک واژه است. پس شبکهٔ پارامترها روی «تعداد عدد خوانده‌شده»
و سپس «میانگین اطمینان اعداد» مقایسه می‌شود.

نمونه:
    python calibrate.py --dir samples/receipts --limit 8
    python calibrate.py --dir samples --thresh 0.2,0.25,0.3,0.35

خروجی: جدول مقایسه + بهترین ترکیب به‌صورت متغیرهای محیطی آماده برای اجرا.
"""
import argparse
import itertools
import os
import re
import sys
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from PIL import Image, ImageOps  # noqa: E402

import engines  # noqa: E402
from rapid import RapidOcrEngine  # noqa: E402

IMAGE_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff')
NUMERIC = re.compile(r'\d[\d.,٬]{2,}')


def numeric_tokens(rows):
    out = []
    for text, score, _box in rows:
        if NUMERIC.search(text.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))):
            out.append((text, score))
    return out


def load_images(folder, limit):
    paths = []
    for name in sorted(os.listdir(folder)):
        if name.lower().endswith(IMAGE_EXT):
            paths.append(os.path.join(folder, name))
        if limit and len(paths) >= limit:
            break
    return paths


def evaluate(engine, paths):
    numbers = 0
    num_score = 0.0
    all_score = 0.0
    tokens = 0
    elapsed = 0.0
    empty = 0
    for path in paths:
        image = Image.open(path)
        image = ImageOps.exif_transpose(image).convert('RGB')
        width, height = image.size
        if width < 1700:
            scale = 1700 / width
            image = image.resize((int(width * scale), int(height * scale)), Image.LANCZOS)
        started = time.perf_counter()
        try:
            rows, _meta = engine.recognize(image)
        except Exception:  # noqa: BLE001 — تصویر خراب، نادیده گرفته می‌شود
            empty += 1
            continue
        elapsed += time.perf_counter() - started
        if not rows:
            empty += 1
        for text, score, _box in rows:
            tokens += 1
            all_score += score
        for _text, score in numeric_tokens(rows):
            numbers += 1
            num_score += score
    return {
        'numbers': numbers,
        'numScore': round(num_score / max(numbers, 1), 3),
        'allScore': round(all_score / max(tokens, 1), 3),
        'tokens': tokens,
        'seconds': round(elapsed / max(len(paths), 1), 2),
        'empty': empty,
    }


def main():
    parser = argparse.ArgumentParser(description='کالیبراسیون پارامترهای تشخیص PP-OCR')
    parser.add_argument('--dir', required=True, help='پوشهٔ عکس‌های نمونه')
    parser.add_argument('--limit', type=int, default=0, help='حداکثر تعداد تصویر')
    parser.add_argument('--thresh', default='0.2,0.25,0.3,0.35')
    parser.add_argument('--box-thresh', default='0.4,0.5,0.6')
    parser.add_argument('--side', default='1600,1920,2048')
    parser.add_argument('--engine', default='ppocrv6', choices=['ppocrv6', 'ppocrv5'])
    args = parser.parse_args()

    if not os.path.isdir(args.dir):
        print(f'پوشه پیدا نشد: {args.dir}')
        return 1
    paths = load_images(args.dir, args.limit)
    if not paths:
        print('هیچ تصویری در پوشه نیست.')
        return 1

    spec = engines.detect_rapid(prefer_v6=args.engine == 'ppocrv6')
    if spec is None:
        spec = engines.detect_rapid(prefer_v6=False)
    if spec is None:
        print('هیچ مدل تشخیص/شناسایی ONNX در models نیست. اول download_models.py را اجرا کنید.')
        return 2

    grid = list(itertools.product(
        [float(x) for x in args.thresh.split(',')],
        [float(x) for x in args.box_thresh.split(',')],
        [int(x) for x in args.side.split(',')],
    ))
    print(f'{len(paths)} تصویر × {len(grid)} ترکیب پارامتر\n')
    header = f'{"thresh":>7} {"box":>5} {"side":>6} | {"اعداد":>6} {"اطمینان اعداد":>12} {"کل":>6} {"ثانیه/تصویر":>11}'
    print(header)
    print('-' * len(header))

    best = None
    for thresh, box_thresh, side in grid:
        engine = RapidOcrEngine(spec, {'thresh': thresh, 'box_thresh': box_thresh, 'limit_side_len': side})
        if not engine.ready():
            print(f'بارگذاری ناموفق با این ترکیب: {engine.error}')
            continue
        result = evaluate(engine, paths)
        print(f'{thresh:>7} {box_thresh:>5} {side:>6} | {result["numbers"]:>6} '
              f'{result["numScore"]:>12} {result["allScore"]:>6} {result["seconds"]:>11}')
        key = (result['numbers'], result['numScore'], result['allScore'], -result['seconds'])
        if best is None or key > best[0]:
            best = (key, (thresh, box_thresh, side), result)

    if best is None:
        print('\nهیچ ترکیبی اجرا نشد.')
        return 2

    _key, (thresh, box_thresh, side), result = best
    print('\nبهترین ترکیب:')
    print(f'  OCR_DET_THRESH={thresh}')
    print(f'  OCR_DET_BOX_THRESH={box_thresh}')
    print(f'  OCR_DET_SIDE={side}')
    print(f'  اعداد خوانده‌شده: {result["numbers"]} · اطمینان اعداد: {result["numScore"]}')
    print('\nاین سه متغیر را در فایل اجرای سرویس تنظیم کنید و سرویس را دوباره راه بیندازید.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
