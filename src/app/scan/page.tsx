'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { ScanResult } from '@/lib/types';
import Header from '@/components/Header';
import jsQR from 'jsqr';

// ─── Web Audio API Sound Generator ──────────────────────────────────
function playScanSound(type: 'success' | 'already_used' | 'invalid_ticket' | 'tampered' | 'error') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'success') {
      // Pleasant double high chime (Green success)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.08);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'already_used') {
      // Two-tone warning chime (Yellow/Orange used)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659, now);
      osc.frequency.setValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Low error buzz (Red invalid)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch {
    // Ignore browser audio restrictions
  }
}

export default function ScanPage() {
  const [passcode, setPasscode] = useState<string>('');
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);

  // Hardware torch state
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Synchronous lock refs to block race conditions from fast camera frames
  const processingRef = useRef<boolean>(false);
  const lastScannedTokenRef = useRef<{ token: string; time: number } | null>(null);

  // Check stored passcode on mount
  useEffect(() => {
    const stored = localStorage.getItem('usher_passcode');
    if (stored) {
      verifyPasscode(stored);
    }
  }, []);

  const verifyPasscode = async (codeToTest: string) => {
    setVerifying(true);
    setAuthError(null);
    try {
      const response = await fetch('/api/scan/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: codeToTest }),
      });

      const data = await response.json();
      if (data.valid) {
        localStorage.setItem('usher_passcode', codeToTest);
        setPasscode(codeToTest);
        setAuthenticated(true);
      } else {
        localStorage.removeItem('usher_passcode');
        setAuthError(data.error || 'كود الماسح غير صحيح');
        setAuthenticated(false);
      }
    } catch {
      setAuthError('حدث خطأ في الاتصال بالسيرفر');
      setAuthenticated(false);
    } finally {
      setVerifying(false);
    }
  };

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    verifyPasscode(passcode.trim());
  };

  const handleLogout = () => {
    stopCamera();
    localStorage.removeItem('usher_passcode');
    setAuthenticated(false);
    setPasscode('');
  };

  const handleScan = useCallback(async (rawQrToken: string) => {
    const qrToken = rawQrToken.trim();
    if (!qrToken) return;

    // Guard 1: Prevent parallel frame decoding execution
    if (processingRef.current) return;

    // Guard 2: Prevent scanning same token within 3 seconds
    const now = Date.now();
    if (
      lastScannedTokenRef.current &&
      lastScannedTokenRef.current.token === qrToken &&
      now - lastScannedTokenRef.current.time < 3000
    ) {
      return;
    }

    // Lock immediately
    processingRef.current = true;
    lastScannedTokenRef.current = { token: qrToken, time: now };
    setProcessing(true);
    setScanResult(null);

    const currentPasscode = passcode || localStorage.getItem('usher_passcode') || '';

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-usher-passcode': currentPasscode,
        },
        body: JSON.stringify({ qrToken }),
      });

      const data: ScanResult = await response.json();
      setScanResult(data);
      setScanHistory((prev) => [data, ...prev].slice(0, 15));

      // Audio + Haptic feedback
      playScanSound(data.type);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (data.type === 'success') {
          navigator.vibrate([100, 50, 100]);
        } else {
          navigator.vibrate([250]);
        }
      }
    } catch {
      const errorResult: ScanResult = {
        type: 'invalid_ticket',
        message: 'Network error',
        messageAr: 'خطأ في الاتصال — تأكد من اتصالك بالإنترنت',
      };
      setScanResult(errorResult);
      playScanSound('invalid_ticket');
    } finally {
      // Auto resume scanning cleanly after 2.5 seconds
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
        processingRef.current = false;
      }, 2500);
    }
  }, [passcode]);

  const handleScanRef = useRef(handleScan);
  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  const resetOverlay = () => {
    setScanResult(null);
    setProcessing(false);
    processingRef.current = false;
  };

  const stopCamera = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  // Hardware Torch toggle
  const toggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch constraint error:', e);
    }
  };

  // Hyper-Speed 60 FPS RequestAnimationFrame Decode Loop
  const startDetectionLoop = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let detector: any = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
    }

    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = async () => {
      const video = videoRef.current;

      if (video && video.readyState === video.HAVE_ENOUGH_DATA && !processingRef.current) {
        let detectedCode: string | null = null;

        // 1. Primary: Native GPU BarcodeDetector API (Ultra-fast 2ms frame scan)
        if (detector) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length > 0) {
              detectedCode = barcodes[0].rawValue || barcodes[0].rawValueText;
            }
          } catch {
            // Ignore frame error
          }
        }

        // 2. Secondary: Fast 400x400 canvas jsQR fallback
        if (!detectedCode && ctx) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          if (vw > 0 && vh > 0) {
            // Fast fixed 400x400 canvas scaling for 1ms jsQR execution
            canvas.width = 400;
            canvas.height = 400;
            ctx.drawImage(video, 0, 0, 400, 400);

            const imageData = ctx.getImageData(0, 0, 400, 400);
            const code = jsQR(imageData.data, 400, 400, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              detectedCode = code.data;
            }
          }
        }

        if (detectedCode && !processingRef.current) {
          handleScanRef.current(detectedCode);
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(tick);
    };

    animationFrameIdRef.current = requestAnimationFrame(tick);
  }, []);

  // Initialize Camera Stream with 1280x720 ideal constraints
  const initCamera = useCallback(async () => {
    stopCamera();
    setError(null);

    const videoConstraintsOptions: MediaTrackConstraints[] = [
      {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      {
        facingMode: { ideal: 'environment' },
      },
      {
        video: true,
      } as unknown as MediaTrackConstraints,
    ];

    let stream: MediaStream | null = null;
    let lastError: unknown = null;

    for (const constraints of videoConstraintsOptions) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: constraints,
          audio: false,
        });

        // Apply continuous autofocus if available
        const track = stream.getVideoTracks()[0];
        if (track && 'applyConstraints' in track) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (track as any).applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          } catch {
            // Ignore focus error
          }
        }

        // Inspect torch capabilities
        if (track && 'getCapabilities' in track) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const caps = (track as any).getCapabilities();
          if (caps.torch) {
            setSupportsTorch(true);
          }
        }

        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      console.error('Camera stream error:', lastError);
      setError('لم نتمكن من الوصول للكاميرا. يرجى التأكد من منح إذن الوصول للكاميرا في إعدادات المتصفح، ثم الضغط على زر "تفعيل الكاميرا".');
      return;
    }

    mediaStreamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute('playsinline', 'true');
      videoRef.current.play().catch(() => {});
    }

    setScanning(true);
    startDetectionLoop();
  }, [startDetectionLoop]);

  // Start Camera when authenticated
  useEffect(() => {
    if (!authenticated) return;
    initCamera();

    return () => {
      stopCamera();
    };
  }, [authenticated, initCamera]);

  // ─── Render Passcode Gate ──────────────────────────────────────────
  if (!authenticated) {
    return (
      <>
        <Header />
        <main style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
          <div className="container-mobile" style={{ maxWidth: '24rem' }}>
            <div className="glass-card" style={{ padding: '2.5rem 1.75rem', textAlign: 'center' }}>
              <div style={{
                width: '4.5rem',
                height: '4.5rem',
                borderRadius: '50%',
                background: 'rgba(251, 186, 51, 0.12)',
                border: '1.5px solid rgba(251, 186, 51, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>

              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <span>بوابة خادم القاعة</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
                  <path d="M13 5v14" />
                </svg>
              </h1>
              <p style={{ color: 'rgba(247, 240, 228, 0.6)', fontSize: '0.875rem', marginBottom: '2rem' }}>
                أدخل كود الماسح المعتمد للدخول إلى كاميرا فحص التذاكر
              </p>

              <form onSubmit={handlePasscodeSubmit}>
                <div style={{ marginBottom: '1.5rem' }}>
                  <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    className="form-input"
                    placeholder="أدخل كود الماسح (مثال: 102030)"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    style={{
                      textAlign: 'center',
                      fontSize: '1.375rem',
                      letterSpacing: '0.25rem',
                      fontWeight: 700,
                      background: 'rgba(19, 12, 5, 0.7)',
                      borderColor: authError ? '#ef4444' : 'rgba(242, 158, 19, 0.3)',
                    }}
                    autoFocus
                  />
                  {authError && (
                    <p style={{ color: '#ef4444', fontSize: '0.8125rem', marginTop: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>{authError}</span>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={verifying || !passcode.trim()}
                  style={{
                    padding: '0.875rem',
                    fontSize: '1rem',
                    fontWeight: 800,
                    opacity: verifying || !passcode.trim() ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {verifying ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                      جاري التحقق...
                    </span>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span>دخول إلى الماسح</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ─── Render Scanner View ───────────────────────────────────────────
  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', padding: '1.5rem 1rem 3rem' }}>
        <div className="container-mobile" style={{ maxWidth: '28rem' }}>
          {/* Header Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            background: 'rgba(19, 12, 5, 0.6)',
            padding: '0.75rem 1.25rem',
            borderRadius: '1rem',
            border: '1px solid rgba(242, 158, 19, 0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span style={{ fontWeight: 800, color: '#f7f0e4', fontSize: '1rem' }}>ماسح التذاكر الفائق</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Torch Button */}
              {supportsTorch && (
                <button
                  onClick={toggleTorch}
                  title="فلاش الكاميرا"
                  style={{
                    background: torchOn ? '#fbba33' : 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(242, 158, 19, 0.3)',
                    color: torchOn ? '#1a0f05' : '#f7f0e4',
                    padding: '0.375rem 0.625rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </button>
              )}

              <button
                onClick={handleLogout}
                className="btn btn-ghost"
                style={{
                  padding: '0.375rem 0.875rem',
                  fontSize: '0.75rem',
                  border: '1px solid rgba(242, 158, 19, 0.25)',
                  color: 'rgba(247, 240, 228, 0.7)',
                }}
              >
                تسجيل الخروج
              </button>
            </div>
          </div>

          {/* High-Performance Camera Container */}
          <div className="glass-card" style={{ padding: '0.75rem', position: 'relative', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1',
              borderRadius: '0.875rem',
              overflow: 'hidden',
              background: '#000000',
            }}>
              <video
                ref={videoRef}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: scanning ? 'block' : 'none',
                }}
                playsInline
                muted
              />

              {/* Laser Viewfinder */}
              {scanning && !scanResult && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    width: '85%',
                    height: '85%',
                    border: '1.5px dashed rgba(251, 186, 51, 0.4)',
                    borderRadius: '1rem',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: '100%',
                      height: '2px',
                      background: 'linear-gradient(90deg, transparent, #fbba33, transparent)',
                      boxShadow: '0 0 12px #fbba33',
                      position: 'absolute',
                      top: '50%',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  </div>
                </div>
              )}

              {!scanning && !error && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem', borderTopColor: '#fbba33' }} />
                  <p style={{ color: 'rgba(247, 240, 228, 0.65)', fontSize: '0.875rem' }}>جاري تشغيل الماسح الفائق...</p>
                </div>
              )}

              {error && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '1.5rem',
                  textAlign: 'center',
                  background: 'rgba(19, 12, 5, 0.95)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 20,
                }}>
                  <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>{error}</p>
                  <button
                    onClick={initCamera}
                    className="btn btn-primary"
                    style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem' }}
                  >
                    📷 تفعيل الكاميرا
                  </button>
                </div>
              )}

              {/* Full Screen Result Overlay with Instant Audio & Color Feedback */}
              {scanResult && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  background: scanResult.type === 'success'
                    ? 'rgba(16, 185, 129, 0.96)'
                    : scanResult.type === 'already_used'
                    ? 'rgba(217, 119, 6, 0.96)'
                    : 'rgba(220, 38, 38, 0.96)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1.5rem 1.25rem',
                  textAlign: 'center',
                  color: '#fff',
                  zIndex: 30,
                  backdropFilter: 'blur(10px)',
                  animation: 'fadeIn 0.2s ease',
                }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    {scanResult.type === 'success' ? (
                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    ) : scanResult.type === 'already_used' ? (
                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    ) : (
                      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    )}
                  </div>

                  <h2 style={{ fontSize: '1.375rem', fontWeight: 900, marginBottom: '0.375rem' }}>
                    {scanResult.messageAr}
                  </h2>

                  {scanResult.registrantName && (
                    <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.25)', padding: '0.625rem 1rem', borderRadius: '0.75rem', width: '100%', maxWidth: '18rem' }}>
                      <p style={{ fontSize: '1.125rem', fontWeight: 800, color: '#ffffff' }}>{scanResult.registrantName}</p>
                      {scanResult.church && (
                        <p style={{ fontSize: '0.8125rem', opacity: 0.9, marginTop: '0.125rem' }}>{scanResult.church}</p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={resetOverlay}
                    style={{
                      marginTop: '1.25rem',
                      background: 'rgba(255, 255, 255, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.4)',
                      color: '#fff',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '0.625rem',
                      fontSize: '0.875rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    فحص تذكرة أخرى ➔
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Manual Input Fallback */}
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(247, 240, 228, 0.6)', marginBottom: '0.75rem', fontWeight: 600 }}>
              إدخال الرمز يدوياً (في حالة تعذر الكاميرا):
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) handleScan(manualCode.trim()); }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="أدخل كود التذكرة..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  style={{ flex: 1, padding: '0.625rem 0.875rem', fontSize: '0.875rem', background: 'rgba(19, 12, 5, 0.7)' }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={processing || !manualCode.trim()}
                  style={{ padding: '0.625rem 1rem', fontSize: '0.875rem' }}
                >
                  فحص
                </button>
              </div>
            </form>
          </div>

          {/* Recent History Log */}
          {scanHistory.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(247, 240, 228, 0.5)', marginBottom: '0.75rem', fontWeight: 700 }}>
                آخر عمليات الفحص:
              </p>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {scanHistory.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.625rem 1rem',
                      borderRadius: '0.625rem',
                      background: 'rgba(19, 12, 5, 0.5)',
                      border: '1px solid rgba(242, 158, 19, 0.1)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#f7f0e4' }}>
                      {item.registrantName || item.messageAr}
                    </span>
                    <span style={{
                      color: item.type === 'success' ? '#10b981' : item.type === 'already_used' ? '#fbba33' : '#ef4444',
                      fontWeight: 700,
                    }}>
                      {item.type === 'success' ? 'مقبول ✓' : item.type === 'already_used' ? 'مستعمل مسبقاً' : 'خطأ'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
