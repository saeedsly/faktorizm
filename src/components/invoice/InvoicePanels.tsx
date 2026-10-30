import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Paperclip, History, RotateCcw, Wallet, Wand2, Building2, Clock, CheckCircle2,
  AlertTriangle, Upload, Trash2, Plus, Sparkles, FileText, ArrowLeft,
} from 'lucide-react';
import { Button, Card, CardTitle, Input, Label, Select, Badge, EmptyState, Progress, Modal } from '@/components/ui/primitives';
import { db } from '@/lib/db';
import { uid, formatMoney, toFaDigits, cn, relativeTime } from '@/lib/utils';
import { toJalali } from '@/lib/jalali';
import { payableOf } from '@/lib/invoices';
import {
  auditOf, versionsOf, snapshot, restoreVersion, logAudit,
  plansOf, saveInstallments, markPaid, isOverdue, daysLate,
} from '@/lib/invoices/workflow';
import { suggestFixes, applyFixes, buildDictionary } from '@/lib/ocr/autofix';
import type { FixSuggestion } from '@/lib/ocr/autofix';
import { getVendor, learnFromInvoice, vendorSuggestions } from '@/lib/vendors';
import type { AuditEntry, Invoice, InvoiceVersion, PaymentPlan, VendorProfile } from '@/lib/types';

/* ------------------------------------------------------- پیوست‌ها */

