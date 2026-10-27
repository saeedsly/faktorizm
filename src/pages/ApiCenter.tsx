import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import {
  KeyRound, Plus, Copy, Trash2, BookOpenCheck, TerminalSquare, Webhook, FileCode2,
  CheckCircle2, AlertCircle, Send, Eye, EyeOff, Play,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import {
  Button, Card, CardTitle, Input, Textarea, Select, Label, Modal, Tabs, Badge, EmptyState,
} from '@/components/ui/primitives';
import ConfirmDialog from '@/components/ConfirmDialog';
import { db } from '@/lib/db';
import {
  createApiKey, revokeApiKey, handleApiRequest, API_ENDPOINTS, buildOpenApiSpec,
  createWebhook, testWebhook,
} from '@/lib/api/engine';
import { downloadText, relativeTime, toFaDigits, cn } from '@/lib/utils';
import type { ApiResponse } from '@/lib/api/engine';

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-accent-soft text-accent',
  POST: 'bg-primary-soft text-primary',
  PUT: 'bg-warning-soft text-warning',
  DELETE: 'bg-danger-soft text-danger',
};

export default function ApiCenter() {
  const keys = useLiveQuery(() => db.apiKeys.toArray(), []) ?? [];
  const hooks = useLiveQuery(() => db.webhooks.toArray(), []) ?? [];
  const [tab, setTab] = useState('keys');
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState('');

  // کنسول
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/api/v1/invoices?limit=5');
  const [body, setBody] = useState('{\n  "number": "API-1001",\n  "issuerName": "شرکت نمونه",\n  "items": []\n}');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [sending, setSending] = useState(false);

  const toggleVisible = (id: string) =>
    setVisible((prev) => new Set(prev).has(id) ? new Set([...prev].filter((x) => x !== id)) : new Set(prev).add(id));

  const maskKey = (k: string) => k.slice(0, 12) + '•'.repeat(16) + k.slice(-4);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('در کلیپ‌بورد کپی شد');
  };

  const send = async () => {
    if (!keys.length) { toast.error('اول یک کلید API بسازید'); setTab('keys'); return; }
    setSending(true);
    let parsed: unknown = undefined;
    if (method !== 'GET' && body.trim()) {
      try { parsed = JSON.parse(body); }
      catch { toast.error('بدنه درخواست JSON معتبر نیست'); setSending(false); return; }
    }
    const res = await handleApiRequest(method, path, parsed, keys[0].key);
    setResponse(res);
    setSending(false);
    if (res.status < 400) toast.success('درخواست موفق'); else toast.error('درخواست ناموفق');
  };

  return (
    <div>
      <PageHeader
        title="مرکز API و یکپارچه‌سازی"
        subtitle="اتصال مستقیم نرم‌افزار حسابداری به فاکتوریزم با REST API"
        icon={<KeyRound size={22} />}
        actions={
          <Button variant="outline" size="sm" onClick={() =>
            downloadText(JSON.stringify(buildOpenApiSpec(), null, 2), 'faktorizm-openapi.json')}>
            <FileCode2 size={15} /> دانلود OpenAPI
          </Button>
        }
      />

      <Tabs active={tab} onChange={setTab}
        tabs={[
          { id: 'keys', label: 'کلیدهای API', icon: <KeyRound size={15} />, count: keys.length },
          { id: 'docs', label: 'مستندات', icon: <BookOpenCheck size={15} /> },
          { id: 'console', label: 'کنسول تست', icon: <TerminalSquare size={15} /> },
          { id: 'webhooks', label: 'وب‌هوک', icon: <Webhook size={15} />, count: hooks.length },
        ]} />

      <div className="mt-5">
        {tab === 'keys' && (
          <div className="space-y-4">
            <Card className="flex flex-wrap items-center justify-between gap-3 bg-primary-soft border-transparent">
              <div>
                <h3 className="font-bold text-sm mb-1">احراز هویت با هدر x-api-key</h3>
                <p className="text-xs text-muted-foreground leading-6">
                  هر کلید را در هدر درخواست‌ها بفرستید: <code className="bg-card px-2 py-1 rounded-lg text-[11px]" dir="ltr">x-api-key: fk_live_…</code>
                </p>
              </div>
              <Button onClick={() => setCreateOpen(true)}><Plus size={16} /> کلید جدید</Button>
            </Card>

            {keys.length === 0 ? (
              <Card><EmptyState icon={<KeyRound size={26} />} title="هنوز کلیدی ساخته نشده است"
                desc="برای اتصال نرم‌افزار حسابداری، اولین کلید API خود را بسازید."
                action={<Button onClick={() => setCreateOpen(true)}><Plus size={16} /> ساخت کلید</Button>} /></Card>
            ) : (
              <div className="space-y-3">
                {keys.map((k) => (
                  <Card key={k.id} className="!p-4 flex flex-wrap items-center gap-4">
                    <span className={cn('icon-tile h-11 w-11', k.enabled ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger')}>
                      <KeyRound size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm">{k.name}</p>
                        <Badge className={k.enabled ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'}>
                          {k.enabled ? 'فعال' : 'غیرفعال'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 font-mono" dir="ltr">
                        {visible.has(k.id) ? k.key : maskKey(k.key)}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        ساخته شده {relativeTime(k.createdAt)}
                        {k.lastUsedAt && ` · آخرین استفاده ${relativeTime(k.lastUsedAt)}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => toggleVisible(k.id)}>
                        {visible.has(k.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copy(k.key)}><Copy size={14} /> کپی</Button>
                      <Button size="sm" variant="danger" onClick={() => setRevokeId(k.id)}><Trash2 size={14} /></Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <Card className="!p-0 overflow-hidden">
            <div className="p-5 border-b border-border">
              <CardTitle title="اندپوینت‌های REST" sub="پایه آدرس: https://your-server.example.com" />
              <div className="rounded-xl bg-muted p-3 text-[11px] leading-6" dir="ltr">
                <p className="text-muted-foreground" dir="rtl">نمونه درخواست:</p>
                <code>curl -H "x-api-key: fk_live_xxxx" https://your-server.example.com/api/v1/invoices?status=review</code>
              </div>
            </div>
            <div className="divide-y divide-border">
              {API_ENDPOINTS.map((e) => (
                <div key={e.method + e.path} className="flex items-center gap-4 p-4 table-row-hover">
                  <Badge className={cn('w-16 justify-center font-mono', METHOD_COLORS[e.method])}>{e.method}</Badge>
                  <code className="text-[12px] font-mono flex-1" dir="ltr">{e.path}</code>
                  <span className="text-xs text-muted-foreground hidden md:block text-left w-64">{e.desc}</span>
                  {!e.auth && <Badge className="bg-muted text-muted-foreground">بدون احراز</Badge>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === 'console' && (
          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <CardTitle title="ارسال درخواست زنده" sub="روی همین دیتابیس محلی اجرا می‌شود" icon={<TerminalSquare size={18} />} />
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Select value={method} onChange={(e) => setMethod(e.target.value)} className="!w-28">
                    {['GET', 'POST', 'PUT', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
                  </Select>
                  <Input dir="ltr" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/api/v1/invoices" />
                </div>
                <Textarea dir="ltr" rows={9} className="font-mono !text-xs" value={body}
                  onChange={(e) => setBody(e.target.value)} placeholder='{"key":"value"}' disabled={method === 'GET'} />
                <Button onClick={send} loading={sending} className="w-full"><Send size={16} /> ارسال درخواست</Button>
                {!keys.length && <p className="text-[11px] text-warning flex items-center gap-1.5"><AlertCircle size={13} /> ابتدا از تب کلیدها یک کلید بسازید.</p>}
              </div>
            </Card>

            <Card>
              <CardTitle title="پاسخ سرور" icon={<Play size={18} />}
                action={response && (
                  <Badge className={response.status < 400 ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger'}>
                    {response.status < 400 ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />} {toFaDigits(response.status)}
                  </Badge>
                )} />
              {response ? (
                <pre dir="ltr" className="text-[11px] leading-6 bg-muted rounded-xl p-4 overflow-auto max-h-[380px] font-mono">
                  {JSON.stringify(response.json, null, 2)}
                </pre>
              ) : (
                <EmptyState icon={<TerminalSquare size={24} />} title="درخواستی اجرا نشده است" desc="از پنل کناری یک درخواست بفرستید تا پاسخ JSON اینجا نمایش داده شود." />
              )}
            </Card>
          </div>
        )}

        {tab === 'webhooks' && (
          <div className="space-y-4">
            <Card>
              <CardTitle title="تعریف وب‌هوک جدید" sub="رویدادها به آدرس شما POST می‌شوند" icon={<Webhook size={18} />} />
              <div className="flex flex-wrap gap-2">
                <Input dir="ltr" placeholder="https://example.com/hooks/faktorizm" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} className="flex-1 min-w-60" />
                <Button onClick={async () => {
                  if (!/^https?:\/\//.test(hookUrl)) { toast.error('آدرس باید با http شروع شود'); return; }
                  await createWebhook(hookUrl, ['invoice.created', 'invoice.approved']);
                  setHookUrl('');
                  toast.success('وب‌هوک ثبت شد');
                }}><Plus size={16} /> افزودن</Button>
              </div>
            </Card>

            {hooks.length === 0 ? (
              <Card><EmptyState icon={<Webhook size={26} />} title="وب‌هوکی تعریف نشده است"
                desc="هنگام تایید یا ساخت فاکتور، رویداد به سرویس بیرونی اطلاع داده می‌شود." /></Card>
            ) : (
              <div className="space-y-3">
                {hooks.map((h) => (
                  <Card key={h.id} className="!p-4 flex flex-wrap items-center gap-4">
                    <span className="icon-tile h-11 w-11 bg-warning-soft text-warning"><Webhook size={19} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[12px] truncate" dir="ltr">{h.url}</p>
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {h.events.map((e) => <Badge key={e} className="bg-muted text-muted-foreground font-mono !text-[10px]" >{e}</Badge>)}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {h.lastAttemptAt ? `آخرین تلاش: ${relativeTime(h.lastAttemptAt)} — کد ${h.lastStatus === 0 ? 'خطای شبکه' : toFaDigits(h.lastStatus ?? 0)}` : 'هنوز تست نشده'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={async () => {
                        const r = await testWebhook(h);
                        typeof r === 'number' && r < 400 ? toast.success(`پاسخ سرور: ${r}`) : toast.error('ارسال ناموفق بود (محدودیت شبکه یا آدرس)');
                      }}><Play size={14} /> تست</Button>
                      <Button size="sm" variant="danger" onClick={async () => { await db.webhooks.delete(h.id); toast.success('وب‌هوک حذف شد'); }}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="ساخت کلید API جدید" size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>انصراف</Button>
            <Button onClick={async () => {
              const k = await createApiKey(keyName || `کلید ${keys.length + 1}`);
              setCreateOpen(false);
              setKeyName('');
              setVisible(new Set([k.id]));
              toast.success('کلید ساخته شد — کلید را الان کپی کنید، فقط یک بار کامل نمایش داده می‌شود');
            }}>ساخت کلید</Button>
          </>
        }>
        <Label>نام کلید (برای یادآوری کاربرد)</Label>
        <Input placeholder="مثلا: اتصال سپیدار" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
        <p className="text-[11px] text-muted-foreground mt-3 leading-6">
          کلیدها به‌صورت محلی نگهداری می‌شوند. برای محیط تولید، سرور Node نمونه داخل پوشه <code dir="ltr">server/</code> همین قرارداد را اجرا می‌کند.
        </p>
      </Modal>

      <ConfirmDialog open={!!revokeId} onClose={() => setRevokeId(null)} title="لغو کلید API"
        message="با لغو این کلید، همه سرویس‌هایی که با آن متصل بودند دسترسی خود را از دست می‌دهند."
        confirmLabel="لغو کلید"
        onConfirm={async () => { if (revokeId) { await revokeApiKey(revokeId); toast.success('کلید لغو شد'); setRevokeId(null); } }} />
    </div>
  );
}
