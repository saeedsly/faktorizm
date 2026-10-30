import { useEffect, useRef, useState } from 'react';
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
import { checkServerOcr } from '@/lib/ocr/serverEngine';
import { AI_PROVIDERS, testAiConnection } from '@/lib/ocr/aiEngine';
import { PROVIDERS, FREE_BADGE, FREE_FIRST, keysOf } from '@/lib/ocr/providers';
import type { ProviderId } from '@/lib/ocr/providers';
import { ExternalLink, KeyRound, CheckCircle2, CloudCog, BookOpen } from 'lucide-react';

/** نشانگر موتور فعال OCR: سرویس محلی PP-OCRv5 یا موتور داخلی مرورگر */
function EngineBadge() {
  const [state, setState] = useState<'checking' | 'v5' | 'tesseract'>('checking');

  useEffect(() => {
    let alive = true;
    checkServerOcr().then((up) => {
      if (alive) setState(up ? 'v5' : 'tesseract');
    });
    return () => { alive = false; };
  }, []);
  if (state === 'checking') {
    return <Badge className="bg-muted text-muted-foreground">در حال بررسی موتور OCR…</Badge>;
  }
  if (state === 'v5') {
    return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">موتور محلی فعال: PP-OCRv5 (عربی/فارسی) — پشتیبان Tesseract 7</Badge>;
  }
  return <Badge className="bg-accent-soft text-accent">موتور فعال: Tesseract 7 — داده زبان فارسی ۴.۰ (درون‌مرورگر)</Badge>;
}

