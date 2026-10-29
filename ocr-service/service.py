# -*- coding: utf-8 -*-
"""
سرویس OCR آفلاین فاکتوریزم — موتور PP-OCRv5 (RapidOCR / ONNX Runtime)

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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.environ.get('OCR_MODEL_DIR', os.path.join(BASE_DIR, 'models'))
PORT = int(os.environ.get('OCR_PORT', '8789'))
MAX_BODY = 25 * 1024 * 1024  # حداکثر ۲۵ مگابایت برای هر تصویر

# بارگذاری تنبل موتور تا /health پیش از آماده‌شدن هم پاسخ بدهد
_engine = None
_engine_error = None


def get_engine():
    global _engine, _engine_error
    if _engine is None and _engine_error is None:
        try:
            from rapidocr import RapidOCR
            _engine = RapidOCR(params={
                'Det.model_path': os.path.join(MODEL_DIR, 'PP-OCRv5_mobile_det.onnx'),
                'Cls.model_path': os.path.join(MODEL_DIR, 'cls.onnx'),
                'Rec.model_path': os.path.join(MODEL_DIR, 'arabic_PP-OCRv5_mobile_rec.onnx'),
                'Rec.rec_keys_path': os.path.join(MODEL_DIR, 'arabic_dict.txt'),
                # عرض بیشتر برای مبالغ بلند فاکتور تا رقم‌ها بریده نشوند
                'Rec.rec_img_shape': [3, 48, 640],
                # حفظ جزئیات اسکن‌های بزرگ (پیش‌فرض ۷۳۶ باعث از دست‌رفتن ستون‌ها می‌شد)
                'Det.limit_side_len': 1280,
            })
        except Exception as exc:  # noqa: BLE001 — خطا باید به کاربر گزارش شود
            _engine_error = f'{type(exc).__name__}: {exc}'
    return _engine


def reconstruct_rows(boxes, txts, scores):
    """جعبه‌های تک‌خطی را به ردیف‌های جدول تبدیل می‌کند (ترتیب راست‌به‌چپ)."""
    items = []
    for box, text, score in zip(boxes, txts, scores):
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append({
            'text': str(text),
            'score': round(float(score), 4),
            'box': [[round(float(x), 1), round(float(y), 1)] for x, y in box],
            'cy': sum(ys) / 4.0, 'ymin': min(ys), 'ymax': max(ys),
            'xmin': min(xs), 'xmax': max(xs),
        })
    items.sort(key=lambda i: i['ymin'])
    rows = []
    for it in items:
        for row in rows:
            # هم‌ردیف اگر بازه عمودی هم‌پوشانی قابل توجه داشته باشد
            if not (it['ymax'] < row['ymin'] - 6 or it['ymin'] > row['ymax'] + 6):
                row['items'].append(it)
                row['ymin'] = min(row['ymin'], it['ymin'])
                row['ymax'] = max(row['ymax'], it['ymax'])
                break
        else:
            rows.append({'ymin': it['ymin'], 'ymax': it['ymax'], 'items': [it]})

    lines = []
    for row in sorted(rows, key=lambda r: r['ymin']):
        ordered = sorted(row['items'], key=lambda i: -i['xmin'])  # راست‌ترین جعبه اول
        line_text = ' '.join(i['text'] for i in ordered)
        lines.append({
            'text': line_text,
            'confidence': round(sum(i['score'] for i in ordered) / len(ordered), 4),
            'boxes': [i['box'] for i in ordered],
        })
    return lines


def recognize(image_bytes):
    engine = get_engine()
    if engine is None:
        raise RuntimeError(_engine_error or 'OCR engine not ready')
    started = time.perf_counter()
    result = engine(image_bytes)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    if not result.txts:
        return {'lines': [], 'text': '', 'confidence': 0, 'elapsedMs': elapsed_ms}
    lines = reconstruct_rows(result.boxes, result.txts, result.scores)
    confidence = round(float(sum(result.scores) / len(result.scores)) * 100, 1)
    return {
        'lines': lines,
        'text': '\n'.join(line['text'] for line in lines),
        'confidence': confidence,
        'elapsedMs': elapsed_ms,
    }


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
    server_version = 'FaktorizmOCR/1.0'

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
            self._send(200 if ready else 503, {
                'ok': ready,
                'engine': 'RapidOCR PP-OCRv5 (arabic/persian, onnxruntime)',
                'error': None if ready else _engine_error,
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
                image = body  # خام image/png | image/jpeg | application/pdf(صفحه اول توسط پروکسی)
            payload = recognize(image)
            self._send(200, {'ok': True, **payload})
        except Exception as exc:  # noqa: BLE001
            self._send(500, {'ok': False, 'error': f'{type(exc).__name__}: {exc}'})

    def log_message(self, fmt, *args):
        sys.stderr.write('[ocr-service] %s\n' % (fmt % args))


def main():
    print('[ocr-service] warming up PP-OCRv5 engine ...', flush=True)
    engine = get_engine()
    if engine is None:
        print('[ocr-service] FATAL: engine failed to load:', _engine_error, flush=True)
        sys.exit(2)
    server = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'[ocr-service] ready on http://127.0.0.1:{PORT}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
