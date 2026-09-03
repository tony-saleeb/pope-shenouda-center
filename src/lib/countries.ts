export interface DialCountry {
  iso: string;
  nameAr: string;
  dial: string;
}

/** Dial codes for abroad registrants. Egypt is omitted — those tracks use the local 01 number. */
export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: 'US', nameAr: 'الولايات المتحدة', dial: '1' },
  { iso: 'CA', nameAr: 'كندا', dial: '1' },
  { iso: 'AU', nameAr: 'أستراليا', dial: '61' },
  { iso: 'NZ', nameAr: 'نيوزيلندا', dial: '64' },
  { iso: 'GB', nameAr: 'المملكة المتحدة', dial: '44' },
  { iso: 'IE', nameAr: 'أيرلندا', dial: '353' },
  { iso: 'FR', nameAr: 'فرنسا', dial: '33' },
  { iso: 'DE', nameAr: 'ألمانيا', dial: '49' },
  { iso: 'IT', nameAr: 'إيطاليا', dial: '39' },
  { iso: 'ES', nameAr: 'إسبانيا', dial: '34' },
  { iso: 'NL', nameAr: 'هولندا', dial: '31' },
  { iso: 'BE', nameAr: 'بلجيكا', dial: '32' },
  { iso: 'AT', nameAr: 'النمسا', dial: '43' },
  { iso: 'CH', nameAr: 'سويسرا', dial: '41' },
  { iso: 'SE', nameAr: 'السويد', dial: '46' },
  { iso: 'GR', nameAr: 'اليونان', dial: '30' },
  { iso: 'CY', nameAr: 'قبرص', dial: '357' },
  { iso: 'AE', nameAr: 'الإمارات', dial: '971' },
  { iso: 'SA', nameAr: 'السعودية', dial: '966' },
  { iso: 'KW', nameAr: 'الكويت', dial: '965' },
  { iso: 'QA', nameAr: 'قطر', dial: '974' },
  { iso: 'BH', nameAr: 'البحرين', dial: '973' },
  { iso: 'OM', nameAr: 'عُمان', dial: '968' },
  { iso: 'JO', nameAr: 'الأردن', dial: '962' },
  { iso: 'LB', nameAr: 'لبنان', dial: '961' },
  { iso: 'IQ', nameAr: 'العراق', dial: '964' },
  { iso: 'LY', nameAr: 'ليبيا', dial: '218' },
  { iso: 'SD', nameAr: 'السودان', dial: '249' },
  { iso: 'SS', nameAr: 'جنوب السودان', dial: '211' },
  { iso: 'KE', nameAr: 'كينيا', dial: '254' },
  { iso: 'ZA', nameAr: 'جنوب أفريقيا', dial: '27' },
].sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));

export function isKnownDialCode(dial: string): boolean {
  return DIAL_COUNTRIES.some((country) => country.dial === dial);
}
