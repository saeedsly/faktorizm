import { Modal, Button } from './ui/primitives';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'تایید', danger = true, loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span className={`icon-tile h-11 w-11 shrink-0 ${danger ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary'}`}>
          <AlertTriangle size={20} />
        </span>
        <p className="text-sm leading-7 text-muted-foreground pt-1.5">{message}</p>
      </div>
    </Modal>
  );
}
