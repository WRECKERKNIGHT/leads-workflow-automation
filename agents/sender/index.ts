import { smtpConfigured, runtimeSmtp } from "@/lib/config";
import { getInstitution, getOutreachItem, markSent, updateInstitution, updateOutreach, pushOfficeEvent, logAgent, createInboxThread } from "@/lib/db/repo";
import { isSendableEmail, registrableDomain } from "@/lib/validation";
import { checkPrice } from "@/agents/verifier";

/**
 * Email Sender — sends approved outreach via real SMTP (nodemailer).
 * Requires SMTP_* env vars. If unconfigured, the send is deferred and reported,
 * so you never lose an approval decision.
 */
export async function sendOutreachEmail(outreachId: number): Promise<{ ok: boolean; queued: boolean; error?: string }> {
  const item = getOutreachItem(outreachId);
  if (!item) return { ok: false, queued: false, error: "outreach item not found" };
  const inst = getInstitution(item.institution_id);
  const to = inst?.admissions_email || inst?.email;
  if (!to) {
    updateOutreach(outreachId, { status: "error", decisions: "no recipient email" });
    pushOfficeEvent("error", `⚠ Cannot send: ${inst?.name ?? "?"} has no email`, { agentId: "email_sender", icon: "⚠️" });
    return { ok: false, queued: false, error: "no recipient email found" };
  }

  // HARD GATE — the last line of defence before SMTP. A draft may only leave
  // once the Verifier agent has approved it, and the recipient must still pass
  // the sendability test at the moment of sending (it may have been edited or
  // the institution re-enriched since approval).
  if (item.status !== "approved" && item.status !== "pending_smtp") {
    const reason = `draft is "${item.status}", not approved by the verifier`;
    updateOutreach(outreachId, { status: "rejected", decisions: reason });
    pushOfficeEvent("error", `🚫 Send blocked for ${inst?.name}: ${reason}`, { agentId: "email_sender", icon: "🚫" });
    return { ok: false, queued: false, error: reason };
  }

  const gate = isSendableEmail(to, {
    siteDomain: inst?.website ? registrableDomain(inst.website) : null,
    schoolName: inst?.name,
    siteVerified: inst?.site_verified === 1,
  });
  if (!gate.ok) {
    const reason = `recipient "${to}" rejected: ${gate.reason}`;
    updateOutreach(outreachId, { status: "rejected", decisions: reason });
    updateInstitution(item.institution_id, { email: "", admissions_email: "", verified_contact: 0 });
    pushOfficeEvent("error", `🚫 Blocked send to ${inst?.name}: ${to} — ${gate.reason}`, { agentId: "email_sender", icon: "🚫" });
    logAgent("email_sender", `Blocked send: ${reason} (${inst?.name})`, { institutionId: inst?.id, level: "error" });
    return { ok: false, queued: false, error: reason };
  }

  /**
   * Defence in depth. The Verifier normally checks the pricing, but `status` can
   * also be set by a hand edit, so the commercial terms are re-asserted here
   * immediately before SMTP. Quoting the wrong numbers to a school is the one
   * mistake that cannot be taken back, so the same `checkPrice` the Verifier
   * uses is run again rather than trusting the earlier verdict.
   */
  const priceCheck = checkPrice(item.body ?? "");
  if (!priceCheck.passed) {
    const reason = `pricing check failed before send: ${priceCheck.detail}`;
    updateOutreach(outreachId, { status: "rejected", decisions: reason });
    pushOfficeEvent("error", `🚫 Send blocked for ${inst?.name}: ${priceCheck.detail}`, { agentId: "email_sender", icon: "🚫" });
    logAgent("email_sender", `Blocked send: ${reason} (${inst?.name})`, { institutionId: inst?.id, level: "error" });
    return { ok: false, queued: false, error: reason };
  }

  if (!smtpConfigured()) {
    // Deferred — approval decision preserved, nothing sent.
    updateOutreach(outreachId, { status: "pending_smtp", decisions: "SMTP not configured — ready to send" });
    pushOfficeEvent("warning", `⚠ Email to ${inst?.name} ready but SMTP not configured`, { agentId: "email_sender", icon: "⚠️" });
    logAgent("email_sender", `Deferred send to ${to}: SMTP env vars missing`, { institutionId: inst?.id });
    return { ok: false, queued: true, error: "SMTP not configured" };
  }

  const nodemailer = await import("nodemailer");
  const s = runtimeSmtp();
  const transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${s.fromName}" <${s.fromEmail}>`,
      to,
      subject: item.subject ?? "",
      text: item.body,
    });
    markSent(outreachId, "sent via SMTP by email_sender");
    updateOutreach(outreachId, { sent_message_id: String(info?.messageId ?? ""), attempts: (item.attempts ?? 0) + 1 });
    updateInstitution(item.institution_id, { sent_at: new Date().toISOString(), stage: "sent", folder_status: "in_progress", last_agent: "email_sender" });
    pushOfficeEvent("send", `📤 Email sent to ${inst?.name} (${to})`, { agentId: "email_sender", icon: "📤" });
    logAgent("email_sender", `Sent to ${to} — subject: ${item.subject}`, { institutionId: inst?.id });
    return { ok: true, queued: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateOutreach(outreachId, { status: "error", decisions: msg });
    pushOfficeEvent("error", `🔥 SMTP send failed: ${msg}`, { agentId: "email_sender", icon: "🔥" });
    logAgent("email_sender", `Send error: ${msg}`, { level: "error", institutionId: inst?.id });
    return { ok: false, queued: false, error: msg };
  }
}

/** Store an inbound reply + classify it with the reply manager's LLM. */
export async function receiveInboundReply(institutionId: number, subject: string, fromAddr: string, body: string) {
  const threadId = createInboxThread(institutionId, subject, fromAddr, body, null);
  pushOfficeEvent("reply", `📱 Reply received from ${institutionId}`, {
    agentId: "reply_manager",
    icon: "📱",
    data: { threadId, snippet: body.slice(0, 140) },
  });
  logAgent("reply_manager", `Inbound reply recorded for #${institutionId}`, { institutionId });
  return threadId;
}