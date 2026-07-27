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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-auto flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative rounded-2xl overflow-hidden border border-amber-500/30 shadow-2xl bg-black/50 p-2">
          {/* Top-Right Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 flex items-center justify-center text-lg font-bold transition-all shadow-lg backdrop-blur-md cursor-pointer hover:scale-105"
            aria-label="إغلاق"
          >
            ✕
          </button>

          {validUrl ? (
            /* eslint-disable-next-next/no-img-element */
            <img
              src={validUrl}
              alt="إيصال الدفع"
              className="max-h-[85vh] w-auto object-contain rounded-lg"
            />
          ) : (
            <div className="p-8 text-center text-red-400 font-semibold">
              صورة غير صالحة
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
