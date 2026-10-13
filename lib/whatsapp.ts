import { whatsappFirstMessage } from "@/agents/types";
import { toWhatsApp, isWhatsAppCapable } from "@/lib/phone";

/**
 * WhatsApp helpers. Outreach has shifted from email-first to WhatsApp-first:
 * every lead that carries a *real* Indian mobile gets a `wa.me` deep link and a
 * short, honest first message the human can send in one tap. Email/SMTP stays
 * intact. All number hygiene lives in `@/lib/phone` so nothing here can build a
 * link from a placeholder number.
 */

/** True when a phone number looks like a usable Indian mobile (the usual WhatsApp reach). */
export function isWhatsAppNumber(phone: string | null | undefined): boolean {
  return isWhatsAppCapable(phone);
}

/** Normalise an Indian phone into international E.164 digit form, e.g. 919876543210. */
export function normalizePhone(phone: string | null | undefined): string | null {
  return toWhatsApp(phone);
}

/** Click-to-chat link: https://wa.me/91987... — no API needed. */
export function waLink(phone: string | null | undefined): string | null {
  const n = toWhatsApp(phone);
  return n ? `https://wa.me/${n}` : null;
}

/** Prefill a WhatsApp message (URL-encoded, so it can plug straight into wa.me). */
export function waText(phone: string | null | undefined, inst: { name: string; category?: string | null; city?: string | null; state?: string | null }): string {
  const link = waLink(phone);
  const text = whatsappFirstMessage(inst);
  return link ? `${link}?text=${encodeURIComponent(text)}` : "";
}
