# -*- coding: utf-8 -*-
"""
کالیبراسیون پارامترهای OCR روی عکس‌های واقعی خودتان (فاز ۳ نقشهٔ راه).

دو حالت سنجش دارد:

* **بدون برچسب** (پیش‌فرض): «چند عدد مالی خوانده شد و با چه اطمینانی». عدد مالی
  حیاتی‌ترین بخش سند است و از دست رفتن یک رقم بدتر از خوانده‌نشدن یک واژه است.
* **با برچسب** (`--truth`): CER/WER واقعی روی متنی که خودتان نوشته‌اید. دقیق‌ترین
  معیار؛ اگر برای هر تصویر متن مرجع داشته باشید از همین استفاده کنید.

شبکهٔ پارامترها شامل خودِ پارامترهای تشخیص (thresh، box_thresh، side) و
پیش‌پردازش‌ها (CLAHE روشن/خاموش، اصلاح کجی روشن/خاموش) است.

نمونه‌ها:

    python calibrate.py --dir samples/receipts --limit 8
    python calibrate.py --dir samples --all
    python calibrate.py --dir samples --truth truth.json --all
    python calibrate.py --dir samples --report report.md

قالب `truth.json`:

    {"invoice-1.jpg": "متن کامل مرجع…", "invoice-2.jpg": "…"}

یا برای هر تصویر یک فایل `<نام تصویر>.txt` در همان پوشه.

خروجی: جدول مقایسه، بهترین ترکیب، و بلوکِ آمادهٔ کپی برای تنظیم متغیرهای محیطی.
"""
import argparse
import itertools
import json
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
FA_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')


# --------------------------------------------------------------------- سنجه‌ها

def numeric_tokens(rows):
    out = []
    for text, score, _box in rows:
        if NUMERIC.search(text.translate(FA_DIGITS)):
            out.append((text, score))
    return out


def normalize(text):
    """نرمال‌سازی برای مقایسهٔ CER: ارقام، جداکننده‌ها و نویسه‌های نمایشی."""
    text = (text or '').translate(FA_DIGITS)
    for ch in ('٬', ',', '|', '\u200c', '/', '-', '.'):
        text = text.replace(ch, ' ')
    return ' '.join(text.split())


def edit_distance(a, b):
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def cer(reference, hypothesis):
    reference, hypothesis = normalize(reference), normalize(hypothesis)
    if not reference:
        return 0.0 if not hypothesis else 1.0
    return edit_distance(reference, hypothesis) / len(reference)


def wer(reference, hypothesis):
    ref_words = normalize(reference).split()
    hyp_words = normalize(hypothesis).split()
    if not ref_words:
        return 0.0 if not hyp_words else 1.0
    return edit_distance(ref_words, hyp_words) / len(ref_words)


# ---------------------------------------------------------------- پیش‌پردازش

def _preparers():
    """توابع پیش‌پردازش مشترک با سرویس (همان کدی که در عمل اجرا می‌شود)."""
    from pipeline import _clahe, _estimate_skew, _resize_for_ocr, _sauvola, _to_gray, _unsharp

    def base(image):
        return ImageOps.autocontrast(_resize_for_ocr(_to_gray(image)), cutoff=1)

    def sharp(image):
        return _unsharp(base(image))

    def contrast(image):
        return _unsharp(_clahe(base(image)))

    def deskew(image):
        source = sharp(image)
        angle = _estimate_skew(source)
        if abs(angle) < 0.3:
            return source
        return ImageOps.autocontrast(
            source.rotate(angle, resample=Image.BICUBIC, fillcolor=255), cutoff=1)

    def binary(image):
        return _sauvola(sharp(image))

    return {'sharp': sharp, 'contrast': contrast, 'deskew': deskew, 'binary': binary}


# ------------------------------------------------------------------- ورودی‌ها

def load_images(folder, limit):
    paths = []
    for name in sorted(os.listdir(folder)):
        if name.lower().endswith(IMAGE_EXT):
            paths.append(os.path.join(folder, name))
        if limit and len(paths) >= limit:
            break
    return paths


def load_truth(folder, truth_path):
    """
    مرجع هر تصویر. پشتیبانی از:
      * فایل JSON با ساختار {نام‌فایل: متن}
      * فایل JSON تک‌متنی (همان قالب bench با seller/items/total)
      * فایل کنار تصویر: `<نام>.txt`
    """
    table = {}
    if truth_path and os.path.exists(truth_path):
        with open(truth_path, encoding='utf-8') as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, str):
                    table[key] = value
                elif isinstance(value, dict):
                    table[key] = value.get('text') or reference_from_fields(value)
    for name in os.listdir(folder):
        if not name.lower().endswith('.txt'):
            continue
        stem = os.path.splitext(name)[0]
        for ext in IMAGE_EXT:
            if os.path.exists(os.path.join(folder, stem + ext)):
                with open(os.path.join(folder, name), encoding='utf-8') as fh:
                    table.setdefault(stem + ext, fh.read())
                break
    return table


