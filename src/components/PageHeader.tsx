import type { ReactNode } from 'react';

export default function PageHeader({
  title, subtitle, icon, actions,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 animate-slide-up">
      <div className="flex items-center gap-3.5 min-w-0">
        {icon && (
          <span className="icon-tile h-12 w-12 gradient-brand text-white shadow-lg shadow-primary/25">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-xl lg:text-2xl font-extrabold truncate">{title}</h2>
          {subtitle && <p className="text-xs lg:text-sm text-muted-foreground mt-1 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
