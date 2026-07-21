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
  const [whatsappUrl, setWhatsappUrl] = useState('');

  useEffect(() => {
    if (registrant) {
      const text = encodeURIComponent(`🎫 تذكرتي لمؤتمر الكنيسة جاهزة! يمكنك عرضها من الرابط التالي:\n${window.location.origin}/ticket/${registrantId}`);
      setWhatsappUrl(`https://api.whatsapp.com/send?phone=2${registrant.whatsappNumber}&text=${text}`);
    }
  }, [registrant, registrantId]);

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

  const handleDownload = async () => {
    if (!ticket?.qrImageUrl) return;
    try {
      const response = await fetch(ticket.qrImageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticket-${registrantId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(ticket.qrImageUrl, '_blank');
    }
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

          {/* Action Buttons */}
          {ticket?.qrImageUrl && (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <button className="btn btn-success btn-full">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <span>إرسال التذكرة على واتساب</span>
                  </button>
                </a>
              )}
              
              <button
                className="btn btn-accent btn-full"
                onClick={handleDownload}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" x2="12" y1="15" y2="3" />
                </svg>
                <span>تحميل التذكرة</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  );
}
