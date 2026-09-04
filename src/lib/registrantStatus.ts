import type { RegistrantStatus } from '@/lib/types';

export const PENDING_REVIEW_STATUSES: RegistrantStatus[] = [
  'pending_verification',
  'manual_review',
];

export const APPROVED_STATUSES: RegistrantStatus[] = ['approved', 'auto_approved'];

export function isApprovedStatus(status: unknown): boolean {
  return status === 'approved' || status === 'auto_approved';
}
