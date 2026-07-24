'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { ScanResult } from '@/lib/types';
import Header from '@/components/Header';
import jsQR from 'jsqr';

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

    // 1. Guard against parallel calls from video frames
    if (processingRef.current) return;

    // 2. Guard against duplicate immediate scan of same QR within 4 seconds
    const now = Date.now();
    if (
      lastScannedTokenRef.current &&
      lastScannedTokenRef.current.token === qrToken &&
      now - lastScannedTokenRef.current.time < 4000
    ) {
      return;
    }

    // Lock immediately synchronously
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

      // Haptic feedback
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (data.type === 'success') {
          navigator.vibrate([100, 50, 100]);
        } else {
          navigator.vibrate([300]);
        }
      }
    } catch {
      const errorResult: ScanResult = {
        type: 'invalid_ticket',
        message: 'Network error',
        messageAr: 'خطأ في الاتصال — تأكد من اتصالك بالإنترنت',
      };
      setScanResult(errorResult);
    } finally {
      // Auto unlock overlay after 3.5 seconds
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
        processingRef.current = false;
      }, 3500);
    }
  }, [passcode]);

  // Keep a ref to handleScan so camera callback always calls latest version
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

  // Ultra-fast Hardware / JS Multi-scale QR detection loop
  const startDetectionLoop = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let barcodeDetector: any = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let lastScanTime = 0;

    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationFrameIdRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = Date.now();
      // Run detection every 40ms (~25 FPS)
      if (now - lastScanTime >= 40 && !processingRef.current) {
        lastScanTime = now;

        let detectedCode: string | null = null;

        // Method 1: Hardware BarcodeDetector API (Zero-latency, 100% screen, distant & tiny QR detection)
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              detectedCode = barcodes[0].rawValue || barcodes[0].rawValueText;
            }
          } catch {
            // Ignore detector frame error
          }
        }

        // Method 2: High-Resolution jsQR Canvas Fallback (100% video frame)
        if (!detectedCode && ctx) {
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;

          if (videoWidth > 0 && videoHeight > 0) {
            canvas.width = videoWidth;
            canvas.height = videoHeight;
            ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

            // Full resolution scan (Detects distant / small QR codes)
            const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data) {
              detectedCode = code.data;
            } else if (videoWidth > 640) {
              // 2-Scale Pyramid Scan: Half resolution (Detects large / close-up QR codes ultra fast)
              canvas.width = Math.floor(videoWidth / 2);
              canvas.height = Math.floor(videoHeight / 2);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const halfData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const halfCode = jsQR(halfData.data, halfData.width, halfData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (halfCode && halfCode.data) {
                detectedCode = halfCode.data;
              }
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

  // Initialize Camera Stream with HD resolution and continuous auto-focus
  const initCamera = useCallback(async () => {
    stopCamera();
    setError(null);

    const videoConstraintsOptions: MediaTrackConstraints[] = [
      // 1. High Definition Rear Camera (Ideal 1080p, 1920x1080 for long range scanning)
      {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      },
      // 2. Standard 720p Rear Camera
      {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
      },
      // 3. Fallback any camera stream
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

        // Try applying continuous autofocus if supported by camera hardware
        const track = stream.getVideoTracks()[0];
        if (track && 'applyConstraints' in track) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (track as any).applyConstraints({
              advanced: [{ focusMode: 'continuous' }],
            });
          } catch {
            // Focus constraint not supported on this device, ignore
          }
        }

        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      console.error('Camera stream error:', lastError);
      setError('لم نتمكن من الوصول للكاميرا. يرجى التأكد من منح إذن الوصول للكاميرا بالمتصفح، ثم الضغط على زر "منح الإذن وتفعيل الكاميرا".');
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
            marginBottom: '1.5rem',
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
              <span style={{ fontWeight: 800, color: '#f7f0e4', fontSize: '1rem' }}>ماسح التذاكر (ذكي)</span>
            </div>
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

          {/* High-Definition Full Frame Camera Container */}
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

              {/* Viewfinder Target Guidelines */}
              {scanning && !scanResult && (
                <div style={{
                  position: 'absolute',
                  inset: '10%',
                  border: '2px dashed rgba(251, 186, 51, 0.6)',
                  borderRadius: '1rem',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
                }}>
                  <div style={{
                    width: '90%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, #fbba33, transparent)',
                    boxShadow: '0 0 12px #fbba33',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                </div>
              )}

              {!scanning && !error && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem', borderTopColor: '#fbba33' }} />
                  <p style={{ color: 'rgba(247, 240, 228, 0.65)', fontSize: '0.875rem' }}>جاري فتح الكاميرا وتجهيز الماسح الذكي...</p>
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
                    📷 منح الإذن وتفعيل الكاميرا
                  </button>
                </div>
              )}

              {/* Scan Result Overlay */}
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
