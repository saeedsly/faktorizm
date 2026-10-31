# -*- coding: utf-8 -*-
"""
واژه‌نامهٔ فارسی OCR — حروف، ارقام و واژه‌ها.

چرا واژه‌نامه؟ موتور OCR برای هر نویسه تصمیم مستقل می‌گیرد و در فونت‌های
فاکتوری، حروفی که فقط در نقطه با هم فرق دارند را جابه‌جا می‌خواند:
«ب/پ/ت/ث/ن/ی»، «ج/چ/ح/خ»، «د/ذ»، «ر/ز/ژ»، «س/ش»، «ص/ض»، «ط/ظ»، «ع/غ»،
«ف/ق»، «ک/گ». واژه‌نامه اجازه می‌دهد این جابه‌جایی‌ها با هزینهٔ کم پذیرفته و
اصلاح شوند، ولی جابه‌جایی‌های بی‌ربط رد شوند؛ در نتیجه واژه‌های درست دست‌نخورده
می‌مانند.

سه بخش دارد:

۱) `LETTER_SETS` — دسته‌های حروف هم‌شکل (فقط تفاوت نقطه یا شکل).
۲) `DIGITS*` و `NUMBER_LOOKALIKE` — ارقام فارسی/عربی/لاتین و حرف‌هایی که در
   فونت چاپی به‌جای رقم خوانده می‌شوند (O→۰، l→۱، S→۵، B→۸…). این اصلاح فقط
   داخل توکنی انجام می‌شود که دست‌کم یک رقم واقعی دارد؛ وگرنه «SO» به «۵۰»
   تبدیل می‌شد.
۳) `WORDS` و `PHRASES` — واژه‌های پرتکرار فاکتور، اداری، کالا، شهرها و
   ماه‌های شمسی.

همه‌چیز محلی و بدون وابستگی بیرونی است.
"""
import re

# ------------------------------------------------------------------ ارقام
FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
LATIN_DIGITS = '0123456789'
FA_TO_LATIN = str.maketrans(FA_DIGITS + AR_DIGITS, LATIN_DIGITS + LATIN_DIGITS)
LATIN_TO_FA = str.maketrans(LATIN_DIGITS, FA_DIGITS)

# حرف‌هایی که در فونت چاپی ممکن است به‌جای رقم خوانده شوند
NUMBER_LOOKALIKE = {
    'O': '۰', 'o': '۰', 'D': '۰', 'Q': '۰', 'ө': '۰',
    'I': '۱', 'l': '۱', '|': '۱', '!': '۱', 'i': '۱', '١': '۱',
    'Z': '۲', 'z': '۲',
    'S': '۵', 's': '۵', '$': '۵',
    'G': '۶', 'b': '۶',
    'B': '۸',
    'g': '۹', 'q': '۹',
    'T': '۷',
}

# ------------------------------------------------------------------ حروف
# هر مجموعه: حروفی که شکل پایهٔ یکسانی دارند و فقط در نقطه فرق می‌کنند
LETTER_SETS = [
    frozenset('بپتثنی'),      # یک شکل، نقطه‌های مختلف
    frozenset('جچحخ'),
    frozenset('دذ'),
    frozenset('رزژ'),
    frozenset('سش'),
    frozenset('صض'),
    frozenset('طظ'),
    frozenset('عغ'),
    frozenset('فق'),
    frozenset('غق'),
    frozenset('ثسش'),
    frozenset('کگ'),
    frozenset('هةۀ'),
    frozenset('یيىئ'),
    frozenset('وؤ'),
    frozenset('ا آ أ إ'),     # همه به «ا» یکسان‌سازی می‌شوند
    frozenset('م'),
    frozenset('ل'),
    frozenset('ن'),
]

# هزینهٔ جانشینی یک حرف با حرفی از همین دسته (در برابر ۱ برای جانشینی معمولی)
CONFUSION_COST = 0.34
MAX_COST_CONFUSION_ONLY = 0.5      # فقط یک جابه‌جایی هم‌شکل: قبول
MAX_COST_LONG_WORD = 1.0           # یک ویرایش معمولی، فقط برای واژه‌های ۵ نویسه و بیشتر

MIN_WORD_LEN = 3                    # واژه‌های کوتاه دست نمی‌خورند
MAX_SPLIT_PART = 12                 # بیشترین طول دو نیمهٔ واژهٔ چسبیده