def reference_from_fields(truth):
    """ساخت متن مرجع از فیلدهای ساخت‌یافته (همان قالب scripts/ocr-bench)."""
    parts = [truth.get('seller') or '', truth.get('sellerMeta') or '',
             'صورتحساب فروش کالا و خدمات',
             f'شماره فاکتور: {truth.get("number")}', f'تاریخ: {truth.get("date")}',
             f'خریدار: {truth.get("buyer")}', truth.get('buyerMeta') or '',
             'شرح کالا تعداد مبلغ واحد مبلغ کل']
    for item in truth.get('items') or []:
        parts.append(f'{item.get("name")} {item.get("qty")} {item.get("unit")} {item.get("total")}')
    parts += ['جمع کل', 'مالیات بر ارزش افزوده', 'مبلغ قابل پرداخت', str(truth.get('total'))]
    return '\n'.join(str(p) for p in parts)


# --------------------------------------------------------------------- ارزیابی

def _rows_text(rows):
    """متن سطر‌بندی‌شدهٔ همان خروجی؛ CER باید مثل خود سرویس سنجیده شود."""
    try:
        from pipeline import reconstruct_rows
        return '\n'.join(line['text'] for line in reconstruct_rows(
            [_row_item(text, score, box) for text, score, box in rows]))
    except Exception:  # noqa: BLE001 — بدون بازسازی هم مقایسه معتبر است
        return '\n'.join(text for text, _score, _box in rows)


def _row_item(text, score, box):
    xs = [p[0] for p in box]
    ys = [p[1] for p in box]
    return {'text': text, 'score': score,
            'xmin': min(xs), 'xmax': max(xs), 'ymin': min(ys), 'ymax': max(ys)}


def evaluate(engine, paths, prep_name, prep, truth, params=None):
    numbers = 0
    num_score = 0.0
    all_score = 0.0
    tokens = 0
    elapsed = 0.0
    empty = 0
    cers = []
    wers = []
    for path in paths:
        image = Image.open(path)
        image = ImageOps.exif_transpose(image).convert('RGB')
        prepared = prep(image)
        started = time.perf_counter()
        try:
            rows, _meta = engine.recognize(prepared)
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
        reference = truth.get(os.path.basename(path))
        if reference:
            hypothesis = _rows_text(rows)
            cers.append(cer(reference, hypothesis))
            wers.append(wer(reference, hypothesis))
    result = {
        'numbers': numbers,
        'numScore': round(num_score / max(numbers, 1), 3),
        'allScore': round(all_score / max(tokens, 1), 3),
        'tokens': tokens,
        'seconds': round(elapsed / max(len(paths), 1), 2),
        'empty': empty,
        'cer': round(sum(cers) / len(cers), 4) if cers else None,
        'wer': round(sum(wers) / len(wers), 4) if wers else None,
        'labelled': len(cers),
        'prep': prep_name,
    }
    result.update(params or {})
    return result


def best_key(result):
    """اولویت: CER (اگر باشد) ← تعداد عدد ← اطمینان اعداد ← سرعت."""
    if result['cer'] is not None:
        return (-result['cer'], result['numbers'], result['numScore'], -result['seconds'])
    return (result['numbers'], result['numScore'], result['allScore'], -result['seconds'])


