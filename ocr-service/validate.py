# -*- coding: utf-8 -*-
"""
فاز ۱ نقشهٔ راه — لایهٔ تأیید خروجی OCR.

فلسفه: «مدل می‌خواند، پایتون تأیید می‌کند».

خطرناک‌ترین حالت این است که خوانش ظاهراً موفق باشد ولی رقمی اشتباه داشته باشد.
این ماژول است که تعیین می‌کند خروجی موتور (هر موتوری: Falcon یا PP-OCR) به
داده مالی تبدیل شود یا نه:

* اطمینان ≥ ۰٫۸۵ → خودکار (وضعیت ok)
* ۰٫۷۰ تا ۰٫۸۵ → نارنجی، «بازبینی اختیاری» (وضعیت review)
* کمتر از ۰٫۷۰ → خالی، پیام «قابل تأیید نیست» (وضعیت unsafe)

افزون بر آن:
* ناسازگاری جمع اقلام/مالیات/جمع کل (بیش از ۰٫۰۱) → پرچم arithmetic_mismatch
* whitelist عدد: فقط ارقام و . / - (حرف O و B و S به رقم اصلاح می‌شوند)
* بازهٔ مجاز تاریخ: ۱۳۹۰–۱۴۰۵ شمسی یا ۲۰۱۰–۲۰۲۶ میلادی
* الگوی شمارهٔ فاکتور

هیچ عددی ساخته نمی‌شود؛ فیلد نامعتبر None می‌شود و در flags گزارش می‌گردد.
"""
import os
import re

AUTO_CONFIRM = float(os.environ.get('OCR_AUTO_CONFIRM', '0.85'))
REVIEW_FLOOR = float(os.environ.get('OCR_REVIEW_FLOOR', '0.70'))
MONEY_TOLERANCE = float(os.environ.get('OCR_MONEY_TOLERANCE', '0.01'))

PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
NUMERIC_WHITELIST = set('0123456789./-')
# اشتباه رایج OCR در فونت‌های چاپی: حرف لاتین به‌جای رقم
LETTER_TO_DIGIT = {'O': '0', 'o': '0', 'D': '0', 'B': '8', 'S': '5', 'l': '1', 'I': '1', 'Z': '2', 'G': '6'}

JALALI_RANGE = (1390, 1405)
GREGORIAN_RANGE = (2010, 2026)

INVOICE_PATTERN = re.compile(r'^(?=.*\d)[A-Za-z0-9\-/]{4,24}$')
DATE_PATTERNS = [
    re.compile(r'^(1[34]\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})$'),  # شمسی
    re.compile(r'^(20\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})$'),    # میلادی
    re.compile(r'^(\d{4})(\d{2})(\d{2})$'),
]


def to_latin_digits(text):
    """ارقام فارسی/عربی → لاتین."""
    out = []
    for ch in str(text):
        if ch in PERSIAN_DIGITS:
            out.append(str(PERSIAN_DIGITS.index(ch)))
        elif ch in ARABIC_DIGITS:
            out.append(str(ARABIC_DIGITS.index(ch)))
        else:
            out.append(ch)
    return ''.join(out)


def clean_number(text):
    """
    whitelist عدد: هر چیزی جز ارقام و . / - حذف می‌شود و O/B/S به رقم اصلاح
    می‌شود. جداکنندهٔ هزارگان فارسی (٬) و کاما حذف می‌شوند.
    """
    if text is None:
        return None
    raw = str(text).replace('\u066c', '').replace('\u060c', '').replace(',', '')
    raw = raw.replace('\u200c', '').replace(' ', '')
    raw = to_latin_digits(raw)
    raw = ''.join(LETTER_TO_DIGIT.get(ch, ch) for ch in raw)
    cleaned = ''.join(ch for ch in raw if ch in NUMERIC_WHITELIST)
    return cleaned or None


def parse_money(text):
    """متن → عدد صحیح ریال/تومان، یا None. علامت منفی حفظ می‌شود."""
    cleaned = clean_number(text)
    if not cleaned:
        return None
    # فقط نقطه و اسلش به‌عنوان جداکنندهٔ هزارگان بررسی می‌شود
    body = cleaned.lstrip('-')
    if body.count('.') > 1:
        body = body.replace('.', '')
    elif '.' in body and len(body.split('.')[-1]) == 3:
        body = body.replace('.', '')
    body = body.replace('/', '')
    try:
        value = float(body)
    except ValueError:
        return None
    if value != value or value in (float('inf'), float('-inf')):
        return None
    return int(round(value)) * (-1 if cleaned.startswith('-') else 1)


