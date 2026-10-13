/**
 * clean-leads.mjs — purge fabricated contact data from the lead database.
 *
 * OpenStreetMap (and a couple of directories) supplied placeholder switchboard
 * numbers. "9999999776" was attached to 1,291 different schools, plus
 * "9999999999" and "916666666666". They are not real contacts: a wa.me link
 * built from one opens a chat with nobody, and it made the dashboard look far
 * healthier than it was.
 *
 * This script clears every placeholder/normalises every real phone, recomputes
 * the WhatsApp flag, and removes consumer/platform domains that were never
 * proven to belong to the business. It is idempotent — run it as often as you
 * like.
 *
 *   node scripts/clean-leads.mjs            # clean the DB
 *   node scripts/clean-leads.mjs --dry-run  # report only, change nothing
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = new DatabaseSync(path.join(root, "data", "agencyos.db"));
db.exec("PRAGMA busy_timeout = 15000;");

const dryRun = process.argv.includes("--dry-run");

const PLACEHOLDER_EXACT = new Set([
  "9999999776", "9999999999", "9999999998", "9999999997", "9999999996",
  "9999999995", "9999999991", "9999999990", "9000000000", "9876543210",
  "1234567890", "1234567891", "0123456789", "1111111111", "2222222222",
  "3333333333", "4444444444", "5555555555", "6666666666", "7777777777",
  "8888888888", "0000000000", "916666666666", "919999999999", "911234567890",
]);

const digitsOnly = (raw) => String(raw ?? "").replace(/\D/g, "");

function isPlaceholderPhone(raw) {
  const d = digitsOnly(raw);
  if (d.length < 10) return true;
  if (PLACEHOLDER_EXACT.has(d)) return true;
  if (/(\d)\1{6,}/.test(d)) return true;
  if (/^(\d)\1+$/.test(d)) return true;
  if (d.length >= 8 && new Set(d).size <= 2) return true;
  if (/0?1234567890?/.test(d)) return true;
  if (/0?9876543210?/.test(d)) return true;
  return false;
}

function cleanPhone(raw) {
  let d = digitsOnly(raw);
  if (isPlaceholderPhone(d)) return null;
  if (d.length === 13 && d.startsWith("091")) d = d.slice(1);
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 11 && d.startsWith("91")) d = d.slice(2);
  if (d.length !== 10) return null;
  if (!/^[1-9]/.test(d)) return null;
  return d;
}

const isWhatsAppCapable = (raw) => {
  const local = cleanPhone(raw);
  return !!local && /^[6-9]/.test(local);
};

/* Consumer/platform domains that are never a local business's own site. */
const JUNK_DOMAINS = [
  "google", "gstatic", "youtube", "facebook", "instagram", "whatsapp", "twitter",
  "linkedin", "pinterest", "tiktok", "wikipedia", "wikimedia", "reddit", "quora",
  "amazon", "flipkart", "myntra", "ajio", "meesho", "snapdeal", "netflix",
  "starsunfolded", "united", "st", "medium", "wordpress", "blogspot", "wix",
  "justdial", "sulekha", "indiamart", "zomato", "swiggy", "bookmyshow",
  "apple", "microsoft", "adobe", "canva", "play", "poki", "vedantu",
];

function registrableDomain(url) {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2) return parts.join(".");
    const two = parts.slice(-2).join(".");
    if (/^(co|ac|edu|gov|net|org|firm|ind|gen|sch|nic)\.[a-z]{2}$/i.test(two)) return parts.slice(-3).join(".");
    return two;
  } catch {
    return null;
  }
}

const isJunkDomain = (domain) => {
  if (!domain) return false;
  const sld = domain.split(".").slice(-2).join(".");
  return JUNK_DOMAINS.some((d) => sld === d || sld.startsWith(d + ".") || domain === d);
};

