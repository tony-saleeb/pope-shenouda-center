'use client';

import React, { useState } from 'react';

interface PaymentInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
}

export default function PaymentInstructionsModal({
  isOpen,
  onClose,
  onProceed,
}: PaymentInstructionsModalProps) {
  const [copied, setCopied] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);

  // Reset internal states whenever modal closes or opens
  React.useEffect(() => {
    if (!isOpen) {
      setIsProceeding(false);
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyPhone = () => {
    if (typeof window === 'undefined') return;

    const targetNumber = '01222572676';

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(targetNumber)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        })
        .catch((err) => {
          console.error('Clipboard API failed, attempting fallback:', err);
          fallbackCopy(targetNumber);
        });
    } else {
      fallbackCopy(targetNumber);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  };

  const handleProceed = async () => {
    setIsProceeding(true);
    try {
      await Promise.resolve(onProceed());
    } catch (err) {
      console.error('Error proceeding to registration:', err);
      setIsProceeding(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(5, 3, 1, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.75rem',
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '28.5rem',
          width: '100%',
          maxHeight: 'calc(100dvh - 1.5rem)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          background: 'linear-gradient(165deg, rgba(24, 15, 6, 0.98), rgba(10, 6, 2, 0.99))',
          border: '1px solid rgba(242, 158, 19, 0.3)',
          boxShadow: '0 30px 70px rgba(0, 0, 0, 0.9), 0 0 40px rgba(242, 158, 19, 0.1)',
          borderRadius: '1.5rem',
          padding: '1.25rem 1rem',
          color: '#f7f0e4',
          direction: 'rtl',
        }}
      >
        {/* Top Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '2.25rem',
              height: '2.25rem',
              borderRadius: '0.625rem',
              background: 'rgba(242, 158, 19, 0.12)',
              border: '1px solid rgba(242, 158, 19, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', margin: 0, lineHeight: 1.2 }}>
                تفاصيل رسوم الدفع
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'rgba(247, 240, 228, 0.5)' }}>
                مؤتمر القرن العاشر
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '2.375rem',
              height: '2.375rem',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'rgba(255, 255, 255, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.2s ease',
            }}
            title="إغلاق"
            aria-label="إغلاق النافذة"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Hero Price Badge */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(242, 158, 19, 0.15), rgba(179, 130, 63, 0.05))',
          border: '1px solid rgba(242, 158, 19, 0.3)',
          borderRadius: '1rem',
          padding: '1rem 0.875rem',
          textAlign: 'center',
          marginBottom: '1rem',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#fbba33',
            letterSpacing: '0.04em',
            display: 'block',
            marginBottom: '0.25rem',
          }}>
            قيمة الاشتراك المطلوب تحويلها
          </span>
          <div style={{
            fontSize: '2rem',
            fontWeight: 900,
            color: '#ffffff',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: '0.375rem',
            lineHeight: 1,
          }}>
            <span style={{ color: '#fbba33' }}>400</span>
            <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>جنيه مصري</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
          {/* Method A: InstaPay Direct Link */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '0.875rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.625rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                طريقة (1): InstaPay مباشر
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                deaconantonius@instapay
              </span>
            </div>

            <a
              href="https://ipn.eg/S/deaconantonius/instapay/8swCdp"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                borderRadius: '0.75rem',
                padding: '0.75rem 0.875rem',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.875rem',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
                transition: 'all 0.2s ease',
                minHeight: '2.625rem',
              }}
            >
              <span>فتح تطبيق InstaPay للدفع</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>

          {/* Method B: Manual Transfer Phone Number */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '1rem',
            padding: '0.875rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.625rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#fbba33', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: '#fbba33', flexShrink: 0 }} />
                طريقة (2): تحويل على رقم انستاباى
              </span>
              <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)' }}>
                InstaPay
              </span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(242, 158, 19, 0.25)',
              borderRadius: '0.75rem',
              padding: '0.5rem 0.75rem',
            }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '1.0625rem',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '0.05em',
              }} dir="ltr">
                0122 257 2676
              </span>

              <button
                onClick={handleCopyPhone}
                style={{
                  background: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                  border: copied ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.18)',
                  color: copied ? '#34d399' : '#f7f0e4',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  minHeight: '2.25rem',
                }}
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>نسخ الرقم</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Notice Card */}
        <div style={{
          background: 'rgba(242, 158, 19, 0.06)',
          border: '1px solid rgba(242, 158, 19, 0.25)',
          borderRadius: '1rem',
          padding: '0.75rem 0.875rem',
          marginBottom: '0.875rem',
          display: 'flex',
          gap: '0.625rem',
          alignItems: 'flex-start',
        }}>
          <div style={{ marginTop: '0.1rem', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <h4 style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#fbba33', margin: '0 0 0.2rem 0' }}>
              ملاحظة هامة (إيصال التحويل)
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'rgba(247, 240, 228, 0.8)', lineHeight: 1.5, margin: 0 }}>
              احرص على احتفاظك بصورة الإيصال (Screenshot) حيث سيتم رفعها في الخطوة القادمة لإقرار التسجيل.
            </p>
          </div>
        </div>

        {/* Fully Responsive Receipt Mockup Example */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(242, 158, 19, 0.2)',
          borderRadius: '1rem',
          padding: '0.75rem 0.5rem',
          marginBottom: '1.25rem',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(247, 240, 228, 0.65)', display: 'block', marginBottom: '0.5rem' }}>
            نموذج إيصال التحويل المقبول (Screenshot):
          </span>
          <div style={{
            position: 'relative',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: '#050301',
            padding: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img
              src="/assets/mockup.png"
              alt="نموذج إيصال التحويل المقبول"
              style={{
                maxWidth: '100%',
                maxHeight: 'min(220px, 28vh)',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                borderRadius: '0.5rem',
                display: 'block',
              }}
            />
          </div>
        </div>

        {/* Primary Action Button */}
        <button
          onClick={handleProceed}
          disabled={isProceeding}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #f29e13, #b3823f)',
            border: '1px solid rgba(251, 186, 51, 0.5)',
            borderRadius: '0.875rem',
            padding: '0.875rem 1rem',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.9375rem',
            cursor: isProceeding ? 'wait' : 'pointer',
            opacity: isProceeding ? 0.85 : 1,
            boxShadow: '0 6px 20px rgba(242, 158, 19, 0.3)',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            minHeight: '2.875rem',
          }}
        >
          {isProceeding ? (
            <>
              <div className="spinner spinner-sm" style={{ borderTopColor: '#ffffff', width: '1.25rem', height: '1.25rem' }} />
              <span>جاري الانتقال لنموذج التسجيل...</span>
            </>
          ) : (
            <>
              <span>المتابعة لنموذج التسجيل</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
