# -*- coding: utf-8 -*-
"""
ساخت تصاویر مرجع (فیکسچر) برای سنجش دقت OCR فاکتور.

سه نسخه از یک فاکتور واقع‌نما می‌سازد:
  invoice-clean.png  → اسکن تمیز و پرکیفیت
  invoice-photo.jpg  → عکس با تاری، نویز، چرخش و JPEG فشرده
  invoice-lowres.jpg → عکس کوچک و کم‌کیفیت موبایل

اجرا:
    /tmp/ocr-venv/bin/python scripts/ocr-bench/make_fixtures.py
"""
import json
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.environ.get('BENCH_FONT', '/tmp/Vazirmatn.ttf')
W, H = 1240, 1754  # نسبت A4 در 150 dpi

FA_DIGITS = str.maketrans('0123456789', '0123456789')
reshaper = arabic_reshaper.ArabicReshaper(configuration={'delete_harakat': False})


def fa(text):
    """شکل‌دهی و راست‌به‌چپ‌سازی متن فارسی برای رندر."""
    return get_display(reshaper.reshape(text))


def money(n):
    return f'{n:,}'.replace(',', '').translate(FA_DIGITS)


INVOICE = {
    'seller': 'فروشگاه لوازم خانگی آرین',
    'sellerMeta': 'خیابان ولیعصر، پلاک 214 — تلفن: 02188776655',
    'buyer': 'شرکت پخش کالای پارس',
    'buyerMeta': 'کد اقتصادی: 411233456789',
    'number': '14032287',
    'date': '1404/05/12',
    'items': [
        ('لپ‌تاپ لنوو مدل ThinkPad E14', 2, 48500000, 97000000),
        ('ماوس بی‌سیم لاجیتک M185', 5, 890000, 4450000),
        ('کیبورد مکانیکال ایسوس', 2, 2350000, 4700000),
        ('کابل HDMI یک متری', 10, 450000, 4500000),
        ('هارد اکسترنال وسترن 2 ترابایت', 1, 6750000, 6750000),
    ],
    'subtotal': 117400000,
    'tax': 10566000,
    'total': 127966000,
}


def draw_invoice():
    img = Image.new('RGB', (W, H), '#ffffff')
    d = ImageDraw.Draw(img)
    f_title = ImageFont.truetype(FONT_PATH, 44)
    f_sub = ImageFont.truetype(FONT_PATH, 24)
    f_head = ImageFont.truetype(FONT_PATH, 28)
    f_body = ImageFont.truetype(FONT_PATH, 26)
    f_small = ImageFont.truetype(FONT_PATH, 22)

    d.rectangle([0, 0, W, 14], fill='#1f3f8f')
    d.text((W - 60, 60), fa(INVOICE['seller']), font=f_title, fill='#0f172a', anchor='ra')
    d.text((W - 60, 120), fa(INVOICE['sellerMeta']), font=f_sub, fill='#475569', anchor='ra')
    d.text((W - 60, 170), fa('صورتحساب فروش کالا و خدمات'), font=f_head, fill='#1f3f8f', anchor='ra')

    d.rectangle([60, 225, W - 60, 225], fill='#cbd5e1')
    d.text((W - 60, 250), fa(f'شماره فاکتور: {INVOICE["number"].translate(FA_DIGITS)}'), font=f_body, fill='#0f172a', anchor='ra')
    d.text((60, 250), fa(f'تاریخ: {INVOICE["date"].translate(FA_DIGITS)}'), font=f_body, fill='#0f172a')
    d.text((W - 60, 290), fa(f'خریدار: {INVOICE["buyer"]}'), font=f_body, fill='#0f172a', anchor='ra')
    d.text((W - 60, 330), fa(INVOICE['buyerMeta']), font=f_small, fill='#475569', anchor='ra')

    # جدول
    top = 400
    # چیدمان واقعی فاکتورهای فارسی: شرح کالا راست‌ترین ستون و مبالغ به سمت چپ
    cols = [  # (x_start, x_end, عنوان)
        (700, 1180, 'شرح کالا'),
        (620, 700, 'تعداد'),
        (380, 620, 'مبلغ واحد'),
        (60, 380, 'مبلغ کل'),
    ]
    d.rectangle([60, top, W - 60, top + 56], fill='#e8eefc')
    for x0, x1, title in cols:
        d.text(((x0 + x1) / 2, top + 28), fa(title), font=f_head, fill='#1f3f8f', anchor='mm')
    y = top + 56
    for idx, (name, qty, unit, total) in enumerate(INVOICE['items']):
        if idx % 2 == 0:
            d.rectangle([60, y, W - 60, y + 54], fill='#f8fafc')
        d.text((1160, y + 27), fa(name), font=f_body, fill='#0f172a', anchor='rm')
        d.text((660, y + 27), money(qty), font=f_body, fill='#0f172a', anchor='mm')
        d.text((500, y + 27), money(unit), font=f_body, fill='#0f172a', anchor='mm')
        d.text((220, y + 27), money(total), font=f_body, fill='#0f172a', anchor='mm')
        y += 54

    d.line([60, y + 10, W - 60, y + 10], fill='#cbd5e1', width=2)
    y += 40
    for label, value in (
        ('جمع کل', INVOICE['subtotal']),
        ('مالیات بر ارزش افزوده (9٪)', INVOICE['tax']),
        ('مبلغ قابل پرداخت', INVOICE['total']),
    ):
        d.text((220, y), money(value), font=f_head, fill='#0f172a', anchor='rm')
        d.text((320, y), fa(label), font=f_body, fill='#334155', anchor='rm')
        y += 56

    d.text((W - 60, H - 120), fa('مهر و امضای فروشنده'), font=f_small, fill='#64748b', anchor='ra')
    d.text((60, H - 120), fa('این فاکتور به صورت رایانه‌ای صادر شده است.'), font=f_small, fill='#64748b')
    return img


def degrade(img, blur, noise, angle, scale, quality, path):
    out = img.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor='white')
    if scale != 1.0:
        out = out.resize((int(out.width * scale), int(out.height * scale)), Image.LANCZOS)
    if blur:
        out = out.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        rnd = random.Random(7)
        px = out.load()
        for _ in range(int(out.width * out.height * noise)):
            x = rnd.randrange(out.width)
            yy = rnd.randrange(out.height)
            delta = rnd.randint(-38, 38)
            r, g, b = px[x, yy][:3]
            px[x, yy] = (max(0, min(255, r + delta)), max(0, min(255, g + delta)), max(0, min(255, b + delta)))
    out.save(path, quality=quality, optimize=True)
    return path


def main():
    base = draw_invoice()
    clean = os.path.join(HERE, 'invoice-clean.png')
    base.save(clean, optimize=True)
    photo = degrade(base, blur=2.1, noise=0.004, angle=1.4, scale=0.86, quality=58,
                    path=os.path.join(HERE, 'invoice-photo.jpg'))
    low = degrade(base, blur=1.5, noise=0.002, angle=-0.8, scale=0.55, quality=50,
                  path=os.path.join(HERE, 'invoice-lowres.jpg'))

    truth = dict(INVOICE)
    truth['items'] = [{'name': n, 'qty': q, 'unit': u, 'total': t} for n, q, u, t in INVOICE['items']]
    with open(os.path.join(HERE, 'invoice-truth.json'), 'w', encoding='utf-8') as fh:
        json.dump(truth, fh, ensure_ascii=False, indent=2)
    print('wrote:', clean, photo, low)


if __name__ == '__main__':
    main()
