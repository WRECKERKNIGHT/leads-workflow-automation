/** Agent ids — a 9-bot workforce across two departments. */
export type AgentId =
  | "lead_finder"
  | "lead_organizer"
  | "research_agent"
  | "opportunity_finder"
  | "demo_builder"
  | "message_writer"
  | "verifier"
  | "email_sender"
  | "reply_manager"
  | "mail_monitor";

/** Where a school folder currently sits in the office. */
export type Stage =
  | "discovery"
  | "organizer"
  | "research"
  | "opportunity"
  | "demo"
  | "message"
  | "sent"
  | "reply"
  | "done";

export type Department = "sales" | "tech";

export type AgentStatus = "working" | "thinking" | "waiting" | "error" | "reviewing" | "needs_human" | "offline";

/** Status of a school folder moving through the office */
export type FolderStatus = "ready" | "in_progress" | "awaiting_approval" | "error" | "needs_human";

/**
 * Category of local business we hunt and pitch — maps to real Overpass/OSM
 * tags. One category runs at a time (the "active category"). Every category is
 * chosen for the same reason: it needs a digital presence, is reachable by
 * phone/WhatsApp, and has no time to build its own website.
 */
export type InstitutionCategory =
  | "School"
  | "Restaurant"
  | "Cafe"
  | "Gym / Fitness"
  | "Salon / Beauty";

export const CATEGORY_VALUES: InstitutionCategory[] = [
  "School",
  "Restaurant",
  "Cafe",
  "Gym / Fitness",
  "Salon / Beauty",
];

export interface InstitutionCategoryOpt {
  value: InstitutionCategory;
  overpassTags: string[];
  /** Short monochrome glyph shown on cards (kept textual so the UI stays strict black/white). */
  glyph: string;
  /** One-line value prop shown under the category name. */
  pitch: string;
  /** What the outreach offers this kind of business in plain language. */
  offer: string;
}

export function categorySlug(category: string): string {
  const s = category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  return s || "school";
}

export function categoryFromSlug(slug: string): InstitutionCategory | null {
  return CATEGORY_CONFIG.find((c) => categorySlug(c.value) === slug)?.value ?? null;
}

/** Which wing of the office each bot lives in. */
export const AGENT_DEPARTMENT: Record<AgentId, Department> = {
  lead_finder: "sales",
  lead_organizer: "sales",
  research_agent: "tech",
  opportunity_finder: "tech",
  demo_builder: "tech",
  message_writer: "sales",
  verifier: "sales",
  email_sender: "sales",
  reply_manager: "sales",
  mail_monitor: "sales",
};

/** Ordered pipeline stages (the rooms in the office) */
export const PIPELINE_STAGES: Stage[] = [
  "discovery",
  "organizer",
  "research",
  "opportunity",
  "demo",
  "message",
  "sent",
  "reply",
  "done",
];

/** The main flow shown on the dashboard before replies. */
export const MAIN_FLOW: Stage[] = ["discovery", "organizer", "research", "opportunity", "demo", "message", "sent", "done"];

export const STAGE_LABELS: Record<Stage, string> = {
  discovery: "School discovered",
  organizer: "Organizing contacts",
  research: "Research",
  opportunity: "Find opportunity",
  demo: "Custom demo",
  message: "Personalized message",
  sent: "Sent",
  reply: "Replies",
  done: "Done",
};

export const STAGE_ICONS: Record<Stage, string> = {
  discovery: "🔔",
  organizer: "🗂️",
  research: "🔍",
  opportunity: "🎯",
  demo: "🎬",
  message: "📧",
  sent: "📤",
  reply: "📱",
  done: "✅",
};

export const AGENT_ORDER: AgentId[] = [
  "lead_finder",
  "lead_organizer",
  "research_agent",
  "opportunity_finder",
  "demo_builder",
  "message_writer",
  "verifier",
  "email_sender",
  "reply_manager",
  "mail_monitor",
];

/** Map stage -> the agent that owns it. "sent"/"done" are terminal-ish. */
export const STAGE_TO_AGENT: Record<Stage, AgentId | null> = {
  discovery: "lead_finder",
  organizer: "lead_organizer",
  research: "research_agent",
  opportunity: "opportunity_finder",
  demo: "demo_builder",
  message: "message_writer",
  sent: "email_sender",
  reply: "reply_manager",
  done: null,
};

export const AGENT_TO_STAGE: Record<AgentId, Stage> = {
  lead_finder: "discovery",
  lead_organizer: "organizer",
  research_agent: "research",
  opportunity_finder: "opportunity",
  demo_builder: "demo",
  message_writer: "message",
  verifier: "message",
  email_sender: "sent",
  reply_manager: "reply",
  mail_monitor: "reply",
};

