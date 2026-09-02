'use client';

import { useEffect, useState, use } from 'react';
import type { Registrant, Ticket } from '@/lib/types';
import Header from '@/components/Header';
import Link from 'next/link';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    try {
      ctx.roundRect(x, y, w, h, r);
      return;
    } catch {
      // Fallback below
    }
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface PublicTicketResponse {
  fullName: string;
  church: string;
  qrImageUrl: string;
  used: boolean;
  usedAt: string | null;
  messageAr?: string;
  error?: string;
}

export default function TicketPage({ params }: { params: Promise<{ registrantId: string }> }) {
  const { registrantId } = use(params);
  const [registrant, setRegistrant] = useState<Registrant | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/public/ticket/${registrantId}`, {
          cache: 'no-store',
        });
        const data: PublicTicketResponse = await res.json();

        if (!res.ok) {
          setError(data.messageAr || 'حدث خطأ في تحميل التذكرة');
          setLoading(false);
          return;
        }

        setRegistrant({
          id: registrantId,
          fullName: data.fullName,
          church: data.church,
          status: 'approved',
          phoneNumber: '',
        } as unknown as Registrant);

        setTicket({
          id: registrantId,
          registrantId,
          qrToken: '',
          qrImageUrl: data.qrImageUrl,
          used: data.used,
          usedAt: data.usedAt ? (new Date(data.usedAt) as any) : null,
        } as unknown as Ticket);

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
   * Universal download rendering a full dark-gold glassmorphic ticket card PNG
   * 100% identical in style to the website design.
   */
  const handleDownload = async () => {
    if (!ticket?.qrImageUrl || !registrant) return;
    setDownloading(true);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      const width = 640;
      const height = 980;
      canvas.width = width;
      canvas.height = height;

      // 1. Dark Background
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#130c05');
      bgGrad.addColorStop(0.5, '#1f1306');
      bgGrad.addColorStop(1, '#0c0703');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Glassmorphic Card Container
      const cardMargin = 24;
      const cardW = width - cardMargin * 2;
      const cardH = height - cardMargin * 2;

      const cardGrad = ctx.createLinearGradient(cardMargin, cardMargin, cardMargin + cardW, cardMargin + cardH);
      cardGrad.addColorStop(0, 'rgba(31, 19, 6, 0.95)');
      cardGrad.addColorStop(1, 'rgba(19, 12, 5, 0.98)');
      ctx.fillStyle = cardGrad;
      drawRoundedRectPath(ctx, cardMargin, cardMargin, cardW, cardH, 24);
      ctx.fill();

      // Card Gold Border
      ctx.strokeStyle = 'rgba(251, 186, 51, 0.4)';
      ctx.lineWidth = 2.5;
      drawRoundedRectPath(ctx, cardMargin, cardMargin, cardW, cardH, 24);
      ctx.stroke();

      // 3. Header Subtitle & Main Title
      ctx.fillStyle = 'rgba(247, 240, 228, 0.65)';
      ctx.font = '600 17px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('تذكرة دخول', width / 2, 75);

      ctx.fillStyle = '#f7f0e4';
      ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
      ctx.fillText('دورة التاريخ الكنسي', width / 2, 118);

      // 4. QR Code Box (Solid White Card filling QR code edge to edge)
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject(new Error('Failed to load QR image'));
        qrImg.src = ticket.qrImageUrl;
      });

      const qrBoxSize = 340;
      const qrBoxX = (width - qrBoxSize) / 2;
      const qrBoxY = 155;

      // White QR Container Card
      ctx.fillStyle = '#ffffff';
      drawRoundedRectPath(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 20);
      ctx.fill();

      // Draw QR Code Image inside white box
      const qrPadding = 12;
      ctx.drawImage(
        qrImg,
        qrBoxX + qrPadding,
        qrBoxY + qrPadding,
        qrBoxSize - qrPadding * 2,
        qrBoxSize - qrPadding * 2
      );

      // 5. Gold Dashed Separator Line
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = 'rgba(251, 186, 51, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(60, 535);
      ctx.lineTo(width - 60, 535);
      ctx.stroke();
      ctx.setLineDash([]);

      // 6. Registrant Info Fields
      // Full Name
      ctx.fillStyle = '#fbba33';
      ctx.font = '700 15px system-ui, -apple-system, sans-serif';
      ctx.fillText('الاسم الكامل', width / 2, 575);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
      ctx.fillText(registrant.fullName, width / 2, 615);

      // Church
      ctx.fillStyle = '#fbba33';
      ctx.font = '700 15px system-ui, -apple-system, sans-serif';
      ctx.fillText('الكنيسة', width / 2, 665);

      ctx.fillStyle = '#f7f0e4';
      ctx.font = '600 23px system-ui, -apple-system, sans-serif';
      ctx.fillText(registrant.church, width / 2, 702);

      // Phone Number (if present)
      if (registrant.phoneNumber) {
        ctx.fillStyle = '#fbba33';
        ctx.font = '700 15px system-ui, -apple-system, sans-serif';
        ctx.fillText('رقم الموبايل', width / 2, 752);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
        ctx.fillText(registrant.phoneNumber, width / 2, 788);
      }

      // 7. Footer Note
      ctx.fillStyle = 'rgba(247, 240, 228, 0.55)';
      ctx.font = '600 14px system-ui, -apple-system, sans-serif';
      ctx.fillText('يرجى إظهار هذه التذكرة عند الدخول', width / 2, 855);

      // Convert to blob and trigger download / share
      canvas.toBlob((blob) => {
        if (!blob) {
          window.open(ticket.qrImageUrl, '_blank');
          setDownloading(false);
          return;
        }

        const url = URL.createObjectURL(blob);

        if (navigator.share && navigator.canShare) {
          const file = new File([blob], `ticket-pope-shenouda-center-${registrantId}.png`, { type: 'image/png' });
          const shareData = { files: [file] };

          if (navigator.canShare(shareData)) {
            navigator.share(shareData)
              .catch(() => fallbackDownload(url))
              .finally(() => setDownloading(false));
            return;
          }
        }

        fallbackDownload(url);
        setDownloading(false);
      }, 'image/png');
    } catch (err) {
      console.error('Download ticket error:', err);
      if (ticket?.qrImageUrl) {
        window.open(ticket.qrImageUrl, '_blank');
      }
      setDownloading(false);
    }
  };

  const fallbackDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-pope-shenouda-center-${registrantId}.png`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
              <path d="M13 5v14" />
            </svg>
          </div>
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
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                تذكرة دخول
              </p>
              <h1 style={{ fontSize: '1.375rem', fontWeight: 800 }}>دورة التاريخ الكنسي</h1>
            </div>

            {/* QR Code */}
            {ticket?.qrImageUrl ? (
              <div style={{
                padding: '0.625rem',
                background: 'white',
                borderRadius: '1rem',
                marginBottom: '1.5rem',
                display: 'inline-block',
              }}>
                <img
                  src={ticket.qrImageUrl}
                  alt="QR Code"
                  style={{ width: '16rem', height: '16rem', maxWidth: '100%', objectFit: 'contain' }}
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
            <div style={{
              borderTop: '1px dashed rgba(251, 186, 51, 0.3)',
              paddingTop: '1.5rem',
              display: 'grid',
              gap: '1rem',
            }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#fbba33', fontWeight: 700, marginBottom: '0.125rem' }}>الاسم الكامل</p>
                <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>{registrant.fullName}</p>
              </div>

              <div>
                <p style={{ fontSize: '0.75rem', color: '#fbba33', fontWeight: 700, marginBottom: '0.125rem' }}>الكنيسة</p>
                <p style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(247, 240, 228, 0.9)' }}>{registrant.church}</p>
              </div>

              {registrant.phoneNumber && (
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#fbba33', fontWeight: 700, marginBottom: '0.125rem' }}>رقم الموبايل</p>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(247, 240, 228, 0.9)', fontFamily: 'monospace' }} dir="ltr">
                    {registrant.phoneNumber}
                  </p>
                </div>
              )}
            </div>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="btn btn-primary btn-full"
              disabled={downloading}
              style={{
                marginTop: '2rem',
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
              }}
            >
              {downloading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="spinner" style={{ width: '1.25rem', height: '1.25rem' }} />
                  جاري تجهيز الصورة...
                </span>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>تحميل التذكرة (صورة)</span>
                </>
              )}
            </button>

            <p style={{ fontSize: '0.75rem', color: 'rgba(247, 240, 228, 0.45)', marginTop: '1rem' }}>
              يرجى إظهار هذه التذكرة عند الدخول
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
