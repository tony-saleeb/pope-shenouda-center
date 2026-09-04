import { describe, it, expect } from 'vitest';
import {
  REGISTRATION_TRACKS,
  trackRequiresAttendanceQr,
  ATTENDANCE_QR_TRACK,
} from './registrationTracks';

describe('trackRequiresAttendanceQr', () => {
  it('is true only for the انتظامي onsite track', () => {
    expect(ATTENDANCE_QR_TRACK).toBe('onsite_exam_onsite');
    expect(trackRequiresAttendanceQr('onsite_exam_onsite')).toBe(true);
  });

  it.each(
    REGISTRATION_TRACKS.filter((id) => id !== 'onsite_exam_onsite')
  )('is false for non-center track %s', (track) => {
    expect(trackRequiresAttendanceQr(track)).toBe(false);
  });

  it('is false for missing or unknown tracks', () => {
    expect(trackRequiresAttendanceQr(undefined)).toBe(false);
    expect(trackRequiresAttendanceQr(null)).toBe(false);
    expect(trackRequiresAttendanceQr('')).toBe(false);
    expect(trackRequiresAttendanceQr('unknown')).toBe(false);
  });
});