# نویسه‌هایی که در فارسی/عربی یکسان‌سازی می‌شوند
CHAR_MAP = str.maketrans({
    'ي': 'ی', 'ى': 'ی', 'ئ': 'ی', 'ك': 'ک',
    'ة': 'ه', 'ۀ': 'ه', 'ؤ': 'و',
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا',
    '\u0640': '',       # کشیده (ـــ)
    '\u200e': '', '\u200f': '', '\u202a': '', '\u202b': '',
    '\u202c': '', '\u202d': '', '\u202e': '', '\u00a0': ' ',
})

# ------------------------------------------------------------------ واژه‌ها
# واژه‌های اداری و فاکتوری
INVOICE_WORDS = """
فاکتور صورتحساب پیش‌فاکتور پیش فاکتور رسید قبض بارنامه حواله
فروش خرید خریدار فروشنده عرضه‌کننده صادرکننده مشتری طرف‌حساب
شرح کالا خدمات تعداد مقدار واحد مبلغ قیمت نرخ فی تخفیف عوارض
مالیات ارزش افزوده مالیات‌بر‌ارزش‌افزوده جمع کل جمع‌کل
قابل‌پرداخت قابل پرداخت پرداخت نقدی نسیه مانده بدهکار بستانکار
دریافت تسویه واریز چک کارت‌خوان کارتخوان تراکنش مرجع پیگیری
شماره تاریخ سریال مرجع سفارش شناسه کد اقتصادی
اقتصادی مالی صنف صنفی شرکت بازرگانی تجارت تجاری تولید صنعتی
گسترش پخش توزیع واردات صادرات نمایندگی فروشگاه سوپرمارکت هایپر
انبار شعبه دفتر کارگاه کارخانه موسسه مؤسسه تعاونی
انبارگردان قبض‌انبار حواله‌انبار انتقال مرجوعی برگشتی امانی
پیش‌پرداخت علی‌الحساب مانده‌حساب صورت‌حساب
""".split()

# واژه‌های بانکی و ارتباطی
CONTACT_WORDS = """
تلفن همراه فکس نمابر آدرس نشانی پستی کدپستی کد‌پستی ایمیل وبسایت سایت
شبا حساب جاری بانک شعبه کد‌اقتصادی شناسه‌ملی ملی ثبت شماره‌ثبت صندوق
پیام‌گیر پست الکترونیک دورنگار
""".split()

# تاریخ و زمان
DATE_WORDS = """
فروردین اردیبهشت خرداد تیر مرداد شهریور مهر آبان آذر دی بهمن اسفند
شنبه یک‌شنبه یکشنبه دوشنبه سه‌شنبه سهشنبه چهارشنبه پنج‌شنبه پنجشنبه جمعه
امروز دیروز فردا تاریخ انقضا سررسید مهلت نوبت ساعت دقیقه ثانیه
""".split()

# اعداد نوشتاری
NUMBER_WORDS = """
یک دو سه چهار پنج شش هفت هشت نه ده یازده دوازده سیزده چهارده پانزده
شانزده هفده هجده نوزده بیست سی چهل پنجاه شصت هفتاد هشتاد نود صد
دویست سیصد چهارصد پانصد ششصد هفتصد هشتصد نهصد هزار میلیون میلیارد
دهم صدم اول دوم سوم چهارم پنجم ششم هفتم هشتم نهم دهمین
""".split()

# کالاهای رایج در فاکتور (الکترونیک، اداری، مصرفی، ساختمانی)
PRODUCT_WORDS = """
لپ‌تاپ لپ تاپ ماوس موس کیبورد مانیتور نمایشگر هارد حافظه حافظه‌خارجی
کابل شارژر آداپتور کیس پرینتر چاپگر اسکنر مودم روتر سوییچ هدفون هدست
اسپیکر بلندگو فلش پاوربانک تبلت گوشی دوربین باتری لامپ فیلتر کارتریج
تونر روبان دیسک دی‌وی‌دی مینی‌کیس رم پردازنده مادربورد فن خنک‌کن
کاغذ دفتر خودکار مداد پاک‌کن خط‌کش ماژیک هایلایت پوشه زونکن پاکت
منگنه استاپلر سوزن چسب نوار‌چسب گیره کاغذ‌خردکن تخته‌وایت‌برد وایت‌برد
روغن برنج شکر آرد چای قهوه شیر پنیر کره ماست دوغ خامه کشک نمک رب سس
سرکه ادویه زعفران بیسکویت ویفر شکلات آدامس نوشابه شربت کمپوت آبمیوه
دستکش پیچ مهره ورق لوله رنگ ابزار جعبه نخ سیم میلگرد پروفیل بتن سیمان
گچ آجر کاشی سرامیک شیرآلات لوله‌کشی عایق رنگ‌آمیزی سمباده چکش آچار
پیچ‌گوشتی دریل فرز سنگ جوش الکترود ماسک عینک کلاه لباس‌کار
ماسک بهداشتی دستمال صابون شامپو پودر مایع شوینده سفیدکننده
پوشک ژل کرم لوسیون اسپری مسواک خمیردندان
""".split()

