export const REGISTRATION_TRACKS = [
  'onsite_exam_onsite',
  'online_exam_onsite',
  'online_no_exam',
  'abroad',
] as const;

export type RegistrationTrack = (typeof REGISTRATION_TRACKS)[number];

export type FeeCurrency = 'EGP' | 'USD';

export interface RegistrationTrackInfo {
  id: RegistrationTrack;
  titleAr: string;
  tagAr?: string;
  tone: 'gold' | 'emerald' | 'sky' | 'copper';
  detailAr: string;
  lectureAr?: string;
  examAr?: string;
  amount: number;
  currency: FeeCurrency;
  currencyAr: string;
  usesInstapay: boolean;
}

export const TRACKS: Record<RegistrationTrack, RegistrationTrackInfo> = {
  onsite_exam_onsite: {
    id: 'onsite_exam_onsite',
    titleAr: 'الحضور في المركز والامتحان في المركز',
    tagAr: 'انتظامي',
    tone: 'gold',
    detailAr: 'المحاضرات والامتحان داخل المركز',
    lectureAr: 'الحضور في المركز',
    examAr: 'الامتحان في المركز',
    amount: 500,
    currency: 'EGP',
    currencyAr: 'جنيه مصري',
    usesInstapay: true,
  },
  online_exam_onsite: {
    id: 'online_exam_onsite',
    titleAr: 'الدورة أونلاين والامتحان في المركز',
    tagAr: 'انتسابي',
    tone: 'emerald',
    detailAr: 'المحاضرات عن بُعد والامتحان داخل المركز',
    lectureAr: 'الدورة أونلاين',
    examAr: 'الامتحان في المركز',
    amount: 400,
    currency: 'EGP',
    currencyAr: 'جنيه مصري',
    usesInstapay: true,
  },
  online_no_exam: {
    id: 'online_no_exam',
    titleAr: 'الدورة أونلاين بدون امتحان',
    tagAr: 'سماعي',
    tone: 'sky',
    detailAr: 'متابعة المحاضرات عن بُعد دون امتحان',
    lectureAr: 'الدورة أونلاين',
    examAr: 'بدون امتحان',
    amount: 400,
    currency: 'EGP',
    currencyAr: 'جنيه مصري',
    usesInstapay: true,
  },
  abroad: {
    id: 'abroad',
    titleAr: 'المقيمون خارج مصر',
    tone: 'copper',
    detailAr: 'للدارسين خارج جمهورية مصر العربية',
    amount: 50,
    currency: 'USD',
    currencyAr: 'دولار أمريكي',
    usesInstapay: false,
  },
};

export const TRACK_LIST: RegistrationTrackInfo[] = REGISTRATION_TRACKS.map(
  (id) => TRACKS[id]
);

export function isRegistrationTrack(value: unknown): value is RegistrationTrack {
  return typeof value === 'string' && (REGISTRATION_TRACKS as readonly string[]).includes(value);
}

export function getTrack(id: string | null | undefined): RegistrationTrackInfo | null {
  if (!id || !isRegistrationTrack(id)) return null;
  return TRACKS[id];
}

export function formatTrackTitle(track: RegistrationTrackInfo): string {
  return track.tagAr ? `${track.titleAr} (${track.tagAr})` : track.titleAr;
}

export function formatTrackFee(track: RegistrationTrackInfo): string {
  const amount = track.amount.toLocaleString('ar-EG');
  return `${amount} ${track.currencyAr}`;
}

/** Center attendance QR is issued only for the انتظامي track. */
export const ATTENDANCE_QR_TRACK: RegistrationTrack = 'onsite_exam_onsite';

export function trackRequiresAttendanceQr(track: unknown): boolean {
  return track === ATTENDANCE_QR_TRACK;
}
