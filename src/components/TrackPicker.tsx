'use client';

import { TRACK_LIST, type RegistrationTrack } from '@/lib/registrationTracks';

function IconOnsite() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 20h18" />
      <path d="M5 20V10l7-5 7 5v10" />
      <path d="M9 20v-6h6v6" />
      <path d="M9 12h.01M12 12h.01M15 12h.01" />
    </svg>
  );
}

function IconOnlineExam() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
      <path d="M8 10l2 2 4-4" />
    </svg>
  );
}

function IconListening() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V6.5A2.5 2.5 0 0 1 6.5 4H12v15H6.5A2.5 2.5 0 0 0 4 19z" />
      <path d="M12 4h5.5A2.5 2.5 0 0 1 20 6.5V19a2.5 2.5 0 0 1-2.5 2.5H12" />
      <path d="M12 4v15" />
    </svg>
  );
}

function IconAbroad() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

function TrackIcon({ id }: { id: RegistrationTrack }) {
  if (id === 'onsite_exam_onsite') return <IconOnsite />;
  if (id === 'online_exam_onsite') return <IconOnlineExam />;
  if (id === 'online_no_exam') return <IconListening />;
  return <IconAbroad />;
}

interface TrackPickerProps {
  value: string;
  onSelect: (id: RegistrationTrack) => void;
  error?: string;
}

export default function TrackPicker({ value, onSelect, error }: TrackPickerProps) {
  return (
    <div className="track-picker">
      <div className="track-grid" role="radiogroup" aria-label="نوع التسجيل">
        {TRACK_LIST.map((track) => {
          const selected = value === track.id;
          const name = track.tagAr ?? track.titleAr;
          const detail = track.lectureAr && track.examAr
            ? `${track.lectureAr} · ${track.examAr}`
            : track.detailAr;

          return (
            <button
              key={track.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={track.tagAr ? `${track.tagAr} — ${track.titleAr}` : track.titleAr}
              className={`track-folio is-${track.tone}${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(track.id)}
            >
              <span className="track-seal">
                <TrackIcon id={track.id} />
              </span>
              <span className="track-folio-copy">
                <span className="track-folio-name">{name}</span>
                <span className="track-folio-detail">{detail}</span>
              </span>
              <span className={`track-dot${selected ? ' is-on' : ''}`} aria-hidden>
                {selected && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
