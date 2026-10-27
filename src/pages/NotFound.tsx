import { useNavigate } from 'react-router-dom';
import { Home, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/primitives';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center animate-fade-in">
      <span className="icon-tile h-20 w-20 rounded-3xl gradient-brand text-white mb-6 animate-float">
        <ScanLine size={36} />
      </span>
      <h1 className="text-5xl font-black gradient-text mb-3">۴۰۴</h1>
      <p className="text-muted-foreground mb-7 text-sm">صفحه‌ای که دنبالش بودید پیدا نشد یا جابه‌جا شده است.</p>
      <div className="flex gap-3">
        <Button onClick={() => navigate('/')}><Home size={16} /> بازگشت به داشبورد</Button>
        <Button variant="outline" onClick={() => navigate('/scan')}><ScanLine size={16} /> اسکن فاکتور</Button>
      </div>
    </div>
  );
}
