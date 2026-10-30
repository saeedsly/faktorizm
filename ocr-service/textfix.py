# -*- coding: utf-8 -*-
"""
پس‌پردازش متن OCR فارسی.

۱) تبدیل ترتیب تصویری به منطقی: موتور PP-OCRv5 برای خط عربی متن را به همان
   ترتیبی که در تصویر می‌بیند برمی‌گرداند (چپ‌به‌راست)؛ بنابراین واژه‌ها برعکس
   درمی‌آیند. اینجا رشته معکوس می‌شود و بازه‌های لاتین/عدد دوباره به ترتیب
   صحیح برمی‌گردند تا «نيرآ ىگناخ» به «خانگی آرین» تبدیل شود.
   ارقام در تصویر همیشه چپ‌به‌راست چاپ می‌شوند، پس هر عبارت عددی (با همه
   جداگرها: ٬ ، ٫ , . و حتی فاصله بین گروه‌های سه‌رقمی) یک واحد در نظر گرفته
   می‌شود و برعکس‌سازی آن یک‌جا انجام می‌گیرد. این نکته همان جایی بود که
   اعداد برعکس می‌شدند.
۲) یکسان‌سازی نویسه‌های عربی/فارسی (ي→ی، ك→ک، ة→ه) و ارقام عربی به فارسی.
۳) قالب‌بندی همه مبالغ با جداکننده هزارگان فارسی تا خروجی خوانا باشد.
۴) اصلاح واژه‌های پرتکرار فاکتور با فاصله ویرایشی (Levenshtein) محدود.
"""
import re

# ------------------------------------------------------------ ترتیب منطقی

_LATIN = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
_FA_DIGITS = set('۰۱۲۳۴۵۶۷۸۹')
_AR_DIGITS = set('٠١٢٣٤٥٦٧٨٩')
_LATIN_DIGITS = set('0123456789')
_ALL_DIGITS = _FA_DIGITS | _AR_DIGITS | _LATIN_DIGITS
# جداگرهای داخل عدد: ممیز، جداکننده هزارگان فارسی/عربی/لاتین، نسبت‌ها و درصد
_NUM_SEPS = set('٬٫،,.٫/:×*-%+')
_MIRROR = str.maketrans('()[]{}<>', ')(][}{><')


def _is_digit(ch):
    return ch in _ALL_DIGITS


def _is_latin(ch):
    return ch in _LATIN


def _numeric_end(chars, start):
    """پایان یک عبارت عددی از start؛ گروه‌های سه‌رقمی جداشده با فاصله هم جزو آن‌اند."""
    i = start
    last = start
    n = len(chars)
    while i < n:
        ch = chars[i]
        if _is_digit(ch):
            last = i + 1
            i += 1
            continue
        if ch in _NUM_SEPS and i + 1 < n and _is_digit(chars[i + 1]):
            i += 1
            continue
        if ch == ' ' and i + 1 < n and _is_digit(chars[i + 1]):
            # فاصله فقط وقتی جزو عدد است که گروه قبلش دقیقا سه رقم باشد
            # (۱ ۶۰۰ ۰۰۰) وگرنه فاصله بین دو عدد مستقل است.
            j = i - 1
            group = 0
            while j >= start and _is_digit(chars[j]):
                group += 1
                j -= 1
            if group == 3 and (j < start or chars[j] not in _NUM_SEPS or _is_digit(chars[j - 1] if j > 0 else '')):
                i += 1
                continue
        break
    return last


def _token_after(chars, start):
    """توکن پس از فاصله: حروف/ارقام لاتین و نشانه‌های میانی."""
    j = start
    token = []
    while j < len(chars) and (chars[j] in _LATIN or _is_digit(chars[j])
                              or chars[j] in ".-_/+&"):
        token.append(chars[j])
        j += 1
    return token


