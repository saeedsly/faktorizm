# -*- coding: utf-8 -*-
"""آزمون فهم ساختار جدول فاکتور از روی موقعیت خانه‌ها (بدون اجرای OCR)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'ocr-service'))

from table import extract_items, header_field, parse_number, repair_total  # noqa: E402


def cell(text, x, y, w=120, h=40):
    return {'text': text, 'xmin': x, 'xmax': x + w, 'ymin': y, 'ymax': y + h,
            'score': 0.95, 'row': 0}


# چیدمان راست‌به‌چپ: شرح کالا راست، بعد تعداد، قیمت واحد و مبلغ کل به چپ
HEADER = [
    cell('شرح کالا', 1000, 100, 220),
    cell('تعداد', 880, 100, 90),
    cell('قیمت واحد', 600, 100, 260),
    cell('مبلغ کل', 300, 100, 260),
]
BODY = [
    cell('لپ‌تاپ لنوو', 1000, 180, 220), cell('۲', 900, 180, 50),
    cell('۴۸٬۵۰۰٬۰۰۰', 620, 180, 200), cell('۹۷٬۰۰۰٬۰۰۰', 300, 180, 240),
    cell('ماوس بی‌سیم', 1000, 250, 220), cell('۵', 900, 250, 50),
    cell('۸۹۰٬۰۰۰', 620, 250, 200), cell('۴٬۴۵۰٬۰۰۰', 300, 250, 240),
]
SUMMARY = [
    cell('جمع کل', 700, 340, 150), cell('۱۰۱٬۴۵۰٬۰۰۰', 300, 340, 240),
    cell('قابل پرداخت', 700, 410, 160), cell('۱۱۰٬۵۸۰٬۵۰۰', 300, 410, 240),
]


class HeaderTests(unittest.TestCase):
    def test_titles(self):
        self.assertEqual(header_field('شرح کالا'), 'title')
        self.assertEqual(header_field('تعداد'), 'qty')
        self.assertEqual(header_field('مبلغ واحد'), 'unit_price')
        self.assertEqual(header_field('مبلغ کل'), 'total')
        self.assertEqual(header_field('تخفیف'), 'discount')
        self.assertEqual(header_field('مالیات'), 'tax')

    def test_unknown(self):
        self.assertIsNone(header_field('تلفن تماس'))


class NumberTests(unittest.TestCase):
    def test_persian_grouped(self):
        self.assertEqual(parse_number('۹۷٬۰۰۰٬۰۰۰'), 97000000)

    def test_latin_grouped(self):
        self.assertEqual(parse_number('4,450,000'), 4450000)

    def test_plain(self):
        self.assertEqual(parse_number('تعداد 5'), 5)

    def test_arabic_digits(self):
        self.assertEqual(parse_number('٤٥٠٠٠٠'), 450000)

    def test_no_number(self):
        self.assertIsNone(parse_number('شرح کالا'))


class ExtractionTests(unittest.TestCase):
    def test_items_are_mapped_to_columns(self):
        items, totals = extract_items(HEADER + BODY + SUMMARY)
        self.assertEqual(len(items), 2)
        first = items[0]
        self.assertEqual(first['title'], 'لپ‌تاپ لنوو')
        self.assertEqual(first['quantity'], 2)
        self.assertEqual(first['unitPrice'], 48500000)
        self.assertEqual(first['total'], 97000000)
        self.assertEqual(items[1]['quantity'], 5)
        self.assertEqual(items[1]['unitPrice'], 890000)

    def test_totals_from_summary_rows(self):
        _, totals = extract_items(HEADER + BODY + SUMMARY)
        self.assertEqual(totals.get('subtotal'), 101450000)
        self.assertEqual(totals.get('total'), 110580500)

    def test_layout_with_discount_and_tax_columns(self):
        header = [
            cell('شرح خدمت', 1050, 100, 200),
            cell('تعداد', 950, 100, 80),
            cell('قیمت واحد', 720, 100, 220),
            cell('تخفیف', 560, 100, 150),
            cell('مالیات', 420, 100, 130),
            cell('مبلغ نهایی', 180, 100, 230),
        ]
        body = [
            cell('خدمات نصب', 1050, 180, 200), cell('1', 960, 180, 40),
            cell('5000000', 730, 180, 180), cell('500000', 570, 180, 120),
            cell('9', 430, 180, 60), cell('4905000', 190, 180, 200),
        ]
        items, _ = extract_items(header + body)
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item['title'], 'خدمات نصب')
        self.assertEqual(item['quantity'], 1)
        self.assertEqual(item['unitPrice'], 5000000)
        self.assertEqual(item['discount'], 500000)
        self.assertEqual(item['taxRate'], 9)
        self.assertEqual(item['total'], 4905000)

    def test_swapped_price_columns_are_corrected(self):
        # ستون‌ها جابه‌جا خوانده شده‌اند: ضرب تعداد باید مبلغ ردیف بسازد
        header = [
            cell('شرح کالا', 1000, 100, 200),
            cell('تعداد', 900, 100, 60),
            cell('قیمت واحد', 650, 100, 200),
            cell('مبلغ کل', 350, 100, 220),
        ]
        body = [
            cell('کابل', 1000, 180, 200), cell('10', 905, 180, 40),
            cell('4500000', 660, 180, 160), cell('450000', 360, 180, 180),
        ]
        items, _ = extract_items(header + body)
        self.assertEqual(items[0]['unitPrice'], 450000)
        self.assertEqual(items[0]['total'], 4500000)

    def test_footer_rows_are_skipped(self):
        footer = [
            cell('مهر و امضای فروشنده', 1000, 500, 300),
            cell('این فاکتور رایانه‌ای صادر شده است', 400, 570, 500),
        ]
        items, _ = extract_items(HEADER + BODY + SUMMARY + footer)
        self.assertEqual(len(items), 2)

    def test_row_without_amount_is_skipped(self):
        extra = [
            cell('خدمات مشاوره رایگان', 1000, 320, 300),
        ]
        items, _ = extract_items(HEADER + BODY + extra)
        self.assertEqual(len(items), 2)

    def test_trailing_quantity_is_removed_from_title(self):
        body = [
            cell('ماوس بی‌سیم 5', 1000, 180, 220), cell('5', 900, 180, 50),
            cell('890000', 620, 180, 200), cell('4450000', 300, 180, 240),
        ]
        items, _ = extract_items(HEADER + body)
        self.assertEqual(items[0]['title'], 'ماوس بی‌سیم')

    def test_missing_title_header_still_extracts(self):
        # در برخی فاکتورها عنوان ستون شرح کالا کم‌کنتراست و خوانده نمی‌شود
        header = [
            cell('مقدار', 880, 100, 90),
            cell('نرخ', 600, 100, 200),
            cell('مبلغ نهایی', 300, 100, 240),
        ]
        body = [
            cell('پشتیبانی سالانه شبکه', 1000, 180, 220), cell('1', 900, 180, 50),
            cell('42000000', 620, 180, 200), cell('43600000', 300, 180, 240),
        ]
        items, _ = extract_items(header + body)
        self.assertEqual(len(items), 1, str(items))
        self.assertEqual(items[0]['title'], 'پشتیبانی سالانه شبکه')
        self.assertEqual(items[0]['quantity'], 1)
        self.assertEqual(items[0]['unitPrice'], 42000000)
        self.assertEqual(items[0]['total'], 43600000)

    def test_unit_price_is_derived_when_missing(self):
        header = [
            cell('شرح کالا', 1000, 100, 220),
            cell('تعداد', 880, 100, 90),
            cell('مبلغ کل', 300, 100, 260),
        ]
        body = [
            cell('هارد اکسترنال', 1000, 180, 220), cell('4', 900, 180, 50),
            cell('27000000', 300, 180, 240),
        ]
        items, _ = extract_items(header + body)
        self.assertEqual(items[0]['unitPrice'], 6750000)

    def test_no_header_returns_nothing(self):
        items, totals = extract_items([cell('سلام', 100, 100, 80)])
        self.assertEqual(items, [])
        self.assertEqual(totals, {})


class RepairTests(unittest.TestCase):
    def test_missing_zero_is_repaired(self):
        # ۴۳٬۶۰۰٬۰۰۰ درست است؛ اگر موتور ۴۳۶٬۰۰۰٬۰۰۰ بخواند (صفر تکراری) اصلاح می‌شود
        value, repaired = repair_total(1, 42000000, 2000000, 9, 436000000)
        self.assertTrue(repaired)
        self.assertEqual(value, 43600000)

    def test_extra_digit_is_repaired(self):
        # 2 × 8,500,000 با ۹٪ = 18,530,000 اما 185,300,000 خوانده شده
        value, repaired = repair_total(2, 8500000, 0, 9, 185300000)
        self.assertTrue(repaired)
        self.assertEqual(value, 18530000)

    def test_consistent_value_untouched(self):
        value, repaired = repair_total(5, 890000, 0, 0, 4450000)
        self.assertFalse(repaired)
        self.assertEqual(value, 4450000)

    def test_hopeless_value_kept_honest(self):
        value, repaired = repair_total(1, 1000000, 0, 0, 777777)
        self.assertFalse(repaired)
        self.assertEqual(value, 777777)


if __name__ == '__main__':
    unittest.main(verbosity=2)
