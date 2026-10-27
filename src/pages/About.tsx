import {
  ScanLine, ShieldCheck, Sparkles, HeartHandshake, Copyright, Mail, Phone, MapPin, Quote,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, Badge } from '@/components/ui/primitives';
import { toFaDigits } from '@/lib/utils';

const VALUES = [
  {
    icon: ShieldCheck,
    title: 'حریم خصوصی، خط قرمز ماست',
    text: 'اسناد مالی هر کسب‌وکاری محرمانه است. به همین دلیل موتور خوانش اسناد روی همان دستگاه کاربر اجرا می‌شود و تصویر فاکتورها بی‌نیاز از ارسال به سرویس بیرونی پردازش می‌شوند. داده‌ها فقط زیر حساب کاربری خود سازمان و با کنترل دسترسی نقش‌محور نگهداری می‌شوند.',
  },
  {
    icon: Sparkles,
    title: 'فناوری در خدمت وقت انسان',
    text: 'ساعت‌ها ورود دستی فاکتور در پایان هر روز، بزرگ‌ترین قاتل تمرکز واحد حسابداری است. فاکتوریزم این کار تکراری را به بینایی ماشین سپرده تا نیروی انسانی به کارهای واقعی‌اش برسد؛ نه اینکه نقشه آینده یک کسب‌وکار، پشت انبوه رسید و فاکتور گم شود.',
  },
  {
    icon: HeartHandshake,
    title: 'فروش فقط شروع رابطه است',
    text: 'هر مشتری پس از خرید، یک همکار بلندمدت محسوب می‌شود. سامانه تیکت داخل برنامه، پاسخ‌گویی مستقیم و انتشار منظم به‌روزرسانی، تضمین می‌کند که هیچ سازمانی بعد از پرداخت اشتراک، تنها رها نشود.',
  },
];

const MILESTONES = [
  { year: '۱۴۰۲', title: 'مشاهده میدانی درد واقعی', text: 'حضور در دفاتر حسابداری و دیدن رنج روزانه ورود دستی ده‌ها فاکتور و رسید حرارتی، جرقه اولیه محصول بود.' },
  { year: '۱۴۰۳', title: 'ساخت موتور بومی OCR فارسی', text: 'ترکیب موتور تشخیص متن با پارسر اختصاصی فاکتورهای فارسی؛ شماره، تاریخ شمسی، مالیات بر ارزش افزوده و اقلام با اتکای بالا استخراج شدند.' },
  { year: '۱۴۰۴', title: 'نسخه تجاری و امنیت سازمانی', text: 'افزودن حساب کاربری، نقش‌های دسترسی، لایسنس اشتراک، همگام‌سازی ابری و استقرار روی MySQL برای فروش سازمانی.' },
];

