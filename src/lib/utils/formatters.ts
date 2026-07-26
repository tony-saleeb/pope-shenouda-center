/**
 * Formats Egyptian phone numbers to international E.164 format (201XXXXXXXXX).
 * Removes spaces, dashes, and replaces leading '0' with '20'.
 */
export function formatEgyptianPhone(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '20' + clean.substring(1);
  }
  if (!clean.startsWith('20') && clean.length === 10) {
    clean = '20' + clean;
  }
  return clean;
}

/**
 * Format currency amount to EGP string.
 */
export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-EG')} جم`;
}

/**
 * Format timestamp or Date object to localized Arabic date string.
 */
export function formatArabicDate(date: Date | { toDate?: () => Date } | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function'
    ? date.toDate()
    : (date as Date);
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG');
}
