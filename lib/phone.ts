/**
 * Phone-number hygiene.
 *
 * OpenStreetMap carries a lot of placeholder switchboard numbers. The string
 * "9999999776" alone was attached to 1,291 different schools in this database,
 * which made the dashboard look stocked with thousands of WhatsApp numbers when
 * it had almost none. "916666666666", "9999999999" and "1234567890" are the same
 * kind of junk — somebody typed a dummy when mapping a business.
 *
 * Nothing writes a phone to the database without passing through `cleanPhone`,
 * and every "is this WhatsApp-ready?" decision goes through `toWhatsApp`. A lead
 * with no real number shows a dash instead of a lie.
 */

/** Exact placeholder numbers that appear verbatim in public datasets. */
const PLACEHOLDER_EXACT = new Set([
  "9999999776", "9999999999", "9999999998", "9999999997", "9999999996",
  "9999999995", "9999999991", "9999999990", "9000000000", "9876543210",
  "1234567890", "1234567891", "0123456789", "1111111111", "2222222222",
  "3333333333", "4444444444", "5555555555", "6666666666", "7777777777",
  "8888888888", "0000000000", "916666666666", "919999999999", "911234567890",
]);

export function digitsOnly(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/**
 * True when a raw phone is placeholder junk: a documented placeholder, one
 * digit repeated into a long run, or a near-flat number with almost no entropy.
 */
export function isPlaceholderPhone(raw: unknown): boolean {
  const d = digitsOnly(raw);
  if (d.length < 10) return true; // too short to be a complete Indian number
  if (PLACEHOLDER_EXACT.has(d)) return true;
  if (/(\d)\1{6,}/.test(d)) return true; // seven-or-more of one digit in a row
  if (/^(\d)\1+$/.test(d)) return true; // the entire number is one digit
  if (d.length >= 8 && new Set(d).size <= 2) return true; // almost no entropy
  if (/0?1234567890?/.test(d)) return true; // ascending run
  if (/0?9876543210?/.test(d)) return true; // descending run
  return false;
}

/**
 * Normalise a raw phone to a bare 10-digit Indian number, or null when it is
 * junk / unusable. Strips country code (+91 / 91 / 0) and punctuation.
 */
export function cleanPhone(raw: unknown): string | null {
  let d = digitsOnly(raw);
  if (isPlaceholderPhone(d)) return null;
  if (d.length === 13 && d.startsWith("091")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 11 && d.startsWith("91")) d = d.slice(2);
  if (d.length !== 10) return null;
  if (!/^[1-9]/.test(d)) return null; // a phone number cannot start with 0
  return d;
}

/**
 * E.164 digits ("91XXXXXXXXXX") for a number that can actually receive a
 * WhatsApp message — an Indian mobile, which starts 6-9.
 */
export function toWhatsApp(raw: unknown): string | null {
  const local = cleanPhone(raw);
  if (!local || !/^[6-9]/.test(local)) return null;
  return `91${local}`;
}

export function isWhatsAppCapable(raw: unknown): boolean {
  return toWhatsApp(raw) !== null;
}

/** A short, honest label for display, e.g. "+91 98765 43210". */
export function formatPhone(raw: unknown): string | null {
  const local = cleanPhone(raw);
  if (!local) return null;
  return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
}
