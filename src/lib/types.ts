import { Timestamp } from 'firebase/firestore';
import type { FeeCurrency, RegistrationTrack } from './registrationTracks';

// ─── Registrant ────────────────────────────────────────────────────
export type RegistrantStatus =
  | 'pending_verification'
  | 'auto_approved'
  | 'manual_review'
  | 'approved'
  | 'rejected';

export interface Registrant {
  fullName: string;
  phoneNumber: string;
  whatsappNumber: string;
  church: string;
  paymentScreenshotUrl: string;
  status: RegistrantStatus;
  adminNotes: string | null;
  createdAt: Timestamp;
  verifiedAt: Timestamp | null;
  track?: RegistrationTrack | null;
  feeAmount?: number | null;
  feeCurrency?: FeeCurrency | null;
  countryDial?: string | null;
}

// ─── Phone Index ───────────────────────────────────────────────────
export interface PhoneIndex {
  registrantId: string;
}

// ─── Bank Transaction ──────────────────────────────────────────────
export interface BankTransaction {
  amount: number;
  senderName: string | null;
  transactionDate: Timestamp;
  matchedRegistrantId: string | null;
  importedAt: Timestamp;
}

// ─── Ticket ────────────────────────────────────────────────────────
export interface Ticket {
  qrToken: string;
  qrImageUrl: string;
  used: boolean;
  usedAt: Timestamp | null;
  usedByUsherId: string | null;
  createdAt: Timestamp;
  /** One gate check-in per Cairo calendar day (`YYYY-MM-DD`). */
  checkIns?: Record<string, { usedAt: Timestamp; usedByUsherId: string }>;
}

// ─── Staff ─────────────────────────────────────────────────────────
export type StaffRole = 'admin' | 'usher';

export interface Staff {
  name: string;
  role: StaffRole;
}

// ─── Bank Statement CSV Row ────────────────────────────────────────
export interface BankStatementRow {
  referenceNumber: string;
  amount: number;
  senderName: string | null;
  transactionDate: string;
}

// ─── Scan Result ───────────────────────────────────────────────────
export type ScanResultType = 'success' | 'already_used' | 'invalid_ticket' | 'tampered';

export interface ScanResult {
  type: ScanResultType;
  registrantName?: string;
  church?: string;
  usedAt?: string;
  message: string;
  messageAr: string;
}

// ─── Registration Form Data ────────────────────────────────────────
export interface RegistrationFormData {
  track: RegistrationTrack | '';
  fullName: string;
  church: string;
  customChurch: string;
  countryDial: string;
  phoneNumber: string;
  whatsappNumber: string;
  sameAsPhone: boolean;
  paymentScreenshot: File | null;
}

// ─── Step Wizard ───────────────────────────────────────────────────
export interface WizardStep {
  id: string;
  titleAr: string;
  titleEn: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  { id: 'track', titleAr: 'نوع التسجيل', titleEn: 'Track' },
  { id: 'fees', titleAr: 'رسوم الدفع', titleEn: 'Fees' },
  { id: 'name', titleAr: 'الاسم', titleEn: 'Name' },
  { id: 'church', titleAr: 'الكنيسة', titleEn: 'Church' },
  { id: 'phone', titleAr: 'رقم الموبايل', titleEn: 'Phone' },
  { id: 'payment', titleAr: 'إثبات الدفع', titleEn: 'Payment' },
];

// ─── Church List ───────────────────────────────────────────────────
// TODO: Replace with actual church list from the user
export const CHURCHES: string[] = [
  'كنيسة مارمرقس',
  'كنيسة العذراء مريم',
  'كنيسة مارجرجس',
  'كنيسة الأنبا أنطونيوس',
  'كنيسة الأنبا بيشوي',
  'كنيسة الأنبا رويس',
  'كنيسة مارمينا',
  'كنيسة السيدة العذراء',
  'كنيسة الملاك ميخائيل',
  'كنيسة مارى جرجس',
];
