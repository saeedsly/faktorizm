import { useMemo, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  ReceiptText, Plus, Search, Trash2, RotateCcw, FileSpreadsheet, FileCog, CheckCheck,
  Archive, PencilLine, FilterX, FileText, Sparkles, BookmarkPlus, Bookmark, CopyCheck,
  ArrowUpDown, Wallet, Braces, Layers, ScanSearch, TriangleAlert,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button, Badge, EmptyState, Select, Input, ConfidenceBar, Tabs, Modal } from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { db } from '@/lib/db';
import { STATUS_META, PAYMENT_META, formatMoney, toFaDigits, cn } from '@/lib/utils';
import { toJalali, toISO } from '@/lib/jalali';
import { softDeleteInvoice, restoreInvoice, permanentDelete, setStatus, setPaymentStatus, payableOf } from '@/lib/invoices';
import { logAudit } from '@/lib/invoices/workflow';
import { exportInvoicesXlsx, exportInvoicesCsv } from '@/lib/exporters/excel';
import { exportInvoicesJson } from '@/lib/exporters/documents';
import { parseQuery, matchesQuery } from '@/lib/invoices/insights';
import type { SmartQuery } from '@/lib/invoices/insights';
import { findDuplicates } from '@/lib/ocr/fingerprint';
import type { Invoice, InvoiceStatus } from '@/lib/types';

const TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'همه' },
  { id: 'review', label: 'در انتظار بازبینی' },
  { id: 'approved', label: 'تایید شده' },
  { id: 'rejected', label: 'رد شده' },
  { id: 'draft', label: 'پیش‌نویس' },
  { id: 'archived', label: 'آرشیو' },
  { id: 'trash', label: 'سطل بازیافت' },
];

type SortKey = 'date' | 'total' | 'issuer' | 'number';

interface SavedView { id: string; name: string; query: string; tab: string }

const VIEWS_KEY = 'faktorizm:saved-views';

function loadViews(): SavedView[] {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]') as SavedView[];
  } catch {
    return [];
  }
}

