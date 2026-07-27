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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative max-w-lg w-full glass-card p-6 md:p-8 rounded-2xl border border-amber-500/30 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'rgba(19, 12, 5, 0.96)', color: '#f7f0e4' }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-neutral-300 flex items-center justify-center text-lg transition-all"
          aria-label="إغلاق"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl shadow-inner">
            💳
          </div>
          <h2 className="text-2xl font-black text-white mb-1">
            تعليمات ورسوم التسجيل
          </h2>
          <p className="text-sm text-neutral-400">
            يرجى قراءة خطوات الدفع التالية بعناية قبل البدء
          </p>
        </div>

        {/* Price Card */}
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 border border-amber-500/40 text-center">
          <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider block mb-1">
            رسوم اشتراك المؤتمر
          </span>
          <div className="text-3xl font-black text-amber-400 flex items-center justify-center gap-1">
            <span>400</span>
            <span className="text-lg font-bold text-amber-200">جنيه مصري (EGP)</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="space-y-4 mb-6">
          {/* Method 1: Direct InstaPay Link */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <h4 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
              <span className="text-amber-400">❶</span> الدفع المباشر عبر InstaPay:
            </h4>
            <a
              href="https://ipn.eg/S/deaconantonius/instapay/8swCdp"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-full py-3 text-sm font-bold text-center block text-white no-underline shadow-lg"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
            >
              🚀 فتح تطبيق InstaPay والدفع المباشر
            </a>
            <span className="text-[0.75rem] text-neutral-400 text-center block mt-1.5">
              (رابط التحويل المباشر إلى deaconantonius@instapay)
            </span>
          </div>

          {/* Method 2: Manual Transfer Phone Number */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <h4 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
              <span className="text-amber-400">❷</span> أو التحويل اليدوي إلى هذا الرقم:
            </h4>
            <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/10">
              <span className="font-mono font-bold text-lg text-amber-300 tracking-wider" dir="ltr">
                0122 2572676
              </span>
              <button
                onClick={handleCopyPhone}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all"
              >
                {copied ? 'تم النسخ ✓' : '📋 نسخ الرقم'}
              </button>
            </div>
            <span className="text-[0.75rem] text-neutral-400 block mt-1">
              * مقبول عبر InstaPay أو محفظة فودافون كاش
            </span>
          </div>
        </div>

        {/* Critical Screenshot Warning */}
        <div className="p-4 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm leading-relaxed">
          <div className="font-bold text-amber-300 mb-1 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>تنبيه هام جداً (صورة الإيصال):</span>
          </div>
          <p className="text-xs text-neutral-300">
            احرص على التقاط **لقطة شاشة (Screenshot)** لرسالة أو إيصال التحويل الناجح، حيث سيطلب منك **رفع صورة الإيصال** في الخطوة القادمة لإتمام التسجيل وتوليد تذكرتك.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={onProceed}
          className="btn btn-primary btn-full py-3.5 text-base font-extrabold w-full shadow-xl"
          style={{ background: 'linear-gradient(135deg, #f29e13, #b3823f)', color: '#fff' }}
        >
          فهمت ذلك، المتابعة للتسجيل ➔
        </button>
      </div>
    </div>
  );
}
