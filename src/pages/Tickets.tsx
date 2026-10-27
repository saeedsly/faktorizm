import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  LifeBuoy, Plus, Send, CircleDot, Clock3, CheckCheck, XCircle, ChevronLeft,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import {
  Button, Card, Input, Textarea, Select, Label, Modal, Badge, EmptyState,
} from '@/components/ui/primitives';
import { api, ApiError } from '@/lib/api/client';
import { useAuth } from '@/stores/auth';
import { relativeTime, toFaDigits, cn } from '@/lib/utils';

interface Ticket {
  id: string; subject: string; priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'answered' | 'closed'; created_by: string; created_at: string; updated_at: string;
}
interface Message { id: string; body: string; author_id: string; author_name: string; created_at: string }
interface TicketDetail extends Ticket { messages: Message[] }

const STATUS = {
  open: { label: 'باز', cls: 'bg-warning-soft text-warning', icon: Clock3 },
  answered: { label: 'پاسخ داده شده', cls: 'bg-info-soft text-info', icon: CircleDot },
  closed: { label: 'بسته شده', cls: 'bg-muted text-muted-foreground', icon: CheckCheck },
};
const PRIORITY = {
  low: { label: 'کم', cls: 'bg-muted text-muted-foreground' },
  normal: { label: 'عادی', cls: 'bg-info-soft text-info' },
  high: { label: 'بالا', cls: 'bg-warning-soft text-warning' },
  urgent: { label: 'فوری', cls: 'bg-danger-soft text-danger' },
};

export default function Tickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [active, setActive] = useState<TicketDetail | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', priority: 'normal' });
  const [reply, setReply] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setTickets((await api.get('/tickets')) as Ticket[]); } catch (e) { toast.error((e as ApiError).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages.length]);

  const openTicket = async (id: string) => {
    try { setActive((await api.get(`/tickets/${id}`)) as TicketDetail); } catch (e) { toast.error((e as ApiError).message); }
  };

  const create = async () => {
    try {
      await api.post('/tickets', form);
      toast.success('تیکت ثبت شد');
      setModal(false);
      setForm({ subject: '', body: '', priority: 'normal' });
      void load();
    } catch (e) { toast.error('ثبت ناموفق', { description: (e as ApiError).message }); }
  };

  const sendReply = async () => {
    if (!active || !reply.trim()) return;
    try {
      await api.post(`/tickets/${active.id}/messages`, { body: reply });
      setReply('');
      await openTicket(active.id);
      void load();
    } catch (e) { toast.error((e as ApiError).message); }
  };

  return (
    <div>
      <PageHeader
        title="تیکت پشتیبانی"
        subtitle="گفتگوی مستقیم با تیم پشتیبانی فاکتوریزم"
        icon={<LifeBuoy size={22} />}
        actions={<Button size="sm" onClick={() => setModal(true)}><Plus size={16} /> تیکت جدید</Button>}
      />

      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-2 !p-0 overflow-hidden h-fit">
          {tickets.length === 0 ? (
            <EmptyState icon={<LifeBuoy size={26} />} title="تیکتی ثبت نشده است"
              desc="هر سوال یا مشکلی داشتید، تیکت بزنید تا تیم پشتیبانی پاسخ دهد." />
          ) : (
            <div className="divide-y divide-border max-h-[640px] overflow-y-auto">
              {tickets.map((t) => {
                const StatusIcon = STATUS[t.status].icon;
                return (
                <button key={t.id} onClick={() => openTicket(t.id)}
                  className={cn('w-full text-right p-4 transition-colors', active?.id === t.id ? 'bg-primary-soft' : 'hover:bg-muted')}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-bold text-[13px] truncate">{t.subject}</p>
                    {t.status === 'closed' && <XCircle size={15} className="text-muted-foreground shrink-0" />}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge className={STATUS[t.status].cls}><StatusIcon size={11} /> {STATUS[t.status].label}</Badge>
                    <Badge className={PRIORITY[t.priority].cls}>{PRIORITY[t.priority].label}</Badge>
                    <span className="text-[10px] text-muted-foreground mr-auto">{relativeTime(t.updated_at)}</span>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-3 flex flex-col min-h-[500px]">
          {!active ? (
            <EmptyState icon={<ChevronLeft size={26} />} title="یک تیکت را برای مشاهده انتخاب کنید" />
          ) : (
            <>
              <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="font-extrabold text-sm">{active.subject}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">ساخته شده {relativeTime(active.created_at)}</p>
                </div>
                <div className="flex gap-1.5">
                  <Badge className={STATUS[active.status].cls}>{STATUS[active.status].label}</Badge>
                  <Badge className={PRIORITY[active.priority].cls}>{PRIORITY[active.priority].label}</Badge>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
                {active.messages.map((m) => {
                  const mine = m.author_id === user?.id;
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-start' : 'justify-end')}>
                      <div className={cn('max-w-[78%] rounded-2xl px-4 py-3',
                        mine ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm')}>
                        <p className="text-[11px] font-bold opacity-80 mb-1">{m.author_name} · {relativeTime(m.created_at)}</p>
                        <p className="text-[13px] leading-7 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {active.status === 'closed' ? (
                <div className="p-4 border-t border-border text-center text-xs text-muted-foreground">
                  این تیکت بسته شده است. برای پیگیری مجدد تیکت جدید ثبت کنید.
                </div>
              ) : (
                <div className="p-4 border-t border-border flex gap-2">
                  <Textarea rows={2} placeholder="پیام خود را بنویسید…" value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendReply(); }} />
                  <Button onClick={sendReply} className="shrink-0"><Send size={16} /></Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="ثبت تیکت جدید"
        footer={<><Button variant="ghost" onClick={() => setModal(false)}>انصراف</Button><Button onClick={create}>ارسال تیکت</Button></>}>
        <div className="space-y-4">
          <div>
            <Label required>موضوع</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="مثلا: مشکل در فعال‌سازی کد اشتراک" />
          </div>
          <div>
            <Label>اولویت</Label>
            <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">کم</option>
              <option value="normal">عادی</option>
              <option value="high">بالا</option>
              <option value="urgent">فوری</option>
            </Select>
          </div>
          <div>
            <Label required>شرح درخواست</Label>
            <Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="مشکل را با ذکر جزئیات و گام‌های انجام‌شده بنویسید…" />
          </div>
          <p className="text-[11px] text-muted-foreground">میانبر ارسال پاسخ: Ctrl + Enter · شماره تیکت: {toFaDigits(tickets.length + 1)}</p>
        </div>
      </Modal>
    </div>
  );
}
