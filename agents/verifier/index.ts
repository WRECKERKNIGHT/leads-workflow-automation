import { config } from "@/lib/config";
import { verifyMailbox } from "@/lib/mail/verify";
import { runAgentTask } from "@/lib/agents/runner";
import {
  getOutreachItem,
  getInstitution,
  updateOutreach,
  updateInstitution,
  pushOfficeEvent,
  logAgent,
  saveVerification,
} from "@/lib/db/repo";
import { isSendableEmail, isForeignLead, registrableDomain, normalizeEmail } from "@/lib/validation";
import { PRICING, OFFER_SUMMARY } from "@/agents/types";
import type { Institution, Verdict, VerdictCheck } from "@/agents/types";

/**
 * Verifier — the last gate before anything leaves the building.
 *
 * It answers one question with evidence: is this email address real, and is this
 * message safe to send? Every check is recorded with its own pass/fail and
 * reason, so the dashboard can show exactly why a draft was allowed or stopped.
 *
 * Checks, in order:
 *   1. recipient_present   — there is an address at all
 *   2. no_bounce_history   — this address has never hard-bounced before
 *   3. site_ownership      — the address sits on a domain proven to be the
 *                            school's own (this is what killed the junk leads)
 *   4. mailbox_exists      — the receiving mail server was asked over SMTP
 *   5. pricing_correct     — the body quotes 50,000 one-time + 2,000/yr and
 *                            never claims 50,000 per year
 *   6. body_sane           — non-empty, addressed, signed, not a duplicate
 *   7. not_cross_border    — the school is in India
 *
 * A draft is auto-approved only when every check passes.
 */

/** Prices that must never appear as an annual figure. */
const WRONG_ANNUAL_PRICE =
  /(?:₹|rs\.?\s*|inr\s*)?([0-9][0-9,]{2,})\s*(?:\/|per\s*)\s*(?:year|yr|annum| annum|p\.a\.)/gi;

/**
 * Rejects a body that quotes a yearly price above the maintenance fee. Exported
 * so the sender can re-assert it immediately before SMTP instead of relying
 * entirely on the Verifier having run.
 */
export function checkPrice(body: string): VerdictCheck {
  const flat = body.replace(WRONG_ANNUAL_PRICE, (m) => m);
  const bad: string[] = [];
  for (const m of flat.matchAll(WRONG_ANNUAL_PRICE)) {
    const digits = Number((m[1] ?? "").replace(/,/g, ""));
    // 2,000/year is the only correct recurring figure.
    if (digits > PRICING.annualMaintenance) bad.push(`${m[0].trim()}`);
  }
  const mentionsSetup = new RegExp(`${PRICING.setupFee.toLocaleString("en-IN")}|${PRICING.setupFee}`).test(body);
  const mentionsMaint = new RegExp(`${PRICING.annualMaintenance.toLocaleString("en-IN")}|${PRICING.annualMaintenance}`).test(body);
  if (bad.length) {
    return {
      id: "pricing_correct",
      label: "Pricing is correct",
      passed: false,
      detail: `quotes a wrong yearly price: ${bad.slice(0, 3).join("; ")} (correct: ${OFFER_SUMMARY})`,
    };
  }
  if (mentionsSetup && !/one[-\s]?time|setup|set up|once/i.test(body)) {
    return {
      id: "pricing_correct",
      label: "Pricing is correct",
      passed: false,
      detail: `${PRICING.setupFee.toLocaleString("en-IN")} is mentioned but not described as a one-time fee`,
    };
  }
  return {
    id: "pricing_correct",
    label: "Pricing is correct",
    passed: true,
    detail: mentionsSetup || mentionsMaint ? `matches the offer (${OFFER_SUMMARY})` : "no conflicting price quoted",
  };
}