def parse_date(text):
    """تاریخ → (سال، ماه، روز، نوع تقویم) یا None."""
    cleaned = to_latin_digits(str(text or '')).strip()
    for pattern in DATE_PATTERNS:
        match = pattern.match(cleaned)
        if not match:
            continue
        year, month, day = (int(g) for g in match.groups())
        if not (1 <= month <= 12 and 1 <= day <= 31):
            return None
        if JALALI_RANGE[0] <= year <= JALALI_RANGE[1]:
            return year, month, day, 'jalali'
        if GREGORIAN_RANGE[0] <= year <= GREGORIAN_RANGE[1]:
            return year, month, day, 'gregorian'
        return None
    return None


def valid_invoice_number(text):
    cleaned = to_latin_digits(str(text or '')).strip()
    if not INVOICE_PATTERN.match(cleaned):
        return None
    if len(re.sub(r'\D', '', cleaned)) < 3:
        return None
    return cleaned


def _reject(clean, catalog, label, detail):
    return {'clean': clean, 'catalog': catalog, 'label': label, 'detail': detail}


def reject_catalog():
    """فهرست قواعدی که نقض آن‌ها داده را قابل‌اعتماد نمی‌کند (برای UI)."""
    return [
        {'code': 'low_confidence', 'label': 'اطمینان پایین خوانش',
         'detail': 'خوانش با اطمینان کمتر از ۷۰٪ انجام شده و قابل تأیید نیست.'},
        {'code': 'item_mismatch', 'label': 'ناسازگاری ردیف',
         'detail': 'تعداد × قیمت واحد با مبلغ ردیف نمی‌خواند؛ رقم مشکوک است.'},
        {'code': 'arithmetic_mismatch', 'label': 'ناسازگاری جمع',
         'detail': 'جمع اقلام با مالیات و جمع کل نمی‌خواند؛ احتمال خطای خواندن رقم.'},
        {'code': 'invalid_date', 'label': 'تاریخ خارج از بازه',
         'detail': 'تاریخ خوانده‌شده در بازهٔ مجاز ۱۳۹۰–۱۴۰۵ شمسی یا ۲۰۱۰–۲۰۲۶ میلادی نیست.'},
        {'code': 'invalid_invoice_number', 'label': 'شمارهٔ فاکتور نامعتبر',
         'detail': 'شمارهٔ فاکتور الگوی متعارف (۴ تا ۲۴ نویسهٔ عدد/خط تیره) را ندارد.'},
        {'code': 'numeric_whitelist', 'label': 'نویسهٔ غیرعددی در مبلغ',
         'detail': 'در فیلد مبلغ نویسه‌ای جز ارقام و جداکننده پیدا شد و حذف/اصلاح شد.'},
    ]


def level_for(confidence):
    """سه‌شاخهٔ اعتماد: ok / review / unsafe (ورودی ۰..۱ یا ۰..۱۰۰)."""
    try:
        value = float(confidence)
    except (TypeError, ValueError):
        return 'unsafe'
    if value > 1:
        value /= 100.0
    if value >= AUTO_CONFIRM:
        return 'ok'
    if value >= REVIEW_FLOOR:
        return 'review'
    return 'unsafe'


