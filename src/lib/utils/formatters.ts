/**
 * Formats a phone number for WhatsApp (digits only, international).
 * Egyptian 01XXXXXXXXX becomes 201XXXXXXXXX. Other numbers keep their country code.
 */
export function formatEgyptianPhone(phone: string): string {
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('00')) clean = clean.slice(2);
  if (clean.startsWith('0') && clean.length === 11) {
    clean = '20' + clean.substring(1);
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
