import { describe, it, expect } from 'vitest';
import {
  trackRequiresAttendanceQr,
  ATTENDANCE_QR_TRACKS,
} from './registrationTracks';

describe('trackRequiresAttendanceQr', () => {
  it('is true for انتظامي, انتسابي, and سماعي', () => {
    expect(ATTENDANCE_QR_TRACKS).toEqual([
      'onsite_exam_onsite',
      'online_exam_onsite',
      'online_no_exam',
    ]);
    for (const track of ATTENDANCE_QR_TRACKS) {
      expect(trackRequiresAttendanceQr(track)).toBe(true);
    }
  });

  it('is false for residents abroad', () => {
    expect(trackRequiresAttendanceQr('abroad')).toBe(false);
  });

  it('is false for missing or unknown tracks', () => {
    expect(trackRequiresAttendanceQr(undefined)).toBe(false);
    expect(trackRequiresAttendanceQr(null)).toBe(false);
    expect(trackRequiresAttendanceQr('')).toBe(false);
    expect(trackRequiresAttendanceQr('unknown')).toBe(false);
  });
});
