import { useState } from 'react';
import { Modal, Button } from './ui/primitives';
import { ScanLine, FileSpreadsheet, KeyRound, Palette, ArrowLeft, Check } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const STEPS = [
  {
    icon: ScanLine,
    title: 'به فاکتوریزم خوش آمدید',
    desc: 'عکس، اسکن یا PDF فاکتورها را بگیرید؛ هوش مصنوعی همه فیلدها را خودش استخراج می‌کند. دیگر ورود دستی ده‌ها فاکتور در روز لازم نیست.',
    color: 'gradient-brand',
  },
  {
    icon: FileSpreadsheet,
    title: 'خروجی آماده حسابداری',
    desc: 'با یک کلیک خروجی اکسل چند‌صفحه‌ای بگیرید یا از قالب آماده سپیدار، همکاران سیستم، رایورز و پارسیان استفاده کنید.',
    color: 'gradient-accent',
  },
  {
    icon: KeyRound,
    title: 'API برای اتصال مستقیم',
    desc: 'با کلید API اختصاری، فاکتورها را مستقیم از نرم‌افزار حسابداری بخوانید و بنویسید. وب‌هوک و فایل OpenAPI هم آماده است.',
    color: 'bg-warning text-warning-foreground',
  },
  {
    icon: Palette,
    title: 'تجربه‌ای حرفه‌ای و فارسی',
    desc: 'رابط کاملاً راست‌چین با فونت وزیرمتن، تم تیره و روشن، تقویم شمسی، ۶۰ ویژگی و میانبرهای کیبورد.',
    color: 'bg-info text-white',
  },
];

export default function Onboarding() {
  const { update } = useAppStore();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = async () => {
    setOpen(false);
    await update({ onboarded: true });
  };

  return (
    <Modal open={open} onClose={finish} title="تور آشنایی با سامانه" size="md"
      footer={
        <>
          <Button variant="ghost" onClick={finish}>رد شدن</Button>
          {!last ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              بعدی
              <ArrowLeft size={16} />
            </Button>
          ) : (
            <Button variant="success" onClick={finish}>
              <Check size={16} />
              شروع کنید
            </Button>
          )}
        </>
      }
    >
      <div className="text-center py-4">
        <span className={`icon-tile h-20 w-20 rounded-3xl mx-auto text-white mb-5 ${current.color} animate-float`}>
          <current.icon size={36} />
        </span>
        <h3 className="text-lg font-extrabold mb-3">{current.title}</h3>
        <p className="text-sm leading-8 text-muted-foreground max-w-md mx-auto">{current.desc}</p>
        <div className="flex items-center justify-center gap-2 mt-7">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${i === step ? 'w-7 bg-primary' : 'w-2 bg-border'}`}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4">گام {step + 1} از {STEPS.length}</p>
      </div>
    </Modal>
  );
}
