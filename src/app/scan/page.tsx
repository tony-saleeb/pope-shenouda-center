'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { ScanResult } from '@/lib/types';
import Header from '@/components/Header';

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

  const scannerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrScannerRef = useRef<any>(null);

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
    localStorage.removeItem('usher_passcode');
    setAuthenticated(false);
    setPasscode('');
    if (html5QrScannerRef.current) {
      try {
        html5QrScannerRef.current.stop();
      } catch {
        // Ignore
      }
    }
  };

  const handleScan = useCallback(async (qrToken: string) => {
    if (processing) return;
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

      // Haptic feedback if available
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (data.type === 'success') {
          navigator.vibrate([100, 50, 100]);
        } else {
          navigator.vibrate([300]);
        }
      }

      // Auto-clear result overlay after 4 seconds
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
      }, 4000);
    } catch {
      const errorResult: ScanResult = {
        type: 'invalid_ticket',
        message: 'Network error',
        messageAr: 'خطأ في الاتصال — تأكد من اتصالك بالإنترنت',
      };
      setScanResult(errorResult);
      setProcessing(false);
    }
  }, [processing, passcode]);

  // Initialize QR scanner when authenticated
  useEffect(() => {
    if (!authenticated) return;

    let mounted = true;

    const initScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        if (!mounted || !scannerRef.current) return;

        const scanner = new Html5Qrcode('qr-reader');
        html5QrScannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            handleScan(decodedText);
          },
          () => {
            // Ignore frame scan errors
          }
        );

        setScanning(true);
      } catch (err) {
        console.error('Scanner init error:', err);
        setError('لا يمكن الوصول للكاميرا — يرجى السماح بالوصول للكاميرا في إعدادات المتصفح');
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (html5QrScannerRef.current) {
        try {
          html5QrScannerRef.current.stop();
        } catch {
          // Ignore cleanup error
        }
      }
    };
  }, [authenticated, handleScan]);

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

              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f7f0e4', marginBottom: '0.5rem' }}>
                بوابة خادم القاعة 🎫
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
                    <p style={{ color: '#ef4444', fontSize: '0.8125rem', marginTop: '0.5rem', fontWeight: 600 }}>
                      ⚠️ {authError}
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
                  }}
                >
                  {verifying ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                      جاري التحقق...
                    </span>
                  ) : (
                    'دخول إلى الماسح 📷'
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
              <span style={{ fontSize: '1.25rem' }}>📷</span>
              <span style={{ fontWeight: 800, color: '#f7f0e4', fontSize: '1rem' }}>ماسح التذاكر</span>
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

          {/* Camera Container */}
          <div className="glass-card" style={{ padding: '1rem', position: 'relative', overflow: 'hidden', marginBottom: '1.5rem' }}>
            <div
              ref={scannerRef}
              id="qr-reader"
              style={{
                width: '100%',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                background: 'black',
                minHeight: '260px',
              }}
            />

            {!scanning && !error && (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto 1rem', borderTopColor: '#fbba33' }} />
                <p style={{ color: 'rgba(247, 240, 228, 0.6)', fontSize: '0.875rem' }}>جاري تشغيل الكاميرا...</p>
              </div>
            )}

            {error && (
              <div style={{
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(239, 68, 68, 0.15)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.875rem' }}>{error}</p>
              </div>
            )}

            {/* Scan Overlay Result */}
            {scanResult && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: scanResult.type === 'success'
                  ? 'rgba(16, 185, 129, 0.95)'
                  : scanResult.type === 'already_used'
                  ? 'rgba(245, 158, 11, 0.95)'
                  : 'rgba(239, 68, 68, 0.95)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem 1.5rem',
                textAlign: 'center',
                color: '#fff',
                zIndex: 10,
                backdropFilter: 'blur(8px)',
              }}>
                <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>
                  {scanResult.type === 'success' ? '✅' : scanResult.type === 'already_used' ? '⚠️' : '❌'}
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                  {scanResult.messageAr}
                </h2>

                {scanResult.registrantName && (
                  <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1.25rem', borderRadius: '0.75rem' }}>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800 }}>{scanResult.registrantName}</p>
                    <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>{scanResult.church}</p>
                  </div>
                )}
              </div>
            )}
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
                      {item.type === 'success' ? 'مقبول ✓' : item.type === 'already_used' ? 'مستعمل ⚠️' : 'خطأ ❌'}
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