# واژه‌های ساختاری و پرکاربرد فارسی (برای اطمینان از سالم ماندن متن)
COMMON_WORDS = """
این آن این‌که اینکه از به با بر برای در را که و یا هم نیز تا بی
هست است بود شد شود شود می‌شود می‌شود نمی‌شود کرده کرده‌شده شده
دارد دارند داشت داشتند دارد ندارد شامل شرح عنوان نوع مدل طرح
کالای کالاها خدمات موارد ردیف ردیف‌ها شماره‌ها اقلام قلم
اصلی فرعی جدید قدیم ویژه رایگان نقدی اعتباری روزانه ماهانه سالانه
قبلی بعدی فوق زیر بالا پایین راست چپ داخلی خارجی
نهایی نهابی مقداری جمعاً خالص ناخالص بدون با‌تخفیف معاف مشمول
مجتمع صنعتی تولیدی بازرگانی خدماتی فنی مهندسی پخش توزیع
پارس آرین ایران تهران اصفهان شیراز مشهد تبریز کرج قم اهواز رشت یزد
کرمان قزوین ساری گرگان بابل رفسنجان خمینی‌شهر نجف‌آباد
""".split()

# واژه‌های صنعتی/برندی که در فاکتورهای واقعی زیاد دیده می‌شوند
BRAND_WORDS = """
لنوو ایسوس ایسر دل اچ‌پی اپل سامسونگ ال‌جی شیائومی سونی کانن اپسون
وسترن سیگیت لاجیتک مایکروسافت اینتل ای‌ام‌دی کینگستون سندیسک
مکانیکال بی‌سیم باسیم اکسترنال اینترنال ترابایت گیگابایت مگابایت
اینچ متری کیلویی بسته‌ای کارتنی
""".split()

WORDS = sorted({
    word for group in (
        INVOICE_WORDS, CONTACT_WORDS, DATE_WORDS, NUMBER_WORDS,
        PRODUCT_WORDS, COMMON_WORDS, BRAND_WORDS,
    )
    for word in group
})

# عبارت‌های چندواژه‌ای: نویسه‌های جداافتاده به هم می‌چسبند
PHRASES = [
    'کد اقتصادی', 'شناسه ملی', 'ارزش افزوده', 'مالیات بر ارزش افزوده',
    'قابل پرداخت', 'جمع کل', 'قیمت واحد', 'مبلغ کل', 'شرح کالا',
    'شماره فاکتور', 'تاریخ فاکتور', 'پیش فاکتور',
    'کارت به کارت', 'حساب جاری', 'شماره شبا', 'کد پستی',
    'مهر و امضا', 'مهر و امضای فروشنده', 'این فاکتور',
]

# خطاهای پرتکرار رکونایزر در عبارت‌های ثابت فاکتور (چپ ← راست: غلط، درست).
# واژهٔ غلط ممکن است خودش واژهٔ معتبر فارسی باشد («ورم») و واژه‌نامه دستش
# به آن نرسد؛ برای همین فقط در بافت همین عبارت‌ها اصلاح می‌شود.
PHRASE_REPAIRS = [
    ('مالیات بر وزم', 'مالیات بر ارزش'),
    ('مالیات بر ازش', 'مالیات بر ارزش'),
    ('مالیات بر ارزس', 'مالیات بر ارزش'),
    ('لوازم خانکی', 'لوازم خانگی'),
    ('صورتحساب فروش کالا وخدهات', 'صورتحساب فروش کالا و خدمات'),
    ('صورتحساب فروش کالا وخدات', 'صورتحساب فروش کالا و خدمات'),
    ('فروش کالا وخدهات', 'فروش کالا و خدمات'),
    ('مبلغ قایل پرداخت', 'مبلغ قابل پرداخت'),
    ('مبلغ نهابی', 'مبلغ نهایی'),
]


# ------------------------------------------------------------------ ایندکس
def normalize_chars(text):
    """یکسان‌سازی نویسه‌های عربی/فارسی و حذف نویسه‌های کنترلی."""
    return text.translate(CHAR_MAP)


