import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from './ui/primitives';
import { Camera, SwitchCamera, CircleAlert, Aperture } from 'lucide-react';

export default function CameraCapture({
  open, onClose, onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    setReady(false);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setDevices(cams);
        setDeviceId(cams[0]?.deviceId ?? '');
      } catch (err) {
        setError(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'دسترسی دوربین داده نشد. لطفا از تنظیمات مرورگر اجازه دوربین را فعال کنید.'
            : 'دوربین در این محیط در دسترس نیست؛ می‌توانید عکس را از گالری آپلود کنید.',
        );
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  const switchCamera = async () => {
    if (devices.length < 2) return;
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    const next = devices[(idx + 1) % devices.length];
    setDeviceId(next.deviceId);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: next.deviceId }, audio: false });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
      onClose();
    }, 'image/jpeg', 0.92);
  };

  return (
    <Modal open={open} onClose={onClose} title="اسکن با دوربین" size="lg"
      footer={<Button onClick={capture} disabled={!ready}><Aperture size={17} /> ثبت عکس</Button>}>
      {error ? (
        <div className="flex flex-col items-center text-center py-10 gap-3">
          <span className="icon-tile h-14 w-14 bg-warning-soft text-warning rounded-2xl"><CircleAlert size={26} /></span>
          <p className="text-sm text-muted-foreground leading-7 max-w-md">{error}</p>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {!ready && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">در حال اتصال به دوربین…</div>}
          <div className="absolute top-3 right-3 flex gap-2">
            {devices.length > 1 && (
              <button onClick={switchCamera} className="h-10 w-10 rounded-full bg-black/55 text-white inline-flex items-center justify-center backdrop-blur hover:bg-black/75">
                <SwitchCamera size={18} />
              </button>
            )}
          </div>
          <div className="absolute inset-x-8 inset-y-10 border-2 border-white/40 rounded-2xl pointer-events-none" />
          <div className="absolute bottom-4 inset-x-0 flex justify-center">
            <span className="chip bg-black/55 text-white backdrop-blur"><Camera size={13} /> سند را داخل کادر قرار دهید</span>
          </div>
        </div>
      )}
    </Modal>
  );
}
