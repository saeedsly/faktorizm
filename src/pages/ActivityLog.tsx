import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScrollText, ReceiptText, Users, Package, KeyRound, Settings2, Download, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, Input, Select, EmptyState, Badge } from '@/components/ui/primitives';
import { db } from '@/lib/db';
import { relativeTime, toFaDigits } from '@/lib/utils';
import { toJalali } from '@/lib/jalali';
import type { Activity } from '@/lib/types';

const ENTITY_META: Record<Activity['entity'], { icon: typeof ReceiptText; cls: string; label: string }> = {
  invoice: { icon: ReceiptText, cls: 'bg-primary-soft text-primary', label: 'فاکتور' },
  contact: { icon: Users, cls: 'bg-accent-soft text-accent', label: 'طرف حساب' },
  product: { icon: Package, cls: 'bg-warning-soft text-warning', label: 'کالا' },
  api: { icon: KeyRound, cls: 'bg-info-soft text-info', label: 'API' },
  export: { icon: Download, cls: 'bg-accent-soft text-accent', label: 'خروجی' },
  system: { icon: Settings2, cls: 'bg-muted text-muted-foreground', label: 'سیستم' },
};

export default function ActivityLog() {
  const activities = useLiveQuery(() => db.activities.orderBy('at').reverse().toArray(), []) ?? [];
  const [entity, setEntity] = useState('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => activities.filter((a) =>
    (entity === 'all' || a.entity === entity) &&
    (!q.trim() || a.detail.includes(q.trim()) || a.action.includes(q.trim())),
  ), [activities, entity, q]);

  return (
    <div>
      <PageHeader title="لاگ فعالیت" subtitle={`${toFaDigits(activities.length)} رخداد ثبت‌شده`} icon={<ScrollText size={22} />} />

      <Card className="!p-4 mb-5 grid md:grid-cols-12 gap-3">
        <div className="md:col-span-7 relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="!pr-9" placeholder="جستجو در رخدادها…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="md:col-span-5" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">همه بخش‌ها</option>
          {Object.entries(ENTITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </Card>

      <Card className="!p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={<ScrollText size={26} />} title="رخدادی ثبت نشده است"
            desc="همه اقدامات شما — اسکن، ویرایش، خروجی و تغییرات تنظیمات — اینجا ثبت می‌شود." />
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((a) => {
              const meta = ENTITY_META[a.entity];
              return (
                <div key={a.id} className="flex items-center gap-4 p-4 table-row-hover">
                  <span className={`icon-tile h-10 w-10 shrink-0 ${meta.cls}`}><meta.icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{a.action}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{a.detail}</p>
                  </div>
                  <Badge className="bg-muted text-muted-foreground hidden sm:inline-flex">{meta.label}</Badge>
                  <div className="text-left shrink-0">
                    <p className="text-[11px] text-muted-foreground">{relativeTime(a.at)}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{toJalali(a.at, 'yyyy/MM/dd HH:mm')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
