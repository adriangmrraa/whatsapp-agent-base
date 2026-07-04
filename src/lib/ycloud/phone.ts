/**
 * Strip all non-digit characters and prepend "54" (Argentina default)
 * if the number has 10 or fewer digits after stripping.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 10) {
    return "54" + digits;
  }
  return digits;
}

/**
 * Basic validation: must have at least 10 digits after stripping non-digits.
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10;
}
