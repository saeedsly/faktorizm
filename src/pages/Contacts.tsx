import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { ContactRound, Plus, Search, PencilLine, Trash2, ReceiptText, Phone, Hash } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button, Card, Input, Select, Label, Modal, Badge, EmptyState, Avatar } from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { db } from '@/lib/db';
import { uid, toFaDigits, relativeTime } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import type { Contact } from '@/lib/types';

const EMPTY: Omit<Contact, 'id' | 'createdAt'> = {
  name: '', type: 'vendor', economicCode: '', nationalId: '', phone: '', address: '',
};

export default function Contacts() {
  const navigate = useNavigate();
  const contacts = useLiveQuery(() => db.contacts.toArray(), []) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices.filter((i) => !i.deletedAt)) {
      if (inv.contactId) map.set(inv.contactId, (map.get(inv.contactId) ?? 0) + 1);
    }
    return map;
  }, [invoices]);

  const filtered = contacts.filter((c) =>
    [c.name, c.economicCode, c.nationalId, c.phone].join(' ').includes(q.trim()));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ name: c.name, type: c.type, economicCode: c.economicCode ?? '', nationalId: c.nationalId ?? '', phone: c.phone ?? '', address: c.address ?? '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('نام طرف حساب الزامی است'); return; }
    if (editing) {
      await db.contacts.update(editing.id, { ...form });
      logActivity('ویرایش طرف حساب', 'contact', form.name, editing.id);
      toast.success('طرف حساب ویرایش شد');
    } else {
      const c: Contact = { id: uid('cnt_'), ...form, createdAt: new Date().toISOString() };
      await db.contacts.add(c);
      logActivity('ثبت طرف حساب', 'contact', form.name, c.id);
      toast.success('طرف حساب ثبت شد');
    }
    setModal(false);
  };

  const typeLabel = (t: Contact['type']) =>
    t === 'vendor' ? 'تامین‌کننده' : t === 'customer' ? 'مشتری' : 'مشتری / تامین‌کننده';

  return (
    <div>
      <PageHeader
        title="دفتر طرفین حساب"
        subtitle={`${toFaDigits(contacts.length)} شخص حقیقی و حقوقی`}
        icon={<ContactRound size={22} />}
        actions={<Button size="sm" onClick={openCreate}><Plus size={16} /> طرف حساب جدید</Button>}
      />

      <Card className="!p-4 mb-5">
        <div className="relative max-w-md">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="!pr-9" placeholder="جستجو با نام، کد اقتصادی، تلفن…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<ContactRound size={26} />} title="طرف حسابی ثبت نشده است"
            desc="طرف حساب‌ها هنگام ذخیره فاکتور اسکن‌شده هم به‌صورت خودکار اضافه می‌شوند."
            action={<Button onClick={openCreate}><Plus size={16} /> ثبت طرف حساب</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border bg-muted/50">
                  <th className="p-3.5 text-right font-semibold">نام / نوع</th>
                  <th className="p-3.5 text-right font-semibold">کد اقتصادی</th>
                  <th className="p-3.5 text-right font-semibold">شناسه ملی</th>
                  <th className="p-3.5 text-right font-semibold">تلفن</th>
                  <th className="p-3.5 text-right font-semibold">فاکتورها</th>
                  <th className="p-3.5 text-right font-semibold">آخرین فعالیت</th>
                  <th className="p-3.5 text-center w-32">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className="table-row-hover border-b border-border last:border-0">
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={c.name} index={i} size="sm" />
                        <div>
                          <p className="font-bold text-[13px]">{c.name}</p>
                          <Badge className="bg-muted text-muted-foreground mt-1">{typeLabel(c.type)}</Badge>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-xs font-mono">{c.economicCode || '—'}</td>
                    <td className="p-3.5 text-xs font-mono">{c.nationalId || '—'}</td>
                    <td className="p-3.5 text-xs">{c.phone || '—'}</td>
                    <td className="p-3.5">
                      <button onClick={() => navigate(`/invoices?q=${encodeURIComponent(c.name)}`)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                        <ReceiptText size={13} /> {toFaDigits(counts.get(c.id) ?? 0)} فاکتور
                      </button>
                    </td>
                    <td className="p-3.5 text-xs text-muted-foreground">{relativeTime(c.createdAt)}</td>
                    <td className="p-3.5">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openEdit(c)} className="icon-tile h-8 w-8 text-muted-foreground hover:bg-primary-soft hover:text-primary"><PencilLine size={15} /></button>
                        <button onClick={() => setDeleteId(c.id)} className="icon-tile h-8 w-8 text-muted-foreground hover:bg-danger-soft hover:text-danger"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'ویرایش طرف حساب' : 'ثبت طرف حساب جدید'}
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>انصراف</Button><Button onClick={save}>ذخیره</Button></>}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label required>نام شرکت / شخص</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلا: شرکت پخش بهار" />
          </div>
          <div>
            <Label>نوع</Label>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Contact['type'] })}>
              <option value="vendor">تامین‌کننده</option>
              <option value="customer">مشتری</option>
              <option value="both">مشتری / تامین‌کننده</option>
            </Select>
          </div>
          <div>
            <Label>تلفن</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="۰۲۱-…" />
          </div>
          <div>
            <Label>کد اقتصادی</Label>
            <Input value={form.economicCode} onChange={(e) => setForm({ ...form, economicCode: e.target.value })} />
          </div>
          <div>
            <Label>شناسه ملی</Label>
            <Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>نشانی</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Hash size={13} /> <Phone size={13} /> کدها برای صدور فاکتور رسمی و اتصال به سامانه مودیان استفاده می‌شوند.
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} title="حذف طرف حساب"
        message="فاکتورهای مرتبط با این طرف حساب حذف نمی‌شوند، فقط این رکورد از دفتر پاک خواهد شد."
        onConfirm={async () => {
          if (!deleteId) return;
          await db.contacts.delete(deleteId);
          logActivity('حذف طرف حساب', 'contact', 'یک رکورد حذف شد', deleteId);
          toast.success('طرف حساب حذف شد');
          setDeleteId(null);
        }} />
    </div>
  );
}