def validate(result):
    """
    خروجی `recognize_bytes` را می‌گیرد و بلوک `verification` را اضافه می‌کند.

    ساختار:
        status: ok | review | unsafe
        confidence: 0..100
        flags: [کدها]
        totals: جمع‌های تأییدشده (ناسازگار حذف می‌شود)
        items: اقلام با فیلدهای عددی پاک‌سازی‌شده
    """
    confidence = float(result.get('confidence') or 0)
    confidence_level = level_for(confidence)
    status = confidence_level
    flags = []
    notes = []

    items = []
    for item in result.get('items') or []:
        clean = dict(item)
        for field in ('quantity', 'unitPrice', 'total', 'discount', 'taxAmount'):
            if clean.get(field) is None:
                continue
            original = clean[field]
            value = parse_money(original)
            if value is None:
                clean[field] = None
                flags.append('numeric_whitelist')
            elif value != original:
                clean[field] = value
        # ستون‌هایی که خوانده نشدند، صفر می‌مانند ولی در هشدار می‌آیند
        if not clean.get('unitPrice') and not clean.get('total'):
            continue

        # سازگاری درون‌ردیفی: تعداد × قیمت واحد − تخفیف باید برابر مبلغ ردیف باشد.
        # نمونهٔ واقعی: «۲۰٬۰۰۰٬۰۰۰» به‌صورت «۲۰٬۰۰۰٬۰۰۱» خوانده می‌شود؛ جمع کل
        # هم ممکن است درست خوانده شود، پس فقط بررسی جمع کل کافی نیست.
        qty = clean.get('quantity') or 1
        unit = clean.get('unitPrice') or 0
        row_total = clean.get('total') or 0
        discount = clean.get('discount') or 0
        if unit and row_total:
            expected_row = qty * unit - discount
            if abs(expected_row - row_total) > max(MONEY_TOLERANCE, abs(row_total) * 0.01):
                clean['needsReview'] = True
                clean['expectedTotal'] = expected_row
                flags.append('item_mismatch')
        items.append(clean)

    totals = dict(result.get('totals') or {})
    for key in ('total', 'tax', 'subtotal', 'discount'):
        if key in totals and totals[key] is not None:
            value = parse_money(totals[key])
            if value is None:
                totals.pop(key, None)
                flags.append('numeric_whitelist')
            else:
                totals[key] = value

    if 'item_mismatch' in flags:
        notes.append('در برخی ردیف‌ها تعداد × قیمت واحد با مبلغ ردیف نمی‌خواند؛ '
                     'احتمال خطای خواندن رقم هست.')
        if status == 'ok':
            status = 'review'

    # حسابداری: جمع اقلام (خالص) + مالیات − تخفیف باید با جمع کل بخواند
    if items and totals.get('total'):
        net = sum(parse_money(i.get('total')) or 0 for i in items)
        tax = totals.get('tax') or 0
        discount = totals.get('discount') or 0
        expected = net + tax - discount
        actual = totals['total']
        if abs(expected - actual) > max(MONEY_TOLERANCE, abs(actual) * 0.002):
            flags.append('arithmetic_mismatch')
            notes.append(
                f'جمع اقلام ({net:,}) با مالیات ({tax:,}) و تخفیف ({discount:,}) '
                f'با جمع کل ({actual:,}) نمی‌خواند.'
            )
            if status == 'ok':
                status = 'review'
            totals['expectedTotal'] = expected
            totals['delta'] = actual - expected

    if status == 'unsafe':
        items = []
        totals = {}
        notes.append('اطمینان خوانش کمتر از ۷۰٪ است؛ این تصویر قابل تأیید نیست. '
                     'عکس روشن‌تر و صاف‌تر بگیرید.')
    elif status == 'review':
        if confidence_level == 'review':
            notes.append('اطمینان خوانش بین ۷۰ تا ۸۵٪ است؛ بازبینی اختیاری پیشنهاد می‌شود.')
        else:
            # اطمینان خوانش بالا بود ولی بررسی عددی ناسازگاری نشان داد
            notes.append('اطمینان خوانش بالا بود، اما بررسی حسابداری ناسازگاری نشان داد؛ '
                         'این سند باید بازبینی شود.')

    verification = {
        'status': status,
        'confidence': round(confidence, 1),
        'autoConfirm': AUTO_CONFIRM * 100,
        'reviewFloor': REVIEW_FLOOR * 100,
        'flags': sorted(set(flags)),
        'notes': notes,
        'items': items,
        'totals': totals,
    }
    result['verification'] = verification
    result['items'] = items
    result['totals'] = totals
    return result


# ------------------------------------------------------------ فیلدهای سرصفحه

def read_field(kind, text, confidence=None):
    """
    خواندن یک فیلد تکی سربرگ (تاریخ/شماره فاکتور/مبلغ) با همان قواعد.
    ورودی: نوع فیلد و متن خام. خروجی: {value, ok, flag}
    """
    if kind == 'date':
        parsed = parse_date(text)
        if not parsed:
            return {'value': None, 'ok': False, 'flag': 'invalid_date'}
        year, month, day, calendar = parsed
        return {
            'value': f'{year:04d}-{month:02d}-{day:02d}',
            'ok': True,
            'calendar': calendar,
            'flag': None,
        }
    if kind == 'invoice':
        value = valid_invoice_number(text)
        if not value:
            return {'value': None, 'ok': False, 'flag': 'invalid_invoice_number'}
        return {'value': value, 'ok': True, 'flag': None}
    if kind == 'money':
        value = parse_money(text)
        if value is None:
            return {'value': None, 'ok': False, 'flag': 'numeric_whitelist'}
        return {'value': value, 'ok': True, 'flag': None}
    return {'value': None, 'ok': False, 'flag': 'unknown_field'}
