import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  Save, Printer, Trash2, Plus, Trash, CheckCircle2, FileText, ScanText, Image as ImageIcon,
  ShieldCheck, ChevronDown, X, Copy, Bot, AlertTriangle, Info, Maximize2, Share2, Workflow,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import MoneyInput from '@/components/MoneyInput';
import InvoiceSummary from '@/components/InvoiceSummary';
import {
  AttachmentsCard, PaymentPlanCard, HistoryCard, AutofixCard, VendorCard,
  DuplicateAlert, SuggestedItemsCard, ConfidenceBreakdown, DueDateCard,
} from '@/components/invoice/InvoicePanels';
import ItemIntelligence from '@/components/invoice/ItemIntelligence';
import { detectItems } from '@/lib/ocr/items';
import { logAudit, snapshot } from '@/lib/invoices/workflow';
import { learnFromInvoice } from '@/lib/vendors';
import { shareInvoiceText, exportInvoiceText } from '@/lib/exporters/documents';
import { Button, Card, CardTitle, Input, Textarea, Select, Label, Badge, Tabs, ConfidenceBar, EmptyState } from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { db } from '@/lib/db';
import { useAppStore } from '@/lib/store';
import {
  recalc, saveInvoice, softDeleteInvoice, computeTotals, itemNet, itemTax,
} from '@/lib/invoices';
import { printInvoice } from '@/lib/exporters/print';
import { uid, formatMoney, toFaDigits, cn, STATUS_META, PAYMENT_META } from '@/lib/utils';
import { toJalali, toISO, todayISO } from '@/lib/jalali';
import type { Invoice, InvoiceItem } from '@/lib/types';

