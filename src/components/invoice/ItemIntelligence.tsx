/**
 * پنل هوشمند اقلام
 *
 * این پنل همان جایی است که کاربر می‌بیند موتور چطور متن خام را فهمیده است:
 * هر خط چه نقشی گرفته، چرا یک ردیف کالا شد یا نشد، اطمینان هر قلم چقدر است،
 * چه ردیفی جا افتاده و اگر تصمیم ماشین درست نبود، کاربر با یک کلیک نقش خط را
 * عوض می‌کند. هیچ متنی بدون تصمیم روشن وارد فیلدهای کالا نمی‌شود.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ScanText, Sparkles, AlertTriangle, CheckCircle2, Eye, EyeOff, ChevronDown, Wand2,
  ListChecks, Tags, Ruler, Barcode, History, GitCompare, ArrowLeftRight, CircleSlash,
  Filter, SlidersHorizontal, Plus, PackageSearch,
} from 'lucide-react';
import { Card, CardTitle, Badge, Button, Select, ConfidenceBar } from '@/components/ui/primitives';
import { db } from '@/lib/db';
import { cn, toFaDigits, formatMoney, uid } from '@/lib/utils';
import type { Invoice, InvoiceItem } from '@/lib/types';
import {
  detectItems, mergeDuplicateItems, suggestTitleFixes, compareWithHistory, rejectedLines,
} from '@/lib/ocr/items';
import type { ItemAnalysis, LineRole, LineAnalysis } from '@/lib/ocr/items';

const ROLE_META: Record<LineRole, { label: string; tone: string; icon: React.ReactNode }> = {
  title: { label: 'عنوان کالا', tone: 'bg-accent-soft text-accent', icon: <Tags size={11} /> },
  numbers: { label: 'ردیف اعداد', tone: 'bg-primary-soft text-primary', icon: <ListChecks size={11} /> },
  header: { label: 'سرستون', tone: 'bg-info-soft text-info', icon: <SlidersHorizontal size={11} /> },
  summary: { label: 'جمع‌بندی', tone: 'bg-warning-soft text-warning', icon: <History size={11} /> },
  meta: { label: 'شناسنامه', tone: 'bg-muted text-muted-foreground', icon: <Barcode size={11} /> },
  promo: { label: 'تبلیغ/پانویس', tone: 'bg-danger-soft text-danger', icon: <CircleSlash size={11} /> },
  qty: { label: 'تعداد', tone: 'bg-primary-soft text-primary', icon: <Ruler size={11} /> },
  noise: { label: 'نویز', tone: 'bg-muted text-muted-foreground', icon: <Filter size={11} /> },
};

const ROLE_OPTIONS: LineRole[] = ['title', 'numbers', 'header', 'summary', 'meta', 'promo', 'qty', 'noise'];

type Tab = 'items' | 'lines' | 'quality';

export default function ItemIntelligence({ invoice, onApply }: {
  invoice: Invoice;
  onApply: (items: InvoiceItem[]) => void;
}) {
  const [tab, setTab] = useState<Tab>('items');
  const [overrides, setOverrides] = useState<Record<number, LineRole>>({});
  const [openItem, setOpenItem] = useState<number | null>(null);
  const [showAlternatives, setShowAlternatives] = useState<number | null>(null);
  const [knownTitles, setKnownTitles] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ title: string; unitPrice: number }>>([]);
  const [applied, setApplied] = useState(false);

  const hasRaw = Boolean(invoice.rawText?.trim());

  useEffect(() => {
    void (async () => {
      const products = await db.products.limit(200).toArray();
      setKnownTitles(products.map((p) => p.title));
      const invoices = await db.invoices.filter((row) => row.id !== invoice.id && !row.deletedAt).limit(80).toArray();
      const prices: Array<{ title: string; unitPrice: number }> = [];
      for (const row of invoices) for (const item of row.items) prices.push({ title: item.title, unitPrice: item.unitPrice });
      setHistory(prices);
    })();
  }, [invoice.id]);

  const analysis: ItemAnalysis | null = useMemo(
    () => (hasRaw ? detectItems(invoice.rawText, undefined, overrides) : null),
    [invoice.rawText, hasRaw, overrides],
  );

  const dedupe = useMemo(() => (analysis ? mergeDuplicateItems(analysis.items) : null), [analysis]);
  const fixes = useMemo(
    () => (analysis ? suggestTitleFixes(analysis.items, knownTitles) : []),
    [analysis, knownTitles],
  );
  const priceChanges = useMemo(
    () => (analysis ? compareWithHistory(analysis.items, history) : []),
    [analysis, history],
  );

  if (!analysis) {
    return (
      <Card>
        <CardTitle icon={<ScanText size={18} />} title="هوش اقلام" sub="متن خام سند لازم است" />
        <p className="text-xs leading-6 text-muted-foreground">
          برای اینکه موتور بتواند خطوط سند را از هم جدا کند، باید متن خوانده‌شده از تصویر موجود باشد.
          سند را از صفحه «اسکن» دوباره پردازش کنید.
        </p>
      </Card>
    );
  }

  const rejected = rejectedLines(analysis);
  const applying = () => {
    const items: InvoiceItem[] = analysis.items.map((item, index) => ({
      id: uid('itm_'),
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      taxRate: invoice.items[index]?.taxRate ?? invoice.items[0]?.taxRate ?? 0,
    }));
    onApply(items);
    setApplied(true);
    window.setTimeout(() => setApplied(false), 2500);
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="p-5 pb-3">
        <CardTitle
          icon={<Sparkles size={18} />}
          title="هوش اقلام"
          sub={`${toFaDigits(analysis.stats.totalLines)} خط بررسی شد · ${toFaDigits(analysis.items.length)} قلم ساخته شد · ${toFaDigits(rejected.length)} خط غیرکالایی رد شد`}
          action={<ConfidenceBar value={analysis.stats.averageConfidence} />}
        />
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge className="bg-accent-soft text-accent"><Tags size={11} /> {toFaDigits(analysis.stats.titleLines)} خط عنوان</Badge>
          <Badge className="bg-primary-soft text-primary"><ListChecks size={11} /> {toFaDigits(analysis.stats.numberLines)} ردیف عددی</Badge>
          <Badge className="bg-muted text-muted-foreground"><Filter size={11} /> {toFaDigits(analysis.stats.ignoredLines)} خط رد‌شده</Badge>
          {analysis.headerFields.length > 0 && (
            <Badge className="bg-info-soft text-info"><SlidersHorizontal size={11} /> سرستون: {analysis.headerFields.length} ستون</Badge>
          )}
          {analysis.missing.length > 0 && (
            <Badge className="bg-warning-soft text-warning"><AlertTriangle size={11} /> ردیف گمشده</Badge>
          )}
        </div>

        {analysis.items.length > 0 && !analysis.items.some((item) => item.unitPrice > 0) && (
          <div className="mb-3 rounded-xl bg-warning-soft px-3 py-2 text-[11px] leading-5 text-warning flex items-start gap-1.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              نام کالاها سالم خوانده شد ولی <b>هیچ مبلغی</b> در تصویر قابل خواندن نبود (ارقام مخدوش‌اند).
              اقلام را اعمال کنید و قیمت‌ها را دستی وارد کنید، یا از تصویر واضح‌تری استفاده کنید.
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-muted gap-1">
            {([
              ['items', 'اقلام', analysis.items.length],
              ['lines', 'خطوط', rejected.length],
              ['quality', 'کیفیت', analysis.missing.length],
            ] as const).map(([id, label, count]) => (
              <button key={id} onClick={() => setTab(id)}
                className={cn('rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors',
                  tab === id ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {label} <span className="opacity-60 tabular-nums">({toFaDigits(count)})</span>
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => { setOverrides({}); setApplied(false); }}>
            <ArrowLeftRight size={14} /> بازخوانی خودکار
          </Button>
          <Button size="sm" onClick={applying} disabled={!analysis.items.length}>
            {applied ? <CheckCircle2 size={15} /> : <Wand2 size={15} />}
            {applied ? 'اعمال شد' : 'اعمال در اقلام فاکتور'}
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------- اقلام */}
      {tab === 'items' && (
        <div className="border-t border-border divide-y divide-border">
          {analysis.items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              ردیف کالایی پیدا نشد؛ در زبانه «خطوط» ببینید کدام خطوط رد شده‌اند و نقششان را دستی درست کنید.
            </p>
          )}
          {analysis.items.map((item, index) => (
            <div key={`${item.title}-${index}`} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-[11px] font-bold text-muted-foreground tabular-nums w-6">
                  {toFaDigits(index + 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{item.title}</p>
                    {item.category && <Badge className="bg-primary-soft text-primary !text-[10px]"><Tags size={10} /> {item.category}</Badge>}
                    {item.unit && <Badge className="bg-muted text-muted-foreground !text-[10px]"><Ruler size={10} /> {item.unit}</Badge>}
                    {item.code && <Badge className="bg-muted text-muted-foreground !text-[10px]"><Barcode size={10} /> {toFaDigits(item.code)}</Badge>}
                    {item.needsReview && <Badge className="bg-warning-soft text-warning !text-[10px]"><AlertTriangle size={10} /> نیازمند بازبینی</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                    {item.unitPrice > 0 || item.total > 0 ? (
                      <>
                        {toFaDigits(item.quantity)} × {formatMoney(item.unitPrice, invoice.currency)}
                        {item.discount > 0 && <> − تخفیف {formatMoney(item.discount, invoice.currency)}</>}
                        {' = '}<span className="font-bold text-foreground">{formatMoney(item.total, invoice.currency)}</span>
                      </>
                    ) : (
                      <span className="text-warning font-semibold">مبلغ این ردیف در تصویر خوانده نشد</span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <ConfidenceBar value={item.confidence} size="xs" />
                    <span className="text-[10px] text-muted-foreground tabular-nums">{toFaDigits(item.confidence)}٪ اطمینان</span>
                    <button onClick={() => setOpenItem(openItem === index ? null : index)}
                      className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5">
                      چرا؟ <ChevronDown size={10} className={cn('transition-transform', openItem === index && 'rotate-180')} />
                    </button>
                    {item.alternatives.length > 0 && (
                      <button onClick={() => setShowAlternatives(showAlternatives === index ? null : index)}
                        className="text-[10px] font-bold text-info hover:underline flex items-center gap-0.5">
                        <GitCompare size={10} /> {toFaDigits(item.alternatives.length)} تفسیر جایگزین
                      </button>
                    )}
                  </div>
                  {openItem === index && (
                    <div className="mt-2 rounded-xl bg-muted/60 p-2.5 space-y-1">
                      {item.reasons.map((reason, i) => (
                        <p key={i} className="text-[11px] leading-5 text-muted-foreground flex items-start gap-1.5">
                          <CheckCircle2 size={11} className="text-accent mt-0.5 shrink-0" /> {reason}
                        </p>
                      ))}
                      {item.note && (
                        <p className="text-[11px] leading-5 text-warning flex items-start gap-1.5">
                          <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {item.note}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        ساخته‌شده از خطوط {item.sourceLines.map((line) => toFaDigits(line + 1)).join('، ')}
                      </p>
                    </div>
                  )}
                  {showAlternatives === index && (
                    <div className="mt-2 rounded-xl border border-border p-2 space-y-1">
                      <p className="text-[10px] text-muted-foreground mb-1">اگر ترتیب ستون‌ها را اشتباه خوانده‌ام، یکی را انتخاب کنید:</p>
                      {item.alternatives.map((alt, i) => (
                        <button key={i}
                          onClick={() => onApply([{
                            id: uid('itm_'), title: item.title, quantity: alt.quantity,
                            unitPrice: alt.unitPrice, discount: alt.discount,
                            taxRate: invoice.items[index]?.taxRate ?? invoice.items[0]?.taxRate ?? 0,
                          }])}
                          className="w-full text-right rounded-lg px-2 py-1.5 text-[11px] hover:bg-primary-soft transition-colors">
                          <span className="font-bold tabular-nums">{toFaDigits(alt.quantity)} × {formatMoney(alt.unitPrice, invoice.currency)}</span>
                          <span className="text-muted-foreground"> → {formatMoney(alt.total, invoice.currency)}</span>
                          <span className="block text-[10px] text-muted-foreground">{alt.reason}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {dedupe && dedupe.merged > 0 && (
            <div className="px-5 py-3 bg-info-soft/50">
              <p className="text-[11px] text-info flex items-center gap-1.5">
                <PackageSearch size={12} /> {toFaDigits(dedupe.merged)} ردیف تکراری پیدا شد و می‌تواند با ردیف هم‌نامش ادغام شود.
              </p>
            </div>
          )}
          {fixes.length > 0 && (
            <div className="px-5 py-3 bg-accent-soft/40">
              <p className="text-[11px] text-accent font-bold flex items-center gap-1.5 mb-1">
                <Wand2 size={12} /> اصلاح خودکار عنوان بر پایه کالاهای ثبت‌شده
              </p>
              {fixes.slice(0, 4).map((fix, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">«{fix.from}» → «{fix.to}»</p>
              ))}
            </div>
          )}
          {priceChanges.length > 0 && (
            <div className="px-5 py-3">
              <p className="text-[11px] font-bold flex items-center gap-1.5 mb-1 text-primary">
                <History size={12} /> مقایسه با خریدهای قبلی
              </p>
              {priceChanges.slice(0, 5).map((change, i) => (
                <p key={i} className="text-[11px] text-muted-foreground tabular-nums">
                  {change.title}: {formatMoney(change.previous, invoice.currency)} → {formatMoney(change.current, invoice.currency)}
                  <span className={cn('font-bold mr-1', change.percent > 0 ? 'text-danger' : 'text-accent')}>
                    ({toFaDigits(Math.abs(change.percent))}٪ {change.percent > 0 ? 'گران‌تر' : 'ارزان‌تر'})
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- خطوط */}
      {tab === 'lines' && (
        <div className="border-t border-border">
          <p className="px-5 py-2.5 text-[11px] text-muted-foreground bg-muted/40">
            هر خط متن یک نقش دارد. اگر موتور اشتباه فهمیده، نقش را از منوی روبه‌رو عوض کنید تا اقلام از نو ساخته شوند.
          </p>
          <div className="divide-y divide-border max-h-[420px] overflow-y-auto">
            {analysis.lines.map((line) => (
              <LineRow key={line.index} line={line} overrides={overrides} setOverrides={setOverrides} />
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- کیفیت */}
      {tab === 'quality' && (
        <div className="border-t border-border p-5 space-y-4">
          <div>
            <p className="text-xs font-bold mb-2 flex items-center gap-1.5"><SlidersHorizontal size={13} className="text-primary" /> کیفیت خوانش هر ستون</p>
            <div className="grid grid-cols-2 gap-2">
              {analysis.columns.map((col) => (
                <div key={col.field} className="rounded-xl bg-muted/60 px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground">{col.label}</p>
                  <p className="text-[13px] font-bold tabular-nums">
                    {toFaDigits(col.present)} ردیف
                    {col.suspicious > 0 && <span className="text-warning text-[10px] font-normal"> · {toFaDigits(col.suspicious)} مشکوک</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {analysis.missing.map((row, i) => (
            <div key={i} className="rounded-xl bg-warning-soft px-3 py-2.5">
              <p className="text-[11px] leading-5 text-warning font-semibold flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {row.reason}
              </p>
              {row.hintTitle && (
                <p className="text-[10px] text-muted-foreground mt-1">عنوان احتمالی این ردیف: «{row.hintTitle}»</p>
              )}
              <button
                onClick={() => onApply([...invoice.items, {
                  id: uid('itm_'), title: row.hintTitle ?? 'ردیف ناقص سند',
                  quantity: 1, unitPrice: row.amount, discount: 0,
                  taxRate: invoice.items[0]?.taxRate ?? 0,
                }])}
                className="mt-1.5 text-[11px] font-bold text-primary hover:underline flex items-center gap-1">
                <Plus size={11} /> افزودن ردیف به مبلغ {formatMoney(row.amount, invoice.currency)}
              </button>
            </div>
          ))}

          {analysis.warnings.length > 0 ? (
            <ul className="space-y-1">
              {analysis.warnings.map((warning, i) => (
                <li key={i} className="text-[11px] leading-5 text-muted-foreground flex items-start gap-1.5">
                  <Eye size={11} className="mt-0.5 shrink-0 text-info" /> {warning}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-accent flex items-center gap-1.5">
              <CheckCircle2 size={12} /> هیچ هشدار خوانشی وجود ندارد.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- یک خط */

function LineRow({ line, overrides, setOverrides }: {
  line: LineAnalysis;
  overrides: Record<number, LineRole>;
  setOverrides: (value: Record<number, LineRole>) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = ROLE_META[line.role];
  return (
    <div className="px-5 py-2">
      <div className="flex items-center gap-2">
        <span className={cn('chip !text-[10px] shrink-0', meta.tone)}>{meta.icon} {meta.label}</span>
        <button onClick={() => setOpen((v) => !v)} className="text-right text-[11px] flex-1 truncate hover:text-primary transition-colors">
          {line.text}
        </button>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{toFaDigits(line.confidence)}٪</span>
        <Select className="!py-1 !text-[10px] w-28 shrink-0" value={line.role}
          onChange={(event) => {
            const next = { ...overrides };
            const role = event.target.value as LineRole;
            if (role === line.role) delete next[line.index];
            else next[line.index] = role;
            setOverrides(next);
          }}>
          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_META[role].label}</option>)}
        </Select>
      </div>
      {open && (
        <p className="text-[10px] text-muted-foreground mt-1 flex items-start gap-1">
          <EyeOff size={10} className="mt-0.5 shrink-0" /> {line.reason}
          {line.numbers.length > 0 && <span className="tabular-nums"> · اعداد: {line.numbers.slice(0, 4).map((n) => toFaDigits(n.toLocaleString('en-US'))).join('، ')}</span>}
        </p>
      )}
    </div>
  );
}