export default function SettingsPage() {
  const { settings, update, applyTheme } = useAppStore();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
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
          <CardTitle title="موتور بینایی ماشین (OCR)" sub="پیش‌فرض آفلاین و محلی؛ حالت ابری اختیاری برای بالاترین دقت" icon={<Cpu size={18} />} />
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
                <p className="text-[11px] text-muted-foreground mt-0.5">افزایش کیفیت، حذف نویز، تصحیح کجی و باینری هوشمند پیش از خوانش</p>
              </div>
              <Switch checked={s.autoPreprocess} onChange={(v) => set({ autoPreprocess: v })} />
            </div>

            <div className="rounded-xl border border-border p-3.5">
              <p className="mb-2 text-sm font-semibold">حالت خوانش</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  { id: 'local', title: 'آفلاین و محلی', desc: 'بدون اینترنت، داده از دستگاه خارج نمی‌شود' },
                  { id: 'hybrid', title: 'ترکیبی', desc: 'محلی + ابری هم‌زمان و انتخاب بهترین مقدار هر فیلد' },
                  { id: 'ai', title: 'فقط ابری (دقیق‌ترین)', desc: 'تصویر مستقیم به مدل بینایی می‌رود؛ OCR محلی اجرا نمی‌شود' },
                ] as const).map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => set({ ocrEngine: mode.id })}
                    className={`rounded-xl border p-3 text-right transition-all ${
                      s.ocrEngine === mode.id
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/25'
                        : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <p className="text-sm font-bold">{mode.title}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{mode.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {s.ocrEngine !== 'local' && (
              <div className="space-y-3 rounded-xl border border-border p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold flex items-center gap-1.5"><CloudCog size={15} className="text-primary" /> سرویس ابری</p>
                  <span className="text-[10px] text-muted-foreground">همه گزینه‌ها با کلید خودتان و ثبت‌نام رایگان</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {FREE_FIRST.map((id: ProviderId) => {
                    const info = PROVIDERS[id];
                    const badge = FREE_BADGE[info.free];
                    const active = s.aiProvider === id;
                    return (
                      <button
                        key={id}
                        onClick={() => set({ aiProvider: id, aiModel: '', aiBaseUrl: info.baseUrl })}
                        className={`rounded-xl border p-3 text-right transition-all ${
                          active ? 'border-primary bg-primary/10 ring-2 ring-primary/25' : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-bold">{info.label}</p>
                          <span className={`chip !text-[10px] ${badge.tone}`}>{badge.label}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{info.hint}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground/80">{info.rateNote}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>مدل</Label>
                    <Input
                      dir="ltr"
                      list="ai-model-list"
                      value={s.aiModel}
                      placeholder={PROVIDERS[s.aiProvider].defaultModel || 'نام مدل'}
                      onChange={(e) => set({ aiModel: e.target.value })}
                    />
                    <datalist id="ai-model-list">
                      {PROVIDERS[s.aiProvider].models.map((model) => (
                        <option key={model.id} value={model.id}>{model.label}</option>
                      ))}
                    </datalist>
                    {PROVIDERS[s.aiProvider].models.some((model) => model.best) && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        پیشنهاد: <span dir="ltr">{PROVIDERS[s.aiProvider].models.find((model) => model.best)!.id}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>آدرس پایه (Base URL)</Label>
                    <Input
                      dir="ltr"
                      value={s.aiBaseUrl}
                      placeholder={PROVIDERS[s.aiProvider].baseUrl || 'https://…/v1'}
                      onChange={(e) => set({ aiBaseUrl: e.target.value.trim() })}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      برای Ollama یا سرویس خودتان؛ خالی بگذارید تا آدرس رسمی استفاده شود.
                    </p>
                  </div>
                </div>

                {!PROVIDERS[s.aiProvider].keyless && (
                  <div>
                    <Label>کلیدهای API (هر خط یک کلید)</Label>
                    <textarea
                      dir="ltr"
                      rows={3}
                      autoComplete="off"
                      spellCheck={false}
                      value={s.aiKeys}
                      placeholder="key-one…&#10;key-two…"
                      onChange={(e) => set({ aiKeys: e.target.value })}
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-mono outline-none focus:border-primary"
                    />
                    <p className="mt-1.5 text-[11px] leading-6 text-muted-foreground">
                      چند کلید بگذارید تا وقتی یکی به سقف مصرف رایگان خورد، بعدی خودکار امتحان شود.
                      {' '}الان <b>{toFaDigits(keysOf(s).length)}</b> کلید ثبت شده است.
                    </p>
                  </div>
                )}

                <div className="rounded-xl bg-muted/70 p-3">
                  <p className="text-[11px] font-bold mb-1.5 flex items-center gap-1.5">
                    <KeyRound size={12} className="text-primary" />
                    گرفتن کلید رایگان از {PROVIDERS[s.aiProvider].label}
                  </p>
                  <ol className="text-[11px] leading-6 text-muted-foreground list-decimal pr-4 space-y-0.5">
                    {PROVIDERS[s.aiProvider].keySteps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {PROVIDERS[s.aiProvider].keyUrl && (
                      <a
                        href={PROVIDERS[s.aiProvider].keyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                      >
                        <ExternalLink size={11} /> باز کردن صفحه ساخت کلید
                      </a>
                    )}
                    <a
                      href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/ai-setup.html`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
                    >
                      <BookOpen size={11} /> آموزش کامل گرفتن کلید رایگان
                    </a>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-muted p-3">
                  <div>
                    <p className="text-sm font-semibold">هر بار بپرس</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">پیش از ارسال هر سند، اجازه بگیر</p>
                  </div>
                  <Switch checked={s.aiAskEachTime} onChange={(v) => set({ aiAskEachTime: v })} />
                </div>

                <Button
                  variant="outline"
                  onClick={async () => {
                    setAiState('checking');
                    const res = await testAiConnection({
                      provider: s.aiProvider,
                      apiKey: keysOf(s)[0] ?? '',
                      keys: keysOf(s),
                      baseUrl: s.aiBaseUrl,
                      model: s.aiModel,
                    });
                    setAiState(res.ok ? 'ok' : 'fail');
                    if (res.ok) toast.success(`اتصال به ${PROVIDERS[s.aiProvider].label} برقرار است`);
                    else toast.error(`اتصال برقرار نشد: ${res.error ?? 'خطای نامشخص'}`);
                  }}
                >
                  {aiState === 'checking' ? 'در حال بررسی…' : 'آزمون اتصال'}
                </Button>
                {aiState === 'ok' && (
                  <p className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 size={12} /> اتصال تایید شد.
                  </p>
                )}
                {aiState === 'fail' && (
                  <p className="text-[11px] font-semibold text-red-500">اتصال برقرار نشد؛ کلید، مدل یا آدرس پایه را بررسی کنید.</p>
                )}
              </div>
            )}

            <EngineBadge />
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
