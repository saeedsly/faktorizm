import {
  Upload, Camera, FileText, ScanText, Wand2, Hash, CalendarDays, Users, ListOrdered,
  Percent, ShieldCheck, Layers, Search, Filter, PencilLine, Image as ImageIcon, Tags,
  FolderTree, StickyNote, CreditCard, Trash2, CheckSquare, CopyPlus, Save,
  ContactRound, UserPlus, History, Package, Sparkles, Scale,
  LayoutDashboard, LineChart, PieChart, Trophy, Landmark, CalendarRange, FileSpreadsheet,
  FileCog, FileDown, Printer, KeyRound, BookOpenCheck, TerminalSquare, FileCode2, PlugZap,
  Webhook, DatabaseBackup, LifeBuoy, MoonStar, Type, Building2, Settings2, Cpu, BellRing,
  ScrollText, GraduationCap, Keyboard, Rocket, Smartphone, Languages,
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
      { title: 'OCR آفلاین فارسی و انگلیسی', desc: 'موتور تشخیص متن Tesseract روی دستگاه، بدون ارسال داده', icon: ScanText },
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
];

export const ALL_FEATURES: Feature[] = FEATURE_GROUPS.flatMap((g) => g.features);
export const FEATURE_COUNT = ALL_FEATURES.length;