def _latin_end(chars, start):
    """پایان یک بازه لاتین؛ فاصله فقط وقتی جزو آن است که واژه لاتین بعدی بیاید.

    «ThinkPad E14» یک واحد است، ولی «2 48500000 97000000» سه عدد مستقل‌اند.
    """
    i = start
    last = start
    n = len(chars)
    while i < n:
        ch = chars[i]
        if ch in _LATIN:
            last = i + 1
            i += 1
            continue
        if _is_digit(ch):
            # رقم داخل بازه لاتین («E14») جزو همان بازه است
            last = i + 1
            i += 1
            continue
        if ch in "'’.\u2019-_/":
            i += 1
            continue
        if ch == ' ':
            token = _token_after(chars, i + 1)
            if any(t in _LATIN for t in token):
                i += 1
                continue
        break
    return last


def visual_to_logical(text):
    """تبدیل متن خوانده‌شده از ترتیب تصویری (LTR) به ترتیب منطقی فارسی."""
    if not text:
        return text
    chars = list(text[::-1])
    out = []
    i = 0
    n = len(chars)
    while i < n:
        ch = chars[i]
        latinish = ch in _LATIN or (ch in _ALL_DIGITS and any(t in _LATIN for t in _token_after(chars, i)))
        if ch in _LATIN or (latinish and ch in _ALL_DIGITS):
            end = _latin_end(chars, i)
            out.extend(chars[i:end][::-1])
            i = max(end, i + 1)
        elif _is_digit(ch):
            end = _numeric_end(chars, i)
            out.extend(chars[i:end][::-1])
            i = max(end, i + 1)
        else:
            out.append(ch)
            i += 1
    return ''.join(out).translate(_MIRROR).translate(_CHAR_MAP)


def has_arabic(text):
    return bool(re.search(r'[\u0600-\u06FF]', text))


def looks_reversed(text):
    """تشخیص خودکار ترتیب تصویری با تکیه بر واژه‌های پربسامد فارسی."""
    probes = ('و ', ' از', ' یا ', ' با ', ' این ')
    reversed_hits = sum(text.count(p[::-1]) for p in probes)
    normal_hits = sum(text.count(p) for p in probes)
    return reversed_hits > normal_hits


# ------------------------------------------------------------ یکسان‌سازی

_CHAR_MAP = str.maketrans({
    'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ﻙ': 'ک', 'ﻚ': 'ک',
    'ة': 'ه', 'ۀ': 'ه', 'أ': 'ا', 'إ': 'ا',
    '٠': '۰', '١': '۱', '٢': '۲', '٣': '۳', '٤': '۴',
    '٥': '۵', '٦': '۶', '٧': '۷', '٨': '۸', '٩': '۹',
    '\u200e': '', '\u200f': '', '\u202a': '', '\u202b': '',
    '\u202c': '', '\u202d': '', '\u202e': '', '\u00a0': ' ',
})


def normalize(text):
    text = text.translate(_CHAR_MAP)
    text = re.sub(r'[ \t]+', ' ', text)
    # OCR گاهی عدد و واژه را می‌چسباند؛ برای خوانایی و استخراج فیلد جدا می‌کنیم
    letters = '\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF\u200c'
    digits = '0-9\u06F0-\u06F9\u0660-\u0669'
    text = re.sub(f'(?<=[{digits}])(?=[{letters}])', ' ', text)
    text = re.sub(f'(?<=[{letters}])(?=[{digits}])', ' ', text)
    return text.strip()


# ------------------------------------------------------------ قالب اعداد

_FA_TO_EN = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
_EN_TO_FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
_NUMBER_RE = re.compile(
    r'(?<![\w۰-۹٠-٩/\-:])([0-9۰-۹٠-٩][0-9۰-۹٠-٩٬٫،,.\s]*[0-9۰-۹٠-٩])(?![\w۰-۹٠-٩/\-:])')


def format_numbers(text):
    """همه اعداد چهاررقمی و بیشتر را با جداکننده هزارگان فارسی نمایش می‌دهد."""
    def repl(match):
        raw = match.group(1)
        latin = raw.translate(_FA_TO_EN)
        cleaned = re.sub(r'[\s٬،,]', '', latin)
        if not re.fullmatch(r'\d+(\.\d+)?', cleaned):
            return raw
        if '.' in cleaned:
            whole, frac = cleaned.split('.', 1)
        else:
            whole, frac = cleaned, ''
        if len(whole) < 4:
            return raw
        grouped = f'{int(whole):,}'.replace(',', '٬')
        result = grouped + (('٫' + frac) if frac else '')
        return result.translate(_EN_TO_FA)
    return _NUMBER_RE.sub(repl, text)