def _variants(word):
    """شکل‌های نوشتاری یک واژه: با نیم‌فاصله، با فاصله، و چسبیده."""
    out = {word}
    if '\u200c' in word:
        out.add(word.replace('\u200c', ' '))
        out.add(word.replace('\u200c', ''))
    if ' ' in word:
        out.add(word.replace(' ', '\u200c'))
        out.add(word.replace(' ', ''))
    return out


def build_index(words):
    index = {}
    for word in words:
        canon = normalize_chars(word)
        for variant in _variants(canon):
            index.setdefault(variant, word)
    return index


INDEX = build_index(WORDS)
_BY_FIRST = {}
for _variant, _canon in INDEX.items():
    _BY_FIRST.setdefault(_variant[:1], []).append((_variant, _canon))
for _key in _BY_FIRST:
    _BY_FIRST[_key].sort(key=len)


def is_known(word):
    return normalize_chars(word) in INDEX


def canon_of(word):
    return INDEX.get(normalize_chars(word))


# ------------------------------------------------------------------ فاصله
def _confusion_cost(a, b):
    if a == b:
        return 0.0
    for group in LETTER_SETS:
        if a in group and b in group:
            return CONFUSION_COST
    return 1.0


def weighted_distance(a, b, limit=2.0):
    """
    فاصلهٔ ویرایشی وزن‌دار (Damerau) با هزینهٔ کم برای حروف هم‌شکل.

    a و b از قبل یکسان‌سازی شده‌اند. اگر فاصله از limit بیشتر شد، همان limit
    برگردانده می‌شود تا محاسبه زودتر تمام شود.
    """
    if a == b:
        return 0.0
    la, lb = len(a), len(b)
    if abs(la - lb) > 2:
        return limit + 1
    prev2 = None
    prev = [j * 1.0 for j in range(lb + 1)]
    for i in range(1, la + 1):
        cur = [i * 1.0] + [0.0] * lb
        for j in range(1, lb + 1):
            sub = prev[j - 1] + _confusion_cost(a[i - 1], b[j - 1])
            cur[j] = min(sub, prev[j] + 1.0, cur[j - 1] + 1.0)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                swap = prev2[j - 2] + 0.5
                if swap < cur[j]:
                    cur[j] = swap
        prev2, prev = prev, cur
    return min(prev[lb], limit + 1)


def _best_candidate(token):
    token = normalize_chars(token)
    best = (None, 99.0)
    for length in range(len(token) - 1, len(token) + 2):
        if length < 1:
            continue
        for variant, canon in _BY_FIRST.get(token[:1], []):
            if len(variant) != length:
                continue
            cost = weighted_distance(token, variant)
            if cost < best[1]:
                best = (canon, cost)
    return best


def split_merged(token):
    """
    واژهٔ چسبیده را به دو واژهٔ شناخته‌شده می‌شکند: «کابلیک» → «کابل یک».

    این حالت وقتی پیش می‌آید که موتور، فاصلهٔ بین دو واژه را نمی‌بیند؛ در
    فاکتور زیاد رخ می‌دهد («هارد۵۰۰» یا «کابلیک متری»).
    """
    token = normalize_chars(token)
    n = len(token)
    if n < 5:
        return None
    for cut in range(3, min(n - 2, MAX_SPLIT_PART) + 1):
        left, right = token[:cut], token[cut:]
        if len(right) > MAX_SPLIT_PART:
            continue
        left_canon = INDEX.get(left)
        right_canon = INDEX.get(right)
        if left_canon and right_canon:
            return f'{left_canon} {right_canon}'
    return None


def correct_token(token, allow_split=True):
    """یک واژه را با واژه‌نامه مقایسه و در صورت اطمینان اصلاح می‌کند."""
    if not token:
        return token
    # رقم‌دارها واژه نیستند (مثل «E14» یا «۲۵۶گیگ»)
    if any(ch.isdigit() or ch in FA_DIGITS or ch in AR_DIGITS for ch in token):
        return token
    plain = normalize_chars(token)
    if plain in INDEX:
        return INDEX[plain]
    if len(plain) < MIN_WORD_LEN:
        return token

    canon, cost = _best_candidate(plain)
    if canon is not None:
        if cost <= MAX_COST_CONFUSION_ONLY:
            return canon
        # یک ویرایش معمولی فقط برای واژه‌های ۴ نویسه و بیشتر («تعدا» → «تعداد»)
        if cost <= MAX_COST_LONG_WORD and len(plain) >= 4:
            return canon

    if allow_split:
        split = split_merged(plain)
        if split:
            return split
    return token


# ------------------------------------------------------------------ ارقام
_NUMERIC_TOKEN = re.compile(r'[0-9۰-۹٠-٩][0-9۰-۹٠-٩٬،,.٫/\-]*')