/* ---------------------------------------------------------------- phones -- */
const phoneRows = db
  .prepare("SELECT id, name, phone, whatsapp_available FROM institutions WHERE phone IS NOT NULL AND phone <> ''")
  .all();

let cleared = 0;
let normalised = 0;
for (const r of phoneRows) {
  const cleaned = cleanPhone(r.phone);
  if (!cleaned) cleared++;
  else if (cleaned !== r.phone || (isWhatsAppCapable(cleaned) ? 1 : 0) !== (r.whatsapp_available ?? 0)) normalised++;
}

const total = db.prepare("SELECT COUNT(*) n FROM institutions").get().n;
const withPhoneBefore = phoneRows.length;

/* -------------------------------------------------------------- websites -- */
const siteRows = db
  .prepare("SELECT id, name, website FROM institutions WHERE website IS NOT NULL AND website <> ''")
  .all();
const badSites = siteRows.filter((r) => isJunkDomain(registrableDomain(r.website)));

/* ----------------------------------------------------------- replies -- */
// The old engine fabricated "replies" so the reply stage never appeared empty.
// Those threads (kind='reply') and their office-feed events are fake history
// and are removed too; real mailbox feedback (bounce / error / out_of_office)
// and any genuinely-arrived replies are untouched.
const fakeReplies = db.prepare("SELECT COUNT(*) n FROM inbox_threads WHERE kind = 'reply'").get().n;
const fakeReplyEvents = db.prepare("SELECT COUNT(*) n FROM office_events WHERE kind = 'reply'").get().n;

console.log("=== clean-leads report ===");
console.log(`lead rows .............. ${total}`);
console.log(`rows with a phone ...... ${withPhoneBefore}`);
console.log(`placeholder phones ..... ${cleared}  (will be cleared)`);
console.log(`phones to normalise .... ${normalised}`);
console.log(`junk websites .......... ${badSites.length}  (will be cleared)`);
console.log(`fabricated replies ..... ${fakeReplies} threads + ${fakeReplyEvents} events  (will be removed)`);
if (cleared) {
  const sample = db
    .prepare("SELECT phone, COUNT(*) n FROM institutions WHERE phone IS NOT NULL AND phone <> '' GROUP BY phone ORDER BY n DESC LIMIT 8")
    .all();
  console.log("top repeated phones:");
  for (const s of sample) if (isPlaceholderPhone(s.phone)) console.log(`   ${s.phone} × ${s.n}`);
}
console.log(`real numbers remaining . ${withPhoneBefore - cleared}`);

if (dryRun) {
  console.log("\n(dry run — nothing written)");
  process.exit(0);
}

db.exec("BEGIN");
const clearStmt = db.prepare("UPDATE institutions SET phone = NULL, whatsapp_available = 0 WHERE id = ?");
const fixStmt = db.prepare("UPDATE institutions SET phone = ?, whatsapp_available = ? WHERE id = ?");
for (const r of phoneRows) {
  const cleaned = cleanPhone(r.phone);
  if (!cleaned) clearStmt.run(r.id);
  else fixStmt.run(cleaned, isWhatsAppCapable(cleaned) ? 1 : 0, r.id);
}
const siteStmt = db.prepare("UPDATE institutions SET website = NULL, site_verified = 0, site_match_reason = ? WHERE id = ?");
for (const r of badSites) {
  siteStmt.run("cleaned — consumer/platform domain, never provable as this business's site", r.id);
}
db.prepare("DELETE FROM inbox_threads WHERE kind = 'reply'").run();
db.prepare("DELETE FROM office_events WHERE kind = 'reply'").run();
db.exec("COMMIT");

const after = db
  .prepare("SELECT COUNT(*) n FROM institutions WHERE phone IS NOT NULL AND phone <> ''")
  .get().n;
console.log(
  `\ndone. phones remaining: ${after} · placeholder phones purged: ${cleared} · ` +
  `junk sites purged: ${badSites.length} · fake replies/purge-history removed`
);
