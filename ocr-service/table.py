# -*- coding: utf-8 -*-
"""
فهم ساختار جدول فاکتور — مستقل از قالب.

روش: در هر سطر، متن شرح کالا از اعداد جدا می‌شود و سپس «نقش» هر عدد با
اعتبارسنجی ریاضی تعیین می‌شود. یعنی از میان چیدمان‌های ممکن
(تعداد، قیمت واحد، تخفیف، مالیات، مبلغ کل) آن چیدمانی انتخاب می‌شود که
معادله «تعداد × قیمت واحد − تخفیف + مالیات = مبلغ ردیف» را بسازد. این روش
به ستون‌بندی ظاهری فاکتور وابسته نیست: هر شرکتی هر جایی که ستون‌ها را بگذارد،
اعداد درست سر جای خودشان می‌نشینند.

عنوان ستون‌های جدول هم خوانده می‌شود و برای تشخیص شروع جدول و نام‌گذاری
ستون‌های نامشخص به کار می‌رود.
"""
import itertools
import re
from statistics import median

FA_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')

HEADER_RULES = [
    ('discount', ('تخفیف', 'تخف', 'discount', 'تخفیفات', 'کسور')),
    ('tax', ('مالیات', 'ارزش افزوده', 'عوارض', 'vat', 'tax')),
    ('unit_price', ('قیمت واحد', 'مبلغ واحد', 'قیمت هر واحد', 'فی', 'نرخ', 'قیمت',
                    'unit price', 'unit', 'price')),
    ('total', ('مبلغ کل', 'مبلغ نهایی', 'قیمت کل', 'جمع ردیف', 'مبلغ ردیف', 'جمع سطر',
               'مبلغ خالص', 'total', 'amount', 'مبلغ')),
    ('qty', ('تعداد', 'مقدار', 'عدد', 'qty', 'quantity')),
    ('title', ('شرح', 'کالا', 'خدمت', 'نام', 'توضیح', 'عنوان', 'ردیف', 'description', 'item')),
]

SUMMARY_WORDS = ('جمع کل', 'قابل پرداخت', 'مالیات', 'ارزش افزوده', 'تخفیف', 'عوارض',
                 'مانده', 'پیش پرداخت', 'مبلغ نهایی', 'جمع مبلغ', 'total', 'subtotal',
                 'grand total', 'discount', 'vat', 'tax')

FOOTER_WORDS = ('مهر', 'امضا', 'امضای', 'صادر', 'توجه', 'شرایط', 'توضیح', 'آدرس',
                'تلفن', 'وب‌سایت', 'وب سایت', 'بانک', 'شبا', 'شماره حساب', 'تشکر',
                'خریدار گرامی', 'قابل پرداخت', 'جمع', 'مالیات', 'معتبر', 'شناسه')

# الگوهای ممکن نقش اعداد در یک سطر، به ترتیب راست به چپ (چیدمان رایج فاکتور فارسی)
TEMPLATES = [
    ('total',),
    ('unit_price', 'total'),
    ('qty', 'total'),
    ('qty', 'unit_price', 'total'),
    ('unit_price', 'total', 'total'),
    ('qty', 'unit_price', 'discount', 'total'),
    ('qty', 'unit_price', 'tax', 'total'),
    ('qty', 'unit_price', 'discount', 'tax', 'total'),
    ('qty', 'unit_price', 'discount', 'total', 'total'),
]

_GROUPED = re.compile(r'\d{1,3}(?:[ \u2009]\d{3})+')
_MONEY = re.compile(r'[0-9۰-۹٠-٩][0-9۰-۹٠-٩٬٫،,.]*')
# حروف فارسی/عربی بدون ارقام فارسی (ارقام در همان بازه یونیکد هستند)
_LETTERS = re.compile(r'[\u0621-\u064A\u0671-\u06D3\u06FA-\u06FF\u200c]')
_DIGITS_RE = re.compile(r'[0-9۰-۹٠-٩]')


def parse_number(text):
    """نخستین عدد موجود در متن خانه؛ دو عدد جدا را به هم نمی‌چسباند."""
    if text is None:
        return None
    cleaned = str(text).translate(FA_DIGITS).replace('٫', '.')
    grouped = _GROUPED.search(cleaned)
    source = grouped.group(0).replace(' ', '').replace('\u2009', '') if grouped else cleaned
    match = _MONEY.search(source)
    if not match:
        return None
    raw = re.sub(r'[\s٬،,]', '', match.group(0)).strip('.')
    if not raw:
        return None
    try:
        return float(raw) if '.' in raw else int(raw)
    except ValueError:
        return None