/** Verdict the Verifier agent reaches before anything is allowed to send. */
export type VerdictStatus = "verified" | "rejected";

export type VerdictCheckId =
  | "recipient_present"
  | "site_ownership"
  | "mailbox_exists"
  | "no_bounce_history"
  | "pricing_correct"
  | "body_sane"
  | "not_cross_border";

export interface VerdictCheck {
  id: VerdictCheckId;
  label: string;
  passed: boolean;
  detail: string;
}

export interface Verdict {
  status: VerdictStatus;
  checks: VerdictCheck[];
  checkedAt: string;
  summary: string;
}

export const CATEGORY_CONFIG: InstitutionCategoryOpt[] = [
  {
    value: "School",
    overpassTags: ["amenity=school"],
    glyph: "S",
    pitch: "Schools still run on paper notices and lost WhatsApp groups.",
    offer: "a simple website, admission form, fee reminder and parent updates",
  },
  {
    value: "Restaurant",
    overpassTags: ["amenity=restaurant", "amenity=fast_food"],
    glyph: "R",
    pitch: "Restaurants lose online orders to aggregators that eat 30%.",
    offer: "a clean digital menu, table booking and direct-order website",
  },
  {
    value: "Cafe",
    overpassTags: ["amenity=cafe"],
    glyph: "C",
    pitch: "Cafes rely on Instagram DMs when they could take orders directly.",
    offer: "a menu site, loyalty page and WhatsApp ordering",
  },
  {
    value: "Gym / Fitness",
    overpassTags: ["leisure=fitness_centre", "leisure=sports_centre"],
    glyph: "G",
    pitch: "Gyms still sign up members on paper registers and lose renewals.",
    offer: "a membership site, plans page and automated renewal reminders",
  },
  {
    value: "Salon / Beauty",
    overpassTags: ["shop=hairdresser", "shop=beauty"],
    glyph: "B",
    pitch: "Salons take bookings over phone calls because nothing is online.",
    offer: "an online booking page and service-price list",
  },
];

/**
 * The commercial offer. There is ONE price, and it is deliberately simple:
 *
 *   Rs 50,000  one-time — to set up and hand over the complete system
 *   Rs  2,000  per year  — maintenance, hosting, support and updates
 *
 * Rs 50,000 is NOT an annual figure. Anything that used to quote it as
 * "per year" was wrong and is rejected by the verifier agent before send.
 */
export const PRICING = {
  currency: "INR",
  /** One-time fee to get the complete system. */
  setupFee: 50000,
  /** Recurring annual maintenance, charged from year 2 onwards. */
  annualMaintenance: 2000,
} as const;

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** One-line offer summary used in emails, demos and the verifier's price check. */
export const OFFER_SUMMARY =
  `${formatINR(PRICING.setupFee)} one-time setup (complete system) + ` +
  `${formatINR(PRICING.annualMaintenance)}/year maintenance`;

/** EduSuite Pro plan tiers (the product being pitched). */
export interface PlanTier {
  id: string;
  name: string;
  /** One-time price to get this tier installed. */
  setupFee: number;
  /** Per-year maintenance for this tier. */
  annualMaintenance: number;
  roles: string[];
}

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "complete",
    name: "EduSuite Pro Complete",
    setupFee: PRICING.setupFee,
    annualMaintenance: PRICING.annualMaintenance,
    roles: [
      "Principal / Admin dashboard",
      "Teacher, Parent & Student portals",
      "Accounts & fee collection",
      "Attendance (QR/GPS)",
      "Analytics & AI question bank",
    ],
  },
];

/** WreckerAI — the student developer brand pitching EduSuite Pro. */
export const AGENCY_BRAND = {
  name: "WreckerAI",
  tagline: "Student-built digital solutions for educational institutions",
  pitch:
    "I'm a student developer building affordable websites, apps, CRMs and automation systems for schools and educational businesses.",
  demoBaseUrl: "https://wreckerks.github.io/school-app-prototype/",
  offer: OFFER_SUMMARY,
};

/**
 * Bot roster — the full profile for every agent in the workforce. The compact
 * "profile card" shown on category dashboards is a shorter slice of this.
 */
export interface BotProfile {
  id: AgentId;
  name: string;
  department: Department;
  role: string;
  stageLabel: string;
  description: string;
  skills: string[];
  glyph: string;
}

