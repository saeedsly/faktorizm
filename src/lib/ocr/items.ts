/**
 * موتور اقلام — «مغز» فهم متن فاکتور
 *
 * مشکل اصلی فاکتورهای فارسی این است که متن OCR هیچ مرزی بین ردیف‌ها ندارد:
 * عنوان کالا در یک خط، اعداد در خط بعد، سرستون در وسط، و آدرس و تلفن و متن
 * جشنواره لابه‌لای همه. این موتور اول **نقش هر خط** را تعیین می‌کند
 * (عنوان کالا، اعداد ردیف، سرستون، جمع‌بندی، شناسنامه، تبلیغ، نویز)، بعد
 * از خطوط هم‌نقش، ردیف کالا می‌سازد و برای هر ردیف دلیل و اطمینان می‌دهد.
 *
 * ویژگی کلیدی: هیچ خطی «فقط چون عدد دارد» کالا نمی‌شود و هیچ متن پرتی داخل
 * عنوان کالا نمی‌رود. هر تصمیم با دلیلش به رابط کاربری گزارش می‌شود تا کاربر
 * بتواند نقش هر خط را با یک کلیک عوض کند.
 */
import {
  amountsOf, plausible, readHeader, isHeaderLine, isMetaLine, summaryKind, assignRoles,
  containsPhrase, hasWord, repairValue, normalizeWord, normalizeKeyword,
  amountDetails, persianRatio,
} from './primitives';
import type { Roles, SummaryKind, VendorHint } from './primitives';
import {
  hasProductWord, looksPromotional, looksLikePaymentHeader, looksLikePlace,
  guessCategory, findUnit, cleanTitle, findItemCode,
} from './lexicon';

/** نقش هر خط در سند */
export type LineRole =
  | 'title'      // عنوان کالا (متن بدون مبلغ)
  | 'numbers'    // ردیف اعداد یک کالا
  | 'header'     // سرستون جدول
  | 'summary'    // جمع‌بندی
  | 'meta'       // تلفن، کد اقتصادی، آدرس…
  | 'promo'      // متن تبلیغاتی/جشنواره
  | 'qty'        // تنها یک عدد کوچک (تعداد ردیف بعد)
  | 'noise';     // خط بی‌معنا

export interface LineAnalysis {
  index: number;
  text: string;
  role: LineRole;
  numbers: number[];
  reason: string;
  /** امتیاز اطمینان نقش این خط (۰ تا ۱۰۰) */
  confidence: number;
  summaryKind?: SummaryKind;
}

export interface ItemAlternative {
  title: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  reason: string;
}

export interface DetectedItem {
  title: string;
  /** عنوان خام، همان‌طور که در متن بود */
  titleRaw: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  /** مبلغی که روی سند چاپ شده بود و با محاسبه نمی‌خواند */
  readTotal?: number;
  code?: string;
  unit?: string;
  category?: string;
  confidence: number;
  needsReview?: boolean;
  note?: string;
  /** شماره خطوط متنی که این قلم از آن‌ها ساخته شد */
  sourceLines: number[];
  /** تفسیرهای جایگزین که کاربر می‌تواند با یک کلیک انتخاب کند */
  alternatives: ItemAlternative[];
  reasons: string[];
}

export interface MissingRowSuggestion {
  amount: number;
  reason: string;
  hintTitle?: string;
}

export interface ColumnQuality {
  field: 'qty' | 'unitPrice' | 'discount' | 'total';
  label: string;
  /** چند ردیف این ستون را داشتند */
  present: number;
  /** چند ردیف این ستون متناقض بود */
  suspicious: number;
}

export interface ItemAnalysis {
  items: DetectedItem[];
  lines: LineAnalysis[];
  header: string[];
  headerFields: Array<keyof Roles>;
  totals: { payable?: number; preDiscount?: number; discount?: number; tax?: number };
  itemsTotal: number;
  missing: MissingRowSuggestion[];
  warnings: string[];
  columns: ColumnQuality[];
  stats: {
    totalLines: number;
    titleLines: number;
    numberLines: number;
    ignoredLines: number;
    averageConfidence: number;
  };
}

const FIELD_LABELS: Record<ColumnQuality['field'], string> = {
  qty: 'تعداد',
  unitPrice: 'قیمت واحد',
  discount: 'تخفیف',
  total: 'مبلغ ردیف',
};

