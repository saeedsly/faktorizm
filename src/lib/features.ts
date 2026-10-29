import {
  Upload, Camera, FileText, ScanText, Wand2, Hash, CalendarDays, Users, ListOrdered,
  Percent, ShieldCheck, Layers, Search, Filter, PencilLine, Image as ImageIcon, Tags,
  FolderTree, StickyNote, CreditCard, Trash2, CheckSquare, CopyPlus, Save,
  ContactRound, UserPlus, History, Package, Sparkles, Scale,
  LayoutDashboard, LineChart, PieChart, Trophy, Landmark, CalendarRange, FileSpreadsheet,
  FileCog, FileDown, Printer, KeyRound, BookOpenCheck, TerminalSquare, FileCode2, PlugZap,
  Webhook, DatabaseBackup, LifeBuoy, MoonStar, Type, Building2, Settings2, Cpu, BellRing,
  ScrollText, GraduationCap, Keyboard, Rocket, Smartphone, Languages,
  UserCog, Lock, Ban, Gauge, UsersRound, UserX, MonitorSmartphone, FileKey,
  Network, EyeOff, Bug, Gift, Crown, MessageSquare,
  Database, HardDrive, CloudUpload, Zap, Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Feature {
  title: string;
  desc: string;
  icon: LucideIcon;
}

export interface FeatureGroup {
  id: string;
  title: string;
  tone: string;
  features: Feature[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'scan',
    title: 'اسکن و بینایی ماشین',
    tone: 'bg-primary-soft text-primary',
    features: [
      { title: 'آپلود کشیدنی', desc: 'بارگذاری فایل با Drag & Drop و انتخاب چندفایلی همزمان', icon: Upload },
      { title: 'اسکن با دوربین', desc: 'عکاسی مستقیم با دوربین موبایل و وب‌کم', icon: Camera },
      { title: 'پشتیبانی PDF چندصفحه‌ای', desc: 'خواندن خودکار تمام صفحات فایل PDF', icon: FileText },
      { title: 'OCR آفلاین فارسی و عربی', desc: 'موتور قوی PP-OCRv5 روی سرویس محلی و Tesseract داخل مرورگر به‌عنوان پشتیبان؛ بدون ارسال داده', icon: ScanText },
      { title: 'پیش‌پردازش هوشمند تصویر', desc: 'باینری Otsu، کنتراست و بزرگ‌سازی خودکار اسناد کم‌کیفیت', icon: Wand2 },
      { title: 'استخراج شماره فاکتور', desc: 'تشخیص خودکار شماره سند از الگوهای فارسی و لاتین', icon: Hash },
      { title: 'تشخیص هوشمند تاریخ', desc: 'پارس تاریخ شمسی، میلادی و نام ماه‌ها', icon: CalendarDays },
      { title: 'شناسایی طرف حساب', desc: 'استخراج نام فروشنده و خریدار از متن سند', icon: Users },
      { title: 'استخراج اقلام و قیمت‌ها', desc: 'جداسازی ردیف‌های کالا، تعداد، قیمت واحد و تخفیف', icon: ListOrdered },
      { title: 'تشخیص مالیات و تخفیف', desc: 'شناسایی ارزش افزوده، تخفیف و مبلغ قابل پرداخت', icon: Percent },
      { title: 'امتیاز اطمینان هر فیلد', desc: 'نمایش درصد اعتماد برای هر فیلد استخراج‌شده', icon: ShieldCheck },
      { title: 'صف پردازش گروهی', desc: 'پردازش پشت سر هم ده‌ها سند با نوار پیشرفت زنده', icon: Layers },
    ],
  },
  {
    id: 'invoices',
    title: 'مدیریت فاکتورها',
    tone: 'bg-accent-soft text-accent',
    features: [
      { title: 'جستجوی پیشرفته', desc: 'جستجو در شماره، طرف حساب، مبلغ و یادداشت‌ها', icon: Search },
      { title: 'فیلترهای چندگانه', desc: 'فیلتر وضعیت، پرداخت، دسته، جهت و بازه زمانی', icon: Filter },
      { title: 'فرم ویرایش حرفه‌ای', desc: 'ویرایش کامل با اعتبارسنجی و محاسبه خودکار', icon: PencilLine },
      { title: 'نمایش سند اصلی', desc: 'تصویر یا PDF اسکن‌شده کنار فرم بازبینی', icon: ImageIcon },
      { title: 'برچسب‌گذاری', desc: 'تگ‌های دلخواه برای دسته‌بندی سریع‌تر', icon: Tags },
      { title: 'دسته‌بندی هزینه', desc: 'گروه‌بندی فاکتورها بر اساس نوع کالا و خدمت', icon: FolderTree },
      { title: 'یادداشت داخلی', desc: 'ثبت توضیحات و پیگیری‌های هر فاکتور', icon: StickyNote },
      { title: 'مدیریت وضعیت پرداخت', desc: 'پرداخت‌شده، پیش‌پرداخت و پرداخت‌نشده', icon: CreditCard },
      { title: 'سطل بازیافت', desc: 'حذف نرم و بازیابی فاکتورها تا ۳۰ روز', icon: Trash2 },
      { title: 'عملیات گروهی', desc: 'تایید، آرشیو، برچسب و خروجی دسته‌جمعی', icon: CheckSquare },
      { title: 'کپی و ثبت دستی', desc: 'ایجاد فاکتور جدید از روی فاکتور موجود یا فرم خالی', icon: CopyPlus },
      { title: 'ذخیره خودکار پیش‌نویس', desc: 'اطلاعات بدون از دست رفتن ذخیره می‌شود', icon: Save },
    ],
  },
  {
    id: 'contacts',
    title: 'طرفین حساب و کالا',
    tone: 'bg-warning-soft text-warning',
    features: [
      { title: 'دفتر طرفین حساب', desc: 'مدیریت مشتریان و تامین‌کنندگان با کد اقتصادی', icon: ContactRound },
      { title: 'ثبت خودکار طرف حساب', desc: 'فروشنده جدید هنگام ذخیره فاکتور خودکار ثبت می‌شود', icon: UserPlus },
      { title: 'تاریخچه هر طرف حساب', desc: 'تمام فاکتورهای مرتبط با یک شخص در یک نگاه', icon: History },
      { title: 'دفتر کالا و خدمات', desc: 'کد، واحد سنجش، قیمت و مالیات اقلام', icon: Package },
      { title: 'تکمیل خودکار اقلام', desc: 'پیشنهاد کالاهای پرتکرار هنگام تایپ', icon: Sparkles },
      { title: 'واحد سنجش و کد کالا', desc: 'پشتیبانی از واحدها و کدگذاری اختصاصی', icon: Scale },
    ],
  },
  {
    id: 'reports',
    title: 'داشبورد و گزارش‌گیری',
    tone: 'bg-info-soft text-info',
    features: [
      { title: 'کارت‌های آماری کلیدی', desc: 'تصویر لحظه‌ای از حجم و مبلغ اسناد', icon: LayoutDashboard },
      { title: 'نمودار روند ماهانه', desc: 'نمودار تعاملی روند فاکتورها روی تقویم شمسی', icon: LineChart },
      { title: 'نمودار وضعیت‌ها', desc: 'توزیع بصری وضعیت اسناد و پرداخت‌ها', icon: PieChart },
      { title: 'برترین طرفین حساب', desc: 'رتبه‌بندی تامین‌کنندگان بر اساس مبلغ', icon: Trophy },
      { title: 'گزارش مالیات', desc: 'جمع‌بندی ارزش افزوده برای اظهارنامه', icon: Landmark },
      { title: 'فیلتر بازه تاریخ شمسی', desc: 'محدوده دلخواه روز، ماه و سال جلالی', icon: CalendarRange },
      { title: 'خروجی اکسل چند شیت', desc: 'شیت فاکتورها، اقلام و خلاصه با فرمت RTL', icon: FileSpreadsheet },
      { title: 'خروجی CSV', desc: 'سازگار با تمام نرم‌افزارهای جدولی', icon: FileCog },
      { title: 'خروجی PDF و چاپ', desc: 'فاکتور رسمی آماده چاپ با سربرگ کسب‌وکار', icon: FileDown },
      { title: 'چاپ مستقیم', desc: 'خروجی استاندارد چاپگر حرارتی و لیزری', icon: Printer },
    ],
  },
  {
    id: 'api',
    title: 'API و یکپارچه‌سازی',
    tone: 'bg-danger-soft text-danger',
    features: [
      { title: 'مرکز API و کلید اختصاصی', desc: 'ساخت و لغو کلیدهای دسترسی امن', icon: KeyRound },
      { title: 'مستندات تعاملی REST', desc: 'مرجع کامل endpointها با مثال', icon: BookOpenCheck },
      { title: 'کنسول تست زنده', desc: 'فراخوانی واقعی API داخل مرورگر و دیدن پاسخ', icon: TerminalSquare },
      { title: 'فایل OpenAPI/Swagger', desc: 'دانلود قرارداد استاندارد برای تیم فنی', icon: FileCode2 },
      { title: 'قالب نرم‌افزارهای حسابداری', desc: 'سپیدار، همکاران سیستم، رایورز و پارسیان', icon: PlugZap },
      { title: 'وب‌هوک', desc: 'اطلاع‌رسانی رویدادها به سرویس بیرونی', icon: Webhook },
      { title: 'پشتیبان و بازیابی JSON', desc: 'خروجی کامل و واردسازی امن داده‌ها', icon: DatabaseBackup },
      { title: 'راهنمای اتصال', desc: 'مستندات گام‌به‌گام اتصال به نرم‌افزار حسابداری', icon: LifeBuoy },
    ],
  },
  {
    id: 'ux',
    title: 'تجربه کاربری و تنظیمات',
    tone: 'bg-primary-soft text-primary',
    features: [
      { title: 'حالت تاریک و روشن', desc: 'تم حرفه‌ای با سازگاری کامل رنگ‌ها', icon: MoonStar },
      { title: 'فونت وزیرمتن و رابط RTL', desc: 'تایپوگرافی فارسی روان و چیدمان راست‌چین', icon: Type },
      { title: 'پروفایل کسب‌وکار', desc: 'نام، شناسه ملی و کد اقتصادی سربرگ', icon: Building2 },
      { title: 'تنظیم مالیات پیش‌فرض', desc: 'درصد ارزش افزوده و واحد پول دلخواه', icon: Settings2 },
      { title: 'تنظیمات موتور OCR', desc: 'انتخاب زبان و کیفیت تشخیص', icon: Cpu },
      { title: 'اعلان‌های هوشمند', desc: 'نوتیفیکیشن لحظه‌ای رویدادهای سامانه', icon: BellRing },
      { title: 'لاگ فعالیت', desc: 'ثبت تمام اقدامات کاربر با زمان دقیق', icon: ScrollText },
      { title: 'تور آشنایی', desc: 'راهنمای چندمرحله‌ای برای شروع سریع', icon: GraduationCap },
      { title: 'میانبرهای کیبورد', desc: 'ناوبری حرفه‌ای بدون موس', icon: Keyboard },
      { title: 'نصب به‌عنوان اپ', desc: 'PWA قابل نصب روی موبایل و دسکتاپ', icon: Smartphone },
      { title: 'معماری خصوصی‌محور', desc: 'داده‌ها هرگز از دستگاه شما خارج نمی‌شوند', icon: ShieldCheck },
      { title: 'دوزبانگی اعداد', desc: 'نمایش ارقام فارسی و لاتین در همه جا', icon: Languages },
    ],
  },
  {
    id: 'security',
    title: 'امنیت و احراز هویت',
    tone: 'bg-danger-soft text-danger',
    features: [
      { title: 'ثبت‌نام و ورود امن', desc: 'حساب کاربری اختصاصی برای هر نفر با ایمیل و رمز عبور', icon: UserCog },
      { title: 'هش رمز با bcrypt و سیاست رمز قوی', desc: 'رمز فقط به‌صورت هش‌شده نگهداری می‌شود و ضوابع پیچیدگی اجباری است', icon: Lock },
      { title: 'احراز هویت دو عاملی TOTP', desc: 'کد شش رقمی Google Authenticator در کنار رمز عبور', icon: Smartphone },
      { title: 'JWT و Refresh چرخشی', desc: 'توکن کوتاه‌مدت و توکن بازیابی با تشخیص بازاستفاده', icon: KeyRound },
      { title: 'قفل خودکار حساب', desc: 'پس از پنج تلاش ناموفق، حساب پانزده دقیقه قفل می‌شود', icon: Ban },
      { title: 'محدودیت نرخ درخواست', desc: 'Rate Limiting برای خنثی کردن حمله جست‌وجوی فراگیر', icon: Gauge },
      { title: 'پنج نقش سازمانی (RBAC)', desc: 'مالک، مدیر، حسابدار، اپراتور و مشاهده‌گر با دسترسی دقیق', icon: UsersRound },
      { title: 'مدیریت و تعلیق کاربران', desc: 'ساخت کاربر، تغییر نقش، تعلیق و باز کردن قفل توسط مدیر', icon: UserX },
      { title: 'جلسات فعال و خروج از راه دور', desc: 'فهرست دستگاه‌های متصل و ابطال جلسه هر کاربر', icon: MonitorSmartphone },
      { title: 'بازیابی رمز با توکن یک‌بارمصرف', desc: 'توکن سی دقیقه‌ای با مصرف یک‌باره و ابطال خودکار جلسات', icon: FileKey },
      { title: 'ممیزی امنیتی همه اقدامات', desc: 'ثبت IP، رویداد و عامل هر تغییر در لاگ تفکیک‌ناپذیر', icon: ScrollText },
      { title: 'هدرهای امنیتی و CORS', desc: 'Helmet، Content-Security-Policy و فهرست مجاز مبدا درخواست', icon: Network },
      { title: 'ضد SQL Injection با Zod', desc: 'اعتبارسنجی همه ورودی‌ها و کوئری‌های کاملا پارامتریزه', icon: ShieldCheck },
      { title: 'جداسازی چندسازمانی', desc: 'هر سازمان فقط داده خودش را می‌بیند (Multi-tenant)', icon: Building2 },
      { title: 'جلوگیری از IDOR', desc: 'بررسی مالکیت رکورد در هر درخواست برای نبود دسترسی عرضی', icon: EyeOff },
      { title: 'محافظت XSS و سقف حجم بدنه', desc: 'خنثی‌سازی اسکریپت و محدودیت دو مگابایتی بار درخواست', icon: Bug },
    ],
  },
  {
    id: 'billing',
    title: 'اشتراک و پشتیبانی',
    tone: 'bg-warning-soft text-warning',
    features: [
      { title: 'کد اشتراک پیش‌پرداخت هش‌شده', desc: 'کد FKM با الفبای بدون ابهام و ذخیره هش‌شده در دیتابیس', icon: CreditCard },
      { title: 'پلن ماهانه، فصلی و سالانه', desc: 'سه سطح اشتراک با قیمت و مدت اعتبار مشخص', icon: CalendarRange },
      { title: 'قفل خودکار پس از انقضا', desc: 'بخش‌های کاری تا تمدید مسدود و داده‌ها حفظ می‌شوند', icon: Lock },
      { title: 'دوره آزمایشی چهارده روزه', desc: 'دسترسی کامل هنگام ثبت‌نام بدون نیاز به پرداخت اولیه', icon: Gift },
      { title: 'تولید دسته‌ای کد اشتراک', desc: 'ساخت گروهی کد برای فروش و خروجی CSV آماده توزیع', icon: Layers },
      { title: 'داشبورد وضعیت اشتراک', desc: 'روزشمار روزهای باقی‌مانده و تاریخ دقیق انقضا', icon: Crown },
      { title: 'تیکت پشتیبانی با اولویت', desc: 'ثبت درخواست با چهار سطح اولویت و وضعیت پیگیری', icon: LifeBuoy },
      { title: 'گفتگوی رشته‌ای تیکت', desc: 'تبادل پیام بین کاربر و پشتیبانی داخل خود سامانه', icon: MessageSquare },
    ],
  },
  {
    id: 'infra',
    title: 'زیرساخت و تضمین کیفیت',
    tone: 'bg-info-soft text-info',
    features: [
      { title: 'پایگاه داده MySQL با Connection Pool', desc: 'ذخیره‌سازی حرفه‌ای با حداکثر بیست اتصال همزمان مدیریت‌شده', icon: Database },
      { title: 'اسکیمای رسمی و مهاجرت دیتابیس', desc: 'فایل SQL استاندارد با InnoDB و utf8mb4 فارسی', icon: HardDrive },
      { title: 'همگام‌سازی ابری داده آفلاین', desc: 'ارسال و دریافت خودکار اسناد بین دستگاه و سرور', icon: CloudUpload },
      { title: 'تست نفوذ دوازده بردار حمله', desc: 'آزمون خودکار تزریق، دور زدن احراز و ارتقای دسترسی', icon: Zap },
      { title: 'تست بار سه‌هزار کاربر', desc: 'سنجش پایداری و تاخیر پاسخ در بار سنگین همزمان', icon: Activity },
    ],
  },
];

export const ALL_FEATURES: Feature[] = FEATURE_GROUPS.flatMap((g) => g.features);
export const FEATURE_COUNT = ALL_FEATURES.length;
