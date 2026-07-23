'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Registrant, Ticket } from '@/lib/types';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';

export default function TicketPage() {
  const params = useParams();
  const registrantId = params.registrantId as string;
  const [registrant, setRegistrant] = useState<Registrant | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const [regSnap, ticketSnap] = await Promise.all([
          getDoc(doc(db, 'registrants', registrantId)),
          getDoc(doc(db, 'tickets', registrantId)),
        ]);

        if (!regSnap.exists()) {
          setError('لم يتم العثور على هذا التسجيل');
          setLoading(false);
          return;
        }

        setRegistrant(regSnap.data() as Registrant);

        if (ticketSnap.exists()) {
          setTicket(ticketSnap.data() as Ticket);
        } else {
          setError('التذكرة لم تُصدر بعد');
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching ticket:', err);
        setError('حدث خطأ في تحميل التذكرة');
        setLoading(false);
      }
    }

    fetchData();
  }, [registrantId]);

  /**
   * Universal download that works on ALL mobile browsers (iOS Safari, Chrome, Android).
   * Uses canvas to render a full ticket card with QR code + registrant info as a single PNG.
   */
  const handleDownload = async () => {
    if (!ticket?.qrImageUrl || !registrant) return;
    setDownloading(true);

    try {
      // Create a canvas-based ticket image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const width = 600;
      const height = 900;
      canvas.width = width;
      canvas.height = height;

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#1a0f05');
      gradient.addColorStop(0.5, '#2d1a0a');
      gradient.addColorStop(1, '#1a0f05');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Gold border
      ctx.strokeStyle = 'rgba(251, 186, 51, 0.4)';
      ctx.lineWidth = 3;
      ctx.roundRect(15, 15, width - 30, height - 30, 20);
      ctx.stroke();

      // Header band
      const headerGrad = ctx.createLinearGradient(0, 0, width, 120);
      headerGrad.addColorStop(0, '#b8860b');
      headerGrad.addColorStop(1, '#d4a017');
      ctx.fillStyle = headerGrad;
      ctx.roundRect(30, 30, width - 60, 110, [15, 15, 0, 0]);
      ctx.fill();

      // Header text
      ctx.fillStyle = '#1a0f05';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('تذكرة دخول', width / 2, 70);
      ctx.font = 'bold 28px Arial, sans-serif';
      ctx.fillText('مؤتمر الكنيسة', width / 2, 115);

      // QR Code
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject(new Error('Failed to load QR'));
        qrImg.src = ticket.qrImageUrl;
      });

      // White QR background
      const qrSize = 280;
      const qrX = (width - qrSize - 40) / 2;
      const qrY = 170;
      ctx.fillStyle = '#ffffff';
      ctx.roundRect(qrX, qrY, qrSize + 40, qrSize + 40, 16);
      ctx.fill();
      ctx.drawImage(qrImg, qrX + 20, qrY + 20, qrSize, qrSize);

      // Dashed separator
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(251, 186, 51, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(50, 530);
      ctx.lineTo(width - 50, 530);
      ctx.stroke();
      ctx.setLineDash([]);

      // Registrant info
      ctx.fillStyle = '#fbba33';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('الاسم', width / 2, 575);
      ctx.fillStyle = '#f7f0e4';
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.fillText(registrant.fullName, width / 2, 615);

      ctx.fillStyle = '#fbba33';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillText('الكنيسة', width / 2, 665);
      ctx.fillStyle = '#f7f0e4';
      ctx.font = '22px Arial, sans-serif';
      ctx.fillText(registrant.church, width / 2, 700);

      ctx.fillStyle = '#fbba33';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillText('رقم الموبايل', width / 2, 750);
      ctx.fillStyle = '#f7f0e4';
      ctx.font = '20px Arial, sans-serif';
      ctx.fillText(registrant.phoneNumber, width / 2, 785);

      // Footer
      ctx.fillStyle = 'rgba(251, 186, 51, 0.2)';
      ctx.font = '12px Arial, sans-serif';
      ctx.fillText('يرجى إظهار هذه التذكرة عند الدخول', width / 2, 850);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) {
          // Fallback: open QR in new tab
          window.open(ticket.qrImageUrl, '_blank');
          setDownloading(false);
          return;
        }

        const url = URL.createObjectURL(blob);

        // Check if Web Share API is available (for iOS Safari and modern mobile browsers)
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `ticket-${registrantId}.png`, { type: 'image/png' });
          const shareData = { files: [file] };
          
          if (navigator.canShare(shareData)) {
            navigator.share(shareData)
              .catch(() => {
                // User cancelled share — fallback to download
                fallbackDownload(url);
              })
              .finally(() => setDownloading(false));
            return;
          }
        }

        // Standard download for desktop and older Android
        fallbackDownload(url);
        setDownloading(false);
      }, 'image/png');
    } catch {
      // Ultimate fallback: open QR image in new tab
      if (ticket?.qrImageUrl) {
        window.open(ticket.qrImageUrl, '_blank');
      }
      setDownloading(false);
    }
  };

  const fallbackDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${registrantId}.png`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up after a short delay
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  if (loading) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner spinner-lg" style={{ margin: '0 auto 1.5rem', borderTopColor: 'var(--color-accent-400)' }} />
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>جاري تحميل التذكرة...</p>
        </div>
      </main>
    );
  }

  if (error || !registrant) {
    return (
      <main style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '28rem' }}>
          <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎫</p>
          <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>{error}</p>
          <Link href={`/status/${registrantId}`} className="btn btn-primary" style={{ marginTop: '1.5rem', textDecoration: 'none', display: 'inline-flex' }}>
            التحقق من الحالة
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <Header />
      <main className="page-enter" style={{ position: 'relative', zIndex: 1, minHeight: 'calc(100dvh - 7.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem' }}>
      <div className="container-mobile" style={{ maxWidth: '24rem' }}>
        <div className="glass-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          {/* Ticket Header */}
          <div style={{
            background: 'linear-gradient(135deg, var(--color-primary-600), var(--color-primary-800))',
            margin: '-2rem -1.5rem 1.5rem',
            padding: '1.5rem',
            borderRadius: '1.25rem 1.25rem 0 0',
          }}>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
              تذكرة دخول
            </p>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 800 }}>مؤتمر الكنيسة</h1>
          </div>

          {/* QR Code */}
          {ticket?.qrImageUrl ? (
            <div style={{
              padding: '1.5rem',
              background: 'white',
              borderRadius: '1rem',
              marginBottom: '1.5rem',
              display: 'inline-block',
            }}>
              <img
                src={ticket.qrImageUrl}
                alt="QR Code"
                style={{ width: '12rem', height: '12rem' }}
              />
            </div>
          ) : (
            <div style={{
              padding: '3rem',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '1rem',
              marginBottom: '1.5rem',
              textAlign: 'center',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.4)' }}>جاري إنشاء رمز QR...</p>
              <div className="spinner" style={{ margin: '1rem auto 0', borderTopColor: 'var(--color-primary-500)' }} />
            </div>
          )}

          {/* Registrant Info */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              {registrant.fullName}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>{registrant.church}</p>
          </div>

          {/* Dashed separator */}
          <div style={{
            borderTop: '2px dashed rgba(255,255,255,0.1)',
            margin: '0 -1.5rem 1.5rem',
            position: 'relative',
          }}>
            {/* Left notch */}
            <div style={{
              position: 'absolute',
              left: '-0.75rem',
              top: '-0.75rem',
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: '50%',
              background: 'var(--color-surface-950)',
            }} />
            {/* Right notch */}
            <div style={{
              position: 'absolute',
              right: '-0.75rem',
              top: '-0.75rem',
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: '50%',
              background: 'var(--color-surface-950)',
            }} />
          </div>

          {/* Ticket Used Status */}
          {ticket?.used && (
            <div style={{
              padding: '0.75rem',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '0.75rem',
              marginBottom: '1rem',
            }}>
              <p style={{ color: 'var(--color-error-500)', fontWeight: 600, fontSize: '0.875rem' }}>
                تم استخدام هذه التذكرة
              </p>
            </div>
          )}

          {/* Download Button (user-facing) */}
          {ticket?.qrImageUrl && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <button
                className="btn btn-accent btn-full"
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  opacity: downloading ? 0.7 : 1,
                  cursor: downloading ? 'wait' : 'pointer',
                }}
              >
                {downloading ? (
                  <>
                    <span className="spinner" style={{ width: '1.25rem', height: '1.25rem', borderTopColor: 'currentColor' }} />
                    <span>جاري التحميل...</span>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" x2="12" y1="15" y2="3" />
                    </svg>
                    <span>تحميل التذكرة</span>
                  </>
                )}
              </button>

              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textAlign: 'center' }}>
                يرجى إظهار هذه التذكرة عند الدخول
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