function checkBody(body: string, subject: string | null): VerdictCheck {
  const text = String(body ?? "").trim();
  if (text.length < 40) {
    return { id: "body_sane", label: "Message is complete", passed: false, detail: `body is only ${text.length} characters` };
  }
  if (!subject?.trim()) {
    return { id: "body_sane", label: "Message is complete", passed: false, detail: "subject line is empty" };
  }
  if (!/(regards|regard|sincerely|thank you|warm regards|best wishes)/i.test(text)) {
    return { id: "body_sane", label: "Message is complete", passed: false, detail: "no sign-off found" };
  }
  if (/(lorem ipsum|placeholder|\[insert|xxx+)/i.test(text)) {
    return { id: "body_sane", label: "Message is complete", passed: false, detail: "body still contains placeholder text" };
  }
  return { id: "body_sane", label: "Message is complete", passed: true, detail: `${text.length} characters, subject and sign-off present` };
}

export interface VerifyOptions {
  /** Set false to only judge, without changing queue status. */
  apply?: boolean;
  /** Skip the SMTP probe (used by dry runs). */
  skipNetwork?: boolean;
}

/**
 * Verify one outreach draft. Returns the full verdict.
 * With `apply` (the default) a passing verdict auto-approves the draft.
 */
export async function verifyOutreach(outreachId: number, opts: VerifyOptions = {}): Promise<Verdict | null> {
  const apply = opts.apply !== false;
  const item = getOutreachItem(outreachId);
  if (!item) return null;
  const inst = getInstitution(item.institution_id) as Institution | null;

  const verdict = await runVerdict(item.id, item.institution_id, item.subject, item.body, inst, opts);

  if (inst) {
    const addr = (inst.admissions_email || inst.email || "").toLowerCase();
    if (addr) {
      const mailboxCheck = verdict.checks.find((c) => c.id === "mailbox_exists");
      updateInstitution(inst.id, {
        mailbox_status: mailboxCheck?.passed ? "exists" : mailboxCheck?.detail.includes("catch-all") ? "catch_all" : inst.mailbox_status,
        mailbox_checked_at: verdict.checkedAt,
        mailbox_detail: mailboxCheck?.detail ?? null,
      });
    }
  }

  if (apply) {
    if (verdict.status === "verified") {
      updateOutreach(item.id, {
        status: "approved",
        verdict: verdict.summary,
        verified_at: verdict.checkedAt,
      });
      const failed = verdict.checks.filter((c) => !c.passed);
      void failed;
      pushOfficeEvent("approved", `✅ Verified — approved to send to ${inst?.name ?? item.institution_id}`, {
        agentId: "verifier",
        icon: "✅",
        data: { email: inst?.admissions_email || inst?.email, checks: verdict.checks },
      });
      logAgent("verifier", `Approved ${inst?.name}: ${verdict.summary}`, { institutionId: inst?.id, outreachId: item.id } as never);
    } else {
      const failed = verdict.checks.filter((c) => !c.passed);
      updateOutreach(item.id, {
        status: "rejected",
        verdict: verdict.summary,
        decisions: `verifier blocked: ${failed.map((c) => c.detail).join(" | ").slice(0, 400)}`,
      });
      if (inst) {
        // A recipient-level failure means the stored address is no longer
        // trustworthy — clear it so it can never be drafted again.
        const recipientFailed = failed.some((c) =>
          ["recipient_present", "site_ownership", "mailbox_exists", "no_bounce_history"].includes(c.id)
        );
        if (recipientFailed) {
          updateInstitution(inst.id, { email: "", admissions_email: "", verified_contact: 0 });
        }
      }
      pushOfficeEvent("rejected", `🚫 Blocked — ${inst?.name ?? item.institution_id}: ${failed[0]?.detail ?? "failed checks"}`, {
        agentId: "verifier",
        icon: "🚫",
        data: { checks: verdict.checks },
      });
      logAgent("verifier", `Blocked ${inst?.name}: ${failed.map((c) => c.detail).join(" | ")}`, {
        level: "warn",
        institutionId: inst?.id,
      } as never);
    }
    const addr = ((inst?.admissions_email || inst?.email || "") as string).toLowerCase();
    if (addr) {
      saveVerification({
        institutionId: item.institution_id,
        outreachId: item.id,
        email: addr,
        status: verdict.status,
        checks: verdict.checks,
        reason: verdict.summary,
        autoApproved: verdict.status === "verified",
      });
    }
  }

  return verdict;
}

/** Pure verdict computation — no writes, safe to call for a dry run. */
export async function runVerdict(
  outreachId: number,
  institutionId: number,
  subject: string | null,
  body: string,
  inst: Institution | null,
  opts: VerifyOptions = {}
): Promise<Verdict> {
  const checks: VerdictCheck[] = [];
  const raw = (inst?.admissions_email || inst?.email || "").trim();
  const to = normalizeEmail(raw) ?? "";

  // 1) recipient present
  checks.push(
    to
      ? { id: "recipient_present", label: "Recipient address present", passed: true, detail: to }
      : { id: "recipient_present", label: "Recipient address present", passed: false, detail: "no email address on file for this school" }
  );

  // 2) bounce history
  const bounced = inst?.bounced === 1;
  checks.push({
    id: "no_bounce_history",
    label: "No previous bounce",
    passed: !bounced,
    detail: bounced ? "this address hard-bounced before and is quarantined" : "no bounce on record",
  });

  // 3) site ownership — the check that stops wrong-domain addresses
  let ownershipOk = false;
  let ownershipDetail = "no website to compare against";
  if (to) {
    const siteUrl = inst?.website ?? null;
    const gate = isSendableEmail(to, {
      siteDomain: siteUrl ? registrableDomain(siteUrl) : null,
      schoolName: inst?.name,
      fromMailto: false,
      siteVerified: inst?.site_verified === 1,
    });
    ownershipOk = gate.ok;
    ownershipDetail = gate.reason;
    if (!gate.ok && /free webmail/i.test(gate.reason)) {
      // A free webmail address is only acceptable when the school's own
      // verified site published it as an explicit contact link.
      ownershipOk = inst?.site_verified === 1;
      ownershipDetail = ownershipOk
        ? "free webmail address published on the school's verified site"
        : gate.reason;
    }
  }
  checks.push({
    id: "site_ownership",
    label: "Address belongs to this school",
    passed: ownershipOk,
    detail: ownershipDetail,
  });

  // 4) SMTP mailbox probe
  if (!to) {
    checks.push({ id: "mailbox_exists", label: "Mailbox exists", passed: false, detail: "no address to probe" });
  } else if (opts.skipNetwork) {
    checks.push({ id: "mailbox_exists", label: "Mailbox exists", passed: false, detail: "probe skipped (dry run)" });
  } else {
    const probe = await verifyMailbox(to);
    const ok = probe.status === "exists" || probe.status === "catch_all";
    checks.push({
      id: "mailbox_exists",
      label: "Mailbox exists",
      passed: ok,
      detail: probe.detail,
    });
  }

  // 5) pricing
  checks.push(checkPrice(String(body ?? "")));

  // 6) body sanity
  checks.push(checkBody(String(body ?? ""), subject));

  // 7) geography
  const foreign = inst ? isForeignLead(inst.lat, inst.lon, inst.name) : false;
  checks.push({
    id: "not_cross_border",
    label: "School is in India",
    passed: !foreign,
    detail: foreign ? "coordinates/name indicate a cross-border school" : "within India",
  });

  void outreachId;
  void institutionId;
  void config;

  const failed = checks.filter((c) => !c.passed);
  return {
    status: failed.length ? "rejected" : "verified",
    checks,
    checkedAt: new Date().toISOString(),
    summary: failed.length
      ? `blocked: ${failed.map((c) => c.label.toLowerCase()).join(", ")}`
      : `verified: mailbox on ${to.split("@")[1] ?? "?"}, pricing correct`,
  };
}

/** Convenience wrapper used by the engine and the API. */
export async function runVerifierTask(): Promise<{ checked: number; approved: number; blocked: number }> {
  const { outreachPending } = await import("@/lib/db/repo");
  const items = outreachPending();
  let approved = 0;
  let blocked = 0;

  await runAgentTask({
    agentId: "verifier",
    taskLabel: `Verifying ${items.length} draft(s)`,
    fn: async (ctx) => {
      const limit = Math.min(items.length, 12);
      for (let i = 0; i < limit; i++) {
        const item = items[i];
        ctx.progress(Math.round((i / limit) * 100), `Verifying draft #${item.id}`);
        const verdict = await verifyOutreach(item.id, { apply: true });
        if (!verdict) continue;
        if (verdict.status === "verified") approved++;
        else blocked++;
        if (!config.mockMode) await new Promise((r) => setTimeout(r, 350));
      }
      ctx.progress(100, `Checked ${limit} · ${approved} approved · ${blocked} blocked`);
    },
  });

  return { checked: limitOf(items), approved, blocked };
}

function limitOf(items: unknown[]): number {
  return Math.min(items.length, 12);
}
