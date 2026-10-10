import dns from "node:dns/promises";
import net from "node:net";
import type { MailboxStatus } from "@/agents/types";

/**
 * Mailbox verification over SMTP.
 *
 * An address scraped off a website can look perfect and still not exist — that
 * is what fills an inbox with "address not found" tickets. The only reliable
 * test is to ask the receiving mail server, using SMTP RCPT TO.
 *
 * This NEVER sends DATA. The session is abandoned right after the server
 * answers RCPT TO, so no message is ever transmitted or delivered.
 */

const PROBE_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface ProbeResult {
  status: MailboxStatus;
  code: number | null;
  detail: string;
}

const domainMxCache = new Map<string, { at: number; hosts: string[] }>();
/** Random address -> result, used to detect catch-all domains. */
const catchAllCache = new Map<string, { at: number; catchAll: boolean }>();
const mailboxCache = new Map<string, { at: number; result: ProbeResult }>();

/** Resolve MX hosts for a domain, falling back to the domain itself (A record). */
export async function resolveMx(domain: string): Promise<string[]> {
  const cached = domainMxCache.get(domain);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.hosts;

  let hosts: string[] = [];
  try {
    const recs = await dns.resolveMx(domain);
    if (recs?.length) hosts = recs.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
  } catch {
    /* no MX — try A record below */
  }
  if (!hosts.length) {
    try {
      await dns.resolve4(domain);
      hosts = [domain];
    } catch {
      hosts = [];
    }
  }
  domainMxCache.set(domain, { at: Date.now(), hosts });
  return hosts;
}

/**
 * Ask one mail server whether it would accept mail for `address`.
 * Resolves with the SMTP reply code; never transmits message content.
 */
export function rcptProbe(host: string, address: string, heloName: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: 25 });
    let stage: "connect" | "helo" | "mail" | "rcpt" = "connect";
    let buf = "";
    let done = false;

    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* already gone */
      }
      resolve(r);
    };
    const timer = setTimeout(() => finish({ status: "unverified", code: null, detail: "SMTP probe timed out" }), timeoutMs);

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const code = Number(raw.slice(0, 3));
        const text = raw.slice(4).trim();
        if (Number.isNaN(code)) continue;

        if (stage === "connect") {
          if (code === 220) {
            stage = "helo";
            socket.write(`HELO ${heloName}\r\n`);
          } else if (code >= 400) {
            finish({ status: "unverified", code, detail: `greeting refused: ${text}` });
          }
        } else if (stage === "helo" && code === 250) {
          stage = "mail";
          socket.write("MAIL FROM:<verify@wreckerai.in>\r\n");
        } else if (stage === "mail" && code === 250) {
          stage = "rcpt";
          socket.write(`RCPT TO:<${address}>\r\n`);
        } else if (stage === "rcpt") {
          if (code === 250 || code === 251) {
            finish({ status: "exists", code, detail: `mail server accepted the recipient (${code})` });
          } else if (code === 550 || code === 551 || code === 552 || code === 553 || code === 554) {
            finish({ status: "rejected", code, detail: `mail server rejected the recipient: ${text}` });
          } else if (code === 421 || code === 450 || code === 451 || code === 452) {
            finish({ status: "unverified", code, detail: `mail server deferred: ${text}` });
          } else if (code >= 400) {
            finish({ status: "unverified", code, detail: `unexpected reply ${code}: ${text}` });
          }
        }
      }
    });
    socket.on("error", (e) => finish({ status: "unverified", code: null, detail: `connection failed: ${e.message}` }));
  });
}

/**
 * Does this domain accept a made-up address? Google Workspace and most
 * hosted mail are catch-all, which means an "accepted" probe proves nothing.
 */
export async function detectCatchAll(domain: string, heloName: string): Promise<boolean> {
  const cached = catchAllCache.get(domain);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.catchAll;

  const hosts = await resolveMx(domain);
  if (!hosts.length) {
    catchAllCache.set(domain, { at: Date.now(), catchAll: false });
    return false;
  }
  const probeAddress = `zz-nonexistent-${Math.random().toString(36).slice(2, 12)}@${domain}`;
  const r = await rcptProbe(hosts[0], probeAddress, heloName, 10_000);
  // A random address being accepted means the domain is catch-all.
  const catchAll = r.status === "exists";
  catchAllCache.set(domain, { at: Date.now(), catchAll });
  return catchAll;
}

/**
 * Full verification for one address: MX lookup, catch-all detection, then a
 * real RCPT probe. Results are cached for a week so a re-run is cheap.
 */
export async function verifyMailbox(
  email: string,
  opts: { heloName?: string; force?: boolean } = {}
): Promise<ProbeResult> {
  const address = String(email ?? "").trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  const heloName = opts.heloName ?? "verifier.wreckerai.in";

  if (!address.includes("@") || !domain) {
    return { status: "rejected", code: null, detail: "not a valid address" };
  }

  const cached = mailboxCache.get(address);
  if (!opts.force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const hosts = await resolveMx(domain);
  if (!hosts.length) {
    const result: ProbeResult = {
      status: "no_mx",
      code: null,
      detail: `${domain} has no MX or A record — it cannot receive email`,
    };
    mailboxCache.set(address, { at: Date.now(), result });
    return result;
  }

  // Probe the real address first — an explicit rejection is conclusive and
  // saves us from the extra catch-all round trip.
  const direct = await rcptProbe(hosts[0], address, heloName);
  if (direct.status === "rejected" || direct.status === "no_mx") {
    mailboxCache.set(address, { at: Date.now(), result: direct });
    return direct;
  }
  if (direct.status === "exists") {
    const catchAll = await detectCatchAll(domain, heloName);
    const result: ProbeResult = catchAll
      ? { status: "catch_all", code: direct.code, detail: `${domain} is catch-all — accepts any address, so this is unproven` }
      : direct;
    mailboxCache.set(address, { at: Date.now(), result });
    return result;
  }

  // Unverified on the primary host — try the next MX before giving up.
  for (const alt of hosts.slice(1, 3)) {
    const r = await rcptProbe(alt, address, heloName, 10_000);
    if (r.status !== "unverified") {
      mailboxCache.set(address, { at: Date.now(), result: r });
      return r;
    }
  }
  mailboxCache.set(address, { at: Date.now(), result: direct });
  return direct;
}

/** Test hook / cache inspection used by the dashboard's verifier panel. */
export function verifierCacheStats() {
  return {
    mailboxes: mailboxCache.size,
    domains: domainMxCache.size,
    catchAllDomains: catchAllCache.size,
  };
}