export function AttachmentsCard({ invoice, onChange }: { invoice: Invoice; onChange: (attachments: Invoice['attachments']) => void }) {
  const [busy, setBusy] = useState(false);
  const attachments = invoice.attachments ?? [];

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const next = [...attachments];
      for (const file of Array.from(files).slice(0, 6)) {
        if (file.size > 2.5 * 1024 * 1024) {
          toast.warning(`«${file.name}» بزرگ است`, { description: 'برای نگهداری آفلاین، فایل زیر ۲.۵ مگابایت انتخاب کنید.' });
          continue;
        }
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('خواندن فایل ناموفق بود'));
          reader.readAsDataURL(file);
        });
        next.push({ id: uid('att_'), name: file.name, type: file.type, size: file.size, data, addedAt: new Date().toISOString() });
      }
      onChange(next);
      toast.success('پیوست اضافه شد');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle
        icon={<Paperclip size={18} />}
        title="پیوست‌های سند"
        sub={`${toFaDigits(attachments.length)} فایل — قرارداد، رسید پرداخت یا عکس دوم`}
        action={(
          <label className="inline-flex">
            <input type="file" multiple accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
            <Button size="sm" variant="outline" loading={busy} onClick={(e) => {
              e.preventDefault();
              (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.click();
            }}>
              <Upload size={14} /> افزودن
            </Button>
          </label>
        )}
      />
      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-6">
          پیوست‌ها داخل همین مرورگر و همراه سند نگه داشته می‌شوند؛ برای دیدن سند اصلی روی تصویر بزنید.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {attachments.map((att) => (
            <div key={att.id} className="rounded-xl border border-border overflow-hidden group relative">
              <a href={att.data} target="_blank" rel="noreferrer" className="block">
                {att.type.startsWith('image/')
                  ? <img src={att.data} alt={att.name} className="h-24 w-full object-cover" />
                  : <div className="h-24 flex items-center justify-center bg-muted"><FileText size={24} className="text-muted-foreground" /></div>}
              </a>
              <div className="p-2">
                <p className="text-[11px] font-semibold truncate" title={att.name}>{att.name}</p>
                <p className="text-[10px] text-muted-foreground">{toFaDigits(Math.round(att.size / 1024))} کیلوبایت</p>
              </div>
              <button
                onClick={() => onChange(attachments.filter((a) => a.id !== att.id))}
                className="absolute top-1 left-1 h-7 w-7 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                title="حذف پیوست"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- برنامه پرداخت */

export function PaymentPlanCard({ invoice }: { invoice: Invoice }) {
  const [plans, setPlans] = useState<PaymentPlan[]>([]);
  const [count, setCount] = useState(3);
  const [everyDays, setEveryDays] = useState(30);
  const [budget, setBudget] = useState(false);

  const load = useCallback(() => { void plansOf(invoice.id).then(setPlans); }, [invoice.id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBudget(true);
    try {
      await saveInstallments(invoice, count, everyDays);
      load();
      toast.success(`${toFaDigits(count)} قسط ساخته شد`, {
        description: 'با زدن «پرداخت شد» وضعیت سند خودکار به‌روز می‌شود.',
      });
    } finally {
      setBudget(false);
    }
  };

  const paidAmount = plans.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  const totalAmount = plans.reduce((s, p) => s + p.amount, 0);
  const progress = totalAmount ? (paidAmount / totalAmount) * 100 : 0;

  return (
    <Card>
      <CardTitle icon={<Wallet size={18} />} title="اقساط و برنامه پرداخت"
        sub={plans.length
          ? `${toFaDigits(plans.filter((p) => p.paidAt).length)} از ${toFaDigits(plans.length)} قسط پرداخت شد`
          : 'سند را به چند قسط تقسیم کنید تا سررسیدها گم نشوند'} />

      {plans.length > 0 && (
        <>
          <div className="mb-3">
            <Progress value={progress} tone={progress >= 100 ? 'accent' : 'primary'} />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
              <span>پرداخت‌شده: {formatMoney(paidAmount, invoice.currency)}</span>
              <span>مانده: {formatMoney(totalAmount - paidAmount, invoice.currency)}</span>
            </div>
          </div>
          <div className="space-y-1.5 mb-3">
            {plans.map((plan) => {
              const overdue = isOverdue(plan);
              const late = daysLate(plan);
              return (
                <div key={plan.id} className={cn('flex items-center gap-2 rounded-lg border p-2 text-xs',
                  plan.paidAt ? 'border-accent/30 bg-accent-soft/40' : overdue ? 'border-danger/30 bg-danger-soft/40' : 'border-border')}>
                  <span className={cn('h-2 w-2 rounded-full shrink-0',
                    plan.paidAt ? 'bg-accent' : overdue ? 'bg-danger' : 'bg-warning')} />
                  <span className="font-semibold">{plan.title}</span>
                  <span className="text-muted-foreground">{toJalali(plan.dueDate)}</span>
                  <span className="font-bold tabular-nums">{formatMoney(plan.amount, invoice.currency)}</span>
                  {overdue && <Badge className="bg-danger-soft text-danger !text-[10px]">{toFaDigits(late)} روز تأخیر</Badge>}
                  {plan.paidAt
                    ? <span className="mr-auto text-accent text-[11px] flex items-center gap-1"><CheckCircle2 size={12} /> پرداخت شد</span>
                    : (
                      <Button size="sm" variant="ghost" className="mr-auto"
                        onClick={async () => { await markPaid(plan.id); load(); toast.success('قسط پرداخت‌شده ثبت شد'); }}>
                        پرداخت شد
                      </Button>
                    )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="grid grid-cols-3 gap-2 items-end">
        <div>
          <Label>تعداد قسط</Label>
          <Input type="number" min={1} max={24} value={count} onChange={(e) => setCount(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} />
        </div>
        <div>
          <Label>فاصله (روز)</Label>
          <Select value={String(everyDays)} onChange={(e) => setEveryDays(Number(e.target.value))}>
            <option value="7">هفتگی</option>
            <option value="15">دو هفته</option>
            <option value="30">ماهانه</option>
            <option value="90">فصلی</option>
          </Select>
        </div>
        <Button size="sm" onClick={create} loading={budget}>
          <Plus size={14} /> {plans.length ? 'بازسازی اقساط' : 'ساخت اقساط'}
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- تاریخچه و نسخه‌ها */

export function HistoryCard({ invoice, onRestored }: { invoice: Invoice; onRestored: (inv: Invoice) => void }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [versions, setVersions] = useState<InvoiceVersion[]>([]);
  const [show, setShow] = useState<'audit' | 'versions'>('audit');

  const load = useCallback(async () => {
    const [a, v] = await Promise.all([auditOf(invoice.id), versionsOf(invoice.id)]);
    setEntries(a);
    setVersions(v);
  }, [invoice.id]);
  useEffect(() => { void load(); }, [load]);

  const saveVersion = async () => {
    await snapshot(invoice, 'نسخه دستی');
    await logAudit(invoice.id, 'نسخه دستی ذخیره شد');
    await load();
    toast.success('نسخه ذخیره شد', { description: 'هر زمان می‌توانید به همین وضعیت برگردید.' });
  };

  return (
    <Card>
      <CardTitle
        icon={<History size={18} />}
        title="تاریخچه و نسخه‌ها"
        sub={`${toFaDigits(entries.length)} رخداد · ${toFaDigits(versions.length)} نسخه`}
        action={(
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShow('audit')}
              className={cn('chip !text-[11px]', show === 'audit' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground')}>رخدادها</button>
            <button onClick={() => setShow('versions')}
              className={cn('chip !text-[11px]', show === 'versions' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground')}>نسخه‌ها</button>
            <Button size="sm" variant="outline" onClick={saveVersion}><Sparkles size={13} /> نسخه</Button>
          </div>
        )}
      />

      {show === 'audit' ? (
        entries.length ? (
          <ol className="relative border-r border-border pr-4 space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -right-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary-soft" />
                <p className="text-xs font-bold">{entry.action}</p>
                <p className="text-[11px] text-muted-foreground leading-5">
                  {relativeTime(entry.at)}
                  {entry.from && entry.to ? ` · از «${entry.from}» به «${entry.to}»` : ''}
                  {entry.note ? ` · ${entry.note}` : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : <p className="text-xs text-muted-foreground">هنوز رخدادی ثبت نشده است.</p>
      ) : versions.length ? (
        <div className="space-y-1.5">
          {versions.map((version) => (
            <div key={version.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
              <Clock size={13} className="text-muted-foreground shrink-0" />
              <span className="font-semibold">{version.label}</span>
              <span className="text-muted-foreground">{relativeTime(version.at)}</span>
              <span className="tabular-nums text-muted-foreground">{formatMoney(version.amount, invoice.currency)}</span>
              <Button size="sm" variant="ghost" className="mr-auto"
                onClick={async () => {
                  const restored = await restoreVersion(version.id);
                  if (restored) { onRestored(restored); await load(); toast.success('سند به این نسخه برگشت'); }
                }}>
                <RotateCcw size={13} /> بازگردانی
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">با زدن «نسخه» یک نقطه بازگشت بسازید.</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- اصلاح پیشنهادی متن */

export function AutofixCard({ invoice, onApplyText }: { invoice: Invoice; onApplyText: (text: string) => void }) {
  const [suggestions, setSuggestions] = useState<FixSuggestion[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const [products, contacts] = await Promise.all([db.products.toArray(), db.contacts.toArray()]);
      const dictionary = buildDictionary(products, contacts);
      const found = suggestFixes(invoice.rawText || '', dictionary);
      setSuggestions(found);
      setAccepted(new Set(found.filter((f) => f.kind === 'control' || f.kind === 'repeat').map((f) => f.id)));
    })();
  }, [invoice.id, invoice.rawText]);

  const apply = () => {
    const chosen = suggestions.filter((s) => accepted.has(s.id));
    onApplyText(applyFixes(invoice.rawText, chosen));
    toast.success(`${toFaDigits(chosen.length)} اصلاح روی متن اعمال شد`, {
      description: 'فیلدها را دوباره بخوانید تا مقادیر اصلاح‌شده جایگزین شوند.',
    });
  };

  return (
    <Card>
      <CardTitle icon={<Wand2 size={18} />} title="اصلاح پیشنهادی متن"
        sub="بر پایه واژه‌نامه کالاها و طرف‌حساب‌های خودتان — فقط چیزهایی که خودتان تیک بزنید"
        action={suggestions.length ? <Button size="sm" onClick={apply}>اعمال</Button> : undefined} />
      {suggestions.length === 0 ? (
        <p className="text-xs text-muted-foreground leading-6">متنی برای اصلاح پیدا نشد؛ خوانش این سند تمیز است.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {suggestions.map((item) => (
            <label key={item.id} className="flex items-start gap-2 rounded-lg border border-border p-2 text-xs cursor-pointer">
              <input type="checkbox" className="mt-0.5 accent-[var(--primary)]"
                checked={accepted.has(item.id)}
                onChange={() => setAccepted((prev) => {
                  const next = new Set(prev);
                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                  return next;
                })} />
              <span className="min-w-0">
                <span className="line-through text-muted-foreground">{item.from}</span>
                <ArrowLeft size={11} className="inline mx-1 opacity-60" />
                <span className="font-bold">{item.to || '—'}</span>
                <span className="block text-[11px] text-muted-foreground">{item.reason}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- دانش فروشنده */

export function VendorCard({ invoice, onApply }: {
  invoice: Invoice;
  onApply: (patch: Partial<Invoice>) => void;
}) {
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setProfile(await getVendor(invoice.issuerName));
  }, [invoice.issuerName]);
  useEffect(() => { void load(); }, [load]);

  const learn = async () => {
    setSaving(true);
    try {
      await learnFromInvoice(invoice);
      await load();
      toast.success('دانش این فروشنده به‌روز شد', { description: 'اسناد بعدی همین فروشنده دقیق‌تر خوانده می‌شوند.' });
    } finally { setSaving(false); }
  };

  const suggestions = vendorSuggestions(profile);
  const canApply = (suggestions.category && suggestions.category !== invoice.category)
    || (suggestions.costCenter && suggestions.costCenter !== invoice.costCenter);

  return (
    <Card>
      <CardTitle icon={<Building2 size={18} />} title="دانش فروشنده"
        sub={profile
          ? `${toFaDigits(profile.samples)} سند از این فروشنده ثبت شده — الگویش ذخیره است`
          : 'اولین سند از این فروشنده؛ با یک کلیک الگویش را یاد بگیرید'}
        action={<Button size="sm" variant="outline" onClick={learn} loading={saving}>یادگیری</Button>} />
      {profile ? (
        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap gap-2">
            {profile.defaultTaxRate > 0 && <Badge className="bg-info-soft text-info">مالیات معمول: {toFaDigits(profile.defaultTaxRate)}٪</Badge>}
            {profile.category && <Badge className="bg-primary-soft text-primary">دسته: {profile.category}</Badge>}
            {profile.costCenter && <Badge className="bg-accent-soft text-accent">مرکز هزینه: {profile.costCenter}</Badge>}
            {profile.header.length > 0 && <Badge className="bg-muted text-muted-foreground">{toFaDigits(profile.header.length)} سرستون شناخته‌شده</Badge>}
          </div>
          {canApply && (
            <Button size="sm" variant="secondary"
              onClick={() => {
                onApply({
                  category: suggestions.category ?? invoice.category,
                  costCenter: suggestions.costCenter ?? invoice.costCenter,
                });
                toast.success('مقادیر از دانش فروشنده اعمال شد');
              }}>
              اعمال دسته و مرکز هزینه این فروشنده
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground leading-6">
          با «یادگیری»، نرخ مالیات، دسته، مرکز هزینه و سرستون‌های این فروشنده ذخیره می‌شود و
          دفعه بعد خوانش دقیق‌تر و سریع‌تر انجام می‌شود.
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- هشدار تکراری */

export function DuplicateAlert({ invoice, onDismiss }: { invoice: Invoice; onDismiss: () => void }) {
  const [match, setMatch] = useState<Invoice | null>(null);

  useEffect(() => {
    void (async () => {
      if (!invoice.number) return;
      const others = await db.invoices
        .filter((row) => row.id !== invoice.id && !row.deletedAt
          && (row.number === invoice.number || (row.issuerName === invoice.issuerName && payableOf(row) === payableOf(invoice))))
        .toArray();
      setMatch(others[0] ?? null);
    })();
  }, [invoice]);

  if (!match) return null;
  return (
    <div className="card !p-4 flex items-start gap-3 bg-warning-soft border-transparent animate-slide-up">
      <AlertTriangle size={20} className="text-warning shrink-0 mt-0.5" />
      <div className="text-xs leading-6">
        <p className="font-bold text-warning mb-0.5">این سند تکراری به نظر می‌رسد</p>
        <p className="text-muted-foreground">
          سندی با شماره «{match.number}» از «{match.issuerName}» و مبلغ {formatMoney(payableOf(match), match.currency)} قبلاً ثبت شده است.
          اگر واقعاً سند جداست، ادامه دهید.
        </p>
      </div>
      <button onClick={onDismiss} className="mr-auto text-muted-foreground hover:text-foreground text-xs">متوجه شدم</button>
    </div>
  );
}

/* ------------------------------------------------------- اقلام پیشنهادی */

export function SuggestedItemsCard({ invoice, onAdd }: { invoice: Invoice; onAdd: (item: { title: string; unitPrice: number; taxRate: number }) => void }) {
  const [products, setProducts] = useState<{ title: string; code?: string; unitPrice: number; taxRate: number; usageCount: number }[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void db.products.orderBy('usageCount').reverse().limit(40).toArray().then(setProducts);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return products.slice(0, 8);
    return products.filter((p) => p.title.includes(needle) || p.code?.includes(needle)).slice(0, 8);
  }, [products, query]);

  const list = products.length ? filtered : [];
  return (
    <Card>
      <CardTitle icon={<FileText size={18} />} title="افزودن سریع از کالاهای پرتکرار"
        sub="با یک کلیک، کالا با قیمت و مالیات قبلی‌اش اضافه می‌شود" />
      <Input placeholder="جستجوی کالا…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-2" />
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">کالایی ثبت نشده است.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {list.map((product) => (
            <button key={product.title}
              onClick={() => onAdd({ title: product.title, unitPrice: product.unitPrice, taxRate: product.taxRate })}
              className="chip bg-muted hover:bg-primary-soft hover:text-primary transition-colors !text-[11px]">
              <Plus size={11} /> {product.title}
              {product.unitPrice > 0 && <span className="opacity-70">· {formatMoney(product.unitPrice, invoice.currency)}</span>}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- خلاصه کیفیت خوانش */

export function ConfidenceBreakdown({ invoice }: { invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(invoice.fieldConfidence ?? {});
  const labels: Record<string, string> = {
    number: 'شماره سند', date: 'تاریخ', issuerName: 'فروشنده', buyerName: 'خریدار',
    items: 'اقلام', total: 'مبلغ نهایی', tax: 'مالیات', discount: 'تخفیف', currency: 'واحد پول',
    category: 'دسته‌بندی',
  };
  const low = entries.filter(([, v]) => v < 70);
  if (!entries.length) return null;
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary" /> اطمینان فیلدها
          {low.length > 0 && <Badge className="bg-warning-soft text-warning !text-[10px]">{toFaDigits(low.length)} فیلد کم‌اطمینان</Badge>}
        </p>
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-primary hover:underline">
          {open ? 'بستن' : 'جزئیات'}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {entries.map(([field, value]) => (
            <div key={field} className="flex items-center justify-between rounded-lg bg-muted/60 px-2 py-1 text-[11px]">
              <span className="text-muted-foreground">{labels[field] ?? field}</span>
              <span className={cn('font-bold tabular-nums', value >= 80 ? 'text-accent' : value >= 55 ? 'text-warning' : 'text-danger')}>
                {toFaDigits(value)}٪
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------- یادآور سررسید */

export function DueDateCard({ invoice, onChange }: { invoice: Invoice; onChange: (date: string) => void }) {
  const days = invoice.dueDate
    ? Math.round((new Date(invoice.dueDate).getTime() - Date.now()) / 86400000)
    : null;
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold flex items-center gap-1.5"><Clock size={14} className="text-info" /> سررسید پرداخت</p>
        {days !== null && (
          <Badge className={cn('!text-[10px]', days < 0 ? 'bg-danger-soft text-danger' : days <= 7 ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent')}>
            {days < 0 ? `${toFaDigits(Math.abs(days))} روز گذشته` : `${toFaDigits(days)} روز مانده`}
          </Badge>
        )}
      </div>
      <Input type="date" value={invoice.dueDate ?? ''} onChange={(e) => onChange(e.target.value)} />
      <div className="flex gap-1.5 mt-2">
        {[7, 15, 30].map((d) => (
          <button key={d} className="chip bg-muted text-muted-foreground hover:text-primary !text-[10px]"
            onClick={() => onChange(new Date(Date.now() + d * 86400000).toISOString().slice(0, 10))}>
            {toFaDigits(d)} روز بعد
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- انتخاب سند از چندسند */

export function MultiDocModal({ open, documents, onClose, onPick }: {
  open: boolean;
  documents: { index: number; label: string; invoice: Invoice; confidence: number }[];
  onClose: () => void;
  onPick: (invoice: Invoice) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="این فایل چند سند دارد" size="lg"
      footer={<Button variant="ghost" onClick={onClose}>بستن</Button>}>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.index} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <span className="icon-tile h-9 w-9 bg-primary-soft text-primary text-xs font-extrabold">{toFaDigits(doc.index + 1)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{doc.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {toFaDigits(doc.invoice.items.length)} قلم · {formatMoney(payableOf(doc.invoice), doc.invoice.currency)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPick(doc.invoice)}>باز کردن</Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function NoAttachments() {
  return <EmptyState icon={<Paperclip size={22} />} title="پیوستی نیست" />;
}
