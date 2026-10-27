import {
  forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes,
  type SelectHTMLAttributes, type ReactNode, useEffect,
} from 'react';
import { X, Inbox } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'gradient-brand text-white shadow-lg shadow-primary/25 hover:brightness-110 active:scale-[.98]',
  secondary: 'bg-muted text-foreground hover:bg-border active:scale-[.98]',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  outline: 'border border-border bg-card hover:bg-muted text-foreground',
  danger: 'bg-danger text-white hover:brightness-110 active:scale-[.98]',
  success: 'bg-accent text-accent-foreground hover:brightness-110 active:scale-[.98]',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-150 select-none',
        'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* ---------- Card ---------- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-5', className)} {...rest}>{children}</div>;
}
export function CardTitle({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className="icon-tile h-10 w-10 bg-primary-soft text-primary">{icon}</span>}
        <div className="min-w-0">
          <h3 className="font-bold text-[15px] truncate">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('chip', className)}>{children}</span>;
}

/* ---------- فرم ---------- */
export function Label({ children, required, htmlFor }: { children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-muted-foreground mb-1.5">
      {children} {required && <span className="text-danger">*</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn('input', className)} {...props} />,
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn('input min-h-24 resize-y', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn('input appearance-none cursor-pointer', className)} {...props}>{children}</select>
  ),
);
Select.displayName = 'Select';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 group">
      <span className={cn('h-6 w-11 rounded-full relative transition-colors', checked ? 'bg-primary' : 'bg-border')}>
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
          checked ? 'right-0.5' : 'right-[22px]',
        )} />
      </span>
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative card w-full max-h-[90vh] overflow-y-auto animate-scale-in', widths[size])}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10 rounded-t-[inherit]">
          <h3 className="font-extrabold text-base">{title}</h3>
          <button onClick={onClose} className="icon-tile h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-card rounded-b-[inherit]">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: string; icon?: ReactNode; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-muted gap-1 overflow-x-auto max-w-full">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-semibold whitespace-nowrap transition-all',
            active === t.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', active === t.id ? 'bg-primary-soft text-primary' : 'bg-border')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ---------- Progress ---------- */
export function Progress({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'accent' | 'warning' | 'danger' }) {
  const tones = { primary: 'gradient-brand', accent: 'gradient-accent', warning: 'bg-warning', danger: 'bg-danger' };
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-500', tones[tone])}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({ icon, title, desc, action }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <span className="icon-tile h-16 w-16 bg-muted text-muted-foreground mb-4 rounded-2xl">
        {icon ?? <Inbox size={28} />}
      </span>
      <h3 className="font-bold text-base mb-1">{title}</h3>
      {desc && <p className="text-sm text-muted-foreground max-w-sm leading-6">{desc}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------- Spinner ---------- */
export function Spinner({ className }: { className?: string }) {
  return <span className={cn('h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block', className)} />;
}

/* ---------- Stat card ---------- */
export function StatCard({
  icon, label, value, sub, tone = 'primary', delay = 0,
}: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode;
  tone?: 'primary' | 'accent' | 'warning' | 'danger' | 'info';
  delay?: number;
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    accent: 'bg-accent-soft text-accent',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  };
  return (
    <Card className="animate-slide-up" >
      <div style={{ animationDelay: `${delay}ms` }} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-semibold mb-2">{label}</p>
          <p className="text-xl font-extrabold truncate">{value}</p>
          {sub && <div className="text-[11px] text-muted-foreground mt-1.5">{sub}</div>}
        </div>
        <span className={cn('icon-tile h-11 w-11', tones[tone])}>{icon}</span>
      </div>
    </Card>
  );
}

/* ---------- Confidence bar ---------- */
export function ConfidenceBar({ value, size = 'sm' }: { value: number; size?: 'sm' | 'xs' }) {
  const tone = value >= 80 ? 'accent' : value >= 55 ? 'warning' : 'danger';
  return (
    <div className="flex items-center gap-2" title={`اطمینان: ${value}٪`}>
      <div className={cn('rounded-full bg-muted overflow-hidden', size === 'sm' ? 'h-1.5 w-14' : 'h-1 w-10')}>
        <div className={cn('h-full rounded-full',
          tone === 'accent' ? 'bg-accent' : tone === 'warning' ? 'bg-warning' : 'bg-danger')}
          style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-muted-foreground">{value}٪</span>
    </div>
  );
}

/* ---------- Avatar ---------- */
const AVATAR_TONES = ['bg-primary-soft text-primary', 'bg-accent-soft text-accent', 'bg-warning-soft text-warning', 'bg-info-soft text-info', 'bg-danger-soft text-danger'];
export function Avatar({ name, index = 0, size = 'md' }: { name: string; index?: number; size?: 'sm' | 'md' }) {
  return (
    <span className={cn(
      'icon-tile font-extrabold shrink-0',
      AVATAR_TONES[index % AVATAR_TONES.length],
      size === 'sm' ? 'h-8 w-8 text-[11px] rounded-lg' : 'h-10 w-10 text-sm',
    )}>
      {initials(name || '؟')}
    </span>
  );
}
