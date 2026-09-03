'use client';

import React, { useState } from 'react';
import { formatTrackFee, type RegistrationTrackInfo } from '@/lib/registrationTracks';

const CONTACT_PHONE_DISPLAY = '0122 257 2676';
const CONTACT_PHONE_DIGITS = '01222572676';
const CONTACT_WHATSAPP = 'https://wa.me/201222572676';
const INSTAPAY_LINK = 'https://ipn.eg/S/deaconantonius/instapay/8swCdp';
const INSTAPAY_ID = 'deaconantonius@instapay';

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
    <div className="pay-sheet">
      <div className={`pay-card is-${track.tone}`}>
        <header className="pay-card-head">
          <div className="pay-card-headline">
            <span className="pay-card-icon" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h5" />
              </svg>
            </span>
            <div className="pay-card-head-text">
              <span className="pay-card-title">رسوم التسجيل</span>
              <span className="pay-card-sub">تفاصيل المبلغ المطلوب</span>
            </div>
          </div>
          <span className={`pay-card-badge is-${track.tone}`}>
            {track.tagAr ?? track.titleAr}
          </span>
        </header>
        <div className="pay-card-divider" aria-hidden />
        <div className="pay-card-total">
          <span className="pay-card-label">المبلغ المطلوب للتحويل</span>
          <div className="pay-card-price">
            <span className="pay-card-amount">
              {track.amount.toLocaleString('ar-EG')}
            </span>
            <span className="pay-card-currency">{track.currencyAr}</span>
          </div>
        </div>
      </div>

      {track.usesInstapay ? (
        <>
          <a
            className="pay-primary"
            href={INSTAPAY_LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>ادفع الآن عبر InstaPay</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <p className="pay-account" dir="ltr">{INSTAPAY_ID}</p>
        </>
      ) : (
        <a
          className="pay-primary"
          href={CONTACT_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>تواصل عبر واتساب للدفع</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      )}

      <div className="pay-split">
        <span>أو حوّل يدوياً</span>
      </div>

      <div className="pay-manual">
        <span className="pay-manual-phone" dir="ltr">{CONTACT_PHONE_DISPLAY}</span>
        <button
          type="button"
          className={`pay-sheet-copy${copied ? ' is-copied' : ''}`}
          onClick={handleCopyPhone}
        >
          {copied ? 'تم النسخ' : 'نسخ الرقم'}
        </button>
      </div>

      {!track.usesInstapay && (
        <p className="pay-account">InstaPay غير متاح — {formatTrackFee(track)}</p>
      )}

      <p className="pay-sheet-tip">بعد التحويل احتفظ بصورة الإيصال لرفعها في الخطوة التالية</p>

      {track.usesInstapay && (
        <figure className="pay-sheet-sample">
          <figcaption>مثال للإيصال المقبول</figcaption>
          <img src="/assets/mockup.png" alt="نموذج إيصال التحويل المقبول" />
        </figure>
      )}
    </div>
  );
}