export default function About() {
  return (
    <div>
      <PageHeader
        title="درباره فاکتوریزم"
        subtitle="روایت یک محصول، از یک درد واقعی تا یک سامانه حرفه‌ای"
        icon={<ScanLine size={22} />}
      />

      {/* معرفی سازنده */}
      <Card className="relative overflow-hidden mb-5">
        <div className="absolute inset-0 opacity-[.05] bg-[radial-gradient(circle_at_100%_0%,var(--primary),transparent_55%)]" />
        <div className="relative grid lg:grid-cols-3 gap-8 items-center">
          <div className="flex flex-col items-center text-center">
            <span className="h-28 w-28 rounded-3xl gradient-brand text-white text-4xl font-black flex items-center justify-center shadow-xl shadow-primary/30 mb-4">
              س‌س
            </span>
            <h2 className="text-lg font-black">سعید سالاری</h2>
            <p className="text-xs text-muted-foreground mt-1">طراح و توسعه‌دهنده ارشد محصول</p>
            <div className="flex gap-2 mt-3 flex-wrap justify-center">
              <Badge className="bg-primary-soft text-primary">معماری نرم‌افزار</Badge>
              <Badge className="bg-accent-soft text-accent">بینایی ماشین</Badge>
              <Badge className="bg-warning-soft text-warning">امنیت اطلاعات</Badge>
            </div>
          </div>

          <div className="lg:col-span-2">
            <Quote size={26} className="text-primary/50 mb-3" />
            <p className="text-sm leading-8 text-muted-foreground">
              سال‌هاست در مسیر توسعه نرم‌افزارهای مالی و اداری کار می‌کنم و بارها از نزدیک دیدم که یک حسابدار
              باتجربه، ساعت‌های گران‌بهای روزش را صرف تایپ کردن اعداد فاکتورهای کاغذی می‌کند؛ کاری تکراری،
              خسته‌کننده و پر از خطای انسانی. فاکتوریزم از دل همین تجربه‌های واقعی بیرون آمد. آنچه برای من مهم
              بود فقط «ساخت یک نرم‌افزار» نبود؛ می‌خواستم ابزاری بسازم که صبح وقتی یک حسابدار سر کار می‌رسد،
              با آرامش یک فنجان چای، انبوه فاکتورهای دیروز را ظرف چند دقیقه اسکن کند و وقتش را به تحلیل واقعی
              هزینه‌ها و سود سازمانش بدهد. این محصول حاصل همان دغدغه است؛ با وسواس روی جزئیات فارسی، امنیت
              داده‌ها و تجربه‌ای که کاربر را خسته نکند.
            </p>
            <p className="text-sm font-bold mt-4">— سعید سالاری</p>
          </div>
        </div>
      </Card>

      {/* ارزش‌ها */}
      <div className="grid md:grid-cols-3 gap-4 mb-5 stagger">
        {VALUES.map((v) => (
          <Card key={v.title} className="hover:-translate-y-0.5 transition-transform">
            <span className="icon-tile h-11 w-11 bg-primary-soft text-primary mb-3"><v.icon size={20} /></span>
            <h3 className="font-extrabold text-sm mb-2">{v.title}</h3>
            <p className="text-xs leading-7 text-muted-foreground">{v.text}</p>
          </Card>
        ))}
      </div>

      {/* مسیر محصول */}
      <Card className="mb-5">
        <h3 className="font-extrabold text-base mb-6">مسیر شکل‌گیری محصول</h3>
        <div className="relative pr-2">
          <div className="absolute right-[11px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-7">
            {MILESTONES.map((m) => (
              <div key={m.year} className="relative pr-10">
                <span className="absolute right-0 top-1 h-6 w-6 rounded-full gradient-brand text-white text-[10px] font-black flex items-center justify-center">
                  ●
                </span>
                <div className="flex items-center gap-3 mb-1">
                  <Badge className="bg-primary-soft text-primary">{m.year}</Badge>
                  <h4 className="font-bold text-sm">{m.title}</h4>
                </div>
                <p className="text-xs leading-7 text-muted-foreground">{m.text}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* تماس و کپی‌رایت */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-extrabold text-sm mb-4">ارتباط با پشتیبانی</h3>
          <div className="space-y-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-2.5"><Mail size={15} className="text-primary" /> support@faktorizm.ir</p>
            <p className="flex items-center gap-2.5"><Phone size={15} className="text-primary" /> ۰۲۱-۰۰۰۰۰۰۰۰</p>
            <p className="flex items-center gap-2.5"><MapPin size={15} className="text-primary" /> تهران، ایران</p>
          </div>
        </Card>
        <Card className="flex flex-col justify-center items-center text-center gap-2">
          <Copyright size={22} className="text-primary" />
          <p className="text-sm font-bold">تمامی حقوق این نرم‌افزار محفوظ است</p>
          <p className="text-xs text-muted-foreground leading-6">
            فاکتوریزم و همه اجزای آن، شامل طراحی رابط، موتور پردازش و فرایندهای اختصاصی،
            محصول انحصاری سعید سالاری است. هرگونه تکثیر، مهندسی معکوس یا عرضه با نام دیگر،
            پیگرد قانونی دارد. نسخه {toFaDigits('2.0')} · {toFaDigits('1405')}
          </p>
        </Card>
      </div>
    </div>
  );
}
