import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function renderPdfPages(file: Blob, scale = 2): Promise<HTMLCanvasElement[]> {
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const pages: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    pages.push(canvas);
  }
  await loadingTask.destroy();
  return pages;
}

export function isPdf(file: { type: string; name: string }): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function isImage(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/')
    || /\.(jpe?g|png|webp|bmp|gif|hei[cf]|tiff?|avif)$/i.test(file.name);
}

/** فرمت‌هایی که مرورگرها معمولاً خودشان رمزگشایی نمی‌کنند */
export function isExoticImage(file: { type: string; name: string }): boolean {
  return /\.(hei[cf]|tiff?)$/i.test(file.name) || /heic|heif|tiff?/i.test(file.type);
}
