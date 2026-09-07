export const PRIMARY_ADMIN_EMAIL = 'tonysaleeb23@gmail.com';

export function isPrimaryAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().trim() === PRIMARY_ADMIN_EMAIL.toLowerCase());
}
