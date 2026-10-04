/**
 * Congolese mobile number in the form FlexPay expects: 243 followed by 9 digits.
 * Accepts 089xxxxxxx, 89xxxxxxx, +24389xxxxxxx, 0024389xxxxxxx, with or without spaces.
 * Returns null when the number is not a valid RDC mobile number.
 */
export function normalizeDrcPhone(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00243')) d = d.slice(5);
  else if (d.startsWith('243')) d = d.slice(3);
  if (d.length === 10 && d.startsWith('0')) d = d.slice(1);
  return /^[89]\d{8}$/.test(d) ? `243${d}` : null;
}

/** "+243 89 123 4567" from a stored number (243 + 9 digits); other values are returned as is */
export function formatDrcPhone(stored: string): string {
  const m = /^243(\d{2})(\d{3})(\d{4})$/.exec(stored);
  return m ? `+243 ${m[1]} ${m[2]} ${m[3]}` : stored;
}
