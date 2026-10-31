# -*- coding: utf-8 -*-
"""
سنجش دقت خوانش OCR روی تصاویر مرجع.

معیارها:
  CER  → نرخ خطای نویسه (ویرایش‌ها تقسیم بر طول متن مرجع)
  فیلد → درستی شماره فاکتور، تاریخ، جمع کل و مبالغ ردیف‌ها
  زمان → میلی‌ثانیه به‌ازای هر تصویر

اجرا:
    /tmp/ocr-venv/bin/python scripts/ocr-bench/bench.py
    /tmp/ocr-venv/bin/python scripts/ocr-bench/bench.py invoice-photo.jpg
"""
import io
import json
import os
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(BASE, 'ocr-service'))

HERE = os.path.dirname(os.path.abspath(__file__))
FA_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789')


def norm(text):
    """نرمال‌سازی برای مقایسه: ارقام فارسی، فاصله‌ها و نویسه‌های نمایشی."""
    text = text.translate(FA_DIGITS)
    text = text.replace('٬', '').replace(',', '').replace('|', ' ').replace('\u200c', ' ')
    # جداکنندهٔ تاریخ/شماره حذف می‌شود تا «1404/05/12» با «14040512» سنجیده شود
    text = text.replace('/', '').replace('-', '').replace('.', '')
    text = text.replace('ي', 'ی').replace('ك', 'ک')
    return ' '.join(text.split())


def digits_only(text):
    return ''.join(ch for ch in text.translate(FA_DIGITS) if ch.isdigit())


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


def cer(ref, hyp):
    ref, hyp = norm(ref), norm(hyp)
    if not ref:
        return 0.0 if not hyp else 1.0
    return edit_distance(ref, hyp) / len(ref)


def field_report(truth, text, parsed=None):
    """
    درستی فیلدهای کلیدی: جست‌وجوی مستقیم مقدار در متن خوانده‌شده، و برای
    جمع‌ها، مقایسه با جمع‌های تأییدشدهٔ لایهٔ اعتبارسنجی (`parsed`).
    """
    flat = norm(text).replace(' ', '')
    out = {}

    inv = digits_only(str(truth['number']))
    out['شماره فاکتور'] = inv in flat

    date = digits_only(truth['date'])
    out['تاریخ'] = date in flat or (len(date) == 8 and date[:4] in flat and date[4:] in flat)

    total = digits_only(str(truth['total']))
    verified_total = None
    if parsed:
        verified_total = (parsed.get('totals') or {}).get('total')
    out['جمع کل'] = total in flat or (
        verified_total is not None and abs(int(verified_total) - int(truth['total'])) <= 1)

    item_hits = 0
    for item in truth['items']:
        amount = digits_only(str(item['total']))
        name_head = norm(item['name']).split()[0]
        if amount in flat and len(name_head) >= 3 and name_head in norm(text).replace(' ', ''):
            item_hits += 1
    out[f'ردیف‌های کامل'] = f'{item_hits}/{len(truth["items"])}'
    return out


def reference_text(truth):
    """متن کامل مرجع برای سنجش CER روی کل سند."""
    parts = [truth['seller'], truth.get('sellerMeta') or '', 'صورتحساب فروش کالا و خدمات',
             f'شماره فاکتور: {truth["number"]}', f'تاریخ: {truth["date"]}',
             f'خریدار: {truth["buyer"]}', truth.get('buyerMeta') or '',
             'شرح کالا تعداد مبلغ واحد مبلغ کل']
    for item in truth['items']:
        parts.append(f'{item["name"]} {item["qty"]} {item["unit"]:,} {item["total"]:,}')
    parts += ['جمع کل', 'مالیات بر ارزش افزوده', 'مبلغ قابل پرداخت', str(truth['total'])]
    return '\n'.join(parts)


def truth_for(name):
    """
    مرجع هر تصویر: قالب دوم (invoice-alt) فاکتور دیگری است و مرجع خودش را
    دارد؛ مقایسهٔ آن با مرجع قالب اول بی‌معنا بود.
    """
    alt = os.path.join(HERE, 'invoice-truth-alt.json')
    if 'alt' in name and os.path.exists(alt):
        return json.load(open(alt, encoding='utf-8'))
    return json.load(open(os.path.join(HERE, 'invoice-truth.json'), encoding='utf-8'))


def run(image_path):
    from pipeline import recognize_bytes  # noqa: E402 — بارگذاری پس از تنظیم مسیر

    with open(image_path, 'rb') as fh:
        data = fh.read()
    started = time.perf_counter()
    result = recognize_bytes(data)
    elapsed = (time.perf_counter() - started) * 1000
    return result, elapsed


def main():
    names = sys.argv[1:] or ['invoice-clean.png', 'invoice-alt.png', 'invoice-photo.jpg', 'invoice-lowres.jpg']
    print(f'{"تصویر":<20}{"CER":>8}{"اطمینان":>10}{"زمان":>10}  وضعیت فیلدها')
    print('-' * 100)
    all_cer = []
    for name in names:
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            print(f'{name}: یافت نشد')
            continue
        truth = truth_for(name)
        try:
            result, elapsed = run(path)
        except Exception as exc:  # noqa: BLE001
            print(f'{name}: خطا — {type(exc).__name__}: {exc}')
            continue
        score = cer(reference_text(truth), result['text'])
        all_cer.append(score)
        fields = field_report(truth, result['text'], result)
        print(f'{name:<20}{score * 100:>7.1f}%{result["confidence"]:>9.1f}%{elapsed:>8.0f}ms  {fields}')
        if os.environ.get('BENCH_TEXT'):
            print('  ── متن خوانده‌شده ──')
            for line in result['text'].splitlines():
                print('   ', line)
    if all_cer:
        print('-' * 100)
        print(f'میانگین CER: {sum(all_cer) / len(all_cer) * 100:.1f}%')


if __name__ == '__main__':
    main()
