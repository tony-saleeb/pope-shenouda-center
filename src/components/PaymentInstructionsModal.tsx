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

  React.useEffect(() => {
    if (!isOpen) {
      setIsProceeding(false);
      setCopied(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
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
    <div className="pay-overlay" onClick={onClose} role="presentation">
      <div
        className="pay-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-dialog-title"
      >
        <header className="pay-header">
          <div>
            <h3 id="pay-dialog-title">تفاصيل رسوم الدفع</h3>
            <p>مركز البابا شنودة للتاريخ الكنسي</p>
          </div>
          <button
            type="button"
            className="pay-close"
            onClick={onClose}
            title="إغلاق"
            aria-label="إغلاق النافذة"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="pay-body">
          <div className="pay-col">
            <div className="pay-amount">
              <span>قيمة الاشتراك المطلوب تحويلها</span>
              <strong>
                400
                <em>جنيه مصري</em>
              </strong>
            </div>

            <div className="pay-method">
              <h4>طريقة (1): InstaPay مباشر</h4>
              <span className="pay-hint">deaconantonius@instapay</span>
              <a
                className="pay-instapay"
                href="https://ipn.eg/S/deaconantonius/instapay/8swCdp"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>فتح تطبيق InstaPay للدفع</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>

            <div className="pay-method">
              <h4>طريقة (2): تحويل على رقم انستاباى</h4>
              <div className="pay-phone-row">
                <span className="pay-phone" dir="ltr">0122 257 2676</span>
                <button
                  type="button"
                  className={`pay-copy${copied ? ' is-copied' : ''}`}
                  onClick={handleCopyPhone}
                >
                  {copied ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

            <div className="pay-note">
              <h4>ملاحظة هامة (إيصال التحويل)</h4>
              <p>
                احرص على احتفاظك بصورة الإيصال (Screenshot) حيث سيتم رفعها في الخطوة القادمة لإقرار التسجيل.
              </p>
            </div>
          </div>

          <div className="pay-col pay-sample">
            <h4>نموذج إيصال التحويل المقبول (Screenshot):</h4>
            <img
              src="/assets/mockup.png"
              alt="نموذج إيصال التحويل المقبول"
            />
          </div>
        </div>

        <div className="pay-footer">
          <button
            type="button"
            className="pay-continue"
            onClick={handleProceed}
            disabled={isProceeding}
          >
            {isProceeding ? (
              <>
                <div className="spinner spinner-sm" style={{ borderTopColor: '#1a1208', width: '1.25rem', height: '1.25rem' }} />
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
    </div>
  );
}
