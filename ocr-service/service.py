# -*- coding: utf-8 -*-
"""
سرویس OCR آفلاین فاکتوریزم — انتخاب خودکار موتور (Falcon-OCR-Arabic / PP-OCR)

کاملا محلی: فقط روی 127.0.0.1 گوش می‌دهد، هیچ ارتباط اینترنتی ندارد و
مدل‌ها از پوشه همین سرویس بارگذاری می‌شوند.

اجرا:
    python service.py                # پورت پیش‌فرض 8789
    OCR_PORT=9000 python service.py

رابط‌ها:
    GET  /health      → وضعیت آماده‌بودن موتور
    POST /recognize   → تصویر در بدنه (raw image/* یا multipart) و JSON نتیجه
"""
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import engines
from pipeline import engine_error, engine_info, get_engine, recognize_bytes
from validate import AUTO_CONFIRM, REVIEW_FLOOR

PORT = int(os.environ.get('OCR_PORT', '8789'))
MAX_BODY = 25 * 1024 * 1024  # حداکثر ۲۵ مگابایت برای هر تصویر


def recognize(image_bytes):
    """خوانش کامل تصویر با خط لوله چندنسخه‌ای (پیش‌پردازش + ترکیب + بازخوانی)."""
    if get_engine() is None:
        raise RuntimeError(engine_error() or 'OCR engine not ready')
    started = time.perf_counter()
    result = recognize_bytes(image_bytes)
    result['elapsedMs'] = round((time.perf_counter() - started) * 1000)
    return result


def parse_multipart(body, content_type):
    """استخراج اولین فایل تصویری از بدنه multipart بدون وابستگی اضافه."""
    marker = content_type.split('boundary=', 1)[1].strip().strip('"')
    delimiter = ('--' + marker).encode()
    for part in body.split(delimiter):
        if b'Content-Disposition' not in part or b'\r\n\r\n' not in part:
            continue
        head, data = part.split(b'\r\n\r\n', 1)
        if b'filename=' in head:
            return data.rstrip(b'\r\n-')
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = 'FaktorizmOCR/2.0'

    def _send(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split('?')[0] == '/health':
            ready = get_engine() is not None
            info = engine_info() if ready else {'id': None, 'label': None}
            self._send(200 if ready else 503, {
                'ok': ready,
                'engine': info.get('label'),
                'engineId': info.get('id'),
                'engines': engines.available(),
                'pipeline': 'auto-engine + multi-variant + reread + rtl-reconstruct',
                'validation': {
                    'autoConfirm': AUTO_CONFIRM,
                    'reviewFloor': REVIEW_FLOOR,
                },
                'error': None if ready else (engine_error() or 'سرویس OCR در دسترس نیست'),
            })
        else:
            self._send(404, {'ok': False, 'error': 'not found'})

    def do_POST(self):
        if self.path.split('?')[0] != '/recognize':
            self._send(404, {'ok': False, 'error': 'not found'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY:
                self._send(413, {'ok': False, 'error': 'bad image size'})
                return
            body = self.rfile.read(length)
            ctype = self.headers.get('Content-Type', '')
            if ctype.startswith('multipart/form-data'):
                image = parse_multipart(body, ctype)
                if image is None:
                    self._send(400, {'ok': False, 'error': 'no file in multipart body'})
                    return
            else:
                image = body  # خام image/png | image/jpeg
            payload = recognize(image)
            self._send(200, {'ok': True, **payload})
        except Exception as exc:  # noqa: BLE001
            self._send(500, {'ok': False, 'error': f'{type(exc).__name__}: {exc}'})

    def log_message(self, fmt, *args):
        sys.stderr.write('[ocr-service] %s\n' % (fmt % args))


def main():
    print('[ocr-service] warming up OCR engine (auto) ...', flush=True)
    engine = get_engine()
    if engine is None:
        print('[ocr-service] FATAL: engine failed to load:', engine_error(), flush=True)
        sys.exit(2)
    print(f"[ocr-service] engine: {engine_info()}", flush=True)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'[ocr-service] ready on http://127.0.0.1:{PORT}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
