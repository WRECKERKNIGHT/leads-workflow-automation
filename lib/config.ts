import { getAllSettings, getActiveCategory } from "@/lib/db/repo";
import { CATEGORY_VALUES } from "@/agents/types";

export const config = {
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openrouterModel: process.env.OPENROUTER_MODEL ?? "minimax/minimax-m3:free",
  overpassUrl: process.env.OVERPASS_API_URL ?? "https://overpass-api.de/api/interpreter",
  nominatimUrl: process.env.NOMINATIM_API_URL ?? "https://nominatim.openstreetmap.org/search",
  // Places API (New) is the only discovery source that returns a business's own
  // website field; every free search route is bot-blocked. Unset = disabled.
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  mockMode: process.env.MOCK_MODE === "true",
  leadDelayMs: Number(process.env.LEAD_DELAY_MS ?? "150"),
  scrapeDelayMs: Number(process.env.SCRAPE_DELAY_MS ?? "900"),
  agentConcurrency: Number(process.env.AGENT_CONCURRENCY ?? "4"),
  outreachRequireApproval: process.env.OUTREACH_REQUIRE_APPROVAL !== "false",
  /**
   * Fully automatic outreach: the Verifier agent judges each draft and, when
   * every check passes, approves it and lets the sender deliver it — no human
   * click. Set AUTO_APPROVE=false to require a manual approval instead.
   */
  autoApprove: process.env.AUTO_APPROVE !== "false",
  autonomous: process.env.AUTONOMOUS_MODE !== "false",
  autoMissionIntervalMs: Number(process.env.AUTO_MISSION_INTERVAL_MS ?? "90000"),
  pipelineIntervalMs: Number(process.env.PIPELINE_INTERVAL_MS ?? "8000"),
  simulateReplies: process.env.SIMULATE_REPLIES === "true",
  replyDelayMs: Number(process.env.REPLY_DELAY_MS ?? "30000"),

  // All-India discovery: states to cycle through. Leave empty for nationwide bbox sweep.
  autoStates: (process.env.AUTO_STATES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  discoveryPerMission: Number(process.env.DISCOVERY_PER_MISSION ?? "40"),
  // Fallback pool — the ACTIVE single category comes from the dashboard setting.
  discoveryCategories: (process.env.DISCOVERY_CATEGORIES ?? CATEGORY_VALUES.join(","))
    .split(",").map((s) => s.trim()).filter(Boolean),

  // Real email sending via SMTP (nodemailer). Leave empty to stay in draft mode.
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? "587"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? "",
  smtpFromName: process.env.SMTP_FROM_NAME ?? "WreckerAI",

  // IMAP inbox monitoring (same Gmail credentials as SMTP). Reads replies,
  // bounces and errors. Set MAIL_ENABLED=false to disable.
  mailEnabled: process.env.MAIL_ENABLED !== "false",
  mailPollIntervalMs: Number(process.env.MAIL_POLL_INTERVAL_MS ?? "120000"),
  mailHost: process.env.MAIL_HOST ?? "",
  mailPort: Number(process.env.MAIL_PORT ?? "993"),
  mailUser: process.env.MAIL_USER ?? "",
  mailPass: process.env.MAIL_PASS ?? "",

  // WreckerAI sender profile — used by the message writer.
  senderRole: process.env.SENDER_ROLE ?? "a student developer building affordable digital solutions for educational institutions",
  senderName: process.env.SENDER_NAME ?? "WreckerAI",
  demoBaseUrl: process.env.DEMO_BASE_URL ?? "https://wreckerks.github.io/school-app-prototype/",
};

export function smtpConfigured(): boolean {
  const s = runtimeSmtp();
  return Boolean(s.host && s.user && s.pass && s.fromEmail);
}

/**
 * The single category that may run right now: whatever the human last picked on
 * the dashboard, falling back to the first configured / default category.
 */
export function resolveActiveCategory(): string {
  return getActiveCategory() ?? config.discoveryCategories[0] ?? CATEGORY_VALUES[0];
}

/** IMAP monitoring configuration — reuses the SMTP/DB-override credentials. */
export function runtimeMail(): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
} {
  const s = runtimeSmtp();
  let overrides: Record<string, string> = {};
  try {
    overrides = getAllSettings();
  } catch {
    overrides = {};
  }
  const pick = (k: string, fallback: string) => overrides[k] ?? fallback;
  const smtpHost = s.host.toLowerCase();
  const host =
    pick("mail.host", config.mailHost) || (smtpHost.includes("gmail.com") ? "imap.gmail.com" : smtpHost) || "imap.gmail.com";
  const port = Number(pick("mail.port", String(config.mailPort)));
  return {
    host,
    port,
    secure: port === 993 || port === 465,
    user: pick("mail.user", s.user),
    pass: pick("mail.pass", s.pass),
  };
}

export function mailConfigured(): boolean {
  if (!config.mailEnabled) return false;
  const m = runtimeMail();
  return Boolean(m.host && m.user && m.pass);
}

/** SMTP resolved at runtime: DB overrides take priority over env vars. */
export function runtimeSmtp(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
} {
  let overrides: Record<string, string> = {};
  try {
    overrides = getAllSettings();
  } catch {
    overrides = {};
  }
  const pick = (k: string, fallback: string) => overrides[k] ?? fallback;
  return {
    host: pick("smtp.host", config.smtpHost),
    port: Number(pick("smtp.port", String(config.smtpPort))),
    user: pick("smtp.user", config.smtpUser),
    pass: pick("smtp.pass", config.smtpPass),
    fromEmail: pick("smtp.fromEmail", config.smtpFromEmail),
    fromName: pick("smtp.fromName", config.smtpFromName),
  };
}