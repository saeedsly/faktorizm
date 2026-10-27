import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Package, Plus, Search, PencilLine, Trash2, Sparkles, Scale } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button, Card, Input, Select, Label, Modal, Badge, EmptyState, StatCard } from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { db } from '@/lib/db';
import { uid, formatMoney, toFaDigits, relativeTime } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import type { Product } from '@/lib/types';

const EMPTY: Omit<Product, 'id' | 'createdAt' | 'usageCount'> = {
  code: '', title: '', unit: 'عدد', unitPrice: 0, taxRate: 10, category: '',
};

export default function Products() {
  const products = useLiveQuery(() => db.products.orderBy('usageCount').reverse().toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = products.filter((p) => [p.title, p.code, p.category].join(' ').includes(q.trim()));
  const totalUsage = products.reduce((s, p) => s + p.usageCount, 0);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ code: p.code, title: p.title, unit: p.unit, unitPrice: p.unitPrice, taxRate: p.taxRate, category: p.category });
    setModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('نام کالا الزامی است'); return; }
    if (editing) {
      await db.products.update(editing.id, { ...form });
      logActivity('ویرایش کالا', 'product', form.title, editing.id);
      toast.success('کالا ویرایش شد');
    } else {
      const p: Product = { id: uid('prd_'), ...form, usageCount: 0, createdAt: new Date().toISOString() };
      await db.products.add(p);
      logActivity('ثبت کالا', 'product', form.title, p.id);
      toast.success('کالا ثبت شد');
    }
    setModal(false);
  };

  return (
    <div>
      <PageHeader
        title="دفتر کالا و خدمات"
        subtitle={`${toFaDigits(products.length)} قلم کالا و خدمت`}
        icon={<Package size={22} />}
        actions={<Button size="sm" onClick={openCreate}><Plus size={16} /> کالای جدید</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={<Package size={20} />} label="تعداد اقلام" value={toFaDigits(products.length)} tone="primary" />
        <StatCard icon={<Sparkles size={20} />} label="مجموع استفاده در فاکتورها" value={toFaDigits(totalUsage)} tone="accent" />
        <StatCard icon={<Scale size={20} />} label="واحدهای سنجش" value={toFaDigits(new Set(products.map((p) => p.unit)).size)} tone="info" />
        <StatCard icon={<Package size={20} />} label="دسته‌بندی‌ها" value={toFaDigits(new Set(products.map((p) => p.category).filter(Boolean)).size)} tone="warning" />
      </div>

      <Card className="!p-4 mb-5">
        <div className="relative max-w-md">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="!pr-9" placeholder="جستجوی کالا، کد یا دسته…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<Package size={26} />} title="کالایی ثبت نشده است"
            desc="اقلام فاکتورهای اسکن‌شده به‌صورت خودکار به این دفتر اضافه می‌شوند و هنگام تایپ تکمیل خودکار می‌شوند."
            action={<Button onClick={openCreate}><Plus size={16} /> ثبت کالا</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border bg-muted/50">
                  <th className="p-3.5 text-right font-semibold">شرح کالا / خدمت</th>
                  <th className="p-3.5 text-right font-semibold">کد</th>
                  <th className="p-3.5 text-right font-semibold">دسته</th>
                  <th className="p-3.5 text-right font-semibold">واحد</th>
                  <th className="p-3.5 text-left font-semibold">قیمت مرجع</th>
                  <th className="p-3.5 text-right font-semibold">مالیات</th>
                  <th className="p-3.5 text-right font-semibold">دفعات استفاده</th>
                  <th className="p-3.5 text-center w-28">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="table-row-hover border-b border-border last:border-0">
                    <td className="p-3.5">
                      <p className="font-bold text-[13px]">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">{relativeTime(p.createdAt)}</p>
                    </td>
                    <td className="p-3.5 text-xs font-mono">{p.code || '—'}</td>
                    <td className="p-3.5">{p.category ? <Badge className="bg-info-soft text-info">{p.category}</Badge> : '—'}</td>
                    <td className="p-3.5 text-xs">{p.unit}</td>
                    <td className="p-3.5 text-left font-bold text-[13px]">{formatMoney(p.unitPrice, 'IRT')}</td>
                    <td className="p-3.5 text-xs">{toFaDigits(p.taxRate)}٪</td>
                    <td className="p-3.5">
                      <Badge className={p.usageCount > 3 ? 'bg-accent-soft text-accent' : 'bg-muted text-muted-foreground'}>
                        {toFaDigits(p.usageCount)} بار
                      </Badge>
                    </td>
                    <td className="p-3.5">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openEdit(p)} className="icon-tile h-8 w-8 text-muted-foreground hover:bg-primary-soft hover:text-primary"><PencilLine size={15} /></button>
                        <button onClick={() => setDeleteId(p.id)} className="icon-tile h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'ویرایش کالا' : 'ثبت کالای جدید'}
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label required>نام کالا / خدمت</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثلا: کاغذ A4 بسته ۵۰۰ برگی" />
          </div>
          <div>
            <Label>کد کالا</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="K-1001" />
          </div>
          <div>
            <Label>دسته‌بندی</Label>
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} list="cat-list" />
            <datalist id="cat-list">
              {['مواد غذایی', 'لوازم اداری', 'الکترونیک', 'خدمات چاپ', 'ساختمانی', 'حمل‌ونقل'].map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <Label>واحد سنجش</Label>
            <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {['عدد', 'بسته', 'جعبه', 'کیسه', 'حلقه', 'هزار', 'شاخه', 'پاکت', 'سرویس', 'ساعت'].map((u) => <option key={u}>{u}</option>)}
            </Select>
          </div>
          <div>
            <Label>نرخ مالیات ٪</Label>
            <Select value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}>
              {[0, 9, 10].map((r) => <option key={r} value={r}>{toFaDigits(r)}٪</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>قیمت مرجع (تومان)</Label>
            <Input type="number" min={0} value={form.unitPrice || ''} onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="حذف کالا"
        message="این قلم از دفتر کالا حذف می‌شود؛ ردیف‌های فاکتورهای قبلی دست‌نخورده می‌مانند."
        onConfirm={async () => {
          if (!deleteId) return;
          await db.products.delete(deleteId);
          logActivity('حذف کالا', 'product', 'یک قلم حذف شد', deleteId);
          toast.success('کالا حذف شد');
          setDeleteId(null);
        }} />
    </div>
  );
}
