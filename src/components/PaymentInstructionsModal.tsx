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

  if (!isOpen) return null;

  const handleCopyPhone = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText('01222572676');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(8, 4, 1, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth: '30rem',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'linear-gradient(145deg, rgba(26, 16, 7, 0.97), rgba(14, 8, 3, 0.98))',
          border: '1px solid rgba(242, 158, 19, 0.35)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 35px rgba(242, 158, 19, 0.12)',
          borderRadius: '1.5rem',
          padding: '1.75rem 1.5rem',
          color: '#f7f0e4',
          direction: 'rtl',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            left: '1.25rem',
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#e6ded6',
            fontSize: '1.125rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
          title="إغلاق"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '4rem',
            height: '4rem',
            margin: '0 auto 0.875rem',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(242, 158, 19, 0.25), rgba(179, 130, 63, 0.1))',
            border: '1px solid rgba(242, 158, 19, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 25px rgba(242, 158, 19, 0.2)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fbba33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            color: '#ffffff',
            marginBottom: '0.35rem',
            background: 'linear-gradient(135deg, #ffffff, #fbba33)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            تعليمات ورسوم التسجيل
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'rgba(247, 240, 228, 0.65)', margin: 0 }}>
            يرجى قراءة خطوات الدفع التالية بعناية قبل البدء
          </p>
        </div>

        {/* Price Tag Box */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(242, 158, 19, 0.18), rgba(179, 130, 63, 0.08))',
          border: '1px solid rgba(242, 158, 19, 0.4)',
          borderRadius: '1.125rem',
          padding: '1rem',
          textAlign: 'center',
          marginBottom: '1.25rem',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#fbba33',
            letterSpacing: '0.05em',
            display: 'block',
            marginBottom: '0.25rem',
          }}>
            رسوم اشتراك المؤتمر
          </span>
          <div style={{
            fontSize: '2rem',
            fontWeight: 900,
            color: '#fbba33',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            lineHeight: 1,
          }}>
            <span>400</span>
            <span style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f7f0e4' }}>جنيه مصري (EGP)</span>
          </div>
        </div>

        {/* Payment Methods Options */}
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
          {/* Method 1: InstaPay Direct Payment */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '1.125rem',
            padding: '1rem',
          }}>
            <h4 style={{
              fontSize: '0.9375rem',
              fontWeight: 800,
              color: '#ffffff',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                background: 'rgba(242, 158, 19, 0.2)',
                color: '#fbba33',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8125rem',
                fontWeight: 900,
              }}>1</span>
              <span>الدفع المباشر عبر تطبيق InstaPay:</span>
            </h4>

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
                border: '1px solid rgba(16, 185, 129, 0.5)',
                borderRadius: '0.875rem',
                padding: '0.875rem 1rem',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.9375rem',
                boxShadow: '0 4px 20px rgba(16, 185, 129, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>🚀 فتح تطبيق InstaPay والدفع المباشر</span>
            </a>

            <span style={{
              display: 'block',
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'rgba(247, 240, 228, 0.5)',
              marginTop: '0.5rem',
            }}>
              رابط التحويل المباشر إلى: deaconantonius@instapay
            </span>
          </div>

          {/* Method 2: Transfer to Phone Number */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '1.125rem',
            padding: '1rem',
          }}>
            <h4 style={{
              fontSize: '0.9375rem',
              fontWeight: 800,
              color: '#ffffff',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                background: 'rgba(242, 158, 19, 0.2)',
                color: '#fbba33',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8125rem',
                fontWeight: 900,
              }}>2</span>
              <span>أو التحويل اليدوي إلى هذا الرقم:</span>
            </h4>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(242, 158, 19, 0.25)',
              borderRadius: '0.875rem',
              padding: '0.625rem 0.875rem',
            }}>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '1.125rem',
                fontWeight: 800,
                color: '#fbba33',
                letterSpacing: '0.05em',
              }} dir="ltr">
                0122 2572676
              </span>

              <button
                onClick={handleCopyPhone}
                style={{
                  background: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(242, 158, 19, 0.2)',
                  border: copied ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(242, 158, 19, 0.4)',
                  color: copied ? '#34d399' : '#fbba33',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '0.625rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span>{copied ? 'تم النسخ ✓' : '📋 نسخ الرقم'}</span>
              </button>
            </div>

            <span style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'rgba(247, 240, 228, 0.5)',
              marginTop: '0.5rem',
            }}>
              * مقبول عبر تطبيق InstaPay أو فودافون كاش
            </span>
          </div>
        </div>

        {/* Screenshot Alert Box */}
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '1.125rem',
          padding: '1rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 800,
            color: '#fbba33',
            marginBottom: '0.35rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}>
            <span>⚠️</span>
            <span>تنبيه هام جداً (صورة الإيصال):</span>
          </div>
          <p style={{
            fontSize: '0.8125rem',
            color: 'rgba(247, 240, 228, 0.85)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            احرص على التقاط <strong>لقطة شاشة (Screenshot)</strong> لإيصال تحويل الدفع الناجح، حيث سيطلب منك <strong>رفع صورة الإيصال</strong> في الخطوة القادمة لإتمام تسجيلك وإصدار تذكرتك.
          </p>
        </div>

        {/* Main Action Button */}
        <button
          onClick={onProceed}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #f29e13, #b3823f)',
            border: '1px solid rgba(251, 186, 51, 0.5)',
            borderRadius: '0.875rem',
            padding: '0.9375rem 1rem',
            color: '#ffffff',
            fontWeight: 900,
            fontSize: '1.0625rem',
            cursor: 'pointer',
            boxShadow: '0 8px 25px rgba(242, 158, 19, 0.35)',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <span>فهمت ذلك، المتابعة للتسجيل ➔</span>
        </button>
      </div>
    </div>
  );
}
