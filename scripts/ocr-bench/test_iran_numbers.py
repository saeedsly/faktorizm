# -*- coding: utf-8 -*-
"""
آزمون اعتبارسنجی شماره‌های هویتی ایران (ocr-service/iran_numbers.py).

شماره‌های معتبر به‌جای «حفظ کردن»، با همان الگوریتم ساخته می‌شوند تا آزمون
به حافظهٔ من وابسته نباشد.

اجرا: /tmp/ocrvenv/bin/python scripts/ocr-bench/test_iran_numbers.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'ocr-service'))

import iran_numbers as ir  # noqa: E402


def make_national_id(base9: str) -> str:
    total = sum(int(base9[i]) * (10 - i) for i in range(9))
    remainder = total % 11
    check = remainder if remainder < 2 else 11 - remainder
    return base9 + str(check)


def make_legal_id(base: str) -> str:
    base = base[:9] + '0'
    weights = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    total = sum(int(base[i]) * weights[i] for i in range(10))
    remainder = total % 11
    check = 11 - remainder if remainder > 1 else remainder
    return base + str(0 if check == 10 else check)


class NationalIdTest(unittest.TestCase):
    def test_generated_ids_are_valid(self):
        for base in ('049937089', '123456789', '001234567', '987654321'):
            nid = make_national_id(base)
            with self.subTest(nid=nid):
                self.assertTrue(ir.national_id_valid(nid))

    def test_wrong_check_digit(self):
        nid = make_national_id('049937089')
        wrong = nid[:-1] + str((int(nid[-1]) + 1) % 10)
        self.assertFalse(ir.national_id_valid(wrong))

    def test_persian_digits_and_separators(self):
        nid = make_national_id('049937089')
        fa = nid.translate(str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹'))
        self.assertTrue(ir.national_id_valid(fa))
        self.assertTrue(ir.national_id_valid(' '.join([nid[:3], nid[3:6], nid[6:]])))

    def test_rejects_junk(self):
        for junk in ('', None, '123', '0000000000', '1111111111', 'نامشخص'):
            with self.subTest(junk=junk):
                self.assertFalse(ir.national_id_valid(junk))


class LegalIdTest(unittest.TestCase):
    def test_generated_valid(self):
        legal = make_legal_id('1086123456')
        self.assertTrue(ir.legal_id_valid(legal))

    def test_wrong_check(self):
        legal = make_legal_id('1086123456')
        wrong = legal[:-1] + str((int(legal[-1]) + 2) % 10)
        self.assertFalse(ir.legal_id_valid(wrong))

    def test_length(self):
        self.assertFalse(ir.legal_id_valid('1234567890'))
        self.assertFalse(ir.legal_id_valid('123456789012'))


class IbanTest(unittest.TestCase):
    def test_known_valid(self):
        for iban in ('IR062960000000100324200001', 'IR820540102680020817909002',
                     'IR580540105180021273113007'):
            with self.subTest(iban=iban):
                self.assertTrue(ir.iban_valid(iban))

    def test_spaces_and_lowercase(self):
        self.assertTrue(ir.iban_valid('ir06 2960 0000 0010 0324 2000 01'))

    def test_broken(self):
        self.assertFalse(ir.iban_valid('IR062960000000100324200002'))
        self.assertFalse(ir.iban_valid('IR062960'))
        self.assertFalse(ir.iban_valid('DE062960000000100324200001'))


class PhoneAndPostalTest(unittest.TestCase):
    def test_mobile(self):
        self.assertTrue(ir.mobile_valid('09123456789'))
        self.assertTrue(ir.mobile_valid('۰۹۱۲۳۴۵۶۷۸۹'))
        self.assertTrue(ir.mobile_valid('+98 912 345 6789'))
        self.assertFalse(ir.mobile_valid('02188776655'))
        self.assertFalse(ir.mobile_valid('0912345'))

    def test_postal(self):
        self.assertTrue(ir.postal_code_valid('1993714651'))
        self.assertTrue(ir.postal_code_valid('۱۹۹۳۷۱۴۶۵۱'))
        self.assertFalse(ir.postal_code_valid('0993714651'))
        self.assertFalse(ir.postal_code_valid('12345'))

    def test_economic_code(self):
        self.assertTrue(ir.economic_code_valid('۴۱۱۲۳۳۴۵۶۷۸۹'))
        self.assertFalse(ir.economic_code_valid('111111111111'))
        self.assertFalse(ir.economic_code_valid('12345'))


class FindIdentifiersTest(unittest.TestCase):
    def test_finds_labeled_values(self):
        legal = make_legal_id('1086123456')
        text = f'شناسه ملی: {legal} — کد اقتصادی ۴۱۱۲۳۳۴۵۶۷۸۹'
        found = ir.find_identifiers(text)
        kinds = {item['kind']: item for item in found}
        self.assertIn('legal_id', kinds)
        self.assertTrue(kinds['legal_id']['ok'])
        self.assertIn('economic_code', kinds)
        self.assertTrue(kinds['economic_code']['ok'])

    def test_does_not_truncate_digits(self):
        nid = make_national_id('049937089')
        found = ir.find_identifiers(f'کد ملی {nid}')
        self.assertEqual(found[0]['value'], nid)

    def test_iban_detected(self):
        found = ir.find_identifiers('شبا: IR062960000000100324200001')
        self.assertTrue(found and found[0]['ok'])

    def test_nothing_found(self):
        self.assertEqual(ir.find_identifiers('جمع کل ۱۱۷٬۴۰۰٬۰۰۰'), [])
        self.assertEqual(ir.find_identifiers(''), [])


if __name__ == '__main__':
    unittest.main(verbosity=1)
