# -*- coding: utf-8 -*-
"""
آزمون موتور اعداد ایرانی (persian_dict) — همهٔ شکل‌های رایج عدد در فاکتور.

اجرا:  /tmp/ocrvenv/bin/python scripts/ocr-bench/test_numbers.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'ocr-service'))

import persian_dict as d  # noqa: E402


class DigitsTest(unittest.TestCase):
    def test_persian_and_arabic_digits(self):
        self.assertEqual(d.parse_amount('۱۴۵'), 145)
        self.assertEqual(d.parse_amount('١٤٥'), 145)
        self.assertEqual(d.parse_amount('۱۲۳۴۵۶۷'), 1234567)

    def test_thousand_separators(self):
        self.assertEqual(d.parse_amount('۱٬۲۳۴٬۵۶۷'), 1234567)
        self.assertEqual(d.parse_amount('1,234,567'), 1234567)
        self.assertEqual(d.parse_amount('۱،۲۳۴،۵۶۷'), 1234567)
        self.assertEqual(d.parse_amount('۱ ۲۳۴ ۵۶۷'), 1234567)
        self.assertEqual(d.parse_amount('1 234 567'), 1234567)
        self.assertEqual(d.parse_amount('۱۲۳۴۵۶۷/۰'), 12345670)
        self.assertEqual(d.parse_amount('۱۲۳/۴۵۶'), 123456)

    def test_short_and_long(self):
        self.assertEqual(d.parse_amount('۹'), 9)
        self.assertEqual(d.parse_amount('۱۲۳۴۵۶۷۸۹۰۱۲'), 123456789012)
        self.assertEqual(d.parse_amount('۱۲٬۵۰۰'), 12500)

    def test_mixed_digit_scripts(self):
        self.assertEqual(d.parse_amount('1۲3'), 123)
        self.assertEqual(d.parse_amount('۱۲3۴'), 1234)

    def test_decimals(self):
        self.assertEqual(d.parse_amount('۱۲٫۵'), 13)          # 12.5 گرد می‌شود
        self.assertEqual(d.parse_amount('۱۲٫۵۰'), 13)
        self.assertEqual(d.parse_amount('۱۲٫۴۴۹'), 12449)      # سه رقم ⇒ هزارگان

    def test_currency_suffix(self):
        self.assertEqual(d.parse_amount('۱۲٬۵۰۰ ریال'), 12500)
        self.assertEqual(d.parse_amount('۹۷٬۰۰۰٬۰۰۰ تومان'), 97000000)
        self.assertEqual(d.parse_amount('1,000 IRR'), 1000)

    def test_negative_forms(self):
        self.assertEqual(d.parse_amount('(۱٬۲۰۰)'), -1200)
        self.assertEqual(d.parse_amount('-۵۰۰'), -500)
        self.assertEqual(d.parse_amount('−۵۰۰'), -500)
        self.assertEqual(d.parse_amount('۵۰۰-'), -500)

    def test_written_multipliers(self):
        self.assertEqual(d.parse_amount('۲ میلیون'), 2000000)
        self.assertEqual(d.parse_amount('۲.۵ میلیون'), 2500000)
        self.assertEqual(d.parse_amount('۳ میلیارد'), 3000000000)
        self.assertEqual(d.parse_amount('۱٫۵ میلیون تومان'), 1500000)

    def test_written_numbers(self):
        self.assertEqual(d.parse_amount('دو میلیون و پانصد هزار'), 2500000)
        self.assertEqual(d.parse_amount('یک میلیون و دویست هزار'), 1200000)
        self.assertEqual(d.parse_amount('سیصد و پنجاه'), 350)
        self.assertEqual(d.parse_amount('هزار'), None)         # بدون عدد نوشتاری

    def test_lookalike_digits(self):
        self.assertEqual(d.parse_amount('1O5'), 105)
        self.assertEqual(d.parse_amount('S0'), 50)
        self.assertEqual(d.parse_amount('2O5,0O0'), 205000)
        self.assertEqual(d.parse_amount('B5O'), 850)

    def test_junk_returns_none(self):
        for junk in ('', None, 'نامشخص', '—', '...', 'ده', 'دو', 'ab', 'NULL'):
            with self.subTest(junk=junk):
                self.assertIsNone(d.parse_amount(junk, allow_words=False))

    def test_no_fabricated_zero(self):
        self.assertIsNone(d.parse_amount('۰٪'))
        self.assertIsNone(d.parse_amount('()'))


class PercentTest(unittest.TestCase):
    def test_percent_forms(self):
        self.assertEqual(d.parse_percent('۹٪'), 9)
        self.assertEqual(d.parse_percent('(%9)'), 9)
        self.assertEqual(d.parse_percent('۹ درصد'), 9)
        self.assertEqual(d.parse_percent('مالیات 9%'), 9)
        self.assertEqual(d.parse_percent('(%۱۰)'), 10)

    def test_percent_rejects(self):
        self.assertIsNone(d.parse_percent('جمع کل'))
        self.assertIsNone(d.parse_percent('۰٪'))
        self.assertIsNone(d.parse_percent(None))


class FormatTest(unittest.TestCase):
    def test_format_amount(self):
        self.assertEqual(d.format_amount(1234567), '۱٬۲۳۴٬۵۶۷')
        self.assertEqual(d.format_amount(-4500), '-۴٬۵۰۰')
        self.assertEqual(d.format_amount(0), '۰')
        self.assertEqual(d.format_amount(None), '')

    def test_digits_only(self):
        self.assertEqual(d.digits_only('۱۲۳/۴۵۶'), '123456')
        self.assertEqual(d.digits_only('۱٬۲۳۴'), '1234')


class IntegrationTest(unittest.TestCase):
    """همان مسیری که جدول و اعتبارسنجی استفاده می‌کنند."""

    def test_table_parse_number(self):
        import table
        self.assertEqual(table.parse_number('۲.۵ میلیون'), 2500000)
        self.assertEqual(table.parse_number('(۱٬۲۰۰)'), -1200)
        self.assertEqual(table.parse_number('۱۲٬۵۰۰ ریال'), 12500)
        self.assertIsNone(table.parse_number('نامشخص'))

    def test_validate_parse_money(self):
        import validate
        self.assertEqual(validate.parse_money('۹۷٬۰۰۰٬۰۰۰ تومان'), 97000000)
        self.assertEqual(validate.parse_money('۱۲۳/۴۵۶'), 123456)
        self.assertIsNone(validate.parse_money('نامشخص'))

    def test_dict_size(self):
        self.assertGreaterEqual(len(d.WORDS), 4000, 'واژه‌نامه باید دست‌کم ۴۰۰۰ واژه باشد')


if __name__ == '__main__':
    unittest.main(verbosity=1)
