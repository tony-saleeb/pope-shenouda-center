'use client';

import { TRACK_LIST, type RegistrationTrack } from '@/lib/registrationTracks';

function PathStrip({
  lecture,
  exam,
}: {
  lecture: string;
  exam: string;
}) {
  return (
    <span className="track-path">
      <span className="track-node">
        <i aria-hidden />
        <span>
          <em>المحاضرات</em>
          <b>{lecture}</b>
        </span>
      </span>
      <span className="track-rail" aria-hidden />
      <span className="track-node">
        <i aria-hidden />
        <span>
          <em>الامتحان</em>
          <b>{exam}</b>
        </span>
      </span>
    </span>
  );
}

interface TrackPickerProps {
  value: string;
  onSelect: (id: RegistrationTrack) => void;
  error?: string;
}

export default function TrackPicker({ value, onSelect, error }: TrackPickerProps) {
  return (
    <div className="track-picker">
      <div className="track-board" role="radiogroup" aria-label="نوع التسجيل">
        {TRACK_LIST.map((track) => {
          const selected = value === track.id;
          const name = track.tagAr ?? track.titleAr;
          const featured = track.id === 'onsite_exam_onsite';
          const hasPath = Boolean(track.lectureAr && track.examAr);

          return (
            <button
              key={track.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={track.tagAr ? `${track.tagAr} — ${track.titleAr}` : track.titleAr}
              className={[
                'track-choice',
                featured ? 'is-featured' : '',
                track.id === 'abroad' ? 'is-abroad' : '',
                selected ? 'is-on' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelect(track.id)}
            >
              <span className="track-choice-top">
                <span className="track-choice-name">{name}</span>
                <span className={`track-choice-tick${selected ? ' is-on' : ''}`} aria-hidden>
                  {selected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
              </span>
              {hasPath ? (
                <PathStrip lecture={track.lectureAr ?? ''} exam={track.examAr ?? ''} />
              ) : (
                <span className="track-choice-note">{track.detailAr}</span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