export default function Invoices() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') ?? 'all');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [payment, setPayment] = useState('all');
  const [costCenter, setCostCenter] = useState('all');
  const [sort, setSort] = useState<SortKey>('date');
  const [asc, setAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [views, setViews] = useState<SavedView[]>(loadViews);
  const [dupOpen, setDupOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ id?: string; kind: 'delete' | 'purge' | null }>({ kind: null });
  const perPage = 10;

  useEffect(() => {
    setTab(params.get('tab') ?? 'all');
    const urlQ = params.get('q');
    if (urlQ) setQ(urlQ);
  }, [params]);

  const all = useLiveQuery(() => db.invoices.orderBy('updatedAt').reverse().toArray(), []);

  const smart: SmartQuery = useMemo(() => parseQuery(q), [q]);

  const costCenters = useMemo(
    () => Array.from(new Set((all ?? []).map((i) => i.costCenter).filter((v): v is string => !!v))),
    [all],
  );

  const duplicates = useMemo(() => {
    if (!all) return [];
    return findDuplicates(all.filter((i) => !i.deletedAt).map((i) => ({
      id: i.id, number: i.number, issuerName: i.issuerName, date: i.date, total: payableOf(i),
    })));
  }, [all]);

  const filtered = useMemo(() => {
    if (!all) return undefined;
    let rows = all.filter((i) => (tab === 'trash' ? !!i.deletedAt : !i.deletedAt));
    if (tab !== 'all' && tab !== 'trash') rows = rows.filter((i) => i.status === (tab as InvoiceStatus));
    if (payment !== 'all') rows = rows.filter((i) => i.paymentStatus === payment);
    if (costCenter !== 'all') rows = rows.filter((i) => (i.costCenter ?? '') === costCenter);
    if (q.trim()) rows = rows.filter((i) => matchesQuery(i, smart));
    const fromIso = toISO(params.get('from') ?? '');
    const toIso = toISO(params.get('to') ?? '');
    if (fromIso) rows = rows.filter((i) => i.date >= fromIso);
    if (toIso) rows = rows.filter((i) => i.date <= toIso);
    const sorted = [...rows].sort((a, b) => {
      let diff = 0;
      if (sort === 'date') diff = a.date.localeCompare(b.date);
      else if (sort === 'total') diff = payableOf(a) - payableOf(b);
      else if (sort === 'issuer') diff = a.issuerName.localeCompare(b.issuerName, 'fa');
      else diff = a.number.localeCompare(b.number, 'fa');
      return asc ? diff : -diff;
    });
    return sorted;
  }, [all, tab, payment, costCenter, q, smart, sort, asc, params]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab, payment, q, params, costCenter, sort, asc]);

  const totalPages = Math.max(1, Math.ceil((filtered?.length ?? 0) / perPage));
  const pageRows = filtered?.slice((page - 1) * perPage, page * perPage) ?? [];
  const inTrash = tab === 'trash';

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(() => new Set(allChecked ? [] : pageRows.map((r) => r.id)));
  const selectedRows = (filtered ?? []).filter((r) => selected.has(r.id));

  const resetFilters = () => {
    setPayment('all'); setCostCenter('all'); setQ(''); setParams({});
  };

  const bulk = useCallback(async (action: 'approve' | 'archive' | 'delete' | 'xlsx' | 'csv' | 'json' | 'paid') => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === 'xlsx') return exportInvoicesXlsx(selectedRows);
    if (action === 'csv') return exportInvoicesCsv(selectedRows);
    if (action === 'json') return exportInvoicesJson(selectedRows);
    if (action === 'delete') {
      await Promise.all(ids.map(softDeleteInvoice));
      toast.success(`${toFaDigits(ids.length)} فاکتور به سطل بازیافت منتقل شد`);
    } else if (action === 'approve') {
      await setStatus(ids, 'approved');
      await Promise.all(ids.map((id) => logAudit(id, 'تایید گروهی')));
      toast.success(`${toFaDigits(ids.length)} فاکتور تایید شد`);
    } else if (action === 'archive') {
      await setStatus(ids, 'archived');
      toast.success(`${toFaDigits(ids.length)} فاکتور آرشیو شد`);
    } else if (action === 'paid') {
      await setPaymentStatus(ids, 'paid');
      toast.success(`${toFaDigits(ids.length)} فاکتور پرداخت‌شده شد`);
    }
    setSelected(new Set());
  }, [selected, selectedRows]);

  const saveView = () => {
    if (!q.trim()) {
      toast.warning('برای ذخیره نما، اول جستجویی بنویسید');
      return;
    }
    const view: SavedView = { id: String(Date.now()), name: q.trim().slice(0, 28), query: q, tab };
    const next = [view, ...views].slice(0, 8);
    setViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    toast.success('نما ذخیره شد', { description: 'دفعه بعد با یک کلیک همین نتیجه را می‌گیرید.' });
  };

  const removeView = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
  };

  const dupInvoices = duplicates
    .map((pair) => ({ pair, a: all?.find((i) => i.id === pair.a.id), b: all?.find((i) => i.id === pair.b.id) }))
    .filter((row) => row.a && row.b);

  return (
    <div>
      <PageHeader
        title="فاکتورها"
        subtitle={`${toFaDigits(filtered?.length ?? 0)} سند در نمای فعلی${smart.min || smart.max ? ' · با فیلتر مبلغ' : ''}`}
        icon={<ReceiptText size={22} />}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesCsv(filtered ?? [])}>
              <FileCog size={15} /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesJson(filtered ?? [])}>
              <Braces size={15} /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesXlsx(filtered ?? [])}>
              <FileSpreadsheet size={15} /> اکسل
            </Button>
            <Button size="sm" onClick={() => navigate('/invoices/new')}>
              <Plus size={16} /> فاکتور جدید
            </Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {duplicates.length > 0 && (
          <button onClick={() => setDupOpen(true)}
            className="chip bg-warning-soft text-warning gap-1.5 !text-xs">
            <TriangleAlert size={13} /> {toFaDigits(duplicates.length)} سند مشکوک به تکرار
          </button>
        )}
      </div>

      {/* جستجوی هوشمند */}
      <div className="card !p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <ScanSearch size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary" />
            <Input
              className="!pr-9"
              placeholder="جستجوی هوشمند: «تایید‌شده بالای ۵ میلیون فروشنده دیجی‌کالا ماه گذشته»"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button variant="outline" size="md" onClick={saveView} title="ذخیره این جستجو">
            <BookmarkPlus size={15} /> ذخیره نما
          </Button>
          <Button variant="ghost" size="md" onClick={resetFilters}>
            <FilterX size={15} /> پاک کردن
          </Button>
        </div>

        {(smart.status || smart.payment || smart.min || smart.max || smart.vendor || smart.needsReview || smart.mismatched || smart.from) && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {smart.status && <Badge className="bg-primary-soft text-primary">وضعیت: {STATUS_META[smart.status]?.label}</Badge>}
            {smart.payment && <Badge className="bg-accent-soft text-accent">پرداخت: {PAYMENT_META[smart.payment]?.label}</Badge>}
            {smart.min !== undefined && <Badge className="bg-muted text-muted-foreground">از {formatMoney(smart.min)}</Badge>}
            {smart.max !== undefined && <Badge className="bg-muted text-muted-foreground">تا {formatMoney(smart.max)}</Badge>}
            {smart.vendor && <Badge className="bg-info-soft text-info">فروشنده: {smart.vendor}</Badge>}
            {smart.needsReview && <Badge className="bg-warning-soft text-warning">نیازمند بازبینی</Badge>}
            {smart.mismatched && <Badge className="bg-danger-soft text-danger">اختلاف مبلغ</Badge>}
            {smart.from && <Badge className="bg-muted text-muted-foreground">از تاریخ {toJalali(smart.from)}</Badge>}
          </div>
        )}

        {views.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border">
            <Bookmark size={13} className="text-muted-foreground" />
            {views.map((view) => (
              <span key={view.id} className="chip bg-muted text-muted-foreground gap-1 !text-[11px]">
                <button className="hover:text-primary" onClick={() => { setQ(view.query); setTab(view.tab); }}>
                  {view.name}
                </button>
                <button onClick={() => removeView(view.id)} className="opacity-60 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* فیلترها */}
      <div className="card !p-4 mb-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-3">
          <Select value={payment} onChange={(e) => setPayment(e.target.value)} disabled={inTrash}>
            <option value="all">همه وضعیت‌های پرداخت</option>
            <option value="unpaid">پرداخت نشده</option>
            <option value="partial">پیش‌پرداخت</option>
            <option value="paid">پرداخت شده</option>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Select value={costCenter} onChange={(e) => setCostCenter(e.target.value)} disabled={inTrash}>
            <option value="all">همه مرکزهای هزینه</option>
            {costCenters.map((center) => <option key={center} value={center}>{center}</option>)}
          </Select>
        </div>
        <div className="md:col-span-3 flex gap-1.5">
          <Input placeholder="از تاریخ ۱۴۰۳/۰۱/۰۱" value={params.get('from') ?? ''}
            onChange={(e) => { const next = new URLSearchParams(params); e.target.value ? next.set('from', e.target.value) : next.delete('from'); setParams(next); }} />
          <Input placeholder="تا تاریخ" value={params.get('to') ?? ''}
            onChange={(e) => { const next = new URLSearchParams(params); e.target.value ? next.set('to', e.target.value) : next.delete('to'); setParams(next); }} />
        </div>
        <div className="md:col-span-3 flex items-center gap-1.5">
          <button
            className="chip bg-muted text-muted-foreground gap-1 !text-[11px] h-10 flex-1 justify-center"
            onClick={() => setAsc((v) => !v)}
            title="تغییر جهت مرتب‌سازی"
          >
            <ArrowUpDown size={13} />
            {sort === 'date' ? 'تاریخ' : sort === 'total' ? 'مبلغ' : sort === 'issuer' ? 'فروشنده' : 'شماره'}
            {asc ? ' ↑' : ' ↓'}
          </button>
          <Select className="flex-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="date">تاریخ</option>
            <option value="total">مبلغ</option>
            <option value="issuer">فروشنده</option>
            <option value="number">شماره</option>
          </Select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2 animate-slide-up bg-primary-soft border-transparent">
          <span className="text-sm font-bold text-primary px-2">{toFaDigits(selected.size)} مورد انتخاب شده</span>
          <div className="mr-auto flex flex-wrap gap-2">
            {!inTrash && (
              <>
                <Button size="sm" variant="success" onClick={() => void bulk('approve')}><CheckCheck size={14} /> تایید گروهی</Button>
                <Button size="sm" variant="secondary" onClick={() => void bulk('paid')}><Wallet size={14} /> پرداخت شد</Button>
                <Button size="sm" variant="secondary" onClick={() => void bulk('archive')}><Archive size={14} /> آرشیو</Button>
                <Button size="sm" variant="outline" onClick={() => void bulk('xlsx')}><FileSpreadsheet size={14} /> اکسل</Button>
                <Button size="sm" variant="outline" onClick={() => void bulk('json')}><Braces size={14} /> JSON</Button>
                <Button size="sm" variant="danger" onClick={() => void bulk('delete')}><Trash2 size={14} /> حذف</Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {filtered === undefined ? (
          <div className="p-10 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : pageRows.length === 0 ? (
          <EmptyState
            icon={<FileText size={26} />}
            title={inTrash ? 'سطل بازیافت خالی است' : q ? 'چیزی با این جستجو پیدا نشد' : 'فاکتوری پیدا نشد'}
            desc={inTrash
              ? 'فاکتورهای حذف‌شده اینجا نمایش داده می‌شوند.'
              : q ? 'عبارت ساده‌تری بنویسید یا فیلترها را بردارید؛ مثلاً فقط «فروشنده دیجی‌کالا».'
                : 'فیلترها را تغییر دهید یا اولین فاکتور را اسکن کنید.'}
            action={!inTrash ? <Button onClick={() => navigate('/scan')}><Plus size={16} /> اسکن فاکتور</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border bg-muted/50">
                  <th className="p-3.5 w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[var(--primary)] w-4 h-4" />
                  </th>
                  <th className="p-3.5 text-right font-semibold">سند / طرف حساب</th>
                  <th className="p-3.5 text-right font-semibold">تاریخ</th>
                  <th className="p-3.5 text-right font-semibold">وضعیت</th>
                  <th className="p-3.5 text-right font-semibold">پرداخت</th>
                  <th className="p-3.5 text-right font-semibold">اطمینان</th>
                  <th className="p-3.5 text-left font-semibold">مبلغ کل</th>
                  <th className="p-3.5 text-center font-semibold w-28">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((inv) => (
                  <Row key={inv.id} inv={inv} checked={selected.has(inv.id)} onCheck={() => toggle(inv.id)}
                    inTrash={inTrash}
                    onEdit={() => navigate(`/invoices/${inv.id}`)}
                    onDelete={() => setConfirm({ id: inv.id, kind: 'delete' })}
                    onPurge={() => setConfirm({ id: inv.id, kind: 'purge' })}
                    onRestore={() => restoreInvoice(inv.id).then(() => toast.success('فاکتور بازیابی شد'))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <p className="text-xs text-muted-foreground">صفحه {toFaDigits(page)} از {toFaDigits(totalPages)}</p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>قبلی</Button>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</Button>
            </div>
          </div>
        )}
      </div>

      {/* پنجره اسناد تکراری */}
      <Modal open={dupOpen} onClose={() => setDupOpen(false)} title="اسناد مشکوک به تکرار" size="lg"
        footer={<Button variant="ghost" onClick={() => setDupOpen(false)}>بستن</Button>}>
        <p className="text-xs text-muted-foreground leading-6 mb-3">
          این اسناد بر پایه شماره، فروشنده و مبلغ (با تحمل غلط تایپی OCR) شبیه هم شناخته شدند.
          حذف، سند را به سطل بازیافت می‌برد و قابل بازگردانی است.
        </p>
        <div className="space-y-2">
          {dupInvoices.map(({ pair, a, b }) => (
            <div key={`${pair.a.id}-${pair.b.id}`} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <CopyCheck size={14} className="text-warning" />
                <span className="text-[11px] font-bold text-warning">{pair.reason}</span>
                <Badge className="bg-muted text-muted-foreground !text-[10px] mr-auto">شباهت {toFaDigits(pair.score)}٪</Badge>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                {[a!, b!].map((inv) => (
                  <div key={inv.id} className="rounded-lg bg-muted/60 p-2">
                    <p className="font-bold truncate">{inv.number} · {inv.issuerName}</p>
                    <p className="text-muted-foreground">
                      {toJalali(inv.date)} · {formatMoney(payableOf(inv), inv.currency)}
                    </p>
                    <div className="flex gap-1.5 mt-1.5">
                      <button className="text-primary hover:underline text-[11px]" onClick={() => navigate(`/invoices/${inv.id}`)}>باز کردن</button>
                      <button className="text-danger hover:underline text-[11px]"
                        onClick={async () => { await softDeleteInvoice(inv.id); toast.success('به سطل بازیافت منتقل شد'); setDupOpen(false); }}>
                        حذف
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm.kind !== null}
        onClose={() => setConfirm({ kind: null })}
        title={confirm.kind === 'purge' ? 'حذف دائم فاکتور' : 'انتقال به بازیافت'}
        message={confirm.kind === 'purge'
          ? 'این فاکتور برای همیشه حذف می‌شود و قابل بازگرداندن نیست. مطمئن هستید؟'
          : 'فاکتور به سطل بازیافت منتقل می‌شود و هر زمان قابل بازگرداندن است.'}
        confirmLabel={confirm.kind === 'purge' ? 'حذف دائم' : 'حذف'}
        loading={false}
        onConfirm={async () => {
          if (!confirm.id) return;
          if (confirm.kind === 'purge') {
            await permanentDelete(confirm.id);
            toast.success('فاکتور دائما حذف شد');
          } else {
            await softDeleteInvoice(confirm.id);
            toast.success('به سطل بازیافت منتقل شد');
          }
          setConfirm({ kind: null });
        }}
      />
    </div>
  );
}

function Row({ inv, checked, onCheck, inTrash, onEdit, onDelete, onPurge, onRestore }: {
  inv: Invoice; checked: boolean; onCheck: () => void; inTrash: boolean;
  onEdit: () => void; onDelete: () => void; onPurge: () => void; onRestore: () => void;
}) {
  const st = STATUS_META[inv.status];
  const pay = PAYMENT_META[inv.paymentStatus];
  const mismatch = inv.documentTotal !== undefined && Math.abs(inv.documentTotal - inv.total) > Math.max(1000, inv.total * 0.01);
  return (
    <tr className={cn('table-row-hover border-b border-border last:border-0', inv.deletedAt && 'opacity-60')}>
      <td className="p-3.5">
        <input type="checkbox" checked={checked} onChange={onCheck} className="accent-[var(--primary)] w-4 h-4" />
      </td>
      <td className="p-3.5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-muted overflow-hidden shrink-0 flex items-center justify-center">
            {inv.thumbnail ? <img src={inv.thumbnail} alt="" className="h-full w-full object-cover" /> : <FileText size={18} className="text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-[13px] truncate">{inv.number}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[220px]">
              {inv.issuerName || 'بدون طرف حساب'} · {toFaDigits(inv.items.length)} قلم
              {inv.costCenter ? ` · ${inv.costCenter}` : ''}
            </p>
          </div>
        </div>
      </td>
      <td className="p-3.5 text-xs whitespace-nowrap">{toJalali(inv.date)}</td>
      <td className="p-3.5">
        <div className="flex items-center gap-1.5">
          <Badge className={st.chipClass}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}</Badge>
          {mismatch && <span title="جمع ردیف‌ها با مبلغ سند اختلاف دارد" className="text-warning"><TriangleAlert size={13} /></span>}
        </div>
      </td>
      <td className="p-3.5"><Badge className={pay.chipClass}>{pay.label}</Badge></td>
      <td className="p-3.5">{inv.source === 'manual' ? <span className="text-[11px] text-muted-foreground">دستی</span> : <ConfidenceBar value={inv.ocrConfidence} />}</td>
      <td className="p-3.5 text-left font-extrabold text-[13px] whitespace-nowrap">{formatMoney(payableOf(inv), inv.currency)}</td>
      <td className="p-3.5">
        <div className="flex items-center justify-center gap-1">
          {inTrash ? (
            <>
              <button onClick={onRestore} title="بازیابی" className="icon-tile h-8 w-8 text-accent hover:bg-accent-soft"><RotateCcw size={15} /></button>
              <button onClick={onPurge} title="حذف دائم" className="icon-tile h-8 w-8 text-danger hover:bg-danger-soft"><Trash2 size={15} /></button>
            </>
          ) : (
            <>
              <button onClick={onEdit} title="ویرایش/مشاهده" className="icon-tile h-8 w-8 text-muted-foreground hover:bg-primary-soft hover:text-primary"><PencilLine size={15} /></button>
              <button onClick={onDelete} title="حذف" className="icon-tile h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export function SavedViewsHint() {
  return (
    <span className="chip bg-muted text-muted-foreground">
      <Sparkles size={11} /> جستجوهای پرتکرار را ذخیره کنید
    </span>
  );
}

export function LayersBadge({ count }: { count: number }) {
  return <Badge className="bg-primary-soft text-primary"><Layers size={11} /> {toFaDigits(count)}</Badge>;
}
