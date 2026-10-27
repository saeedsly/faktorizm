import type { Invoice, AppSettings } from '../types';
import { formatMoney, toFaDigits } from '../utils';
import { toJalali } from '../jalali';
import { itemNet, itemTax } from '../invoices';

const BASE_STYLES = `
  * { font-family: 'Vazirmatn Variable', Vazirmatn, Tahoma, 'Segoe UI', sans-serif; box-sizing: border-box; }
  body { direction: rtl; color: #0f172a; margin: 0; padding: 32px; background: #fff; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6d5efc; padding-bottom: 16px; margin-bottom: 20px; }
  h1 { font-size: 22px; margin: 0 0 6px; color: #4c3fdb; }
  .muted { color: #64748b; font-size: 12px; }
  .badge { display:inline-block; padding: 4px 12px; border-radius: 999px; background: #ece9ff; color: #5b4de0; font-size: 12px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin: 18px 0; }
  .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; }
  .field .k { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .field .v { font-size: 14px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
  th { background: #6d5efc; color: #fff; padding: 10px; text-align: right; }
  td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) td { background: #fafbff; }
  .totals { margin-top: 18px; width: 340px; margin-inline-start: auto; }
  .totals .row { display: flex; justify-content: space-between; padding: 7px 4px; font-size: 13px; border-bottom: 1px dashed #cbd5e1; }
  .totals .grand { font-size: 17px; font-weight: 800; color: #4c3fdb; border-bottom: none; padding-top: 12px; }
  .footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
  @media print { body { padding: 8px; } .no-print { display:none } }
`;

export function printInvoice(invoice: Invoice, settings: AppSettings): void {
  const win = window.open('', '_blank', 'width=900,height=750');
  if (!win) return;

  const rows = invoice.items.map((it, i) => `
    <tr>
      <td>${toFaDigits(i + 1)}</td>
      <td>${escapeHtml(it.title)}</td>
      <td>${toFaDigits(it.quantity)}</td>
      <td>${toFaDigits(new Intl.NumberFormat('en-US').format(it.unitPrice))}</td>
      <td>${toFaDigits(new Intl.NumberFormat('en-US').format(it.discount))}</td>
      <td>${toFaDigits(it.taxRate)}٪</td>
      <td>${toFaDigits(new Intl.NumberFormat('en-US').format(itemNet(it) + itemTax(it)))}</td>
    </tr>`).join('');

  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <title>فاکتور ${escapeHtml(invoice.number)}</title><style>${BASE_STYLES}</style></head><body>
  <div class="head">
    <div>
      <h1>${escapeHtml(settings.businessName)}</h1>
      <div class="muted">${escapeHtml(settings.businessAddress || 'تهران، ایران')} ${settings.businessPhone ? '— ' + escapeHtml(settings.businessPhone) : ''}</div>
      ${settings.businessEconomicCode ? `<div class="muted">کد اقتصادی: ${escapeHtml(settings.businessEconomicCode)}</div>` : ''}
    </div>
    <div style="text-align:left">
      <div class="badge">فاکتور فروش</div>
      <div class="muted" style="margin-top:8px">شماره: <b>${escapeHtml(invoice.number)}</b></div>
      <div class="muted">تاریخ: ${toJalali(invoice.date, 'yyyy/MM/dd')}</div>
    </div>
  </div>
  <div class="grid">
    <div class="field"><div class="k">فروشنده / طرف حساب</div><div class="v">${escapeHtml(invoice.issuerName || '—')}</div></div>
    <div class="field"><div class="k">خریدار</div><div class="v">${escapeHtml(invoice.buyerName || '—')}</div></div>
    <div class="field"><div class="k">دسته‌بندی</div><div class="v">${escapeHtml(invoice.category)}</div></div>
    <div class="field"><div class="k">وضعیت پرداخت</div><div class="v">${invoice.paymentStatus === 'paid' ? 'پرداخت شده' : invoice.paymentStatus === 'partial' ? 'پیش‌پرداخت' : 'پرداخت نشده'}</div></div>
  </div>
  <table>
    <thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>مالیات</th><th>مبلغ نهایی</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">موردی ثبت نشده است</td></tr>'}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>جمع تخفیف</span><b>${formatMoney(invoice.discountTotal, invoice.currency)}</b></div>
    <div class="row"><span>مالیات بر ارزش افزوده</span><b>${formatMoney(invoice.taxTotal, invoice.currency)}</b></div>
    <div class="row grand"><span>مبلغ قابل پرداخت</span><b>${formatMoney(invoice.total, invoice.currency)}</b></div>
  </div>
  <div class="footer"><span>سامانه فاکتوریزم — صادر شده در ${toJalali(new Date().toISOString(), 'yyyy/MM/dd HH:mm')}</span><span>${escapeHtml(invoice.fileName)}</span></div>
  <script>window.onload=()=>{setTimeout(()=>window.print(),350)}</script>
  </body></html>`;

  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
