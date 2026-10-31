# -*- coding: utf-8 -*-
"""
جدول آزمایشی پیش‌پردازش: کدام نسخهٔ تصویر برای کدام نوع عکس بهتر می‌خواند؟

برای هر تصویر، چند «دستور پیش‌پردازش» جدا اجرا می‌شود و CER هرکدام با متن مرجع
سنجیده می‌شود. خروجی، مبنای تنظیم `build_variant_plan` در `pipeline.py` است.

اجرا:
    /tmp/ocrvenv/bin/python scripts/ocr-bench/tune.py                # همه
    /tmp/ocrvenv/bin/python scripts/ocr-bench/tune.py invoice-photo.jpg
"""
import io
import os
import sys
import time

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(BASE, 'ocr-service'))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from bench import cer, reference_text, truth_for  # noqa: E402

from PIL import Image, ImageFilter, ImageOps  # noqa: E402

from pipeline import (_clahe, _median, _resize_for_ocr, _sauvola,  # noqa: E402
                      _to_gray, _unsharp, recognize_items, reconstruct_rows)


def _load(name):
    data = open(os.path.join(HERE, name), 'rb').read()
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)).convert('RGB'))
    return _to_gray(img)


def _base(gray, width=None):
    if width:
        scale = width / gray.width
        if scale > 1:
            gray = gray.resize((width, int(gray.height * scale)), Image.LANCZOS)
    return ImageOps.autocontrast(gray, cutoff=1)


RECIPES = {
    'sharp@min': lambda g: _unsharp(_resize_for_ocr(g) if False else
                                    _base(_resize_for_ocr(g))),
    'sharp@2200': lambda g: _unsharp(_base(g, max(2200, g.width))),
    'sharp@2600': lambda g: _unsharp(_base(g, max(2600, g.width))),
    'clahe+sharp': lambda g: _unsharp(_clahe(_base(_resize_for_ocr(g)))),
    'strong-sharp': lambda g: _resize_for_ocr(g).filter(ImageFilter.UnsharpMask(3.0, 240, 2)),
    'sauvola': lambda g: _sauvola(_median(_unsharp(_base(_resize_for_ocr(g))))),
    'no-sharp': lambda g: _base(_resize_for_ocr(g)),
}


def main():
    names = sys.argv[1:] or ['invoice-clean.png', 'invoice-alt.png',
                             'invoice-photo.jpg', 'invoice-lowres.jpg']
    recipes = os.environ.get('RECIPES', '').split(',') if os.environ.get('RECIPES') else list(RECIPES)
    print(f'{"recipe":<14}' + ''.join(f'{n.replace("invoice-", ""):>16}' for n in names))
    print('-' * (14 + 16 * len(names)))
    table = {}
    for recipe in recipes:
        row = []
        for name in names:
            gray = _load(name)
            img = RECIPES[recipe](gray)
            started = time.perf_counter()
            rows = recognize_items(img)
            elapsed = time.perf_counter() - started
            text = '\n'.join(r['text'] if isinstance(r, dict) else r for r in reconstruct_rows(rows))
            score = cer(reference_text(truth_for(name)), text)
            row.append((score, elapsed))
            table[(recipe, name)] = score
        print(f'{recipe:<14}' + ''.join(f'{s * 100:>12.1f}%{e:>3.0f}s' for s, e in row))
    print('-' * (14 + 16 * len(names)))
    best = {name: min(recipes, key=lambda r: table[(r, name)]) for name in names}
    for name in names:
        print(f'بهترین برای {name:<20} {best[name]:<14} {table[(best[name], name)] * 100:.1f}%')
    avg = {r: sum(table[(r, n)] for n in names) / len(names) for r in recipes}
    top = min(avg, key=avg.get)
    print(f'\nمیانگین بهترین دستور سراسری: {top} → {avg[top] * 100:.1f}%')
    for r in sorted(avg, key=avg.get):
        print(f'  {r:<14}{avg[r] * 100:>6.1f}%')


if __name__ == '__main__':
    main()
