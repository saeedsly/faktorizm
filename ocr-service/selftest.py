# -*- coding: utf-8 -*-
"""
خودآزمون لایهٔ تأیید و رجیستری موتور — بدون نیاز به مدل یا تصویر.

اجرا:
    python selftest.py          # همه بررسی‌ها
    python selftest.py -v       # با نمایش جزئیات هر مورد
"""
import sys

import validate

VERBOSE = '-v' in sys.argv or '--verbose' in sys.argv
checks = []


def check(name, got, want):
    ok = got == want
    checks.append((name, ok, got, want))
    if VERBOSE or not ok:
        print(('✓' if ok else '✗'), name, '→', got, '' if ok else f'(انتظار: {want})')


def main():
    # ---------------------------------------------------------- سه‌شاخهٔ اعتماد
    check('۰٫۹۵ → ok', validate.level_for(0.95), 'ok')
    check('۰٫۸۵ → ok (مرز)', validate.level_for(0.85), 'ok')
    check('۰٫۸۴ → review', validate.level_for(0.84), 'review')
    check('۰٫۷۰ → review (مرز)', validate.level_for(0.70), 'review')
    check('۰٫۶۹ → unsafe', validate.level_for(0.69), 'unsafe')
    check('۹۵ (درصد) → ok', validate.level_for(95), 'ok')
    check('هیچ → unsafe', validate.level_for(None), 'unsafe')

    # ---------------------------------------------------------- whitelist عدد
    check('رقم فارسی', validate.parse_money('۱۲۳۴۵'), 12345)
    check('رقم عربی', validate.parse_money('١٢٣٤٥'), 12345)
    check('جداکنندهٔ فارسی', validate.parse_money('۱٬۲۵۰٬۰۰۰'), 1250000)
    check('O به‌جای صفر', validate.parse_money('1O5'), 105)
    check('B به‌جای هشت', validate.parse_money('1B0'), 180)
    check('S به‌جای پنج', validate.parse_money('S0'), 50)
    check('متن غیرعددی', validate.parse_money('نامشخص'), None)
    check('خالی', validate.parse_money(''), None)
    check('منفی حفظ می‌شود', validate.parse_money('-۲۵۰۰'), -2500)
    check('نقطهٔ هزارگان', validate.parse_money('1.250.000'), 1250000)

    # ---------------------------------------------------------- تاریخ
    check('شمسی معتبر', validate.parse_date('1403/05/12'), (1403, 5, 12, 'jalali'))
    check('شمسی خارج از بازه', validate.parse_date('1385/01/01'), None)
    check('میلادی معتبر', validate.parse_date('2024-07-03'), (2024, 7, 3, 'gregorian'))
    check('میلادی خارج از بازه', validate.parse_date('2009-12-31'), None)
    check('ماه نامعتبر', validate.parse_date('1403/13/01'), None)
    check('بی‌ساختار', validate.parse_date('تیر ۱۴۰۳'), None)

    # ---------------------------------------------------------- شماره فاکتور
    check('شماره معتبر', validate.valid_invoice_number('۱۴۰۳-۰۰۸۴۵'), '1403-00845')
    check('شماره کوتاه', validate.valid_invoice_number('12'), None)
    check('شماره با حرف', validate.valid_invoice_number('ABC'), None)

    # ---------------------------------------------------------- حسابداری
    base = {
        'confidence': 92.0,
        'items': [
            {'title': 'کاغذ A4', 'quantity': 2, 'unitPrice': 500000, 'total': 1000000},
            {'title': 'تونر', 'quantity': 1, 'unitPrice': 2000000, 'total': 2000000},
        ],
        'totals': {'total': 3240000, 'tax': 240000},
    }
    result = validate.validate(dict(base))
    check('جمع هم‌خوان → ok', result['verification']['status'], 'ok')
    check('بدون پرچم', result['verification']['flags'], [])

    bad = dict(base, totals={'total': 3540000, 'tax': 240000})
    result = validate.validate(bad)
    check('ناسازگاری جمع → پرچم', 'arithmetic_mismatch' in result['verification']['flags'], True)
    check('ناسازگاری جمع → review', result['verification']['status'], 'review')
    check('اختلاف گزارش می‌شود', result['totals'].get('delta'), 300000)

    low = dict(base, confidence=54.0)
    result = validate.validate(low)
    check('اطمینان پایین → unsafe', result['verification']['status'], 'unsafe')
    check('اقلام خالی می‌شوند', result['items'], [])
    check('پیام تأییدنشدن', 'قابل تأیید نیست' in result['verification']['notes'][0], True)

    # اطمینان بالا + ناسازگاری حسابداری: پیام باید دربارهٔ حسابداری باشد، نه بازهٔ اطمینان
    high_but_bad = dict(base, totals={'total': 3540000, 'tax': 240000})
    result = validate.validate(high_but_bad)
    check('پیام ناسازگاری درست است',
          'حسابداری' in ' '.join(result['verification']['notes']), True)
    check('پیام بازهٔ اطمینان اشتباه نمی‌آید',
          'بین ۷۰ تا ۸۵' not in ' '.join(result['verification']['notes']), True)

    mid = dict(base, confidence=78.0)
    result = validate.validate(mid)
    check('میانه → review', result['verification']['status'], 'review')
    check('اقلام حفظ می‌شوند', len(result['items']), 2)

    row_bad = {
        'confidence': 93.0,
        'items': [{'title': 'تونر', 'quantity': 1, 'unitPrice': 20000001, 'total': 2000000}],
        'totals': {},
    }
    result = validate.validate(row_bad)
    check('ردیف ناسازگار → پرچم', 'item_mismatch' in result['verification']['flags'], True)
    check('ردیف ناسازگار → review', result['verification']['status'], 'review')
    check('ردیف ناسازگار علامت‌گذاری', result['items'][0].get('needsReview'), True)

    dirty = {
        'confidence': 90.0,
        'items': [{'title': 'کاغذ', 'quantity': '۲', 'unitPrice': '5O0,000', 'total': 1000000}],
        'totals': {'total': 1000000},
    }
    result = validate.validate(dirty)
    check('مبلغ پاک‌سازی‌شده', result['items'][0]['unitPrice'], 500000)
    check('تعداد پاک‌سازی‌شده', result['items'][0]['quantity'], 2)

    # ---------------------------------------------------------- رجیستری موتور
    import engines

    found = engines.available()
    check('فهرست موتورها لیست است', isinstance(found, list), True)
    engine = engines.select('ppocrv5')
    if engine is None:
        check('نبود وابستگی → None', True, True)
        check('پیام خطای فارسی', bool(engines.selection_error()), True)
    else:
        check('موتور v5 شناسایی شد', engine.id, 'ppocrv5-arabic')
        check('موتور آماده است', engine.ready(), True)
    unknown = engines.select('engine-ناموجود')
    check('موتور ناشناخته → None', unknown, None)

    failed = [c for c in checks if not c[1]]
    print()
    print(f'{len(checks) - len(failed)}/{len(checks)} بررسی موفق')
    if failed:
        for name, _ok, got, want in failed:
            print('  ✗', name, '→', got, 'انتظار:', want)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