def main():
    parser = argparse.ArgumentParser(description='کالیبراسیون پارامترهای تشخیص PP-OCR')
    parser.add_argument('--dir', required=True, help='پوشهٔ عکس‌های نمونه')
    parser.add_argument('--limit', type=int, default=0, help='حداکثر تعداد تصویر')
    parser.add_argument('--thresh', default='0.2,0.25,0.3,0.35')
    parser.add_argument('--box-thresh', default='0.4,0.5,0.6')
    parser.add_argument('--side', default='1600,1920,2048')
    parser.add_argument('--prep', default='sharp,contrast,deskew',
                        help='نسخه‌های پیش‌پردازش: sharp,contrast,deskew,binary')
    parser.add_argument('--all', action='store_true',
                        help='شبکهٔ کامل: همهٔ پیش‌پردازش‌ها × همهٔ پارامترها (کند)')
    parser.add_argument('--truth', help='فایل JSON یا پوشهٔ برچسب‌ها برای CER/WER')
    parser.add_argument('--report', help='نوشتن گزارش Markdown در این مسیر')
    parser.add_argument('--engine', default='ppocrv6', choices=['ppocrv6', 'ppocrv5'])
    args = parser.parse_args()

    if not os.path.isdir(args.dir):
        print(f'پوشه پیدا نشد: {args.dir}')
        return 1
    paths = load_images(args.dir, args.limit)
    if not paths:
        print('هیچ تصویری در پوشه نیست.')
        return 1

    truth = load_truth(args.dir, args.truth)
    labelled = sum(1 for p in paths if os.path.basename(p) in truth)

    spec = engines.detect_rapid(prefer_v6=args.engine == 'ppocrv6')
    if spec is None:
        spec = engines.detect_rapid(prefer_v6=False)
    if spec is None:
        print('هیچ مدل تشخیص/شناسایی ONNX در models نیست. اول download_models.py را اجرا کنید.')
        return 2

    preparers = _preparers()
    prep_names = [n for n in args.prep.split(',') if n in preparers]
    if not prep_names:
        print(f'پیش‌پردازش نامعتبر. یکی از این‌ها: {", ".join(preparers)}')
        return 1
    if args.all:
        prep_names = list(preparers)
        if len({args.thresh, args.box_thresh, args.side}) == 1:
            args.thresh = '0.2,0.3,0.4'
            args.box_thresh = '0.4,0.5,0.6'
            args.side = '1600,1920,2048'

    grid = list(itertools.product(
        [float(x) for x in args.thresh.split(',')],
        [float(x) for x in args.box_thresh.split(',')],
        [int(x) for x in args.side.split(',')],
    ))
    total_runs = len(grid) * len(prep_names)
    print(f'{len(paths)} تصویر × {total_runs} ترکیب (پارامتر × پیش‌پردازش)'
          + (f' · برچسب برای {labelled} تصویر' if labelled else ' · بدون برچسب'))
    head = (f'{"پیش‌پردازش":>10} {"thresh":>7} {"box":>5} {"side":>6} | '
            f'{"اعداد":>6} {"اطمینان":>8} {"CER":>7} {"WER":>7} {"ثانیه":>7}')
    print(head)
    print('-' * 78)

    results = []
    for prep_name, (thresh, box_thresh, side) in itertools.product(prep_names, grid):
        engine = RapidOcrEngine(spec, {
            'thresh': thresh, 'box_thresh': box_thresh, 'limit_side_len': side,
        })
        if not engine.ready():
            print(f'بارگذاری ناموفق با این ترکیب: {engine.error}')
            continue
        result = evaluate(engine, paths, prep_name, preparers[prep_name], truth,
                          {'thresh': thresh, 'box_thresh': box_thresh, 'side': side})
        results.append(result)
        cer_text = f'{result["cer"] * 100:6.1f}%' if result['cer'] is not None else '      —'
        wer_text = f'{result["wer"] * 100:6.1f}%' if result['wer'] is not None else '      —'
        print(f'{prep_name:>10} {thresh:>7} {box_thresh:>5} {side:>6} | '
              f'{result["numbers"]:>6} {result["numScore"]:>8} {cer_text} {wer_text} '
              f'{result["seconds"]:>7}')

    if not results:
        print('\nهیچ ترکیبی اجرا نشد.')
        return 2

    results.sort(key=best_key, reverse=True)
    best = results[0]
    print('\nبهترین ترکیب:')
    print(f'  نسخهٔ تصویر     : {best["prep"]}')
    print(f'  اعداد خوانده‌شده : {best["numbers"]}')
    print(f'  اطمینان اعداد   : {best["numScore"]}')
    if best['cer'] is not None:
        print(f'  CER / WER        : {best["cer"] * 100:.1f}% / {best["wer"] * 100:.1f}% '
              f'(روی {best["labelled"]} تصویر برچسب‌دار)')

    print()
    print('— بلوک آمادهٔ کپی —')
    block = best_block(best)
    print(block)

    if args.report:
        write_report(args.report, paths, results, best, labelled)
        print(f'\nگزارش در {args.report} نوشته شد.')
    return 0


def best_block(best):
    """بلوک متغیرهای محیطی برای همان ترکیب برنده."""
    lines = [
        f'OCR_PREP={best["prep"]}',
        f'OCR_DET_THRESH={best["thresh"]}',
        f'OCR_DET_BOX_THRESH={best["box_thresh"]}',
        f'OCR_DET_SIDE={best["side"]}',
    ]
    return '\n'.join(lines)


def write_report(path, paths, results, best, labelled):
    """گزارش Markdown آماده برای چسباندن در مستندات یا ارسال."""
    lines = ['# گزارش کالیبراسیون OCR', '',
             f'- تصاویر: {len(paths)}' + (f' (برچسب‌دار: {labelled})' if labelled else ' (بدون برچسب)'),
             f'- ترکیب‌های آزمایش‌شده: {len(results)}', '',
             '| پیش‌پردازش | thresh | box | side | اعداد | اطمینان | CER | WER | ثانیه |',
             '| --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for r in results[:15]:
        lines.append(
            f'| {r["prep"]} | {r["thresh"]} | {r["box_thresh"]} | {r["side"]} | {r["numbers"]} | '
            f'{r["numScore"]} | ' + (f'{r["cer"] * 100:.1f}%' if r['cer'] is not None else '—') +
            ' | ' + (f'{r["wer"] * 100:.1f}%' if r['wer'] is not None else '—') +
            f' | {r["seconds"]} |')
    lines += ['', '## ترکیب پیشنهادی', '', '```', best_block(best), '```', '']
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))


if __name__ == '__main__':
    sys.exit(main())