def header_field(text):
    low = text.replace('‌', ' ').strip()
    for field, words in HEADER_RULES:
        for word in words:
            if word in low or word in text:
                return field
    return None


def _is_text_cell(item):
    text = item['text']
    letters = len(_LETTERS.findall(text))
    return letters >= 3 and letters > len(_DIGITS_RE.findall(text))


def _center(item):
    return (item['xmin'] + item['xmax']) / 2.0


def group_rows(items, tolerance=0.45):
    ordered = sorted(items, key=lambda i: (i['ymin'], -i['xmin']))
    rows = []
    for it in ordered:
        height = max(it['ymax'] - it['ymin'], 1.0)
        placed = False
        for row in rows:
            overlap = min(it['ymax'], row['ymax']) - max(it['ymin'], row['ymin'])
            if overlap / max(min(height, row['height']), 1.0) > tolerance:
                row['items'].append(it)
                row['ymin'] = min(row['ymin'], it['ymin'])
                row['ymax'] = max(row['ymax'], it['ymax'])
                placed = True
                break
        if not placed:
            rows.append({'ymin': it['ymin'], 'ymax': it['ymax'], 'height': height, 'items': [it]})
    rows.sort(key=lambda r: r['ymin'])
    for index, row in enumerate(rows):
        row['index'] = index
    return rows


def find_header(rows):
    best, best_count = None, 0
    for row in rows:
        fields = {header_field(it['text']) for it in row['items']}
        fields.discard(None)
        if len(fields) > best_count:
            best, best_count = row, len(fields)
    return best if best_count >= 2 else None


def header_sequence(header_row):
    """ترتیب ستون‌های عنوان‌دار از راست به چپ (برای راهنمایی تشخیص نقش)."""
    if header_row is None:
        return []
    cells = sorted(header_row['items'], key=lambda i: -_center(i))
    return [f for f in (header_field(it['text']) for it in cells) if f]


def column_roles(header_row):
    """ستون‌های عنوان‌دار سربرگ، با بازهٔ افقی هر ستون."""
    if header_row is None:
        return []
    cols = []
    for item in header_row['items']:
        field = header_field(item['text'])
        if not field:
            continue
        cols.append({
            'field': field,
            'xmin': item['xmin'],
            'xmax': item['xmax'],
            'cx': _center(item),
            'width': max(item['xmax'] - item['xmin'], 1.0),
        })
    return cols


def roles_by_columns(row, cols):
    """
    نقش هر عدد را از «ستون» آن در جدول می‌گیرد، نه از معادلهٔ ردیف.

    در جدول واقعی جای ستون‌ها ثابت است؛ تکیه بر موقعیت از حدس معادله‌ای دقیق‌تر
    است و جلوی خطای رایج «A4 در شرح کالا به‌عنوان تعداد خوانده شود» را می‌گیرد.
    """
    if not cols:
        return {}
    data = {}
    for item in sorted(row['items'], key=lambda i: -_center(i)):
        value = parse_number(item['text'])
        if value is None:
            continue
        cx = _center(item)
        best = min(cols, key=lambda c: abs(c['cx'] - cx))
        # فاصلهٔ بیش از دو برابر عرض ستون یعنی عدد به هیچ ستونی تعلق ندارد
        if abs(best['cx'] - cx) > best['width'] * 2:
            continue
        if best['field'] == 'title':
            continue
        data.setdefault(best['field'], value)
    return data


def _row_numbers(row):
    """اعداد سطر به ترتیب راست به چپ، همراه با خانه مربوطه."""
    out = []
    for item in sorted(row['items'], key=lambda i: -_center(i)):
        value = parse_number(item['text'])
        if value is not None:
            out.append((item, value))
    return out


def _row_text(row):
    """متن شرح کالا: خانه‌های متنی؛ اگر نبود، بلندترین خانه بدون عدد بزرگ."""
    cells = [i for i in row['items'] if _is_text_cell(i)]
    if cells:
        return ' '.join(i['text'] for i in sorted(cells, key=lambda i: -i['xmin']))
    return ''


