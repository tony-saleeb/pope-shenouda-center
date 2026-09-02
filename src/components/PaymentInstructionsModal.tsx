'use client';

import React, { useState } from 'react';
import { formatTrackFee, formatTrackTitle, type RegistrationTrackInfo } from '@/lib/registrationTracks';

const CONTACT_PHONE_DISPLAY = '0122 257 2676';
const CONTACT_PHONE_DIGITS = '01222572676';
const CONTACT_WHATSAPP = 'https://wa.me/201222572676';

export default function PaymentInstructionsPanel({
  track,
}: {
  track: RegistrationTrackInfo | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!track) return null;

  const handleCopyPhone = () => {
    if (typeof window === 'undefined') return;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(CONTACT_PHONE_DIGITS)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
        })
        .catch(() => {
          fallbackCopy(CONTACT_PHONE_DIGITS);
        });
    } else {
      fallbackCopy(CONTACT_PHONE_DIGITS);
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
    } catch {
      // Clipboard unavailable — the number remains visible to copy manually.
    }
  };

  return (
    <div className="pay-inline">
      <p className="pay-inline-track">{formatTrackTitle(track)}</p>

      <div className="pay-body">
        <div className="pay-col">
          <div className="pay-amount">
            <span>قيمة الاشتراك المطلوب تحويلها</span>
            <strong>
              {track.amount.toLocaleString('ar-EG')}
              <em>{track.currencyAr}</em>
            </strong>
          </div>

          {track.usesInstapay ? (
            <>
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
                  <span className="pay-phone" dir="ltr">{CONTACT_PHONE_DISPLAY}</span>
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
            </>
          ) : (
            <div className="pay-method">
              <h4>التحويل بالدولار</h4>
              <span className="pay-hint">InstaPay غير متاح لهذه الفئة. تواصل لإتمام تحويل {formatTrackFee(track)}</span>
              <a
                className="pay-instapay"
                href={CONTACT_WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>التواصل عبر واتساب لإتمام التحويل</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
              <div className="pay-phone-row" style={{ marginTop: '0.65rem' }}>
                <span className="pay-phone" dir="ltr">{CONTACT_PHONE_DISPLAY}</span>
                <button
                  type="button"
                  className={`pay-copy${copied ? ' is-copied' : ''}`}
                  onClick={handleCopyPhone}
                >
                  {copied ? <span>تم النسخ</span> : <span>نسخ الرقم</span>}
                </button>
              </div>
            </div>
          )}

          <div className="pay-note">
            <h4>ملاحظة هامة (إيصال التحويل)</h4>
            <p>
              احرص على احتفاظك بصورة الإيصال (Screenshot) حيث سيتم رفعها لاحقاً في خطوة إثبات الدفع.
            </p>
          </div>
        </div>

        {track.usesInstapay && (
          <div className="pay-col pay-sample">
            <h4>نموذج إيصال التحويل المقبول (Screenshot):</h4>
            <img
              src="/assets/mockup.png"
              alt="نموذج إيصال التحويل المقبول"
            />
          </div>
        )}
      </div>
    </div>
  );
}