def has_digit(text):
    return bool(re.search(r'[0-9۰-۹٠-٩]', text))


def repair_number_token(token):
    """
    توکنی که باید عدد باشد را اصلاح می‌کند.

    فقط وقتی دست می‌زند که دست‌کم یک رقم واقعی در توکن باشد و همهٔ نویسه‌های
    دیگرش «شبیه رقم» باشند؛ در نتیجه «SO» یا «B» به عدد تبدیل نمی‌شوند.
    خط ارقام یکدست می‌شود: توکنی که رقم لاتین دارد لاتین می‌ماند و توکن
    فارسی/عربی به فارسی تبدیل می‌شود، تا «1O5» به «1۰5» تبدیل نشود.
    """
    if not token or not has_digit(token):
        return token

    has_latin = any(ch in LATIN_DIGITS for ch in token)
    has_persian = any(ch in FA_DIGITS or ch in AR_DIGITS for ch in token)
    target_latin = has_latin or not has_persian

    out = []
    changed = False
    for ch in token:
        if ch in LATIN_DIGITS:
            out.append(ch)
        elif ch in FA_DIGITS or ch in AR_DIGITS:
            digit = ch.translate(FA_TO_LATIN)
            converted = digit if target_latin else digit.translate(LATIN_TO_FA)
            out.append(converted)
            changed = changed or converted != ch
        elif ch in NUMBER_LOOKALIKE:
            digit = NUMBER_LOOKALIKE[ch].translate(FA_TO_LATIN)
            out.append(digit if target_latin else digit.translate(LATIN_TO_FA))
            changed = True
        elif ch in '٬،,.٫/-':
            out.append(ch)
        else:
            return token  # نویسهٔ غیرعددی واقعی: دست نمی‌زنیم
    return ''.join(out) if changed else token


def repair_numbers(text):
    """اصلاح شماره‌های مخدوش در یک خط متن («1O5» → «۱۰۵»)."""
    def repl(match):
        return repair_number_token(match.group(0))
    # فقط توکن‌های چسبیده بررسی می‌شوند؛ فاصله‌ها دست‌نخورده می‌مانند
    return re.sub(r'[0-9۰-۹٠-٩OoDQIl|iZzSsGbgqTB$!.,٬،/]+', repl, text)


def to_latin_number(text):
    """عدد فارسی/عربی → عدد لاتین (برای محاسبه)."""
    return text.translate(FA_TO_LATIN)


def parse_amount(text):
    """
    مبلغ → عدد صحیح یا None. جداکننده‌های هزارگان برداشته می‌شوند.

    «۱۴۵٬۶۷۹» → 145679 ؛ «1O5,000» → 105000 ؛ «نامشخص» → None
    """
    if text is None:
        return None
    token = repair_number_token(str(text).strip())
    if not token or not has_digit(token):
        return None
    cleaned = to_latin_number(token)
    cleaned = re.sub(r'[\s٬،,]', '', cleaned)
    if cleaned.count('.') > 1:
        cleaned = cleaned.replace('.', '')
    elif '.' in cleaned and len(cleaned.split('.')[-1]) == 3:
        cleaned = cleaned.replace('.', '')
    cleaned = cleaned.replace('/', '')
    try:
        value = float(cleaned)
    except ValueError:
        return None
    return int(round(value))


# ------------------------------------------------------------------ متن
_TOKEN_RE = re.compile(r'[\u0600-\u06FF\u200c]+')


def correct_text(text):
    """اصلاح واژه‌به‌واژهٔ یک خط متن فارسی."""
    def repl(match):
        return correct_token(match.group(0))
    return _TOKEN_RE.sub(repl, text)


def fix_phrases(text):
    """فاصله‌های جاافتاده و خطاهای ثابت عبارت‌های فاکتور را برمی‌گرداند."""
    out = text
    for wrong, right in PHRASE_REPAIRS:
        if wrong in out:
            out = out.replace(wrong, right)
    for phrase in PHRASES:
        compact = phrase.replace(' ', '')
        if compact != phrase and compact in out and phrase not in out:
            out = out.replace(compact, phrase)
    return out


def clean(text, words=True, numbers=True, phrases=True):
    """مسیر کامل: یکسان‌سازی، اصلاح عبارت، اصلاح واژه و اصلاح ارقام."""
    if not text:
        return text
    out = normalize_chars(text)
    if phrases:
        out = fix_phrases(out)
    if words:
        out = correct_text(out)
    if numbers:
        out = repair_numbers(out)
    return out
