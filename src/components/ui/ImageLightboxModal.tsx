'use client';

import React from 'react';
import { safeImageSrc } from '@/lib/validation';

interface ImageLightboxModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageLightboxModal({ imageUrl, onClose }: ImageLightboxModalProps) {
  if (!imageUrl) return null;

  const validUrl = safeImageSrc(imageUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl bg-black/40 p-2">
          {validUrl ? (
            /* eslint-disable-next-next/no-img-element */
            <img
              src={validUrl}
              alt="إيصال الدفع"
              className="max-h-[75vh] w-auto object-contain rounded-lg"
            />
          ) : (
            <div className="p-8 text-center text-red-400 font-semibold">
              صورة غير صالحة
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {validUrl && (
            <a
              href={validUrl}
              target="_blank" rel="noopener noreferrer"
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all flex items-center gap-2"
            >
              🔍 فتح الصورة الأصلية
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 transition-all"
          >
            إغلاق المعاينة
          </button>
        </div>
      </div>
    </div>
  );
}
