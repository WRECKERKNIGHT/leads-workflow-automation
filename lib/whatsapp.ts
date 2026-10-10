import { whatsappFirstMessage } from "@/agents/types";

/**
 * WhatsApp helpers. Outreach has shifted from email-first to WhatsApp-first:
 * every lead that carries a phone number gets a `wa.me` deep link and a short,
 * honest first message the human can send in one tap. Email/SMTP stays intact.
 */

/** True when a phone number looks like a usable Indian mobile (the usual WhatsApp reach). */
export function isWhatsAppNumber(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  const local = digits.replace(/^91/, "");
  return /^[6-9]\d{9}$/.test(local);
}

/** Normalise an Indian phone into international E.164 digit form, e.g. 919876543210. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = "91" + digits;
  if (digits.length === 11 && digits.startsWith("0")) digits = "91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = "91" + digits.slice(2);
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return null;
}

/** Click-to-chat link: https://wa.me/91987... — Canada-friendly, no API needed. */
export function waLink(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}` : null;
}

/** Prefill a WhatsApp message (URL-encoded, so it can plug straight into wa.me). */
export function waText(phone: string | null | undefined, inst: { name: string; category?: string | null; city?: string | null; state?: string | null }): string {
  const link = waLink(phone);
  const text = whatsappFirstMessage(inst);
  return link ? `${link}?text=${encodeURIComponent(text)}` : "";
}