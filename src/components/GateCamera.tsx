'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { centerSquareCrop } from '@/lib/qr/frameCrop';

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function createDetector(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null;
  try {
    return new (window as unknown as {
      BarcodeDetector: new (options: { formats: string[] }) => BarcodeDetectorLike;
    }).BarcodeDetector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('unsupported');
  }
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    },
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: true },
  ];
  let lastError: unknown = null;
  for (const constraints of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
        } catch {
          // Continuous focus is optional.
        }
      }
      return stream;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('camera');
}

export function GateCamera({
  paused = false,
  onDetect,
}: {
  paused?: boolean;
  onDetect: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [session, setSession] = useState(0);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    let busy = false;
    let lastCode = '';
    let lastAt = 0;
    const detector = createDetector();
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function start() {
      setError(null);
      setLive(false);
      try {
        const stream = await openCamera();
        if (!alive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        if (track && 'getCapabilities' in track) {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setSupportsTorch(Boolean(caps.torch));
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.muted = true;
          video.playsInline = true;
          await video.play().catch(() => undefined);
        }
        if (alive) setLive(true);
      } catch {
        if (alive) {
          setError('لم نتمكن من فتح الكاميرا. اضغط تفعيل الكاميرا ووافق على الإذن.');
        }
      }
    }

    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (busy || pausedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      busy = true;
      void (async () => {
        let code: string | null = null;
        if (detector) {
          try {
            const found = await detector.detect(video);
            code = found[0]?.rawValue?.trim() || null;
          } catch {
            code = null;
          }
        }
        if (!code && ctx) {
          const crop = centerSquareCrop(video.videoWidth, video.videoHeight);
          if (crop) {
            canvas.width = crop.out;
            canvas.height = crop.out;
            ctx.drawImage(video, crop.sx, crop.sy, crop.side, crop.side, 0, 0, crop.out, crop.out);
            const image = ctx.getImageData(0, 0, crop.out, crop.out);
            const decoded = jsQR(image.data, crop.out, crop.out, { inversionAttempts: 'dontInvert' });
            code = decoded?.data?.trim() || null;
          }
        }
        if (!alive || pausedRef.current || !code) return;
        const now = Date.now();
        if (code === lastCode && now - lastAt < 2500) return;
        lastCode = code;
        lastAt = now;
        onDetectRef.current(code);
      })()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };

    void start();
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [session]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setSupportsTorch(false);
    }
  };

  return (
    <div className="gate-camera">
      <video ref={videoRef} autoPlay muted playsInline />
      {live && !paused && (
        <div className="gate-camera-finder" aria-hidden>
          <span />
        </div>
      )}
      {supportsTorch && (
        <button type="button" className={`gate-camera-torch${torchOn ? ' is-on' : ''}`} onClick={() => void toggleTorch()} aria-label="فلاش الكاميرا">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </button>
      )}
      {!live && !error && <p className="gate-camera-wait">جاري تشغيل الكاميرا...</p>}
      {error && (
        <div className="gate-camera-error">
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => setSession((value) => value + 1)}>
            تفعيل الكاميرا
          </button>
        </div>
      )}
    </div>
  );
}
