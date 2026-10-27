import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2, Landmark, Cpu, Palette, DatabaseBackup, Info, Save, Upload, Download,
  Trash2, Moon, Sun, GraduationCap, RotateCcw,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, CardTitle, Input, Select, Label, Button, Switch, Badge } from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAppStore } from '@/lib/store';
import { exportBackup, importBackup } from '@/lib/exporters/backup';
import { seedDemoData, wipeAllData } from '@/lib/seed';
import { logActivity } from '@/lib/activity';
import { toFaDigits } from '@/lib/utils';

export default function SettingsPage() {
  const { settings, update, applyTheme } = useAppStore();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const s = settings;
  const set = (patch: Partial<typeof s>) => update(patch);

  const onImport = async (file: File) => {
    try {
      const r = await importBackup(file);
      toast.success('بازیابی انجام شد', { description: `${toFaDigits(r.invoices)} فاکتور و ${toFaDigits(r.contacts)} طرف حساب` });
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast.error('بازیابی انجام نشد', { description: e instanceof Error ? e.message : 'فایل نامعتبر' });
    }
  };

  return (
    <div>
      <PageHeader title="تنظیمات" subtitle="پیکربندی سامانه، موتور OCR و داده‌ها" icon={<Building2 size={22} />}
        actions={<Button onClick={() => toast.success('تنظیمات ذخیره شد')}><Save size={16} /> ذخیره</Button>} />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* پروفایل کسب‌وکار */}
        <Card>
          <CardTitle title="پروفایل کسب‌وکار" sub="روی فاکتور چاپی و خروجی‌ها درج می‌شود" icon={<Building2 size={18} />} />
          <div className="space-y-4">
            <div>
              <Label>نام کسب‌وکار</Label>
              <Input value={s.businessName} onChange={(e) => set({ businessName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>کد اقتصادی</Label>
                <Input value={s.businessEconomicCode} onChange={(e) => set({ businessEconomicCode: e.target.value })} />
              </div>
              <div>
                <Label>شناسه ملی</Label>
                <Input value={s.businessNationalId} onChange={(e) => set({ businessNationalId: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>تلفن</Label>
              <Input value={s.businessPhone} onChange={(e) => set({ businessPhone: e.target.value })} />
            </div>
            <div>
              <Label>نشانی</Label>
              <Input value={s.businessAddress} onChange={(e) => set({ businessAddress: e.target.value })} />
            </div>
          </div>
        </Card>

        {/* مالی */}
        <Card>
          <CardTitle title="تنظیمات مالی" icon={<Landmark size={18} />} />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>نرخ پیش‌فرض مالیات بر ارزش افزوده (٪)</Label>
                <Select value={s.defaultTaxRate} onChange={(e) => set({ defaultTaxRate: Number(e.target.value) })}>
                  {[0, 9, 10].map((r) => <option key={r} value={r}>{toFaDigits(r)}٪</option>)}
                </Select>
              </div>
              <div>
                <Label>واحد پول پیش‌فرض</Label>
                <Select value={s.currency} onChange={(e) => set({ currency: e.target.value as 'IRR' | 'IRT' })}>
                  <option value="IRT">تومان</option>
                  <option value="IRR">ریال</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>آستانه تایید خودکار پس از OCR (٪ اطمینان)</Label>
              <Input type="number" min={0} max={100} value={s.autoApproveThreshold}
                onChange={(e) => set({ autoApproveThreshold: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-6">
                اسنادی که اطمینان استخراج آن‌ها بالاتر از این عدد باشد، مستقیم «تایید شده» و بقیه در صف بازبینی می‌مانند.
              </p>
            </div>
          </div>
        </Card>

        {/* OCR */}
        <Card>
          <CardTitle title="موتور بینایی ماشین (OCR)" sub="کاملا آفلاین و روی همین مرورگر" icon={<Cpu size={18} />} />
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>زبان سند</Label>
                <Select value={s.ocrLangs} onChange={(e) => set({ ocrLangs: e.target.value as typeof s.ocrLangs })}>
                  <option value="fas+eng">فارسی + انگلیسی</option>
                  <option value="fas">فقط فارسی</option>
                  <option value="eng">فقط انگلیسی</option>
                </Select>
              </div>
              <div>
                <Label>کیفیت / سرعت</Label>
                <Select value={s.ocrQuality} onChange={(e) => set({ ocrQuality: e.target.value as typeof s.ocrQuality })}>
                  <option value="fast">سریع</option>
                  <option value="balanced">متعادل</option>
                  <option value="accurate">دقیق (کندتر)</option>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted p-3.5">
              <div>
                <p className="text-sm font-semibold">پیش‌پردازش خودکار تصویر</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">باینری Otsu، کنتراست و بزرگ‌سازی اسناد کم‌کیفیت</p>
              </div>
              <Switch checked={s.autoPreprocess} onChange={(v) => set({ autoPreprocess: v })} />
            </div>
            <Badge className="bg-accent-soft text-accent">نسخه موتور: Tesseract 7 — داده زبان فارسی ۴.۰</Badge>
          </div>
        </Card>

        {/* ظاهر */}
        <Card>
          <CardTitle title="ظاهر و شخصی‌سازی" icon={<Palette size={18} />} />
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => applyTheme('dark')}
              className={`rounded-xl border p-4 text-right transition-all ${s.theme === 'dark' ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'}`}>
              <Moon size={20} className="text-primary mb-2" />
              <p className="font-bold text-sm">حالت تیره</p>
              <p className="text-[11px] text-muted-foreground mt-1">مناسب کار طولانی</p>
            </button>
            <button onClick={() => applyTheme('light')}
              className={`rounded-xl border p-4 text-right transition-all ${s.theme === 'light' ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40'}`}>
              <Sun size={20} className="text-warning mb-2" />
              <p className="font-bold text-sm">حالت روشن</p>
              <p className="text-[11px] text-muted-foreground mt-1">نمای کلاسیک</p>
            </button>
          </div>
          <Button variant="outline" className="w-full mt-4" onClick={() => set({ onboarded: false })}>
            <GraduationCap size={16} /> اجرای دوباره تور آشنایی
          </Button>
        </Card>

        {/* داده و پشتیبان */}
        <Card className="lg:col-span-2">
          <CardTitle title="مدیریت داده و پشتیبان‌گیری" sub="همه داده‌ها در IndexedDB همین مرورگر ذخیره می‌شوند" icon={<DatabaseBackup size={18} />} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Button variant="outline" onClick={exportBackup}><Download size={16} /> خروجی پشتیبان JSON</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload size={16} /> بازیابی از فایل</Button>
            <Button variant="outline" onClick={async () => {
              await seedDemoData();
              toast.success('داده نمونه در دسترس است');
            }}><RotateCcw size={16} /> بارگذاری داده نمونه</Button>
            <Button variant="danger" onClick={() => setConfirmWipe(true)}><Trash2 size={16} /> پاک کردن همه داده</Button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          </div>
          <div className="mt-4 rounded-xl bg-muted p-4 flex items-start gap-3">
            <Info size={17} className="text-info shrink-0 mt-0.5" />
            <p className="text-[11.5px] leading-6 text-muted-foreground">
              توصیه می‌کنیم هفته‌ای یک‌بار خروجی پشتیبان بگیرید. پاک کردن کش مرورگر داده‌های محلی را حذف می‌کند،
              اما فایل پشتیبان قابل بازیابی کامل است. هیچ سندی به سرور خارجی ارسال نمی‌شود.
            </p>
          </div>
        </Card>
      </div>

      <ConfirmDialog open={confirmWipe} onClose={() => setConfirmWipe(false)} title="پاک کردن کامل داده‌ها"
        message="همه فاکتورها، طرفین حساب، کالاها، کلیدهای API و لاگ‌ها حذف می‌شوند. این عملیات قابل بازگشت نیست؛ بهتر است اول پشتیبان بگیرید."
        confirmLabel="بله، همه را پاک کن"
        loading={wiping}
        onConfirm={async () => {
          setWiping(true);
          await wipeAllData();
          await logActivity('پاک‌سازی', 'system', 'کاربر همه داده‌ها را پاک کرد');
          setConfirmWipe(false);
          toast.success('همه داده‌ها پاک شد');
          setTimeout(() => location.reload(), 1000);
        }} />
    </div>
  );
}
