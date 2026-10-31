# -*- coding: utf-8 -*-
"""
اعتبارسنجی شماره‌های هویتی ایران — همان چیزی که در سربرگ فاکتور می‌آید.

همهٔ توابع، ورودی «کثیفِ OCR» را هم می‌پذیرند: ارقام فارسی/عربی، جداکنندهٔ
هزارگان (٬ ، , فاصله)، پیشوند/پسوند متنی («کد ملی: ۰۰۱۲۳۴۵۶۷۸») و حرف‌های
شبیه‌رقم. خروجی همیشه یکی از این سه است:

    ('ok',  value)   عدد معتبر است
    ('bad', value)   شکل درست است ولی رقم کنترل نمی‌خواند
    (None,  None)    اصلاً چنین شماره‌ای در متن نبود

رقم کنترل، تنها چیزی است که «خواندن اشتباه یک رقم» را از «عدد درست» جدا
می‌کند؛ همان فلسفهٔ «مدل می‌خواند، پایتون تأیید می‌کند».
"""
import re

try:
    import persian_dict
except ImportError:  # pragma: no cover — اجرای مستقل
    persian_dict = None


def _digits(text):
    """فقط ارقام (لاتین)، با ترمیم حرف‌های شبیه‌رقم."""
    if text is None:
        return ''
    if persian_dict is not None:
        return persian_dict.digits_only(str(text))
    return re.sub(r'\D', '', str(text).translate(
        str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')))


# ------------------------------------------------------------- کد ملی (۱۰ رقمی)
def national_id_valid(text):
    """کد ملی اشخاص حقیقی: ۱۰ رقم و رقم کنترل استاندارد."""
    digits = _digits(text)
    if len(digits) != 10:
        return False
    if digits in {'0000000000', '1111111111', '2222222222', '3333333333',
                  '4444444444', '5555555555', '6666666666', '7777777777',
                  '8888888888', '9999999999'}:
        return False
    check = int(digits[9])
    total = sum(int(digits[i]) * (10 - i) for i in range(9))
    remainder = total % 11
    return check == remainder if remainder < 2 else check == 11 - remainder


# ------------------------------------------------- شناسه ملی اشخاص حقوقی (۱۱ رقم)
def legal_id_valid(text):
    """شناسهٔ ملی شرکت: ۱۱ رقم، وزن‌های ۱۰ تا ۲ و رقم کنترل در انتها."""
    digits = _digits(text)
    if len(digits) != 11:
        return False
    if digits == '0' * 11:
        return False
    weights = [10, 9, 8, 7, 6, 5, 4, 3, 2]
    total = sum(int(digits[i]) * weights[i] for i in range(9))
    remainder = total % 11
    check = int(digits[10])
    expected = 11 - remainder if remainder > 1 else remainder
    if expected == 10:
        expected = 0
    # رقم دهم (اندیس ۹) در شناسهٔ حقوقی همیشه ۰ است
    return check == expected and digits[9] in '0'


# ------------------------------------------------------------------ شبا (IR…)
def iban_valid(text):
    """شبا: IR + ۲۴ رقم، با الگوریتم mod 97."""
    raw = re.sub(r'[\s\u00a0\u200c-]', '', str(text or '')).upper()
    if persian_dict is not None:
        raw = persian_dict.to_latin_number(raw)
    if not raw.startswith('IR'):
        return False
    digits = _digits(raw[2:])
    if len(digits) != 24:
        return False
    # IR06 2960… → 2960… + 1827 + 06  (حرف‌ها: I=18، R=27)
    rearranged = digits[2:] + '1827' + digits[:2]
    return int(rearranged) % 97 == 1


# -------------------------------------------------------------- کد اقتصادی (۱۲)
def economic_code_valid(text):
    """
    کد اقتصادی ۱۲ رقمی (مالیات بر ارزش افزوده).

    ایران رقم کنترل یکسانِ سراسری برای آن تعریف نکرده است؛ پس فقط شکل و
    جلوگیری از عددِ تکراری/ناقص بررسی می‌شود — ادعای اعتبار بیشتر نمی‌کنیم.
    """
    digits = _digits(text)
    return len(digits) == 12 and len(set(digits)) > 2


# ---------------------------------------------------------------- کد پستی (۱۰)
def postal_code_valid(text):
    digits = _digits(text)
    return len(digits) == 10 and digits[0] != '0' and digits not in {'1234567890', '0000000000'}


# ------------------------------------------------------------------ تلفن‌ها
def mobile_valid(text):
    digits = _digits(text)
    if digits.startswith('0098'):
        digits = '0' + digits[4:]
    elif digits.startswith('98') and len(digits) == 12:
        digits = '0' + digits[2:]
    return len(digits) == 11 and digits.startswith('09')


def landline_valid(text):
    """تلفن ثابت با کد شهر: ۸ رقم بدون کد یا ۱۰–۱۱ رقم با کد."""
    digits = _digits(text)
    return len(digits) in (8, 10, 11) and digits.startswith('0') is False and digits[0] != '0' or (
        len(digits) in (10, 11) and digits.startswith('0'))


# ------------------------------------------------------------------ تشخیص خودکار
EXPECTED_LENGTH = {
    'national_id': 10,
    'legal_id': 11,
    'economic_code': 12,
    'postal_code': 10,
    'mobile': 11,
    'iban': 26,
}


def expected_length(kind):
    return EXPECTED_LENGTH.get(kind)


LABELS = {
    'national_id': 'کد ملی',
    'legal_id': 'شناسهٔ ملی',
    'economic_code': 'کد اقتصادی',
    'postal_code': 'کد پستی',
    'mobile': 'شمارهٔ همراه',
    'iban': 'شبا',
}


_PATTERNS = (
    ('national_id', re.compile(r'(?:کد\s*ملی|شماره\s*ملی)[^0-9۰-۹٠-٩]{0,4}'))
    , ('legal_id', re.compile(r'(?:شناسه\s*ملی)[^0-9۰-۹٠-٩]{0,4}'))
    , ('economic_code', re.compile(r'(?:کد\s*اقتصادی)[^0-9۰-۹٠-٩]{0,4}'))
    , ('postal_code', re.compile(r'(?:کد\s*پستی)[^0-9۰-۹٠-٩]{0,4}'))
    , ('iban', re.compile(r'(?:شبا|IBAN)[^A-Za-z]{0,4}'))
    , ('mobile', re.compile(r'(?:همراه|موبایل)[^0-9۰-۹٠-٩]{0,4}'))
)


def find_identifiers(text):
    """
    شماره‌های هویتیِ برچسب‌دار در یک خط/متن.

    خروجی: فهرست دیکشنری {kind, value, ok} — برای هشدار در بازبینی فاکتور.
    """
    if not text:
        return []
    found = []
    for kind, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            tail = text[match.end():match.end() + 32]
            raw = re.match(r'[0-9۰-۹٠-٩٬،,\s\-]{4,30}', tail)
            if not raw:
                if kind == 'iban':
                    iban = re.search(r'IR[0-9۰-۹]{20,28}', text, re.I)
                    if iban:
                        value = iban.group(0)
                        found.append({'kind': kind, 'value': value, 'ok': iban_valid(value)})
                continue
            value = raw.group(0).strip()
            checker = {
                'national_id': national_id_valid,
                'legal_id': legal_id_valid,
                'economic_code': economic_code_valid,
                'postal_code': postal_code_valid,
                'mobile': mobile_valid,
            }[kind]
            found.append({'kind': kind, 'value': value, 'ok': checker(value)})
    return found