export const BOT_PROFILES: BotProfile[] = [
  {
    id: "lead_finder",
    name: "Lead Finder",
    department: "sales",
    role: "Discovery",
    stageLabel: "Discovery",
    glyph: "L",
    description: "Sweeps OpenStreetMap across India, state by state, and drops a new lead the moment one is found with its name, category, phone, email and location.",
    skills: ["Overpass queries", "State bbox tiling", "Neighbour-country filter", "Phone-first scoring"],
  },
  {
    id: "lead_organizer",
    name: "Lead Organizer",
    department: "sales",
    role: "Contact extraction",
    stageLabel: "Organizer",
    glyph: "O",
    description: "Proves a website belongs to the business, scrapes only the proven site, then pulls real phone numbers and email addresses so every lead has workable contact info.",
    skills: ["Ownership verification", "Contact-page scraping", "Google Maps / JustDial lookup", "Reverse geocoding"],
  },
  {
    id: "research_agent",
    name: "Research Agent",
    department: "tech",
    role: "Digital audit",
    stageLabel: "Research",
    glyph: "R",
    description: "Audits the business's digital presence: website up or down, mobile-friendly, has an enquiry form, active on social media — the facts the pitch is built on.",
    skills: ["Website health checks", "Mobile audit", "Social detection", "Confidence scoring"],
  },
  {
    id: "opportunity_finder",
    name: "Opportunity Finder",
    department: "tech",
    role: "Pitch angle",
    stageLabel: "Opportunity",
    glyph: "O",
    description: "Decides why THIS business is a good fit and what we lead with — no website, no booking page, weak socials — and prioritises every lead Low/Medium/High.",
    skills: ["Gap analysis", "Priority scoring", "Pitch-angle selection"],
  },
  {
    id: "demo_builder",
    name: "Demo Builder",
    department: "tech",
    role: "Personalised demo",
    stageLabel: "Demo",
    glyph: "D",
    description: "Builds a personalised one-page demo and facts sheet for the business so the pitch proves itself instead of promising.",
    skills: ["Facts-sheet generation", "Tier selection", "Evidence-based claims"],
  },
  {
    id: "message_writer",
    name: "Message Writer",
    department: "sales",
    role: "Email + WhatsApp copy",
    stageLabel: "Message",
    glyph: "M",
    description: "Writes a short, honest, personalised pitch quoting the real price and only the facts the research actually verified.",
    skills: ["LLM drafting", "Obsession with verified facts", "Pricing discipline"],
  },
  {
    id: "verifier",
    name: "Verifier",
    department: "sales",
    role: "Quality gate",
    stageLabel: "Message",
    glyph: "V",
    description: "The final gate before anything is sent: address sanity, real site ownership, live mailbox check and correct price. Anything it is not sure about is stopped.",
    skills: ["SMTP RCPT probing", "Domain ownership", "Bounce quarantine", "Auto-approval"],
  },
  {
    id: "email_sender",
    name: "Email Sender",
    department: "sales",
    role: "Delivery",
    stageLabel: "Sent",
    glyph: "E",
    description: "Delivers approved drafts over real SMTP and quarantines any address that hard-bounces so it is never contacted again.",
    skills: ["SMTP deliverability", "Bounce handling", "Rate limiting"],
  },
  {
    id: "reply_manager",
    name: "Reply Manager",
    department: "sales",
    role: "Inbound replies",
    stageLabel: "Reply",
    glyph: "R",
    description: "Synced with the mailbox, classifies every reply as interested / needs info / not interested / wrong contact / unclear, and routes the right follow-up.",
    skills: ["IMAP sync", "LLM classification", "Follow-up routing"],
  },
  {
    id: "mail_monitor",
    name: "Mail Monitor",
    department: "sales",
    role: "Inbox watch",
    stageLabel: "Reply",
    glyph: "M",
    description: "Watches the inbox continuously for bounces, out-of-office notices and replies so nothing that comes back is ever missed.",
    skills: ["Live IMAP poll", "Kind detection", "Error triage"],
  },
];

/**
 * First WhatsApp message for a lead. WhatsApp outreach is the primary channel
 * now; email (SMTP) stays fully wired but a fast first touch is one short,
 * honest wa.me text.
 */
