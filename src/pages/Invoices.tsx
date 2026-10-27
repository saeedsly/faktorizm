import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  ReceiptText, Plus, Search, Trash2, RotateCcw, FileSpreadsheet, FileCog, CheckCheck,
  Archive, PencilLine, Eye, FilterX, FileText,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button, Badge, EmptyState, Select, Input, ConfidenceBar, Tabs } from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { db } from '@/lib/db';
import {
  STATUS_META, PAYMENT_META, formatMoney, toFaDigits, cn,
} from '@/lib/utils';
import { toJalali, toISO } from '@/lib/jalali';
import {
  softDeleteInvoice, restoreInvoice, permanentDelete, setStatus,
} from '@/lib/invoices';
import { exportInvoicesXlsx, exportInvoicesCsv } from '@/lib/exporters/excel';
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

export default function Invoices() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [payment, setPayment] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{ id?: string; kind: 'delete' | 'purge' | null }>({ kind: null });
  const perPage = 10;

  useEffect(() => {
    const urlQ = params.get('q');
    if (urlQ) setQ(urlQ);
  }, [params]);

  const all = useLiveQuery(() => db.invoices.orderBy('updatedAt').reverse().toArray(), []);

  const filtered = useMemo(() => {
    if (!all) return undefined;
    let rows = all.filter((i) => (tab === 'trash' ? !!i.deletedAt : !i.deletedAt));
    if (tab !== 'all' && tab !== 'trash') rows = rows.filter((i) => i.status === (tab as InvoiceStatus));
    if (payment !== 'all') rows = rows.filter((i) => i.paymentStatus === payment);
    if (q.trim()) {
      const needle = q.toLowerCase();
      rows = rows.filter((i) =>
        [i.number, i.issuerName, i.buyerName, i.category, i.note, i.tags.join(' ')]
          .join(' ').toLowerCase().includes(needle));
    }
    const fromIso = toISO(from);
    const toIso = toISO(to);
    if (fromIso) rows = rows.filter((i) => i.date >= fromIso!);
    if (toIso) rows = rows.filter((i) => i.date <= toIso!);
    return rows;
  }, [all, tab, payment, q, from, to]);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab, payment, q, from, to]);

  const pageRows = filtered?.slice((page - 1) * perPage, page * perPage) ?? [];
  const totalPages = Math.max(1, Math.ceil((filtered?.length ?? 0) / perPage));
  const inTrash = tab === 'trash';
  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allChecked = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(() => new Set(allChecked ? [] : pageRows.map((r) => r.id)));
  const selectedRows = (filtered ?? []).filter((r) => selected.has(r.id));

  const resetFilters = () => { setPayment('all'); setFrom(''); setTo(''); setQ(''); setParams({}); };

  const bulk = async (action: 'approve' | 'archive' | 'delete' | 'xlsx' | 'csv') => {
    const ids = Array.from(selected);
    if (action === 'xlsx') return exportInvoicesXlsx(selectedRows);
    if (action === 'csv') return exportInvoicesCsv(selectedRows);
    if (action === 'delete') {
      await Promise.all(ids.map(softDeleteInvoice));
      toast.success(`${toFaDigits(ids.length)} فاکتور به سطل بازیافت منتقل شد`);
    } else if (action === 'approve') {
      await setStatus(ids, 'approved');
      toast.success(`${toFaDigits(ids.length)} فاکتور تایید شد`);
    } else if (action === 'archive') {
      await setStatus(ids, 'archived');
      toast.success(`${toFaDigits(ids.length)} فاکتور آرشیو شد`);
    }
    setSelected(new Set());
  };

  return (
    <div>
      <PageHeader
        title="فاکتورها"
        subtitle={`${toFaDigits(filtered?.length ?? 0)} سند در نمای فعلی`}
        icon={<ReceiptText size={22} />}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesCsv(filtered ?? [])}>
              <FileCog size={15} /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportInvoicesXlsx(filtered ?? [])}>
              <FileSpreadsheet size={15} /> اکسل
            </Button>
            <Button size="sm" onClick={() => navigate('/invoices/new')}>
              <Plus size={16} /> فاکتور جدید
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} active={tab} onChange={setTab} />
      </div>

      {/* فیلترها */}
      <div className="card !p-4 mb-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-4 relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="!pr-9" placeholder="جستجو در شماره، طرف حساب، یادداشت…" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="md:col-span-2" value={payment} onChange={(e) => setPayment(e.target.value)} disabled={inTrash}>
          <option value="all">همه وضعیت‌های پرداخت</option>
          <option value="unpaid">پرداخت نشده</option>
          <option value="partial">پیش‌پرداخت</option>
          <option value="paid">پرداخت شده</option>
        </Select>
        <Input className="md:col-span-2" placeholder="از تاریخ ۱۴۰۳/۰۱/۰۱" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input className="md:col-span-2" placeholder="تا تاریخ" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="ghost" size="sm" className="md:col-span-2" onClick={resetFilters}>
          <FilterX size={15} /> حذف فیلترها
        </Button>
      </div>

      {/* عملیات گروهی */}
      {selected.size > 0 && (
        <div className="card !p-3 mb-4 flex flex-wrap items-center gap-2 animate-slide-up bg-primary-soft border-transparent">
          <span className="text-sm font-bold text-primary px-2">{toFaDigits(selected.size)} مورد انتخاب شده</span>
          <div className="mr-auto flex flex-wrap gap-2">
            {!inTrash && <>
              <Button size="sm" variant="success" onClick={() => bulk('approve')}><CheckCheck size={14} /> تایید گروهی</Button>
              <Button size="sm" variant="secondary" onClick={() => bulk('archive')}><Archive size={14} /> آرشیو</Button>
              <Button size="sm" variant="outline" onClick={() => bulk('xlsx')}><FileSpreadsheet size={14} /> خروجی انتخابی</Button>
              <Button size="sm" variant="danger" onClick={() => bulk('delete')}><Trash2 size={14} /> حذف</Button>
            </>}
          </div>
        </div>
      )}

      {/* جدول */}
      <div className="card !p-0 overflow-hidden">
        {filtered === undefined ? (
          <div className="p-10 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : pageRows.length === 0 ? (
          <EmptyState
            icon={<FileText size={26} />}
            title={inTrash ? 'سطل بازیافت خالی است' : 'فاکتوری پیدا نشد'}
            desc={inTrash ? 'فاکتورهای حذف‌شده اینجا نمایش داده می‌شوند.' : 'فیلترها را تغییر دهید یا اولین فاکتور را اسکن کنید.'}
            action={!inTrash ? <Button onClick={() => navigate('/scan')}><Plus size={16} /> اسکن فاکتور</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
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
            <p className="text-xs text-muted-foreground truncate max-w-[220px]">{inv.issuerName || 'بدون طرف حساب'} · {toFaDigits(inv.items.length)} قلم</p>
          </div>
        </div>
      </td>
      <td className="p-3.5 text-xs whitespace-nowrap">{toJalali(inv.date)}</td>
      <td className="p-3.5"><Badge className={st.chipClass}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}</Badge></td>
      <td className="p-3.5"><Badge className={pay.chipClass}>{pay.label}</Badge></td>
      <td className="p-3.5">{inv.source === 'manual' ? <span className="text-[11px] text-muted-foreground">دستی</span> : <ConfidenceBar value={inv.ocrConfidence} />}</td>
      <td className="p-3.5 text-left font-extrabold text-[13px] whitespace-nowrap">{formatMoney(inv.total, inv.currency)}</td>
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