def _score_assignment(values, roles):
    """امتیاز یک چیدمان: معادله مالی ردیف چقدر می‌خواند؟"""
    data = dict(zip(roles, values))
    qty = data.get('qty', 1) or 1
    unit = data.get('unit_price', 0) or 0
    discount = data.get('discount', 0) or 0
    tax = data.get('tax', 0) or 0
    total = data.get('total', 0) or 0

    if 'unit_price' not in roles and qty > 0:
        unit = total / qty if 'total' in roles else 0
    if unit <= 0 or total <= 0:
        return -1.0
    # قیمت واحدی که هزار برابر کوچک‌تر از مبلغ ردیف است، در واقع تعداد است
    if unit * 1000 < total:
        return -1.0
    if qty <= 0 or qty > 100000:
        return -1.0
    if discount > unit * qty * 2:
        return -1.0

    net = qty * unit - discount
    expected_no_tax = net
    expected_rate = net * (1 + tax / 100.0) if 0 < tax <= 100 else None
    expected_amount = net + tax if tax > 100 else None

    best = None
    for expected in (expected_no_tax, expected_rate, expected_amount):
        if expected is None or expected <= 0:
            continue
        diff = abs(expected - total) / max(total, 1)
        score = 1.0 - min(diff, 1.0)
        if best is None or score > best:
            best = score
    if best is None:
        return -1.0
    # در فاکتور واقعی، تعداد عدد کوچک صحیح است؛ چیدمان‌های غیرواقعی جریمه می‌شوند
    if data.get('qty') is not None and (float(qty) != int(qty) or qty > 10000):
        best -= 0.25
    if data.get('discount') and data['discount'] == total:
        best -= 0.2
    return best


def assign_roles(values, hint=None):
    """نقش هر عدد را از میان چیدمان‌های ممکن انتخاب می‌کند.

    hint: ترتیب ستون‌های عنوان‌دار همان سند؛ در تساوی، چیدمان هم‌خوان با آن
    ترجیح داده می‌شود.
    """
    if not values:
        return {}
    best_roles, best_score = None, -1.0
    for roles in TEMPLATES:
        if len(roles) != len(values):
            continue
        score = _score_assignment(values, roles)
        if hint:
            hint_order = [h for h in hint if h in ('qty', 'unit_price', 'discount', 'tax', 'total')]
            overlap = sum(1 for a, b in zip(roles, hint_order) if a == b)
            score += overlap * 0.02
        if score > best_score:
            best_roles, best_score = roles, score
    if best_roles is None:
        # طول فهرست با هیچ الگویی نمی‌خواند (خانه‌های چسبیده): تخمین محافظه‌کارانه
        total = max(values)
        rest = list(values)
        rest.remove(total)
        data = {'total': total}
        small = [v for v in rest if 0 < v < 1000 and float(v).is_integer()]
        if small:
            data['qty'] = small[0]
            rest.remove(small[0])
        if rest:
            data['unit_price'] = max(rest)
            rest.remove(max(rest))
        if len(rest) >= 2:
            data['discount'] = rest[-1] if rest[-1] < data['unit_price'] else 0
        return data
    data = dict(zip(best_roles, values))
    # ستون تکراری «total» در برخی الگوها: اولی مبلغ واحد است
    if best_roles.count('total') == 2:
        data['unit_price'] = values[best_roles.index('total')]
        data['total'] = values[len(values) - 1 - best_roles[::-1].index('total')]
    return data


def _clean_title(text):
    text = re.sub(r'\s+', ' ', text).strip(' -|:.')
    text = re.sub(r'^[\d۰-۹]{1,3}[\s.\-)]*', '', text)
    text = re.sub(r'[\s|]+[\d۰-۹]{1,3}$', '', text)
    return text.strip(' -|:.')


