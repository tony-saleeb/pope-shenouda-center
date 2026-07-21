'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useRouter } from 'next/navigation';
import type { ScanResult } from '@/lib/types';

export default function ScanPage() {
  const { user, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const scannerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrScannerRef = useRef<any>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && (!user || (role !== 'usher' && role !== 'admin'))) {
      router.push('/admin/login');
    }
  }, [user, role, authLoading, router]);

  const handleScan = useCallback(async (qrToken: string) => {
    if (processing || !user) return;
    setProcessing(true);
    setScanResult(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrToken }),
      });

      const data: ScanResult = await response.json();
      setScanResult(data);
      setScanHistory((prev) => [data, ...prev].slice(0, 20));

      // Auto-clear result overlay after 5 seconds
      setTimeout(() => {
        setScanResult(null);
        setProcessing(false);
      }, 5000);
    } catch {
      const errorResult: ScanResult = {
        type: 'invalid_ticket',
        message: 'Network error',
        messageAr: 'خطأ في الاتصال — تأكد من اتصالك بالإنترنت',
      };
      setScanResult(errorResult);
      setProcessing(false);
    }
  }, [processing, user]);

  // Initialize QR scanner
  useEffect(() => {
    if (!user || (role !== 'usher' && role !== 'admin')) return;

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
            // Ignore scan errors when no QR code is in frame
          }
        );

        setScanning(true);
      } catch (err) {
        console.error('Scanner init error:', err);
        setError('لا يمكن الوصول للكاميرا — يرجى إعطاء صلاحية الكاميرا في المتصفح');
      }
    };

    initScanner();

    return () => {
      mounted = false;
      if (html5QrScannerRef.current) {
        html5QrScannerRef.current.stop().catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  if (authLoading) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg spinner-gold" />
      </main>
    );
  }

  const getResultOverlay = () => {
    if (!scanResult) return null;

    let bgClass = '';
    let icon = null;

    switch (scanResult.type) {
      case 'success':
        bgClass = 'scan-success';
        icon = (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
        break;
      case 'already_used':
        bgClass = 'scan-warning';
        icon = (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
        break;
      default:
        bgClass = 'scan-error';
        icon = (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
    }

    return (
      <div
        className={`scan-overlay ${bgClass}`}
        onClick={() => { setScanResult(null); setProcessing(false); }}
        style={{ cursor: 'pointer', zIndex: 100 }}
      >
        <div style={{
          width: '5rem', height: '5rem', borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem',
        }}>
          {icon}
        </div>

        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', marginBottom: '0.75rem' }}>
          {scanResult.messageAr}
        </h2>

        {scanResult.registrantName && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '1rem' }}>
            <p style={{ fontSize: '1.375rem', fontWeight: 800, color: 'white' }}>
              {scanResult.registrantName}
            </p>
            {scanResult.church && (
              <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.85)', marginTop: '0.25rem' }}>
                {scanResult.church}
              </p>
            )}
          </div>
        )}

        {scanResult.usedAt && (
          <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: '1rem', fontSize: '0.875rem' }}>
            تم تسجيل الدخول سابقاً في: {new Date(scanResult.usedAt).toLocaleString('ar-EG')}
          </p>
        )}

        <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '2rem', fontSize: '0.8125rem' }}>
          اضغط في أي مكان لمسح التذكرة التالية
        </p>
      </div>
    );
  };

  return (
    <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', paddingBottom: '3rem' }}>
      {/* Result Overlay */}
      {getResultOverlay()}

      {/* Mobile Scanner Header */}
      <div style={{
        padding: '1rem 1.25rem',
        background: 'rgba(19, 12, 5, 0.88)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(242, 158, 19, 0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f7f0e4', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📷</span>
          <span>فحص التذاكر</span>
        </h1>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.8125rem',
          color: scanning ? '#10b981' : '#ef4444',
          background: scanning ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
          padding: '0.375rem 0.75rem',
          borderRadius: '0.625rem',
          border: `1px solid ${scanning ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
        }}>
          <div className="pulse-dot" style={{ background: scanning ? '#10b981' : '#ef4444' }} />
          <span>{scanning ? 'الكاميرا تعمل' : 'الكاميرا متوقفة'}</span>
        </div>
      </div>

      {/* Responsive Mobile Camera View Container */}
      <div style={{ padding: '1.25rem 1rem', maxWidth: '28rem', margin: '0 auto' }}>
        <div style={{
          position: 'relative',
          borderRadius: '1.25rem',
          overflow: 'hidden',
          border: '1.5px solid rgba(242, 158, 19, 0.25)',
          background: 'rgba(19, 12, 5, 0.7)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        }}>
          {error ? (
            <div style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: 'rgba(239, 68, 68, 0.08)',
            }}>
              <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>📵</p>
              <p style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#f87171', marginBottom: '0.5rem' }}>
                {error}
              </p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(247, 240, 228, 0.55)' }}>
                تأكد من فتح الصفحة في المتصفح وإعطاء الصلاحية للكاميرا
              </p>
            </div>
          ) : (
            <div id="qr-reader" ref={scannerRef} style={{ width: '100%' }} />
          )}

          {processing && !scanResult && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}>
              <div className="spinner spinner-lg spinner-gold" />
            </div>
          )}
        </div>
      </div>

      {/* Scan History */}
      {scanHistory.length > 0 && (
        <div style={{ padding: '0 1rem', maxWidth: '28rem', margin: '1rem auto 0' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem', color: 'rgba(247, 240, 228, 0.65)' }}>
            سجل آخر الفحوصات ({scanHistory.length.toLocaleString('ar-EG')})
          </h3>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {scanHistory.map((scan, index) => (
              <div
                key={index}
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid rgba(242, 158, 19, 0.12)',
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>
                  {scan.type === 'success' ? '✅' : scan.type === 'already_used' ? '⚠️' : '🚫'}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: '#f7f0e4' }}>{scan.registrantName || scan.messageAr}</span>
                  {scan.church && (
                    <span style={{ color: 'rgba(247, 240, 228, 0.5)', marginRight: '0.5rem' }}>
                      — {scan.church}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