export function whatsappFirstMessage(inst: {
  name: string;
  category?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  const category = CATEGORY_CONFIG.find((c) => c.value === inst.category) ?? CATEGORY_CONFIG[0];
  const where = [inst.city, inst.state].filter(Boolean).join(", ");
  const ctx = where ? `${inst.name} (${where})` : inst.name;
  return [
    `Hi ${ctx},`,
    ``,
    `I'm ${AGENCY_BRAND.name} — a student developer making simple websites and WhatsApp/booking systems for ${inst.category ?? "local businesses"}.`,
    ``,
    `For a business like yours, that usually means ${category.offer}.`,
    ``,
    `Could I send over a short idea in 2 minutes? No cost, no obligation.`,
    "",
    `— ${AGENCY_BRAND.name}`,
  ].join("\n");
}

/** How an app-availability check classifies a school. */
export type AppStatus = "app_found" | "app_possible" | "app_not_found" | "unverified";

export const APP_STATUS_LABELS: Record<AppStatus, string> = {
  app_found: "Confirmed app found",
  app_possible: "Possible app found",
  app_not_found: "No matching app found in checked sources",
  unverified: "Unable to verify",
};

export type ReplyClassification = "interested" | "curious" | "not_interested" | "wrong_contact" | "unclear";

/** What a real Gmail message synced by the Mail Monitor actually is. */
export type MailThreadKind = "reply" | "bounce" | "out_of_office" | "error" | "other";

export const REPLY_CLASSIFICATION_LABELS: Record<ReplyClassification, string> = {
  interested: "Interested",
  curious: "Needs more information",
  not_interested: "Not interested",
  wrong_contact: "Wrong contact",
  unclear: "Unclear",
};

export interface Appointment {
  type: "call" | "meeting" | "demo";
  scheduled_for: string | null;
  status: "pending" | "confirmed" | "done" | "cancelled";
  notes: string | null;
}

/** What an SMTP RCPT probe concluded about a mailbox. */
export type MailboxStatus =
  /** Server explicitly accepted the recipient (250/251). */
  | "exists"
  /** Server explicitly rejected the recipient (550/551/553) — it does not exist. */
  | "rejected"
  /** Domain accepts every address (catch-all), so the probe proves nothing. */
  | "catch_all"
  /** Domain has no MX/A record — cannot receive mail at all. */
  | "no_mx"
  /** Greylisted / rate-limited / transient — try again later. */
  | "unverified";

export const MAILBOX_STATUS_LABELS: Record<MailboxStatus, string> = {
  exists: "Mailbox confirmed by mail server",
  rejected: "Mail server says this address does not exist",
  catch_all: "Domain accepts any address (catch-all) — unproven",
  no_mx: "Domain cannot receive email (no MX record)",
  unverified: "Not checked yet",
};

/** Where a contact address was found — recorded so every lead is auditable. */
export type ContactSource =
  | "osm_tag"
  | "school_website"
  | "google_maps"
  | "justdial"
  | "web_search"
  | "manual";

/** A demo facts sheet generated for a school (EduSuite Pro pitch). */
export interface Proposal {
  id: number;
  institution_id: number;
  title: string;
  body: string;
  services: string | null;
  price_tier: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

/** Complete institution record flowing through every agent. */
export interface Institution {
  id: number;
  mission_id: number;
  name: string;
  category: string;
  region: string;
  state: string;
  lat: number | null;
  lon: number | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  maps_link: string | null;
  rating: number | null;
  reviews: number | null;
  stage: Stage;
  folder_status: FolderStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  last_agent: AgentId | null;
  /** 1 once this address has hard-bounced; quarantined forever after. */
  bounced: number;

  // Lead Organizer output — real contacts
  principal_name: string | null;
  owner_name: string | null;
  admissions_email: string | null;
  whatsapp_available: number | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  youtube: string | null;
  year_established: string | null;
  student_strength: string | null;
  branches: string | null;
  verified_contact: number;

  // Contact provenance — proves WHERE each address actually came from.
  contact_source: string | null;
  /** 1 when the website has been proven to belong to THIS school. */
  site_verified: number;
  site_match_reason: string | null;
  /** Verifier agent's SMTP mailbox probe result. */
  mailbox_status: MailboxStatus;
  mailbox_checked_at: string | null;
  mailbox_detail: string | null;

  // Research Agent output — website + app audit
  website_up: number;
  https_secure: number;
  mobile_friendly: number;
  app_status: AppStatus;
  app_evidence: string | null;
  sources_checked: string | null;
  research_confidence: "Low" | "Medium" | "High" | null;
  has_admission_form: number;
  has_fee_payment: number;
  has_chatbot: number;
  social_active: number;
  research_notes: string | null;

  // Opportunity Finder output
  opportunity_type: string | null;
  opportunity_reason: string | null;
  opportunity_priority: "Low" | "Medium" | "High" | null;

  // Demo Builder output
  plan_tier: string | null;
  demo_notes: string | null;

  // Message writer / sender output
  message_subject: string | null;
  message_body: string | null;
  sent_at: string | null;
}

/** A row in institution table using column-name keys (snake_case) */
export type InstitutionRow = Omit<Record<string, unknown>, "id"> & { id: number };