# -*- coding: utf-8 -*-
"""
پس‌پردازش متن OCR فارسی.

۱) تبدیل ترتیب تصویری به منطقی: موتور PP-OCRv5 برای خط عربی متن را به همان
   ترتیبی که در تصویر می‌بیند برمی‌گرداند (چپ‌به‌راست)؛ بنابراین واژه‌ها برعکس
   درمی‌آیند. اینجا رشته معکوس می‌شود و بازه‌های لاتین/عدد دوباره به ترتیب
   صحیح برمی‌گردند تا «نيرآ ىگناخ» به «خانگی آرین» تبدیل شود.
۲) یکسان‌سازی نویسه‌های عربی/فارسی (ي→ی، ك→ک، ة→ه) و ارقام عربی به فارسی.
۳) اصلاح واژه‌های پرتکرار فاکتور با فاصله ویرایشی (Levenshtein) محدود.
"""
import re

# ------------------------------------------------------------ ترتیب منطقی

_LTR_CHARS = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')
_NUM_CHARS = set('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩')
_SEPARATORS = set('./:٬,+-%_@#()[]{}<>|=*&$ ')
_MIRROR = str.maketrans('()[]{}<>', ')(][}{><')


def _is_ltr(ch):
    return ch in _LTR_CHARS or ch in _NUM_CHARS


def visual_to_logical(text):
    """تبدیل متن خوانده‌شده از ترتیب تصویری (LTR) به ترتیب منطقی فارسی."""
    if not text:
        return text
    # فقط وقتی معکوس می‌کنیم که متن واقعاً ترتیب تصویری داشته باشد؛
    # نشانه‌اش آن است که واژه‌ها برعکس‌اند و در جمله فارسی «و» برعکس دیده می‌شود.
    chars = list(text[::-1])
    out = []
    i = 0
    n = len(chars)
    while i < n:
        if _is_ltr(chars[i]):
            j = i
            last_ltr = i
            while j < n and (chars[j] in _LTR_CHARS or chars[j] in _NUM_CHARS
                             or (chars[j] in _SEPARATORS and j + 1 < n and
                                 (chars[j + 1] in _LTR_CHARS or chars[j + 1] in _NUM_CHARS))):
                if _is_ltr(chars[j]):
                    last_ltr = j
                j += 1
            out.extend(chars[i:last_ltr + 1][::-1])
            i = last_ltr + 1
        else:
            out.append(chars[i])
            i += 1
    return ''.join(out).translate(_MIRROR)


def has_arabic(text):
    return bool(re.search(r'[\u0600-\u06FF]', text))


def looks_reversed(text):
    """تشخیص خودکار ترتیب تصویری با تکیه بر واژه‌های پربسامد فارسی."""
    probes = ('و ', ' از', ' یا ', ' با ', ' این ')
    # در متن معکوس، «و» به تنهایی و واژه‌های پرتکرار برعکس ظاهر می‌شوند
    reversed_hits = sum(text.count(p[::-1]) for p in probes)
    normal_hits = sum(text.count(p) for p in probes)
    return reversed_hits > normal_hits


# ------------------------------------------------------------ یکسان‌سازی

_CHAR_MAP = str.maketrans({
    'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک',
    'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا', 'آ': 'آ',
    '٠': '۰', '١': '۱', '٢': '۲', '٣': '۳', '٤': '۴',
    '٥': '۵', '٦': '۶', '٧': '۷', '٨': '۸', '٩': '۹',
    '\u200e': '', '\u200f': '', '\u202a': '', '\u202b': '',
    '\u202c': '', '\u202d': '', '\u202e': '',
})


def normalize(text):
    text = text.translate(_CHAR_MAP)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


# ------------------------------------------------------------ واژه‌نامه