function blankInvoice(taxRate: number, currency: 'IRR' | 'IRT'): Invoice {
  const now = new Date().toISOString();
  return {
    id: uid('inv_'),
    number: `FK-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    kind: 'invoice', direction: 'purchase', status: 'draft', paymentStatus: 'unpaid',
    issuerName: '', buyerName: '', date: todayISO(),
    items: [{ id: uid('itm_'), title: '', quantity: 1, unitPrice: 0, discount: 0, taxRate }],
    discountTotal: 0, taxTotal: 0, total: 0, category: 'خرید کالا', tags: [], note: '',
    currency, rawText: '', ocrConfidence: 0, fieldConfidence: {},
    fileName: '', fileType: '', thumbnail: '', pages: 0, source: 'manual',
    createdAt: now, updatedAt: now,
  };
}

export default function InvoiceEdit({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings } = useAppStore();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [tab, setTab] = useState('form');
  const [tagInput, setTagInput] = useState('');
  const [dateText, setDateText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const currencyLabel = (invoice?.currency ?? settings.currency) === 'IRR' ? 'ریال' : 'تومان';
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const firstRef = useRef(true);

  const products = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const contacts = useLiveQuery(() => db.contacts.toArray(), []) ?? [];

  useEffect(() => {
    if (mode === 'create') {
      setInvoice(blankInvoice(settings.defaultTaxRate, settings.currency));
      setDateText(toJalali(todayISO()));
      return;
    }
    db.invoices.get(id!).then((inv) => {
      if (!inv) { toast.error('فاکتور یافت نشد'); navigate('/invoices'); return; }
      setInvoice(inv);
      setDateText(toJalali(inv.date));
      if (inv.status === 'review') setTab('form');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  // ذخیره خودکار پیش‌نویس در حالت ویرایش
  useEffect(() => {
    if (!invoice || mode !== 'edit' || firstRef.current) { firstRef.current = false; return; }
    const t = setTimeout(async () => {
      await db.invoices.put({ ...invoice, updatedAt: new Date().toISOString() });
      setSavedAt(new Date());
    }, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

  const itemReview = useMemo(
    () => (invoice?.rawText?.trim() ? detectItems(invoice.rawText) : null),
    [invoice?.rawText],
  );

  const totals = useMemo(() => {
    if (!invoice) return null;
    const t = computeTotals(invoice.items);
    // مالیات و مبلغ سند ممکن است با جمع ردیف‌ها فرق داشته باشند؛ عدد سند مرجع نمایش است
    return { ...t, taxTotal: invoice.taxTotal, total: t.subtotal - t.discountTotal + invoice.taxTotal };
  }, [invoice]);

  if (!invoice || !totals) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}</div>;
  }

  const patch = (p: Partial<Invoice>) => setInvoice((prev) => recalc({ ...prev!, ...p }));

  const patchItem = (itemId: string, p: Partial<InvoiceItem>) => {
    patch({ items: invoice.items.map((it) => (it.id === itemId ? { ...it, ...p } : it)) });
  };

  const addItem = () => patch({
    items: [...invoice.items, { id: uid('itm_'), title: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: settings.defaultTaxRate }],
  });

  const removeItem = (itemId: string) =>
    patch({ items: invoice.items.filter((it) => it.id !== itemId) });

  const duplicateItem = (it: InvoiceItem) =>
    patch({ items: [...invoice.items, { ...it, id: uid('itm_') }] });

  const onSave = async (newStatus?: Invoice['status']) => {
    const toSave: Invoice = { ...invoice };
    if (newStatus) toSave.status = newStatus;
    if (!toSave.issuerName.trim()) {
      toast.warning('نام طرف حساب خالی است', { description: 'بهتر است فروشنده فاکتور مشخص باشد' });
    }
    if (mode === 'edit') await snapshot(invoice, 'پیش از ذخیره');
    await saveInvoice(toSave, mode === 'create' ? 'create' : 'edit');
    if (mode === 'create') {
      await logAudit(toSave.id, 'سند ایجاد شد', { to: toSave.status });
    } else if (newStatus && newStatus !== invoice.status) {
      await logAudit(toSave.id, 'وضعیت سند تغییر کرد', { from: invoice.status, to: newStatus });
    } else {
      await logAudit(toSave.id, 'سند ویرایش شد');
    }
    if (toSave.status === 'approved' && toSave.issuerName.trim()) {
      await learnFromInvoice(toSave);
    }
    toast.success(mode === 'create' ? 'فاکتور ثبت شد' : 'تغییرات ذخیره شد');
    if (mode === 'create') navigate(`/invoices/${toSave.id}`, { replace: true });
    setSavedAt(new Date());
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !invoice.tags.includes(t)) patch({ tags: [...invoice.tags, t] });
    setTagInput('');
  };

  const lowConfidenceFields = Object.entries(invoice.fieldConfidence).filter(([, v]) => v < 70);

  return (
    <div>
      <PageHeader
        title={mode === 'create' ? 'فاکتور جدید' : `ویرایش فاکتور ${invoice.number}`}
        subtitle={invoice.source === 'scan' ? `منبع: اسکن ${invoice.fileName}` : 'ثبت دستی'}
        icon={<FileText size={22} />}
        actions={
          <>
            {savedAt && <span className="text-[11px] text-muted-foreground hidden md:block">ذخیره خودکار: {toFaDigits(savedAt.toLocaleTimeString('fa-IR'))}</span>}
            <Button variant="outline" size="sm" onClick={() => printInvoice(invoice, settings)}><Printer size={15} /> چاپ / PDF</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              const result = await shareInvoiceText(invoice);
              if (result === 'shared') toast.success('خلاصه سند به اشتراک گذاشته شد');
              else if (result === 'copied') toast.success('خلاصه سند کپی شد', { description: 'در پیام‌رسان یا اکسل بچسبانید.' });
              else { exportInvoiceText(invoice); toast.success('فایل متنی سند ذخیره شد'); }
            }}>
              <Share2 size={15} /> اشتراک متن
            </Button>
            {mode === 'edit' && (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></Button>
            )}
            <Button size="sm" onClick={() => onSave()}><Save size={15} /> ذخیره</Button>
            {invoice.status !== 'approved' && (
              <Button variant="success" size="sm" onClick={() => onSave('approved')}><CheckCircle2 size={15} /> ذخیره و تایید</Button>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        {/* ستون فرم */}
        <div className="lg:col-span-2 space-y-5">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'form', label: 'اطلاعات فاکتور', icon: <FileText size={15} /> },
              { id: 'ocr', label: 'اقلام و متن OCR', icon: <ScanText size={15} /> },
              { id: 'workflow', label: 'پیگیری و گردش کار', icon: <Workflow size={15} /> },
            ]}
          />

          {tab === 'form' && (
            <>
              <DuplicateAlert invoice={invoice} onDismiss={() => undefined} />
              {itemReview && (itemReview.missing.length > 0 || itemReview.items.some((item) => item.needsReview)) && (
                <div className="card !p-4 flex items-start gap-3 bg-info-soft border-transparent animate-slide-up">
                  <ScanText size={20} className="text-info shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-info mb-1">هوش اقلام یک نکته دارد</p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {itemReview.items.filter((item) => item.needsReview).length > 0
                        && `${toFaDigits(itemReview.items.filter((item) => item.needsReview).length)} ردیف اطمینان کم دارد`}
                      {itemReview.items.filter((item) => item.needsReview).length > 0 && itemReview.missing.length > 0 && ' و '}
                      {itemReview.missing.length > 0 && 'به‌نظر یک ردیف در خوانش جا افتاده است'}
                      ؛ در زبانه «اقلام و متن OCR» می‌توانید نقش هر خط را ببینید و اصلاح کنید.
                    </p>
                    <button onClick={() => setTab('ocr')}
                      className="mt-1 text-[11px] font-bold text-primary hover:underline">
                      بررسی خط‌به‌خط اقلام
                    </button>
                  </div>
                </div>
              )}
              {lowConfidenceFields.length > 0 && (
                <div className="card !p-4 flex items-start gap-3 bg-warning-soft border-transparent animate-slide-up">
                  <ShieldCheck size={20} className="text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-warning mb-1">بازبینی هوشمند</p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {toFaDigits(lowConfidenceFields.length)} فیلد اطمینان کمتر از ۷۰٪ دارد و پیشنهاد می‌شود قبل از تایید چک شوند:
                      {' '}{lowConfidenceFields.map(([f]) => FIELD_LABELS[f] ?? f).join('، ')}
                    </p>
                  </div>
                </div>
              )}

              <Card>
                <CardTitle title="مشخصات سند" />
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="شماره فاکتور" confidence={invoice.fieldConfidence.number}>
                    <Input value={invoice.number} onChange={(e) => patch({ number: e.target.value })} />
                  </Field>
                  <Field label="تاریخ (شمسی)">
                    <Input value={dateText} onChange={(e) => {
                      setDateText(e.target.value);
                      const iso = toISO(e.target.value);
                      if (iso) patch({ date: iso });
                    }} placeholder="۱۴۰۳/۰۵/۱۲" />
                  </Field>
                  <Field label="نوع سند">
                    <Select value={invoice.kind} onChange={(e) => patch({ kind: e.target.value as Invoice['kind'] })}>
                      <option value="invoice">فاکتور</option>
                      <option value="receipt">رسید</option>
                      <option value="bill">قبض</option>
                    </Select>
                  </Field>
                  <Field label="جهت سند">
                    <Select value={invoice.direction} onChange={(e) => patch({ direction: e.target.value as Invoice['direction'] })}>
                      <option value="purchase">خرید (هزینه)</option>
                      <option value="sale">فروش (درآمد)</option>
                    </Select>
                  </Field>
                  <Field label="وضعیت سند">
                    <Select value={invoice.status} onChange={(e) => patch({ status: e.target.value as Invoice['status'] })}>
                      {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="وضعیت پرداخت">
                    <Select value={invoice.paymentStatus} onChange={(e) => patch({ paymentStatus: e.target.value as Invoice['paymentStatus'] })}>
                      {Object.entries(PAYMENT_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </Select>
                  </Field>
                </div>
              </Card>

              <Card>
                <CardTitle title="طرفین حساب" />
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="فروشنده / طرف حساب" confidence={invoice.fieldConfidence.issuerName}>
                    <Input list="contacts-list" value={invoice.issuerName}
                      onChange={(e) => patch({ issuerName: e.target.value })} placeholder="نام شرکت یا فروشگاه" />
                  </Field>
                  <Field label="خریدار" confidence={invoice.fieldConfidence.buyerName}>
                    <Input value={invoice.buyerName} onChange={(e) => patch({ buyerName: e.target.value })} />
                  </Field>
                  <Field label="دسته‌بندی">
                    <Input value={invoice.category} onChange={(e) => patch({ category: e.target.value })} list="category-list" />
                  </Field>
                  <Field label="واحد پول">
                    <Select value={invoice.currency} onChange={(e) => patch({ currency: e.target.value as 'IRR' | 'IRT' })}>
                      <option value="IRT">تومان</option>
                      <option value="IRR">ریال</option>
                    </Select>
                  </Field>
                  <Field label="مرکز هزینه / پروژه">
                    <Input list="cost-center-list" value={invoice.costCenter ?? ''}
                      onChange={(e) => patch({ costCenter: e.target.value })} placeholder="مثلاً شعبه مرکزی" />
                  </Field>
                </div>
                <datalist id="contacts-list">
                  {contacts.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
                <datalist id="cost-center-list">
                  {['شعبه مرکزی', 'انبار', 'تولید', 'اداری', 'فروش'].map((c) => <option key={c} value={c} />)}
                </datalist>
                <datalist id="category-list">
                  {['خرید کالا', 'مواد غذایی', 'لوازم اداری', 'الکترونیک', 'خدمات چاپ', 'حمل‌ونقل', 'ساختمانی', 'قبوض و خدمات'].map((c) =>
                    <option key={c} value={c} />)}
                </datalist>
              </Card>

              {/* اقلام */}
              <Card className="!p-0 overflow-hidden">
                <div className="p-5 pb-3 flex items-center justify-between">
                  <CardTitle title="اقلام فاکتور" sub={`${toFaDigits(invoice.items.length)} ردیف`} />
                  <Button size="sm" variant="outline" onClick={addItem}><Plus size={15} /> ردیف جدید</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground border-y border-border bg-muted/60">
                        <th className="p-3 text-center font-semibold w-10">#</th>
                        <th className="p-3 text-right font-semibold">شرح کالا / خدمت</th>
                        <th className="p-3 text-center font-semibold w-24">تعداد</th>
                        <th className="p-3 text-right font-semibold w-40">
                          قیمت واحد <span className="font-normal">({currencyLabel})</span>
                        </th>
                        <th className="p-3 text-right font-semibold w-36">
                          تخفیف <span className="font-normal">({currencyLabel})</span>
                        </th>
                        <th className="p-3 text-center font-semibold w-24">مالیات ٪</th>
                        <th className="p-3 text-left font-semibold w-40">مبلغ نهایی</th>
                        <th className="w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((it, idx) => (
                        <tr key={it.id} className="border-b border-border last:border-0 align-middle hover:bg-muted/30 transition-colors">
                          <td className="p-2 text-xs text-muted-foreground text-center tabular-nums">{toFaDigits(idx + 1)}</td>
                          <td className="p-2">
                            <Input list="products-list" className="!py-2" value={it.title}
                              onChange={(e) => patchItem(it.id, { title: e.target.value })} placeholder="نام کالا یا خدمت" />
                          </td>
                          <td className="p-2">
                            <Input type="number" min={0} className="!py-2 text-center tabular-nums" value={it.quantity}
                              onChange={(e) => patchItem(it.id, { quantity: Number(e.target.value) })} />
                          </td>
                          <td className="p-2">
                            <MoneyInput value={it.unitPrice} ariaLabel="قیمت واحد"
                              onChange={(v) => patchItem(it.id, { unitPrice: v })} />
                          </td>
                          <td className="p-2">
                            <MoneyInput value={it.discount} ariaLabel="تخفیف"
                              onChange={(v) => patchItem(it.id, { discount: v })} />
                          </td>
                          <td className="p-2">
                            <Select className="!py-2 text-center" value={it.taxRate}
                              onChange={(e) => patchItem(it.id, { taxRate: Number(e.target.value) })}>
                              {[0, 6, 9, 10].map((r) => <option key={r} value={r}>{toFaDigits(r)}٪</option>)}
                            </Select>
                          </td>
                          <td className="p-2 text-left font-bold text-[13px] whitespace-nowrap tabular-nums">
                            {formatMoney(itemNet(it) + itemTax(it), invoice.currency)}
                          </td>
                          <td className="p-2">
                            <div className="flex gap-0.5">
                              <button title="کپی ردیف" onClick={() => duplicateItem(it)}
                                className="icon-tile h-8 w-8 text-muted-foreground hover:bg-muted"><Copy size={14} /></button>
                              <button title="حذف ردیف" onClick={() => removeItem(it.id)}
                                className="icon-tile h-8 w-8 text-danger hover:bg-danger-soft"><Trash size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {invoice.items.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                            هنوز ردیفی ثبت نشده است؛ با دکمه «ردیف جدید» یا اسکن فاکتور شروع کنید.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 text-[13px]">
                        <td colSpan={6} className="p-3 text-left font-semibold text-muted-foreground">
                          جمع {toFaDigits(invoice.items.length)} ردیف
                        </td>
                        <td className="p-3 text-left font-extrabold tabular-nums">
                          {formatMoney(totals.total, invoice.currency)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <datalist id="products-list">
                  {products.map((p) => <option key={p.id} value={p.title}>{formatMoney(p.unitPrice, settings.currency)}</option>)}
                </datalist>
              </Card>

              <Card>
                <CardTitle title="یادداشت و برچسب‌ها" />
                <div className="flex gap-2 mb-3">
                  <Input placeholder="برچسب جدید مثلا: ضروری" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                  <Button variant="outline" onClick={addTag}><Plus size={16} /></Button>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {invoice.tags.map((t) => (
                    <Badge key={t} className="bg-primary-soft text-primary !text-xs !py-1 !px-3">
                      {t}
                      <button onClick={() => patch({ tags: invoice.tags.filter((x) => x !== t) })} className="mr-1 opacity-70 hover:opacity-100"><X size={12} /></button>
                    </Badge>
                  ))}
                  {invoice.tags.length === 0 && <span className="text-xs text-muted-foreground">هنوز برچسبی اضافه نشده است</span>}
                </div>
                <Textarea rows={3} placeholder="یادداشت داخلی این فاکتور…" value={invoice.note}
                  onChange={(e) => patch({ note: e.target.value })} />
              </Card>
            </>
          )}

          {tab === 'ocr' && (
            <div className="space-y-5">
              <InvoiceSummary invoice={invoice} />

              <Card>
                <CardTitle title="اقلام خوانده‌شده از سند"
                  sub={`${toFaDigits(invoice.items.length)} ردیف · فهمیده‌شده از متن سند`}
                  icon={<ScanText size={18} />}
                  action={invoice.ocrConfidence > 0 ? <ConfidenceBar value={invoice.ocrConfidence} /> : undefined} />
                {invoice.items.length ? (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full min-w-[720px] text-[13px]">
                      <thead>
                        <tr className="text-[11px] text-muted-foreground border-b border-border">
                          <th className="py-2 px-2 text-right font-semibold">شرح کالا / خدمت</th>
                          <th className="py-2 px-2 text-center font-semibold w-20">تعداد</th>
                          <th className="py-2 px-2 text-left font-semibold w-32">قیمت واحد</th>
                          <th className="py-2 px-2 text-left font-semibold w-28">تخفیف</th>
                          <th className="py-2 px-2 text-center font-semibold w-20">مالیات</th>
                          <th className="py-2 px-2 text-left font-semibold w-32">مبلغ نهایی</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoice.items.map((it) => (
                          <tr key={it.id} className="border-b border-border/60 last:border-0">
                            <td className="py-2 px-2 text-right">{it.title || '—'}</td>
                            <td className="py-2 px-2 text-center tabular-nums">{toFaDigits(it.quantity)}</td>
                            <td className="py-2 px-2 text-left tabular-nums">{formatMoney(it.unitPrice, invoice.currency)}</td>
                            <td className="py-2 px-2 text-left tabular-nums text-muted-foreground">
                              {it.discount ? formatMoney(it.discount, invoice.currency) : '—'}
                            </td>
                            <td className="py-2 px-2 text-center tabular-nums">{toFaDigits(it.taxRate)}٪</td>
                            <td className="py-2 px-2 text-left font-bold tabular-nums">
                              {formatMoney(itemNet(it) + itemTax(it), invoice.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border bg-muted/40">
                          <td className="py-2.5 px-2 text-left font-semibold text-muted-foreground" colSpan={5}>
                            مبلغ قابل پرداخت سند
                          </td>
                          <td className="py-2.5 px-2 text-left font-extrabold tabular-nums">
                            {formatMoney(invoice.total, invoice.currency)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <EmptyState icon={<ScanText size={26} />} title="ردیفی خوانده نشد"
                    desc="اگر تصویر تار است، سند را دوباره و با کیفیت بالاتر اسکن کنید." />
                )}
              </Card>

              <ItemIntelligence invoice={invoice} onApply={(items) => {
                patch({ items });
                toast.success('اقلام بازسازی شد', { description: `${items.length} ردیف از روی تحلیل خطوط متن` });
              }} />

              <Card>
                <CardTitle title="متن خام خوانده‌شده"
                  sub="همان چیزی که موتور از تصویر دیده است؛ برای مقایسه و بازبینی"
                  icon={<FileText size={18} />}
                  action={(
                    <button onClick={() => setShowRaw((v) => !v)}
                      className="text-[11px] font-semibold text-primary hover:underline">
                      {showRaw ? 'پنهان کردن' : 'نمایش متن'}
                    </button>
                  )} />
                {showRaw ? (
                  invoice.rawText ? (
                    <pre dir="auto" className="whitespace-pre-wrap text-xs leading-7 bg-muted rounded-xl p-4 max-h-[420px] overflow-y-auto font-sans">
                      {invoice.rawText}
                    </pre>
                  ) : (
                    <EmptyState icon={<ScanText size={26} />} title="متن OCR موجود نیست"
                      desc="فاکتورهای اسکن‌شده متن خام شناسایی‌شده را اینجا نگه می‌دارند." />
                  )
                ) : (
                  <p className="text-xs text-muted-foreground leading-6">
                    متن خام برای بازبینی در دسترس است؛ برای جدول خوانا از بخش «اقلام فاکتور» استفاده کنید.
                  </p>
                )}
              </Card>

              <AutofixCard
                invoice={invoice}
                onApplyText={(text) => {
                  setInvoice((prev) => prev ? { ...prev, rawText: text, updatedAt: new Date().toISOString() } : prev);
                  void logAudit(invoice.id, 'متن خام اصلاح شد');
                }}
              />
            </div>
          )}

          {tab === 'workflow' && (
            <div className="space-y-5">
              <DuplicateAlert invoice={invoice} onDismiss={() => undefined} />
              {itemReview && (itemReview.missing.length > 0 || itemReview.items.some((item) => item.needsReview)) && (
                <div className="card !p-4 flex items-start gap-3 bg-info-soft border-transparent animate-slide-up">
                  <ScanText size={20} className="text-info shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-info mb-1">هوش اقلام یک نکته دارد</p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {itemReview.items.filter((item) => item.needsReview).length > 0
                        && `${toFaDigits(itemReview.items.filter((item) => item.needsReview).length)} ردیف اطمینان کم دارد`}
                      {itemReview.items.filter((item) => item.needsReview).length > 0 && itemReview.missing.length > 0 && ' و '}
                      {itemReview.missing.length > 0 && 'به‌نظر یک ردیف در خوانش جا افتاده است'}
                      ؛ در زبانه «اقلام و متن OCR» می‌توانید نقش هر خط را ببینید و اصلاح کنید.
                    </p>
                    <button onClick={() => setTab('ocr')}
                      className="mt-1 text-[11px] font-bold text-primary hover:underline">
                      بررسی خط‌به‌خط اقلام
                    </button>
                  </div>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <ConfidenceBreakdown invoice={invoice} />
                <DueDateCard invoice={invoice} onChange={(dateText) => patch({ dueDate: dateText || undefined })} />
              </div>

              <PaymentPlanCard invoice={invoice} />
              <HistoryCard invoice={invoice} onRestored={(restored) => { setInvoice(restored); setDateText(toJalali(restored.date)); }} />
              <AttachmentsCard invoice={invoice} onChange={(attachments) => patch({ attachments })} />
              <VendorCard invoice={invoice} onApply={(p) => patch(p)} />
              <SuggestedItemsCard
                invoice={invoice}
                onAdd={(product) => {
                  patch({
                    items: [...invoice.items, {
                      id: uid('itm_'), title: product.title, quantity: 1,
                      unitPrice: product.unitPrice, discount: 0, taxRate: product.taxRate,
                    }],
                  });
                  toast.success('کالا اضافه شد');
                }}
              />
            </div>
          )}
        </div>

        {/* ستون کناری */}
        <div className="space-y-5">
          {invoice.source === 'scan' && assistantOpen && (
            <Card className="!p-4 border-primary/30 animate-slide-up">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                    <Bot size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-extrabold">دستیار خوانش فاکتور</p>
                    <p className="text-[11px] text-muted-foreground">تحلیل کاملاً آفلاین روی همین دستگاه</p>
                  </div>
                </div>
                <button onClick={() => setAssistantOpen(false)} title="بستن"
                  className="icon-tile h-7 w-7 text-muted-foreground hover:bg-muted"><X size={14} /></button>
              </div>

              <div className="flex items-center gap-3 mb-3">
                <ConfidenceBar value={invoice.ocrConfidence} />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  اطمینان {toFaDigits(invoice.ocrConfidence)}٪
                </span>
              </div>

              {lowConfidenceFields.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-bold text-muted-foreground mb-1.5">فیلدهای نیازمند بازبینی</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lowConfidenceFields.map(([f, v]) => (
                      <span key={f}
                        className={cn('text-[11px] px-2 py-0.5 rounded-full border',
                          v >= 55 ? 'bg-warning-soft text-warning border-transparent'
                            : 'bg-danger-soft text-danger border-transparent')}>
                        {FIELD_LABELS[f] ?? f} · {toFaDigits(v)}٪
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {(invoice.ocrWarnings?.length ?? 0) > 0 ? (
                <ul className="space-y-2">
                  {invoice.ocrWarnings!.map((w, i) => {
                    const isInfo = /محاسبه شد|تصحیح شد/.test(w);
                    return (
                      <li key={i} className="flex items-start gap-2 text-xs leading-6">
                        {isInfo
                          ? <Info size={15} className="text-info shrink-0 mt-1" />
                          : <AlertTriangle size={15} className="text-warning shrink-0 mt-1" />}
                        <span className="text-foreground/90">{w}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs leading-6 text-accent flex items-start gap-2">
                  <CheckCircle2 size={15} className="shrink-0 mt-1" />
                  همه مبالغ و فیلدها با هم سازگارند؛ مورد مشکوکی برای بازبینی پیدا نشد.
                </p>
              )}
            </Card>
          )}

          <Card>
            <CardTitle title="پیش‌نمایش سند" icon={<ImageIcon size={18} />} />
            {invoice.thumbnail ? (
              <button
                onClick={() => setZoom(true)}
                className="block w-full rounded-xl overflow-hidden border border-border group relative"
                title="بزرگ‌نمایی سند"
              >
                <img src={invoice.thumbnail} alt="سند" className="w-full object-cover group-hover:scale-[1.02] transition-transform" />
                <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-semibold text-white">
                  <Maximize2 size={12} /> بزرگ‌نمایی
                </span>
              </button>
            ) : (
              <div className="rounded-xl bg-muted h-44 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileText size={28} />
                <span className="text-xs">سند دستی بدون تصویر</span>
              </div>
            )}
            {invoice.pages > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2 text-center">{toFaDigits(invoice.pages)} صفحه · {invoice.fileName}</p>
            )}
          </Card>

          {zoom && invoice.thumbnail && (
            <div
              className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4"
              onClick={() => setZoom(false)}
              role="dialog"
              aria-modal="true"
            >
              <div className="relative max-h-full max-w-5xl overflow-auto rounded-2xl bg-white p-2 shadow-2xl">
                <img src={invoice.thumbnail} alt="سند" className="max-h-[85vh] w-auto" />
                <button
                  onClick={() => setZoom(false)}
                  className="absolute left-3 top-3 rounded-lg bg-black/70 p-2 text-white"
                  title="بستن"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          <Card>
            <CardTitle title="جمع‌بندی مالی" />
            <div className="space-y-2.5 text-sm">
              <SumRow label="جمع کل اقلام" value={formatMoney(totals.subtotal, invoice.currency)} />
              <SumRow label="جمع تخفیف" value={formatMoney(totals.discountTotal, invoice.currency)} tone="text-warning" />
              <SumRow label="مالیات بر ارزش افزوده" value={formatMoney(totals.taxTotal, invoice.currency)} tone="text-info" />
              <div className="border-t border-border pt-3 mt-3 flex items-center justify-between">
                <span className="font-extrabold">مبلغ قابل پرداخت</span>
                <span className="font-extrabold text-base gradient-text">{formatMoney(totals.total, invoice.currency)}</span>
              </div>
              {invoice.documentTotal !== undefined && invoice.documentTotal > 0 && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-muted-foreground">مبلغ نهایی چاپ‌شده روی سند</span>
                  <button
                    onClick={() => setInvoice((prev) => { const next = { ...prev!, documentTotal: undefined }; return recalc(next); })}
                    title="اگر مبلغ سند اشتباه خوانده شده، حذفش کنید تا جمع ردیف‌ها ملاک شود"
                    className="font-bold tabular-nums text-primary hover:underline"
                  >
                    {formatMoney(invoice.documentTotal, invoice.currency)}
                  </button>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">وضعیت فعلی</span>
                <Badge className={STATUS_META[invoice.status].chipClass}>{STATUS_META[invoice.status].label}</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">اطمینان استخراج</span>
                {invoice.ocrConfidence > 0 ? <ConfidenceBar value={invoice.ocrConfidence} /> : <span>دستی</span>}
              </div>
            </div>
            <Button variant="outline" className="w-full mt-4" onClick={() => printInvoice(invoice, settings)}>
              <Printer size={16} /> چاپ فاکتور / خروجی PDF
            </Button>
          </Card>

          <Card className="!p-4">
            <div className="flex items-start gap-2.5">
              <ChevronDown size={16} className="text-muted-foreground mt-0.5" />
              <p className="text-[11px] leading-6 text-muted-foreground">
                تغییرات در حالت ویرایش هر ۲.۵ ثانیه به‌صورت خودکار ذخیره می‌شوند. اقلام جدید به دفتر کالا و طرف حساب جدید به دفتر طرفین اضافه می‌شود.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="حذف فاکتور"
        message="این فاکتور به سطل بازیافت منتقل می‌شود و از فهرست اصلی کنار می‌رود."
        onConfirm={async () => {
          await softDeleteInvoice(invoice.id);
          setConfirmDelete(false);
          toast.success('فاکتور به سطل بازیافت منتقل شد');
          navigate('/invoices');
        }}
      />
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  number: 'شماره فاکتور', date: 'تاریخ', issuerName: 'فروشنده', buyerName: 'خریدار',
  total: 'مبلغ کل', taxTotal: 'مالیات', discountTotal: 'تخفیف', items: 'اقلام',
};

function Field({ label, children, confidence }: { label: string; children: React.ReactNode; confidence?: number }) {
  return (
    <div>
      <Label>
        <span className="inline-flex items-center gap-1.5">
          {label}
          {confidence !== undefined && (
            <span title={`اطمینان ${confidence}٪`}
              className={cn('h-1.5 w-1.5 rounded-full', confidence >= 80 ? 'bg-accent' : confidence >= 55 ? 'bg-warning' : 'bg-danger')} />
          )}
        </span>
      </Label>
      {children}
    </div>
  );
}

function SumRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-semibold text-[13px]', tone)}>{value}</span>
    </div>
  );
}
