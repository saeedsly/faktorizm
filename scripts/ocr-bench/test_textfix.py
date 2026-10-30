# -*- coding: utf-8 -*-
"""آزمون‌های پس‌پردازش متن OCR فارسی (ترتیب واژه‌ها، اعداد، جداکننده‌ها)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'ocr-service'))

from textfix import format_numbers, postprocess_line, visual_to_logical  # noqa: E402


class WordOrderTests(unittest.TestCase):
    def test_reversed_words_become_logical(self):
        self.assertEqual(visual_to_logical('نيرآ ىگناخ مزاول هاگشورف'), 'فروشگاه لوازم خانگی آرین')

    def test_number_keeps_digit_order(self):
        self.assertEqual(visual_to_logical('۱۴۰۳۲۲۸۷ روتکاف هرامش'), 'شماره فاکتور ۱۴۰۳۲۲۸۷')

    def test_date_keeps_order(self):
        self.assertEqual(visual_to_logical('1404/05/12 :خیرات'), 'تاریخ: 1404/05/12')

    def test_mixed_latin_keeps_order(self):
        self.assertEqual(visual_to_logical('ThinkPad E14 لدم وونل پاتپل'), 'لپتاپ لنوو مدل ThinkPad E14')

    def test_percent_symbol(self):
        self.assertEqual(visual_to_logical('٪۹ هدوزفا شزرا'), 'ارزش افزوده ۹٪')


class NumberOrderTests(unittest.TestCase):
    def test_latin_thousands(self):
        self.assertEqual(visual_to_logical('150,000,000 لک عمج'), 'جمع کل 150,000,000')

    def test_persian_thousands_separator(self):
        self.assertEqual(visual_to_logical('۱۲۷٬۹۶۶٬۰۰۰ لک عمج'), 'جمع کل ۱۲۷٬۹۶۶٬۰۰۰')

    def test_arabic_comma_separator(self):
        # جداکننده عربی «،» هم باید جزو عدد شناخته شود، نه دو عدد جدا
        self.assertEqual(visual_to_logical('۲۵۰،۰۰۰ غلبم'), 'مبلغ ۲۵۰،۰۰۰')

    def test_space_grouped_thousands(self):
        self.assertEqual(visual_to_logical('۱ ۶۰۰ ۰۰۰ غلبم'), 'مبلغ ۱ ۶۰۰ ۰۰۰')

    def test_separate_numbers_keep_their_order(self):
        # سه عدد مستقل نباید در هم ادغام شوند و ترتیبشان باید حفظ شود
        self.assertEqual(
            visual_to_logical('97000000 48500000 2 الاك حرش'),
            'شرح کالا 2 48500000 97000000',
        )

    def test_decimal_amount(self):
        self.assertEqual(visual_to_logical('۱۲٫۵ دصرد'), 'درصد ۱۲٫۵')


class FormatTests(unittest.TestCase):
    def test_groups_large_numbers(self):
        self.assertEqual(format_numbers('مبلغ 48500000 ریال'), 'مبلغ ۴۸٬۵۰۰٬۰۰۰ ریال')

    def test_keeps_small_numbers(self):
        self.assertEqual(format_numbers('تعداد 5 عدد'), 'تعداد 5 عدد')

    def test_does_not_break_dates(self):
        self.assertEqual(format_numbers('۱۴۰۴/۰۵/۱۲'), '۱۴۰۴/۰۵/۱۲')

    def test_normalizes_existing_grouping(self):
        self.assertEqual(format_numbers('۱۲۷,۹۶۶,۰۰۰'), '۱۲۷٬۹۶۶٬۰۰۰')


class PipelineTests(unittest.TestCase):
    def test_full_line(self):
        line = postprocess_line('۱۲۷٬۹۶۶٬۰۰۰ لک عمج')
        self.assertEqual(line, 'جمع کل ۱۲۷٬۹۶۶٬۰۰۰')

    def test_latin_only_line_untouched(self):
        self.assertEqual(postprocess_line('ThinkPad E14'), 'ThinkPad E14')

    def test_words_are_corrected(self):
        self.assertIn('تعداد', postprocess_line('تعدا 5'))

    def test_short_words_not_touched(self):
        self.assertEqual(postprocess_line('جمع کل'), 'جمع کل')


if __name__ == '__main__':
    unittest.main(verbosity=2)
