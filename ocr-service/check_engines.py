# -*- coding: utf-8 -*-
"""
Engine check - prints what the local OCR service can and cannot do.

Run it when the app shows "Tesseract (in browser)" and you expect the strong
engine. Output is plain ASCII English so it is readable in any Windows console
codepage; the Persian explanation lives in the README files.

    python check_engines.py
    python check_engines.py --json
"""
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

OK = '[ok]  '
NO = '[--]  '
WARN = '[!!]  '


def collect():
    import engines  # imported late so a syntax error is reported clearly

    diag = engines.diagnostics()
    diag['service'] = {
        'port': int(os.environ.get('OCR_PORT', '8789')),
        'engine_mode': os.environ.get('OCR_ENGINE', 'auto'),
    }
    try:
        from pipeline import engine_error, engine_info, get_engine

        diag['selection'] = {
            'ready': get_engine() is not None,
            'active': engine_info().get('id') if get_engine() is not None else None,
            'active_label': engine_info().get('label') if get_engine() is not None else None,
            'error': engine_error(),
        }
    except Exception as exc:  # noqa: BLE001
        diag['selection'] = {'ready': False, 'active': None, 'error': f'{type(exc).__name__}: {exc}'}
    return diag


def print_report(diag):
    print('')
    print('Faktorizm OCR - engine check')
    print('=' * 58)

    py = diag['python']
    print('\n1) Python')
    print(f'{OK}interpreter: {py["executable"]}')
    print(f'{OK}version: {py["version"]}')
    for name in ('onnxruntime', 'rapidocr', 'torch', 'transformers'):
        mark = OK if py[name] else NO
        extra = ''
        if name in ('torch', 'transformers') and not py[name]:
            extra = '  (only needed for Falcon)'
        if name in ('onnxruntime', 'rapidocr') and not py[name]:
            extra = '  (needed for PP-OCR)  -> run setup.bat'
        print(f'{mark}{name}{extra}')

    print('\n2) Model files')
    print(f'{OK}folder: {diag["modelsDir"]}')
    for key, label in (('det', 'detector'), ('rec', 'arabic recognizer'), ('cls', 'classifier'), ('dict', 'arabic keys')):
        value = diag['files'].get(key)
        print(f'{OK if value else NO}{label}: {value or "missing"}')

    print('\n3) Engines')
    labels_en = {'falcon-ocr-arabic': 'Falcon-OCR-Arabic', 'ppocrv5-arabic': 'PP-OCR v5 (arabic)',
                 'ppocrv6-arabic': 'PP-OCR v6 det + arabic rec', 'tesseract-browser': 'Tesseract (browser)'}
    for engine in diag['engines']:
        mark = OK if engine['ready'] else NO
        print(f'{mark}{labels_en.get(engine["id"], engine["id"])}  [{engine["id"]}]')
        if not engine['ready']:
            reason = engine.get('reasonEn') or engine.get('reason')
            if reason:
                print(f'      reason: {reason}')

    falcon = diag['falcon']
    print(f'\n4) Falcon-OCR folder')
    print(f'{"[ok]  " if falcon["hasWeights"] else NO}{falcon["dir"]}')
    if falcon['weights']:
        print(f'       weights: {", ".join(falcon["weights"])}')
    if not falcon['ready']:
        print(f'{WARN}{falcon.get("reasonEn") or falcon["reason"]}')

    print('\n5) Persian dictionary')
    print(f'{OK if diag["dictionary"]["words"] else NO}{diag["dictionary"]["words"]} words loaded')

    sel = diag.get('selection') or {}
    print('\n6) Selected engine')
    if sel.get('ready'):
        print(f'{OK}{sel.get("active_label")}  [{sel.get("active")}]')
    else:
        print(f'{NO}no strong engine - the app will fall back to Tesseract in the browser')
        if sel.get('error'):
            print(f'      reason: {sel["error"]}')

    print('\n' + '=' * 58)
    if sel.get('ready'):
        print('RESULT: strong engine is ready. The app uses it automatically.')
    else:
        print('RESULT: strong engine NOT ready.')
        print('  - run setup.bat once (installs Python packages)')
        print('  - then run start.bat (starts the service on port 8789)')
        print('  - for Falcon run falcon-setup.bat (about 1.1 GB, one time)')
    print('')


def main():
    if '--json' in sys.argv:
        print(json.dumps(collect(), ensure_ascii=False, indent=2))
        return 0
    try:
        diag = collect()
    except Exception as exc:  # noqa: BLE001
        print(f'[--]  engine check failed: {type(exc).__name__}: {exc}')
        print('      run setup.bat first (it installs numpy, onnxruntime and rapidocr)')
        return 2
    print_report(diag)
    return 0 if (diag.get('selection') or {}).get('ready') else 1


if __name__ == '__main__':
    sys.exit(main())