# واژه‌های پرکاربرد فاکتور و کالا برای اصلاح خطاهای تک‌نویسه‌ای
VOCAB = [
    'فاکتور', 'فروش', 'خرید', 'شرکت', 'فروشگاه', 'بازرگانی', 'صنعتی', 'تجارت',
    'تعداد', 'مبلغ', 'مبلغ کل', 'شرح', 'کالا', 'خدمات', 'واحد', 'قیمت',
    'جمع', 'کل', 'تخفیف', 'مالیات', 'ارزش', 'افزوده', 'قابل', 'پرداخت',
    'شرح کالا', 'مبلغ واحد', 'مبلغ کل', 'شماره', 'تاریخ', 'خریدار', 'فروشنده',
    'کد اقتصادی', 'شناسه ملی', 'تلفن', 'آدرس', 'شعبه', 'انبار', 'بارنامه',
    'لپ‌تاپ', 'لپ تاپ', 'ماوس', 'کیبورد', 'مانیتور', 'هارد', 'کابل', 'شارژر',
    'پرینتر', 'اسکنر', 'مودم', 'روتر', 'هدفون', 'اسپیکر', 'فلش', 'رم',
    'کاغذ', 'خودکار', 'مداد', 'پاک‌کن', 'دفتر', 'پوشه', 'زونکن',
    'روغن', 'موتور', 'برنج', 'شکر', 'آرد', 'چای', 'قهوه', 'شیر', 'پنیر',
    'دستکش', 'پیچ', 'مهره', 'ورق', 'لوله', 'رنگ', 'ابزار', 'جعبه',
    'مکانیکال', 'بی‌سیم', 'بی سیم', 'اکسترنال', 'ترابایت', 'گیگابایت',
    'پارس', 'آرین', 'ایران', 'تهران', 'اصفهان', 'شیراز', 'مشهد', 'تبریز',
]


def _edit_distance_at_most_one(a, b):
    if abs(len(a) - len(b)) > 1:
        return False
    if a == b:
        return True
    if len(a) == len(b):
        diff = [i for i in range(len(a)) if a[i] != b[i]]
        return len(diff) == 1
    # اختلاف طول یک نویسه: درج/حذف
    short, long = (a, b) if len(a) < len(b) else (b, a)
    i = j = 0
    skipped = False
    while i < len(short) and j < len(long):
        if short[i] == long[j]:
            i += 1
            j += 1
        elif skipped:
            return False
        else:
            skipped = True
            j += 1
    return True


def _vocab_index():
    index = {}
    for word in VOCAB:
        for variant in {word, word.replace('‌', ' '), word.replace('‌', '')}:
            index[variant] = word
    return index


_INDEX = _vocab_index()


def fix_words(text):
    """اصلاح واژه‌های نزدیک به واژه‌نامه (فقط اختلاف یک نویسه و طول ≥ ۳)."""
    def repl(match):
        word = match.group(0)
        if word in _INDEX:
            return _INDEX[word]
        if len(word) < 3:
            return word
        for candidate, canonical in _INDEX.items():
            if abs(len(candidate) - len(word)) <= 1 and _edit_distance_at_most_one(word, candidate):
                return canonical
        return word

    return re.sub(r'[\u0600-\u06FF\u200c]{3,}', repl, text)


def fix_number_tokens(text):
    """اعداد را با جداکننده هزارگان یکدست می‌کند (۰ تا ۹ فارسی)."""
    def repl(match):
        raw = match.group(0)
        digits = re.sub(r'\D', '', raw)
        if len(digits) < 4 or len(digits) > 15:
            return raw
        grouped = f'{int(digits):,}'.replace(',', '٬')
        return grouped.translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))
    return re.sub(r'[۰-۹0-9][۰-۹0-9٬,.\s]{2,}[۰-۹0-9]', repl, text)


def postprocess_line(line, fix_vocab=True, fix_numbers=False, force_visual=None):
    line = normalize(line)
    if force_visual is None:
        force_visual = has_arabic(line)
    if force_visual or looks_reversed(line):
        line = visual_to_logical(line)
    line = normalize(line)
    if fix_vocab:
        line = fix_words(line)
    if fix_numbers:
        line = fix_number_tokens(line)
    return line
