import * as XLSX from 'xlsx';
import type { Invoice } from '../types';
import { toLatinDigits, formatNumber } from '../utils';
import { toJalali } from '../jalali';

export type AccountingSoftware = 'generic' | 'sepidar' | 'hamkaran' | 'rayvarz' | 'parsian';

export const SOFTWARE_LABELS: Record<AccountingSoftware, string> = {
  generic: 'اکسل استاندارد فاکتوریزم',
  sepidar: 'سپیدار سیستم',
  hamkaran: 'همکاران سیستم',
  rayvarz: 'رایورز',
  parsian: 'پارسیان',
};

function rtlSheet(ws: XLSX.WorkSheet): XLSX.WorkSheet {
  ws['!views'] = [{ RTL: true }];
  return ws;
}

function setWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map((w) => ({ wch: w }));
}

/** شیت اصلی فاکتورها */
function invoicesSheet(invoices: Invoice[]): XLSX.WorkSheet {
  const rows = invoices.map((inv) => ({
    'شناسه': inv.id,
    'شماره فاکتور': inv.number,
    'نوع سند': inv.kind === 'invoice' ? 'فاکتور' : inv.kind === 'receipt' ? 'رسید' : 'قبض',
    'تاریخ شمسی': toJalali(inv.date),
    'تاریخ میلادی': inv.date,
    'فروشنده / طرف حساب': inv.issuerName,
    'خریدار': inv.buyerName,
    'دسته‌بندی': inv.category,
    'تعداد اقلام': inv.items.length,
    'جمع تخفیف': inv.discountTotal,
    'مالیات بر ارزش افزوده': inv.taxTotal,
    'مبلغ کل': inv.total,
    'واحد پول': inv.currency === 'IRR' ? 'ریال' : 'تومان',
    'وضعیت': inv.status,
    'وضعیت پرداخت': inv.paymentStatus,
    'درصد اطمینان OCR': inv.ocrConfidence,
    'برچسب‌ها': inv.tags.join('، '),
    'یادداشت': inv.note,
    'فایل اصلی': inv.fileName,
  }));
  const ws = rtlSheet(XLSX.utils.json_to_sheet(rows));
  setWidths(ws, [12, 16, 10, 14, 14, 28, 22, 16, 10, 14, 18, 16, 10, 12, 14, 14, 16, 24, 22]);
  return ws;
}

/** شیت اقلام تفکیکی */
function itemsSheet(invoices: Invoice[]): XLSX.WorkSheet {
  const rows = invoices.flatMap((inv) =>
    inv.items.map((it, i) => ({
      'شماره فاکتور': inv.number,
      'تاریخ': toJalali(inv.date),
      'فروشنده': inv.issuerName,
      'ردیف': i + 1,
      'شرح کالا / خدمت': it.title,
      'تعداد': it.quantity,
      'قیمت واحد': it.unitPrice,
      'تخفیف ردیف': it.discount,
      'درصد مالیات': it.taxRate,
      'مبلغ خالص': it.quantity * it.unitPrice - it.discount,
      'مالیات ردیف': Math.round((it.quantity * it.unitPrice - it.discount) * (it.taxRate / 100)),
      'مبلغ نهایی ردیف': Math.round((it.quantity * it.unitPrice - it.discount) * (1 + it.taxRate / 100)),
    })),
  );
  const ws = rtlSheet(XLSX.utils.json_to_sheet(rows));
  setWidths(ws, [16, 14, 26, 8, 34, 10, 14, 12, 12, 16, 14, 16]);
  return ws;
}

function summarySheet(invoices: Invoice[]): XLSX.WorkSheet {
  const total = invoices.reduce((s, i) => s + i.total, 0);
  const tax = invoices.reduce((s, i) => s + i.taxTotal, 0);
  const discount = invoices.reduce((s, i) => s + i.discountTotal, 0);
  const rows = [
    { شاخص: 'تعداد فاکتور', مقدار: toLatinDigits(String(invoices.length)) },
    { شاخص: 'مجموع مبالغ', مقدار: total },
    { شاخص: 'مجموع مالیات بر ارزش افزوده', مقدار: tax },
    { شاخص: 'مجموع تخفیف', مقدار: discount },
    { شاخص: 'تعداد اقلام', مقدار: invoices.reduce((s, i) => s + i.items.length, 0) },
    { شاخص: 'میانگین مبلغ هر فاکتور', مقدار: invoices.length ? Math.round(total / invoices.length) : 0 },
  ];
  const ws = rtlSheet(XLSX.utils.json_to_sheet(rows));
  setWidths(ws, [34, 20]);
  return ws;
}