def extract_items(items):
    """اقلام ساخت‌یافته جدول + مبالغ جمع‌بندی."""
    rows = group_rows(items)
    header_row = find_header(rows)
    hint = header_sequence(header_row)
    cols = column_roles(header_row)
    start = header_row['index'] if header_row else 0

    out = []
    totals = {}

    for row in rows:
        if row['index'] <= start and header_row is not None:
            continue
        numbers = _row_numbers(row)
        title = _clean_title(_row_text(row))
        joined = ' '.join(i['text'] for i in row['items']).replace('‌', ' ')
        low = joined

        # سطرهای جمع‌بندی
        if any(word in low for word in SUMMARY_WORDS) and not _looks_like_item(numbers):
            amounts = [v for _, v in numbers if v >= 100]
            if amounts:
                amount = max(amounts)
                if 'قابل پرداخت' in low or 'نهایی' in low:
                    totals['total'] = amount
                elif 'مالیات' in low or 'ارزش افزوده' in low or 'عوارض' in low:
                    totals['tax'] = amount
                elif 'تخفیف' in low:
                    totals['discount'] = amount
                elif 'جمع' in low:
                    totals.setdefault('subtotal', amount)
            continue

        if not numbers:
            continue
        values = [v for _, v in numbers]
        roles = roles_by_columns(row, cols) if cols else {}
        if not (roles.get('unit_price') or roles.get('total')):
            # ستون‌بندی سربرگ راه نداد (ردیف ناقص/چسبیده): معادلهٔ ردیف تصمیم می‌گیرد
            roles = assign_roles(values, hint)

        unit_price = int(roles.get('unit_price') or 0)
        total = int(roles.get('total') or 0)
        qty = roles.get('qty')
        discount = int(roles.get('discount') or 0)
        tax_raw = roles.get('tax')

        # اگر ستون قیمت واحد پیدا نشد، از مبلغ ردیف و تعداد ساخته می‌شود
        if qty and qty > 1 and total and (not unit_price or abs(qty * unit_price - total) / total > 0.15):
            if total >= unit_price * qty * 0.5 or unit_price < 100:
                unit_price = round(total / qty)
        if total and not unit_price:
            unit_price = total
        if unit_price and not total:
            total = unit_price * (qty or 1)

        # اعتبارسنجی نهایی: اگر جای مبلغ واحد و کل عوض شده، اصلاح می‌شود
        if qty and unit_price and total:
            if abs(qty * unit_price - total) / max(total, 1) > 0.15 and \
                    abs(qty * total - unit_price) / max(unit_price, 1) < 0.15:
                unit_price, total = total, unit_price

        if not title or max(unit_price, total) < 1000:
            continue

        tax_rate = tax_raw if tax_raw is not None and 0 < tax_raw <= 100 else 0
        tax_amount = tax_raw if tax_raw is not None and tax_raw > 100 else 0
        corrected, repaired = repair_total(qty, unit_price, discount, tax_rate, total)
        if repaired:
            total = corrected
        if any(word in title for word in FOOTER_WORDS):
            continue

        out.append({
            'title': title,
            'quantity': int(qty) if qty else 1,
            'unitPrice': unit_price,
            'discount': discount,
            'taxRate': tax_rate,
            'taxAmount': tax_amount,
            'total': total,
        })

    return out, totals


def repair_total(qty, unit_price, discount, tax_rate, total):
    """اصلاح رقم جاافتاده/تکراری در مبلغ ردیف با کمک معادله ردیف.

    موتور OCR گاهی یک صفر را جا می‌اندازد یا تکرار می‌کند («۳۹٬۷۰۰٬۰۰۰» ←
    «۳۹۷٬۰۰۰٬۰۰۰»). اگر مقدار چاپ‌شده با تعداد × قیمت واحد نخواند، حالت‌های
    محتمل (حذف یک رقم، تقسیم یا ضرب در ده) آزموده می‌شود و نزدیک‌ترین حالت
    که معادله را می‌سازد برگردانده می‌شود. اگر هیچ‌کدام نخواند، همان مقدار
    خوانده‌شده برمی‌گردد تا چیزی از خودمان نسازیم.
    """
    if not qty or not unit_price or not total:
        return total, False
    net = qty * unit_price - (discount or 0)
    expected = net * (1 + (tax_rate or 0) / 100.0) if tax_rate else net
    if expected <= 0:
        return total, False
    if abs(total - expected) / max(total, 1) <= 0.02:
        return total, False

    digits = str(int(total))
    candidates = {total}
    if len(digits) > 2:
        for index in range(len(digits)):
            trimmed = digits[:index] + digits[index + 1:]
            if trimmed and trimmed != '0':
                candidates.add(int(trimmed))
    candidates.add(int(round(total / 10)))
    candidates.add(int(round(total * 10)))
    best, best_diff = total, None
    for candidate in candidates:
        if candidate <= 0:
            continue
        diff = abs(candidate - expected) / max(candidate, 1)
        if best_diff is None or diff < best_diff:
            best, best_diff = candidate, diff
    if best_diff is not None and best_diff <= 0.01:
        return best, True
    return total, False


def _looks_like_item(numbers):
    """سطر با تعداد و مبلغ، ردیف کالاست نه جمع‌بندی."""
    if len(numbers) < 2:
        return False
    values = [v for _, v in numbers]
    small = [v for v in values if 0 < v < 1000 and float(v).is_integer()]
    big = [v for v in values if v >= 10000]
    return bool(small) and len(big) >= 1
