import { useState } from 'react';
import { Sparkles, Search, CheckCircle2, ScanLine } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, Input, Badge } from '@/components/ui/primitives';
import { FEATURE_GROUPS, FEATURE_COUNT } from '@/lib/features';
import { toFaDigits, cn } from '@/lib/utils';

export default function Features() {
  const [q, setQ] = useState('');

  return (
    <div>
      <PageHeader
        title={`${toFaDigits(FEATURE_COUNT)} ویژگی حرفه‌ای فاکتوریزم`}
        subtitle="همه قابلیت‌ها در همین نسخه فعال و قابل استفاده هستند"
        icon={<Sparkles size={22} />}
      />

      <Card className="relative overflow-hidden mb-6 !p-8 text-center">
        <div className="absolute inset-0 opacity-[.05] bg-[radial-gradient(circle_at_50%_0%,var(--primary),transparent_65%)]" />
        <span className="icon-tile h-16 w-16 rounded-2xl gradient-brand text-white mx-auto mb-4 animate-float">
          <ScanLine size={28} />
        </span>
        <h3 className="text-xl font-extrabold mb-2">
          از لحظه اسکن تا اتصال به حسابداری، <span className="gradient-text">همه‌چیز یک‌جا</span>
        </h3>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-7">
          بینایی ماشین آفلاین، استخراج هوشمند فیلدهای فارسی، مدیریت کامل اسناد، گزارش‌های مالیاتی و API آماده یکپارچه‌سازی —
          بدون اینکه هیچ داده‌ای از دستگاه شما خارج شود.
        </p>
        <div className="max-w-md mx-auto mt-5 relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="!pr-9" placeholder="جستجو در ویژگی‌ها…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="space-y-6">
        {FEATURE_GROUPS.map((group) => {
          const features = group.features.filter((f) =>
            !q.trim() || f.title.includes(q.trim()) || f.desc.includes(q.trim()));
          if (!features.length) return null;
          return (
            <div key={group.id}>
              <div className="flex items-center gap-2.5 mb-3">
                <h3 className="font-extrabold text-sm">{group.title}</h3>
                <Badge className="bg-muted text-muted-foreground">{toFaDigits(group.features.length)}</Badge>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
                {features.map((f) => (
                  <Card key={f.title} className="hover:border-primary/40 hover:-translate-y-0.5 transition-all !p-4">
                    <div className="flex items-start gap-3">
                      <span className={cn('icon-tile h-10 w-10 shrink-0', group.tone)}><f.icon size={18} /></span>
                      <div className="min-w-0">
                        <h4 className="font-bold text-[13px] mb-1 flex items-center gap-1.5">
                          {f.title}
                          <CheckCircle2 size={13} className="text-accent shrink-0" />
                        </h4>
                        <p className="text-[11.5px] leading-6 text-muted-foreground">{f.desc}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