/** شیت قالب مخصوص نرم‌افزار حسابداری */
function templateSheet(invoices: Invoice[], software: AccountingSoftware): XLSX.WorkSheet {
  let rows: Record<string, unknown>[] = [];

  if (software === 'sepidar') {
    rows = invoices.flatMap((inv) =>
      inv.items.map((it) => ({
        'تاریخ سند': toJalali(inv.date),
        'شماره فاکتور': inv.number,
        'طرف حساب': inv.issuerName,
        'کد کالا': '',
        'شرح کالا/خدمات': it.title,
        'تعداد': it.quantity,
        'واحد سنجش': 'عدد',
        'مبلغ واحد': it.unitPrice,
        'تخفیف': it.discount,
        'درصد مالیات': it.taxRate,
        'مبلغ مالیات': Math.round((it.quantity * it.unitPrice - it.discount) * it.taxRate / 100),
        'مبلغ کل': Math.round((it.quantity * it.unitPrice - it.discount) * (1 + it.taxRate / 100)),
      })),
    );
  } else if (software === 'hamkaran') {
    rows = invoices.map((inv) => ({
      'تاریخ سند': toJalali(inv.date),
      'شماره فاکتور': inv.number,
      'کد طرف حساب': inv.contactId ?? '',
      'نام طرف حساب': inv.issuerName,
      'شرح سند': `فاکتور خرید ${inv.number}`,
      'بدهکار (ریال)': inv.total * (inv.currency === 'IRT' ? 10 : 1),
      'بستانکار (ریال)': 0,
      'مالیات': inv.taxTotal,
    }));
  } else if (software === 'rayvarz') {
    rows = invoices.flatMap((inv) =>
      inv.items.map((it, i) => ({
        'ردیف': i + 1,
        'تاریخ': toJalali(inv.date),
        'شماره فاکتور': inv.number,
        'فروشنده': inv.issuerName,
        'کالا/خدمات': it.title,
        'تعداد': it.quantity,
        'قیمت واحد': it.unitPrice,
        'جمع کل': it.quantity * it.unitPrice,
        'مالیات ارزش افزوده': Math.round((it.quantity * it.unitPrice) * it.taxRate / 100),
        'مبلغ نهایی': inv.total,
      })),
    );
  } else if (software === 'parsian') {
    rows = invoices.map((inv) => ({
      'InvoiceDate': toJalali(inv.date),
      'InvoiceNo': inv.number,
      'Supplier': inv.issuerName,
      'ItemCount': inv.items.length,
      'Subtotal': inv.total - inv.taxTotal,
      'VAT': inv.taxTotal,
      'Discount': inv.discountTotal,
      'TotalAmount': inv.total,
      'Currency': inv.currency,
      'PaymentStatus': inv.paymentStatus,
    }));
  }
  const ws = rtlSheet(XLSX.utils.json_to_sheet(rows));
  setWidths(ws, Object.keys(rows[0] ?? { '': '' }).map(() => 18));
  return ws;
}

export function exportInvoicesXlsx(invoices: Invoice[], software: AccountingSoftware = 'generic'): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, invoicesSheet(invoices), 'فاکتورها');
  XLSX.utils.book_append_sheet(wb, itemsSheet(invoices), 'اقلام');
  XLSX.utils.book_append_sheet(wb, summarySheet(invoices), 'خلاصه');
  if (software !== 'generic') {
    XLSX.utils.book_append_sheet(wb, templateSheet(invoices, software), `قالب ${SOFTWARE_LABELS[software]}`.slice(0, 28));
  }
  const stamp = toJalali(new Date().toISOString(), 'yyyyMMdd-HHmm');
  XLSX.writeFile(wb, `faktorizm-${toLatinDigits(stamp)}.xlsx`, { bookType: 'xlsx', compression: true });
}

export function invoicesToCsv(invoices: Invoice[]): string {
  const header = ['شماره فاکتور', 'تاریخ', 'فروشنده', 'تعداد اقلام', 'تخفیف', 'مالیات', 'مبلغ کل', 'وضعیت'];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  for (const inv of invoices) {
    lines.push([
      inv.number, toJalali(inv.date), inv.issuerName, inv.items.length,
      inv.discountTotal, inv.taxTotal, inv.total, inv.status,
    ].map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

export function exportInvoicesCsv(invoices: Invoice[]): void {
  const blob = new Blob([invoicesToCsv(invoices)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `faktorizm-${formatNumber(Date.now(), false)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