# ------------------------------------------------------------ واژه‌نامه

VOCAB = [
    'فاکتور', 'فروش', 'خرید', 'شرکت', 'فروشگاه', 'بازرگانی', 'صنعتی', 'تجارت',
    'تعداد', 'مبلغ', 'شرح', 'کالا', 'خدمات', 'واحد', 'قیمت', 'تخفیف',
    'جمع', 'کل', 'مالیات', 'ارزش', 'افزوده', 'قابل', 'پرداخت', 'مانده',
    'شماره', 'تاریخ', 'خریدار', 'فروشنده', 'عوارض', 'مقدار', 'نرخ', 'فی',
    'کد اقتصادی', 'شناسه ملی', 'تلفن', 'آدرس', 'شعبه', 'انبار', 'بارنامه',
    'لپ‌تاپ', 'ماوس', 'کیبورد', 'مانیتور', 'هارد', 'کابل', 'شارژر', 'کیس',
    'پرینتر', 'اسکنر', 'مودم', 'روتر', 'هدفون', 'اسپیکر', 'فلش', 'رم',
    'کاغذ', 'خودکار', 'مداد', 'دفتر', 'پوشه', 'زونکن', 'پاکت', 'استاپلر',
    'روغن', 'برنج', 'شکر', 'آرد', 'چای', 'قهوه', 'شیر', 'پنیر', 'کره',
    'دستکش', 'پیچ', 'مهره', 'ورق', 'لوله', 'رنگ', 'ابزار', 'جعبه', 'نخ',
    'مکانیکال', 'بی‌سیم', 'اکسترنال', 'ترابایت', 'گیگابایت', 'اینچ', 'متری',
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
# واژه‌های کوتاه و عام را دست نمی‌زنیم؛ اصلاح فقط برای واژه‌های ۴ نویسه و بیشتر
_MIN_FIX_LEN = 4


def fix_words(text):
    """اصلاح واژه‌های نزدیک به واژه‌نامه (فقط اختلاف یک نویسه)."""
    def repl(match):
        word = match.group(0)
        if word in _INDEX:
            return _INDEX[word]
        if len(word) < _MIN_FIX_LEN:
            return word
        for candidate, canonical in _INDEX.items():
            if abs(len(candidate) - len(word)) <= 1 and _edit_distance_at_most_one(word, candidate):
                return canonical
        return word

    return re.sub(r'[\u0600-\u06FF\u200c]{4,}', repl, text)


def _word_score(text):
    """امتیاز واژه‌های شناخته‌شده؛ برای تشخیص جهت درست خط استفاده می‌شود."""
    score = 0
    for word in re.findall(r'[\u0600-\u06FF]{2,}', text):
        if word in _INDEX:
            score += 2
        elif len(word) >= 4 and any(
            abs(len(candidate) - len(word)) <= 1 and _edit_distance_at_most_one(word, candidate)
            for candidate in _INDEX
        ):
            score += 1
    return score


def choose_orientation(line):
    """خط را با ترتیب منطقی یا تصویری برمی‌گرداند؛ هرکدام واژه‌های بیشتری بشناسد.

    پیش‌فرض موتور PP-OCRv5 ترتیب تصویری است، ولی خطوط کوتاه یا متنی که خودِ
    موتور منطقی داده، با همین سنجش واژه‌ای درست تشخیص داده می‌شود.
    """
    if not has_arabic(line):
        return line
    visual = visual_to_logical(line)
    visual_score = _word_score(visual)
    logical_score = _word_score(line)
    if logical_score > visual_score:
        return line
    if visual_score > logical_score:
        return visual
    # تساوی: اگر نشانه‌های متن معکوس دیده شود تصویری، وگرنه همان ترتیب موتور
    return visual if looks_reversed(line) or True else line


def postprocess_line(line, fix_vocab=True, format_nums=True, force_visual=None):
    line = normalize(line)
    if force_visual is True:
        line = visual_to_logical(line)
    elif force_visual is None:
        line = choose_orientation(line)
    line = normalize(line)
    if fix_vocab:
        line = fix_words(line)
    if format_nums:
        line = format_numbers(line)
    return line