/**
 * طبقه‌بندی همه خطوط متن.
 * ترتیب بررسی مهم است: سرستون → جمع‌بندی → شناسنامه → تبلیغ → عددی → متنی.
 */
export function classifyLines(
  raw: string,
  hint?: VendorHint,
  overrides: Record<number, LineRole> = {},
): LineAnalysis[] {
  const extra: Partial<Record<SummaryKind, string[]>> = {};
  if (hint?.totalsKeywords?.length) extra.payable = hint.totalsKeywords;

  const lines = raw
    .split(/\r?\n/)
    // خط عمودی جدول در متن خام به‌جای فاصله نشسته است
    .map((line) => line.replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const classified = lines.map((text, index): LineAnalysis => {
    const tokens = amountDetails(text);
    const numbers = tokens.map((token) => token.value);
    const fine = numbers.filter(plausible);
    const valid = tokens.filter((token) => plausible(token.value) && token.value >= 1000);
    const repaired = valid.some((token) => token.repaired);
    const fields = readHeader(text);
    const wordsOnly = text
      .replace(/[0-9۰-۹٠-٩]+/g, ' ')
      .replace(/[^\u0600-\u06FFA-Za-z]/g, '')
      .trim();
    const persianWords = (text.match(/[\u0621-\u064A\u066E-\u06D3]{2,}/g) ?? []).length;
    const ratio = persianRatio(text);
    const product = hasProductWord(text);
    const hasBigAmount = valid.length > 0;

    // ۱) جمع‌بندی سند (قبل از هر چیز: خط جمع، هیچ‌وقت کالا نیست)
    const wordCountAll = text.split(/\s+/).filter(Boolean).length;
    const allowNoAmountSummary = !product && wordCountAll <= 6 && !isHeaderLine(text, fields);
    const kind = summaryKind(text, true, extra)
      ?? (allowNoAmountSummary ? summaryKind(text, false, extra) : null);
    if (kind) {
      return {
        index, text, role: 'summary', numbers, summaryKind: kind,
        reason: `${KIND_LABEL[kind]} سند است، نه کالا`, confidence: 95,
      };
    }

    // ۲) سرستون جدول یا سرستون بلوک پرداخت (پیش از قاعده نویز، چون واژه لاتین دارد)
    if (isHeaderLine(text, fields) && !product) {
      return { index, text, role: 'header', numbers, reason: 'دو یا چند عنوان ستون دارد و عدد ندارد', confidence: 92 };
    }
    if (looksLikePaymentHeader(text) && !hasBigAmount) {
      return { index, text, role: 'header', numbers, reason: 'سرستون بلوک پرداخت است، نه کالا', confidence: 88 };
    }

    // ۳) خطوط شناسنامه‌ای: تلفن، کد اقتصادی، آدرس، نام فروشگاه
    if (isMetaLine(text) || looksLikePlace(text)) {
      return { index, text, role: 'meta', numbers, reason: 'اطلاعات شناسنامه‌ای (تلفن/آدرس/کد/فروشگاه)', confidence: 90 };
    }

    // ۴) متن تبلیغاتی و پانویس
    if (looksPromotional(text)) {
      return { index, text, role: 'promo', numbers, reason: 'متن تبلیغاتی/جشنواره یا پانویس سند', confidence: 85 };
    }

    // ۵) آشغال اسکن: خطی که حروفش بیشتر لاتین است و مبلغ هم ندارد
    if (ratio < 0.35 && persianWords < 2 && !hasBigAmount) {
      return { index, text, role: 'noise', numbers, reason: 'خط لاتین بی‌معنا (نویز اسکن)', confidence: 25 };
    }

    // ۶) خط دارای دو مبلغ یا بیشتر: ردیف اعداد کالا
    if (valid.length >= 2) {
      return {
        index, text, role: 'numbers', numbers,
        reason: repaired
          ? `${valid.length} مبلغ در خط بود؛ ارقام مخدوش با جدول نویسه‌های مشابه بازیابی شد`
          : `${valid.length} عدد با مبلغ در یک خط: ردیف اعداد یک کالا`,
        confidence: repaired ? 62 : 88,
      };
    }

    // ۷) یک مبلغ در خط: اگر واژه‌های کالا هم دارد، عددش کد است نه مبلغ
    if (valid.length === 1) {
      // خطی که واژه سرستون دارد (تعداد/قیمت/مبلغ) ردیف مقدار است، نه عنوان
      if (persianWords >= 2 && fields.length === 0) {
        return {
          index, text, role: 'title', numbers,
          reason: 'خط عنوان کالا با یک عدد چسبیده (کد کالا)، نه ردیف مبلغ',
          confidence: product ? 84 : 66,
        };
      }
      return {
        index, text, role: 'numbers', numbers,
        reason: repaired ? 'تنها یک مبلغ مخدوش در خط: ردیف کالای تک‌ستونه' : 'تنها یک مبلغ در خط: ردیف کالای تک‌ستونه',
        confidence: repaired ? 45 : 70,
      };
    }

    // ۸) عدد غول‌آسا و بی‌معنا: نویز اسکن
    if (numbers.length && !fine.length && wordsOnly.length < 6) {
      return { index, text, role: 'noise', numbers, reason: 'عدد خارج از بازه مبلغ: نویز اسکن', confidence: 30 };
    }

    // ۹) خطی که فقط یک عدد کوچک است: تعداد ردیف بعد
    if (numbers.length === 1 && numbers[0] > 0 && numbers[0] < 1000 && wordsOnly.length < 3) {
      return { index, text, role: 'qty', numbers, reason: 'تنها یک عدد کوچک: تعداد ردیف بعدی', confidence: 60 };
    }

    // ۱۰) خط متنی با واژه‌های فارسی: عنوان کالا
    const hasPersianWord = /[\u0621-\u064A\u066E-\u06D3]{3,}/.test(text);
    const codeToken = /(^|\s)[A-Za-z]{1,3}\d{1,4}(\s|$)/.test(text);   // مثل «A4»
    if ((persianWords >= 2 || product || (persianWords >= 1 && codeToken && hasPersianWord))
      && wordsOnly.length >= 3) {
      return {
        index, text, role: 'title', numbers,
        reason: product
          ? 'نام کالا با واژه شناخته‌شده صنف'
          : persianWords >= 2 ? 'خط متنی فارسی: نام کالا' : 'خط متنی کوتاه: نام کالا',
        confidence: product ? 90 : persianWords >= 2 ? 72 : 55,
      };
    }

    // ۱۱) هر چیز دیگر: نویز
    return { index, text, role: 'noise', numbers, reason: 'خط بی‌معنا یا نویز اسکن', confidence: 20 };
  });

  // اصلاح ساختاری: عنوان کالا فقط بین سرستون جدول و جمع‌بندی سند معنا دارد
  const headerIndex = classified.findIndex((line) => line.role === 'header');
  const summaryIndex = classified.findIndex((line) => line.role === 'summary');
  const structured = classified.map((line) => {
    if (line.role !== 'title' || hasProductWord(line.text)) return line;
    if (headerIndex >= 0 && line.index < headerIndex) {
      return { ...line, role: 'noise' as LineRole, reason: 'پیش از سرستون جدول است (سربرگ فروشگاه)، نه کالا', confidence: 30 };
    }
    if (summaryIndex >= 0 && line.index > summaryIndex) {
      return { ...line, role: 'promo' as LineRole, reason: 'پس از جمع‌بندی سند آمده است (پانویس)، نه کالا', confidence: 40 };
    }
    return line;
  });

  // نقش‌هایی که کاربر دستی عوض کرده، بر تصمیم ماشین مقدم‌اند و دلیلشان هم عوض می‌شود
  return structured.map((line) => (
    overrides[line.index]
      ? { ...line, role: overrides[line.index], reason: 'نقش این خط را خودتان تعیین کرده‌اید', confidence: 100 }
      : line
  ));
}

const KIND_LABEL: Record<SummaryKind, string> = {
  payable: 'مبلغ قابل پرداخت',
  preDiscount: 'جمع قبل از تخفیف',
  discount: 'تخفیف کل',
  tax: 'مالیات',
};

const SUMMARY_TO_TOTAL: Record<SummaryKind, 'payable' | 'preDiscount' | 'discount' | 'tax'> = {
  payable: 'payable',
  preDiscount: 'preDiscount',
  discount: 'discount',
  tax: 'tax',
};

interface Block {
  titleLines: number[];
  titleWords: string[];
  numbersLine?: LineAnalysis;
  qtyLine?: LineAnalysis;
}

/**
 * تحلیل کامل اقلام یک سند.
 * @param raw متن خام OCR
 * @param hint دانش فروشنده (سرستون‌ها و کلیدواژه‌های جمع‌بندی)
 */
export function detectItems(
  raw: string,
  hint?: VendorHint,
  overrides: Record<number, LineRole> = {},
): ItemAnalysis {
  const lines = classifyLines(raw, hint, overrides);
  const warnings: string[] = [];

  let headerFields: Array<keyof Roles> = hint?.header?.length ? readHeader(hint.header.join(' ')) : [];
  const headerLabels: string[] = hint?.header?.length ? [...hint.header] : [];
  for (const line of lines) {
    if (line.role !== 'header') continue;
    const fields = readHeader(line.text);
    if (fields.length >= 2) {
      headerFields = fields;
      headerLabels.push(...line.text.split(/\s+/).filter(Boolean));
    }
  }

  const totals: ItemAnalysis['totals'] = {};
  for (const line of lines) {
    if (line.role !== 'summary' || !line.summaryKind) continue;
    // مبلغ جمع‌بندی باید سالم خوانده شده باشد؛ عدد بازسازی‌شده از نویسه مخدوش، مبلغ سند نیست
    const clean = amountDetails(line.text)
      .filter((token) => !token.repaired && plausible(token.value) && token.value >= 1000)
      .map((token) => token.value)
      .sort((a, b) => b - a);
    const value = clean[0];
    if (value === undefined) continue;
    const key = SUMMARY_TO_TOTAL[line.summaryKind];
    if (totals[key] === undefined) totals[key] = value;
    else if (totals[key] !== value && Math.abs(totals[key] - value) / Math.max(value, 1) > 0.01) {
      warnings.push(`«${line.text.slice(0, 34)}» دو بار با دو عدد مختلف خوانده شد؛ مقدار اول در نظر گرفته شد.`);
    }
  }

  // تخفیفِ تنها و بدون هیچ جمع دیگری قابل اعتماد نیست
  if (totals.discount && !totals.payable && !totals.preDiscount) {
    warnings.push('خط تخفیف بدون مبلغ نهایی سند خوانده شد و کنار گذاشته شد.');
    delete totals.discount;
  }

  /* ------------------------------------------------ ساخت ردیف‌ها از بلوک‌ها */
  const blocks: Block[] = [];
  let current: Block | null = null;
  let lastRole: LineRole = 'noise';

  const newBlock = (): Block => {
    const block: Block = { titleLines: [], titleWords: [] };
    blocks.push(block);
    return block;
  };

  for (const line of lines) {
    if (line.role === 'numbers') {
      // ردیف اعداد به بلوک عنوانِ قبل از خودش می‌چسبد؛ اگر عنوانی نبود، بلوک تازه
      const block = current && current.titleLines.length ? current : newBlock();
      block.numbersLine = line;
      current = null;
      lastRole = 'numbers';
      continue;
    }
    if (line.role === 'qty') {
      // «تعداد» تنها، منتظر عنوان بعدی می‌ماند
      if (!current) current = newBlock();
      current.qtyLine = line;
      lastRole = 'qty';
      continue;
    }
    if (line.role === 'title') {
      // خط دوم عنوان فقط وقتی به خط اول می‌چسبد که ادامه واقعی باشد:
      // کوتاه باشد، مبلغ نداشته باشد و خط قبلی هم یک عنوان کامل نباشد
      const previous = current && current.titleLines.length > 0 ? current : null;
      const continuation = Boolean(
        previous
        && lastRole === 'title'
        && previous.titleLines.length < 2
        && previous.titleWords.join(' ').split(' ').length <= 5
        && line.numbers.filter((n) => n >= 1000).length === 0,
      );
      if (!continuation) current = newBlock();
      current!.titleLines.push(line.index);
      current!.titleWords.push(line.text);
      lastRole = 'title';
      continue;
    }
    current = null;
    lastRole = line.role;
  }

  // خطوطی که ارقامشان با جدول نویسه‌های مشابه بازیابی شده‌اند
  const numberRepaired = new Map<number, boolean>();
  for (const line of lines) {
    if (line.role !== 'numbers') continue;
    const values = amountDetails(line.text).filter((token) => token.value >= 1000);
    numberRepaired.set(line.index, values.some((token) => token.repaired));
  }

  // اگر سند هیچ نشانه‌ای از جدول یا جمع‌بندی ندارد، متن یک نامه است نه فاکتور
  const hasTableSignals = lines.some((line) => ['numbers', 'header', 'summary'].includes(line.role));

  const items: DetectedItem[] = [];
  for (const block of blocks) {
    const numbersLine = block.numbersLine;
    const titleRaw = block.titleWords.join(' ');
    const title = cleanTitle(titleRaw);

    // ردیف بدون مبلغ: نام کالا درست خوانده شده ولی رقم‌هایش ناخوانا بوده‌اند
    if (!numbersLine) {
      if (!title || title.length < 3 || !hasTableSignals) continue;
      const repairedNote = 'مبلغ این ردیف در متن ناخوانا بود؛ قیمت را دستی وارد کنید.';
      items.push({
        title,
        titleRaw,
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        total: 0,
        category: guessCategory(title),
        unit: findUnit(titleRaw),
        confidence: 48,
        needsReview: true,
        note: repairedNote,
        sourceLines: [...block.titleLines],
        alternatives: [],
        reasons: [
          `عنوان از ${block.titleLines.length} خط متنی ساخته شد`,
          'ردیف اعداد این کالا خوانده نشد (ارقام مخدوش)',
        ],
      });
      continue;
    }

    if (!title) {
      // ردیف عدد بدون هیچ عنوان: اگر مبلغش در مقیاس قلم قبلی باشد، ادامه همان قلم است
      const values = numbersLine.numbers.filter(plausible);
      const last = items[items.length - 1];
      if (
        last && values.length === 1
        && values[0] < Math.max(last.unitPrice, last.total, 1) * 2
      ) {
        last.reasons.push('ردیف عددی بی‌عنوان با مقیاس همین کالا: به‌عنوان تخفیف/ادامه ردیف خوانده شد');
        last.sourceLines.push(numbersLine.index);
        if (!last.discount) {
          last.discount = values[0];
          last.total = Math.max(0, Math.round(last.quantity * last.unitPrice - last.discount));
        }
      } else {
        warnings.push(`ردیف عددی بدون عنوان در خط ${numbersLine.index + 1} نادیده گرفته شد (مقیاسش با اقلام نمی‌خواند).`);
      }
      continue;
    }

    const fine = numbersLine.numbers.filter(plausible);
    const repairedTokens = amountDetails(numbersLine.text).filter((token) => token.value >= 1000);
    const repairedCount = repairedTokens.filter((token) => token.repaired).length;
    // اگر بیشتر مبلغ‌های ردیف از نویسه‌های مخدوش بازیابی شده‌اند، عدد قابل اعتماد نیست
    const untrusted = repairedCount > 0 && repairedCount * 2 >= repairedTokens.length;
    if (untrusted) {
      items.push({
        title,
        titleRaw,
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        total: 0,
        category: guessCategory(title),
        unit: findUnit(titleRaw),
        confidence: 52,
        needsReview: true,
        note: 'مبلغ این ردیف در تصویر مخدوش بود و بازسازی‌اش قابل اعتماد نیست؛ دستی وارد کنید.',
        sourceLines: [...block.titleLines, numbersLine.index],
        alternatives: [],
        reasons: [
          `عنوان از ${block.titleLines.length} خط متنی ساخته شد`,
          'ارقام ردیف بیشتر با نویسه‌های شبیه رقم بازسازی شده بودند',
        ],
      });
      continue;
    }

    const roles = assignRoles(fine, headerFields);
    let quantity = roles.qty ?? block.qtyLine?.numbers[0] ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;

    let discount = roles.discount ?? 0;
    let unitPrice = roles.unitPrice ?? 0;
    let total = roles.total ?? 0;

    const repairedNumbers = numberRepaired.get(numbersLine.index) ?? false;
    const reasons: string[] = [
      `عنوان از ${block.titleLines.length} خط متنی ساخته شد`,
      `نقش اعداد از ${headerFields.length ? 'سرستون‌های سند' : 'معادله ردیف'} تعیین شد`,
    ];

    if (!unitPrice && total) unitPrice = Math.round((total + discount) / quantity);
    if (!total) total = Math.round(unitPrice * quantity - discount);

    let readTotal: number | undefined;
    let needsReview = false;
    let note: string | undefined;

    if (unitPrice > 0 && total > 0) {
      const expected = unitPrice * quantity - discount;
      const drift = Math.abs(total - expected) / Math.max(total, 1);
      if (drift > 0 && drift <= 0.02) {
        // مبلغ چاپ‌شده دقیق‌تر از محاسبه است (گرد کردن، عوارض)؛ دست نمی‌زنیم
        reasons.push('مبلغ چاپ‌شده با معادله ردیف می‌خواند');
      } else if (drift > 0.02) {
        readTotal = total;
        const repaired = repairValue(expected, total);
        if (repaired) {
          total = repaired;
          note = 'مبلغ ردیف اصلاح شد (یک رقم در خوانش جابه‌جا شده بود).';
          reasons.push('یک رقم در مبلغ ردیف جابه‌جا بود و اصلاح شد');
        } else {
          total = Math.max(0, Math.round(expected));
          needsReview = true;
          note = 'مبلغ چاپ‌شده با محاسبه ردیف نمی‌خواند؛ مقدار محاسبه‌شده گذاشته شد.';
          reasons.push('مبلغ چاپ‌شده با معادله ردیف نمی‌خواند: نیازمند بازبینی');
        }
      }
    }

    if (repairedNumbers) {
      needsReview = true;
      note = [note, 'ارقام مبلغ این ردیف در تصویر مخدوش بود؛ مقدار بازیابی‌شده را بازبینی کنید.'].filter(Boolean).join(' ');
      reasons.push('مبلغ از نویسه‌های مخدوش بازیابی شد');
    }

    if (discount > unitPrice * quantity) {
      needsReview = true;
      note = [note, 'تخفیف از مبلغ ردیف بیشتر است.'].filter(Boolean).join(' ');
    }

    // اطمینان قلم: از نقش خطوط، واژه‌های صنف و سلامت معادله
    const titleConfidence = block.titleWords.some((word) => hasProductWord(word)) ? 88 : 66;
    const numbersConfidence = numbersLine.confidence;
    const mathConfidence = needsReview ? 40 : 96;
    const confidence = Math.round(Math.min(98,
      0.35 * titleConfidence + 0.3 * numbersConfidence + 0.35 * mathConfidence));

    const code = findItemCode(titleRaw) ?? fine.find((n) => String(n).length >= 6 && n < 1_000_000)?.toString();
    const unit = findUnit(titleRaw);
    const category = guessCategory(title);

    items.push({
      title,
      titleRaw,
      quantity,
      unitPrice,
      discount,
      total,
      readTotal,
      code: code && !/^\d{7,}$/.test(code) ? code : undefined,
      unit,
      category,
      confidence,
      needsReview,
      note,
      sourceLines: numbersLine ? [...block.titleLines, numbersLine.index] : [...block.titleLines],
      alternatives: buildAlternatives(title, fine, headerFields),
      reasons,
    });
  }

  const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);

  /* -------------------------------------------------- ردیف‌های گمشده */
  const missing: MissingRowSuggestion[] = [];
  if (totals.payable && itemsTotal > 0) {
    const beforeTax = totals.payable - (totals.tax ?? 0);
    const diff = beforeTax - itemsTotal;
    if (Math.abs(diff) / Math.max(beforeTax, 1) > 0.02 && Math.abs(diff) > 999) {
      missing.push({
        amount: Math.abs(diff),
        reason: diff > 0
          ? `جمع اقلام ${itemsTotal.toLocaleString('en-US')} است ولی سند ${beforeTax.toLocaleString('en-US')} دارد؛ ردیفی به‌اندازه ${Math.abs(diff).toLocaleString('en-US')} کم است.`
          : `جمع اقلام از مبلغ سند بیشتر است (${Math.abs(diff).toLocaleString('en-US')})؛ احتمالاً ردیفی دوبار شمرده شده.`,
        hintTitle: suggestMissingTitle(lines),
      });
    }
  }

  /* -------------------------------------------------- کیفیت ستون‌ها */
  const columns: ColumnQuality[] = (['qty', 'unitPrice', 'discount', 'total'] as const).map((field) => {
    let present = 0;
    let suspicious = 0;
    for (const item of items) {
      if (field === 'qty' && item.quantity > 1) present++;
      if (field === 'unitPrice' && item.unitPrice > 0) present++;
      if (field === 'discount' && item.discount > 0) present++;
      if (field === 'total' && item.total > 0) present++;
      if (field === 'qty' && item.quantity === 1 && item.unitPrice === item.total) suspicious++;
    }
    return { field, label: FIELD_LABELS[field], present, suspicious };
  });

  // هشدارهای فهم
  if (!headerFields.length && items.length) {
    warnings.push('سرستون جدول پیدا نشد؛ نقش اعداد از معادله هر ردیف استنباط شد. اگر ستون‌ها را در فاکتور می‌بینید، یک بار تصویر واضح‌تری بدهید.');
  }
  if (items.some((item) => item.needsReview)) {
    warnings.push('بعضی ردیف‌ها با اطمینان کم خوانده شدند؛ مبلغشان را بازبینی کنید.');
  }
  const junkTitles = items.filter((item) => item.title.length < 4);
  if (junkTitles.length) warnings.push(`${junkTitles.length} قلم عنوان کوتاه و مشکوک دارد.`);
  if (!items.length) {
    warnings.push('هیچ ردیف کالایی در متن پیدا نشد؛ اگر فاکتور جدول دارد، تصویر را کامل‌تر و صاف‌تر بگیرید.');
  } else if (!items.some((item) => item.unitPrice > 0 || item.total > 0)) {
    warnings.push('نام کالاها خوانده شد ولی هیچ مبلغی سالم نبود (ارقام در تصویر مخدوش‌اند)؛ قیمت‌ها را دستی وارد کنید یا از تصویر واضح‌تری استفاده کنید.');
  }

  const averageConfidence = items.length
    ? Math.round(items.reduce((s, item) => s + item.confidence, 0) / items.length)
    : 0;

  return {
    items,
    lines,
    header: headerLabels,
    headerFields,
    totals,
    itemsTotal,
    missing,
    warnings,
    columns,
    stats: {
      totalLines: lines.length,
      titleLines: lines.filter((line) => line.role === 'title').length,
      numberLines: lines.filter((line) => line.role === 'numbers').length,
      ignoredLines: lines.filter((line) => ['meta', 'promo', 'noise'].includes(line.role)).length,
      averageConfidence,
    },
  };
}

/** عنوان احتمالی ردیف گمشده: متنی که بیشترین شباهت را به کالا دارد ولی ردیف نشد */
function suggestMissingTitle(lines: LineAnalysis[]): string | undefined {
  const firstSummary = lines.findIndex((line) => line.role === 'summary');
  const region = firstSummary >= 0 ? lines.slice(0, firstSummary) : lines;
  const candidates = region.filter((line) => line.role === 'title');
  const strong = candidates.filter((line) => line.confidence >= 70 && hasProductWord(line.text));
  const pool = strong.length ? strong : candidates;
  return pool[pool.length - 1]?.text.slice(0, 40);
}

/**
 * تفسیرهای جایگزین برای یک ردیف.
 * وقتی مبلغ چاپ‌شده با معادله نمی‌خواند، کاربر باید بتواند با یک کلیک
 * تفسیر درست را انتخاب کند: قیمت واحد جابه‌جا، تخفیف به‌جای قیمت، یا
 * تعداد اشتباه.
 */
export function buildAlternatives(
  title: string,
  numbers: number[],
  headerFields: Array<keyof Roles>,
): ItemAlternative[] {
  const out: ItemAlternative[] = [];
  if (numbers.length < 2) return out;
  const seen = new Set<string>();
  const push = (alt: ItemAlternative) => {
    const key = `${alt.quantity}-${alt.unitPrice}-${alt.discount}-${alt.total}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(alt);
  };

  const max = Math.max(...numbers);
  const others = numbers.filter((n) => n !== max);
  for (const candidate of others) {
    // تفسیر ۱: عدد بزرگ‌تر قیمت واحد است و عدد کوچک‌تر تخفیف
    push({
      title, quantity: 1, unitPrice: max, discount: candidate,
      total: Math.max(0, max - candidate),
      reason: `قیمت واحد ${max.toLocaleString('en-US')} و تخفیف ${candidate.toLocaleString('en-US')}`,
    });
    // تفسیر ۲: عدد کوچک‌تر تعداد است (اگر کوچک و صحیح باشد)
    if (Number.isInteger(candidate) && candidate > 1 && candidate < 200) {
      const unit = Math.round(max / candidate);
      push({
        title, quantity: candidate, unitPrice: unit, discount: 0,
        total: max,
        reason: `${candidate} عدد × ${unit.toLocaleString('en-US')}`,
      });
    }
  }
  // تفسیر سوم: از روی سرستون سند
  if (headerFields.length >= numbers.length) {
    const roles = assignRoles(numbers, headerFields);
    if (roles.unitPrice) {
      const quantity = roles.qty ?? 1;
      const discount = roles.discount ?? 0;
      push({
        title, quantity,
        unitPrice: roles.unitPrice,
        discount,
        total: roles.total ?? Math.max(0, roles.unitPrice * quantity - discount),
        reason: 'بر پایه ترتیب ستون‌های سرستون سند',
      });
    }
  }
  return out.slice(0, 4);
}

/** ادغام اقلام تکراری داخل یک سند (همان کالا دو بار خوانده شده) */
export function mergeDuplicateItems(items: DetectedItem[]): { items: DetectedItem[]; merged: number } {
  const out: DetectedItem[] = [];
  let merged = 0;
  for (const item of items) {
    const key = normalizeKeyword(item.title);
    const existing = out.find((row) => normalizeKeyword(row.title) === key && row.unitPrice === item.unitPrice);
    if (existing && key.length >= 4) {
      existing.quantity += item.quantity;
      existing.total += item.total;
      existing.discount += item.discount;
      existing.sourceLines.push(...item.sourceLines);
      existing.reasons.push('با یک ردیف هم‌نام در همین سند ادغام شد');
      merged++;
      continue;
    }
    out.push({ ...item, sourceLines: [...item.sourceLines], reasons: [...item.reasons] });
  }
  return { items: out, merged };
}

/** پیشنهاد اصلاح نام کالا با استفاده از کالاهای ثبت‌شده کاربر */
export function suggestTitleFixes(
  items: DetectedItem[],
  knownTitles: string[],
): Array<{ index: number; from: string; to: string; reason: string }> {
  const out: Array<{ index: number; from: string; to: string; reason: string }> = [];
  for (const [index, item] of items.entries()) {
    const flat = normalizeKeyword(item.title);
    if (flat.length < 4) continue;
    for (const known of knownTitles) {
      const knownFlat = normalizeKeyword(known);
      if (!knownFlat || knownFlat === flat) continue;
      const similarity = commonPrefixRatio(flat, knownFlat);
      if (similarity >= 0.8 && similarity < 1) {
        out.push({
          index, from: item.title, to: known,
          reason: `«${item.title}» شبیه کالای ثبت‌شده «${known}» است`,
        });
        break;
      }
    }
  }
  return out;
}

function commonPrefixRatio(a: string, b: string): number {
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  if (!shorter) return 0;
  if (longer.includes(shorter)) return shorter.length / longer.length + 0.15 > 1 ? 1 : 0.85;
  let same = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) same++;
    else break;
  }
  return same / longer.length;
}

/** مقایسه قیمت اقلام با آخرین خرید همان کالا */
export interface PriceChange {
  title: string;
  previous: number;
  current: number;
  percent: number;
}

export function compareWithHistory(
  items: DetectedItem[],
  history: Array<{ title: string; unitPrice: number }>,
): PriceChange[] {
  const out: PriceChange[] = [];
  for (const item of items) {
    const key = normalizeKeyword(item.title);
    if (key.length < 4) continue;
    const previous = history.find((row) => normalizeKeyword(row.title) === key);
    if (!previous || !previous.unitPrice || !item.unitPrice) continue;
    const percent = Math.round(((item.unitPrice - previous.unitPrice) / previous.unitPrice) * 100);
    if (Math.abs(percent) >= 5) {
      out.push({ title: item.title, previous: previous.unitPrice, current: item.unitPrice, percent });
    }
  }
  return out;
}

/** تعداد خطوطی که به‌عنوان کالا رد نشدند (برای پیام «چرا این خط کالا نشد») */
export function rejectedLines(analysis: ItemAnalysis): LineAnalysis[] {
  return analysis.lines.filter((line) => ['meta', 'promo', 'noise', 'header', 'summary'].includes(line.role));
}

export { containsPhrase, hasWord, normalizeWord, normalizeKeyword };
