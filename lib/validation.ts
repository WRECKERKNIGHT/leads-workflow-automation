/**
 * Strict email plausibility checks for outreach contacts.
 *
 * The scraper previously accepted ANY email found on a page, which let junk
 * addresses through (noreply@, help@angelone.in, ticket widgets, etc.) and
 * caused real sends to bounce. Every email we store or send must pass here.
 */

const JUNK_LOCAL = /^(no[\-_]?reply|noreply|donotreply|help|support|customer|care|helpdesk|webmaster|postmaster|abuse|ticket|booking|reserv|billing|accounts|payments|sales|marketing|newsletter|alert|notify|notification|team|security|privacy|legal|press|media|android|ios|developer|devops|test|admin)$/i;

/** Consumer / service domains that are never a school's own contact. */
const JUNK_DOMAINS: string[] = [
  "angelone", "groww", "zerodha", "upstox", "paytm", "phonepe", "gpay",
  "premierleague", "bpl", "ipl", "tickets", "bookmyshow", "zomato", "swiggy",
  "netflix", "amazon", "flipkart", "myntra", "ajio", "meesho", "snapdeal",
  "uber", "ola", "irctc", "providex", "redbus", "makemytrip", "goibibo",
  "epicgames", "steampowered", "cisa", "openai", "anthropic", "google",
  "microsoft", "apple", "facebook", "instagram", "whatsapp", "telegram",
  "youtube", "twitch", "linkedin", "discord", "snapchat", "tiktok", "blogspot",
  "wix", "godaddy", "wordpress", "medium", "substack", "patreon",
  "indiamart", "sulekha", "justdial", "quickr", "olx", "adpushup",
  // Domains that showed up as bogus "school websites" during the first run.
  "indiatoday", "poki", "reddit", "vedantu", "zhihu", "arsenal", "swiggy",
  "allindiabullion", "chamberofcommerce", "pinoyweekly", "pika", "myclassboard",
  "maharashtratourism", "children", "nobroker", "hengrunchina", "puresociology",
  "motherjunction", "momjunction", "wiktionary", "wikipedia", "khanacademy",
  "socratic", "chegg", "coursehero", "brainly", "toppr", "byjus", "unacademy",
  "hashnode", "devto", "npmjs", "pypi", "docker", "gitee", "github", "gitlab",
  "adobe", "grammarly", "canva", "figma", "notion", "slack", "zoom", "teams",
  "hubspot", "salesforce", "shopify", "woocommerce", "magento", "walmart",
  "ikea", "homeshop18", "ajio", "myntra", "nykaa", "boat", "noise", "boAt",
  "croma", "reliancedigital", "tatacls", "airtel", "jio", "vodafone", "idea",
  "bsnl", "paytm", "yatra", "ixigo", "cleartrip", "OYO", "oyo", "tata",
  "quora", "angel", "angelcruise", "cruise", "pinterest", "flickr", "tumblr",
  "stackexchange", "yandex", "baidu", "ask", "aol", "msn", "gmx", "yahoo",
];

/**
 * Words that appear in almost every school name, so they carry no identifying
 * signal when matching a name against a domain. "Sunrise Public School" must
 * not be considered a match for a domain merely containing "public".
 */
const GENERIC_NAME_WORDS = new Set([
  "school", "schools", "academy", "academies", "public", "private", "high",
  "higher", "secondary", "primary", "senior", "junior", "middle", "k12",
  "international", "educational", "education", "institute", "institution",
  "college", "university", "vidyalaya", "mandir", "pathshala", "bhavan",
  "sangh", "trust", "society", "association", "foundation", "centre",
  "center", "academy", "model", "convent", "mission", "gurukul", "president",
  "and", "the", "of", "for", "new", "sri", "smt", "dr", "m", "s",
  // School *category* words. "Sainik School" and "Bal Bharati School" name a
  // kind of school that hundreds of institutions share, so they cannot
  // distinguish one school's site from an exam portal or a textbook publisher.
  "sainik", "navodaya", "kendriya", "bharati", "bal", "bala", "deep", "shiksha",
  "pathshala", "vidya", "vidyalaya", "pustak", "textbook", "stationery",
  // Place and region words. "Delhi Public School" reduces to just "delhi", and
  // delhi.gov.in is the state government portal, not a school — matching a
  // school on its city name alone is meaningless.
  "india", "delhi", "mumbai", "bombay", "kolkata", "calcutta", "chennai",
  "madras", "bengaluru", "bangalore", "hyderabad", "pune", "ahmedabad", "surat",
  "jaipur", "lucknow", "kanpur", "nagpur", "indore", "bhopal", "patna", "kochi",
  "cochin", "thiruvananthapuram", "visakhapatnam", "bhubaneswar", "guwahati",
  "karnataka", "kerala", "tamil", "telugu", "hindi", "english", "assam", "bihar",
  "goa", "punjab", "rajasthan", "gujarat", "maharashtra", "odisha", "orissa",
  "west", "bengal", "uttar", "pradesh", "andhra", "telangana", "chhattisgarh",
  "jharkhand", "haryana", "himachal", "uttarakhand", "sikkim", "tripura",
  "manipur", "meghalaya", "mizoram", "nagaland", "arunachal", "national",
  "state", "government", "govt", "board", "cbse", "icse", "ssc", "primary",
]);

/** Words that make a domain look institutional without identifying a school. */
const SCHOOL_LABEL_WORDS = ["school", "schools", "college", "academy", "vidyalaya", "shiksha", "edu", "education", "pathshala", "bhavan"];

/**
 * Government domains belong to a ministry, a state department or an exam board,
 * never to one school. jk.gov.in, education.gov.in and pmshri.education.gov.in
 * all host pages about *many* schools, so a page full of school vocabulary proves
 * nothing about which school a lead is. Sales outreach to them is misdirected by
 * definition, so they are refused outright.
 */
const GOV_PORTAL_RE = /(^|\.)gov\.[a-z]{2,}$|(^|\.)govt\.[a-z]{2,}$|(^|\.)nic\.in$|(^|\.)ac\.nic\.in$/i;

/**
 * Host labels that serve a *publisher or shop* rather than the institution.
 * books.ebalbharati.in is a textbook store that happens to share a name with
 * Bal Bharati School.
 */
const PORTAL_HOST_LABEL_RE = /^(books?|shop|store| bookstore|library|ebooks?|catalog|products?)\./i;

/**
 * Vocabulary that only appears on a genuine school, college or institute page.
 * A school named after a single distinctive word ("Radiant School") cannot be
 * confirmed from its domain alone, because radiant.in is an IT distributor and
 * angel.com is a cruise line. Counting this vocabulary on the page itself
 * separates an actual institution from a company that shares its name.
 */
const SCHOOL_VOCAB = [
  "admission", "admissions", "student", "students", "pupil", "pupils", "principal",
  "principal", "headmaster", "headmistress", "classroom", "syllabus", "curriculum",
  "cbse", "icse", "state board", "academic year", "session", "tuition", "fees",
  "fee structure", "school", "college", "academy", "campus", "hostel", "uniform",
  "exam", "board", "faculty", "educator", "learning", "kindergarten", "nursery",
  "playground", "library", "laboratory", "annual day", "sports day", "scholarship",
];

/** Words that mark a page as commercial even when it shares a school's name. */
const COMMERCIAL_MARKERS = [
  "pvt ltd", "private limited", "industries", "technologies", "consulting",
  "consultancy", "distributor", "wholesale", "supplier", "shipping", "cruise",
  "cruises", "insurance", "enterprises", "trading", "real estate", "manufacturing",
];

/** How much school vocabulary a page actually shows. */
export function schoolSignalScore(text: string | null | undefined): number {
  const blob = String(text ?? "").toLowerCase();
  if (!blob) return 0;
  let hits = 0;
  for (const term of SCHOOL_VOCAB) {
    if (blob.includes(term)) hits++;
  }
  return hits;
}

/**
 * True when a page reads like a business rather than a school. Matching is done
 * on whole words: a substring test flags ordinary school pages for containing
 * "inc" inside another word.
 */
export function readsCommercial(text: string | null | undefined): boolean {
  const blob = String(text ?? "").toLowerCase();
  if (!blob) return false;
  return COMMERCIAL_MARKERS.filter((m) => blob.includes(m)).length >= 2;
}

/** Indian states, used to catch a same-named school in the wrong state. */
const INDIAN_STATES: Record<string, string> = {
  "andhra pradesh": "andhra pradesh", andhra: "andhra pradesh", visakhapatnam: "andhra pradesh",
  arunachal: "arunachal pradesh", assam: "assam", guwahati: "assam", dibrugarh: "assam",
  bihar: "bihar", patna: "bihar", gaya: "bihar",
  chhattisgarh: "chhattisgarh", raipur: "chhattisgarh",
  goa: "goa", panaji: "goa",
  gujarat: "gujarat", ahmedabad: "gujarat", surat: "gujarat", vadodara: "gujarat", rajkot: "gujarat",
  haryana: "haryana", gurgaon: "haryana", faridabad: "haryana",
  "himachal pradesh": "himachal pradesh", shimla: "himachal pradesh",
  jharkhand: "jharkhand", ranchi: "jharkhand", jamshedpur: "jharkhand",
  karnataka: "karnataka", bangalore: "karnataka", bengaluru: "karnataka", mysore: "karnataka",
  mysuru: "karnataka", mangalore: "karnataka", mangaluru: "karnataka", hubballi: "karnataka",
  hubli: "karnataka", belagavi: "karnataka", belgaum: "karnataka", dharwad: "karnataka",
  kerala: "kerala", kochi: "kerala", cochin: "kerala", trivandrum: "kerala", thiruvananthapuram: "kerala",
  "madhya pradesh": "madhya pradesh", bhopal: "madhya pradesh", indore: "madhya pradesh",
  maharashtra: "maharashtra", mumbai: "maharashtra", pune: "maharashtra", nagpur: "maharashtra",
  nashik: "maharashtra", thane: "maharashtra",
  manipur: "manipur", imphal: "manipur",
  meghalaya: "meghalaya", shillong: "meghalaya",
  mizoram: "mizoram", aizawl: "mizoram",
  nagaland: "nagaland", kohima: "nagaland", dimapur: "nagaland",
  odisha: "odisha", orissa: "odisha", bhubaneswar: "odisha", cuttack: "odisha", rourkela: "odisha",
  punjab: "punjab", ludhiana: "punjab", amritsar: "punjab", jalandhar: "punjab",
  rajasthan: "rajasthan", jaipur: "rajasthan", jodhpur: "rajasthan", udaipur: "rajasthan",
  sikkim: "sikkim", gangtok: "sikkim",
  "tamil nadu": "tamil nadu", chennai: "tamil nadu", coimbatore: "tamil nadu", madurai: "tamil nadu",
  tiruchirappalli: "tamil nadu", trichy: "tamil nadu", tirunelveli: "tamil nadu", salem: "tamil nadu",
  telangana: "telangana", hyderabad: "telangana", warangal: "telangana",
  tripura: "tripura", agartala: "tripura",
  "uttar pradesh": "uttar pradesh", lucknow: "uttar pradesh", kanpur: "uttar pradesh",
  varanasi: "uttar pradesh", agra: "uttar pradesh", ghaziabad: "uttar pradesh", noida: "uttar pradesh",
  uttarakhand: "uttarakhand", dehradun: "uttarakhand", haridwar: "uttarakhand",
  "west bengal": "west bengal", kolkata: "west bengal", calcutta: "west bengal",
  howrah: "west bengal", durgapur: "west bengal", siliguri: "west bengal", darjeeling: "west bengal",
  bali: "uttar pradesh", "new delhi": "delhi", delhi: "delhi",
};

/**
 * Catch the "right name, wrong school" case.
 *
 * Plenty of schools share a name across states, so confirming that a page is a
 * school is not enough — it has to be *this* school's. Stella Maris School in
 * Karnataka was matching a women's arts college in Chennai, and Radiant School
 * in Assam was matching an English academy in Surat, because in both cases the
 * name matched and the page was educational.
 *
 * Indian institutions almost always print their city or state, so a page that
 * names a different state and never names the school's own state is treated as
 * a different institution.
 */
export function locationConflict(
  pageText: string | null | undefined,
  schoolState: string | null | undefined,
  schoolAddress?: string | null
): string | null {
  const known = String(schoolState ?? "").trim().toLowerCase();
  if (!known || known === "india") return null;
  const knownState = INDIAN_STATES[known] ?? known;

  const blob = String(pageText ?? "").toLowerCase();
  if (blob.length < 40) return null;

  // If the page ever names the school's own state, it is plausibly theirs.
  if (blob.includes(known) || blob.includes(knownState)) return null;

  // A city listed on the school's own record also counts as "their" location.
  const addressBlob = String(schoolAddress ?? "").toLowerCase();
  if (addressBlob) {
    const tokens = [...addressBlob.matchAll(/[a-z]{4,}/g)].map((m) => m[0]);
    if (tokens.some((t) => INDIAN_STATES[t] && INDIAN_STATES[t] !== knownState)) {
      // The record itself places the school in more than one state; stay quiet.
      return null;
    }
    if (tokens.some((t) => INDIAN_STATES[t] === knownState || t === knownState)) return null;
  }

  const found = new Set<string>();
  for (const [needle, stateName] of Object.entries(INDIAN_STATES)) {
    if (stateName === knownState) continue;
    if (new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(blob)) {
      found.add(stateName);
    }
  }
  if (!found.size) return null;
  return `page names ${[...found].join("/")} but this school is in ${schoolState}`;
}

export interface EmailContext {
  /** The school's own website host (lower-case, no scheme). */
  siteDomain?: string | null;
  /** Was this address found in an explicit mailto: contact link? */
  fromMailto?: boolean;
  /** The school name, for token matching. */
  schoolName?: string | null;
}

export function normalizeEmail(raw: string): string | null {
  const e = String(raw ?? "").trim().toLowerCase().replace(/^mailto:/i, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  if (e.includes("..") || e.includes(".@") || e.startsWith(".") || e.endsWith(".com.")) return null;
  return e;
}

/** Crude junk filtering — reject obvious service/newsletter/consumer addresses. */
export function isJunkEmail(email: string): boolean {
  const e = normalizeEmail(email);
  if (!e) return true;
  const [, domain] = e.split("@");
  if (JUNK_LOCAL.test(e.split("@")[0])) return true;
  const sld = domain.split(".").slice(-2).join(".").toLowerCase();
  if (JUNK_DOMAINS.some((d) => sld === d || sld.startsWith(d))) return true;
  // Local-part that looks like an address (123@…) or is pure digits.
  if (/^\d+$/.test(e.split("@")[0])) return true;
  return false;
}

const SCHOOLISH_LOCAL = /admission|principal|school|academy|college|office|director|enquir|contact|info|admin|faculty|teacher|founder|head|staff|virtual|online|official/i;
const WEBMAIL = /@(gmail|yahoo|rediff|hotmail|outlook|ymail|gmx|zoho|icloud|aol|proton)\.com?(\.[a-z]{2})?$/i;
const BKASH = /\.(bd|pk|np|lk|mm|cn|af|ir|ng|ke|gh|za)\b/;
const ORG_TLD = /\.(co\.in|ac\.in|edu\.in|edu|org|net|com|school|k12)$/i;
const JUNK_TLD = /\.(travel|shop|store|xyz|live|online|site|best|club|info|top|loan|work|world|guru|express|racing|stream|download|review|news|today|tokyo|club)$/i;

/**
 * Decide whether an address is plausibly THIS school's contact.
 * Conservative: the address must be tied to the school somehow — its own
 * domain, an explicit mailto: contact link on its site, or a school-flavoured
 * webmail. Bare generic addresses (contact@<unrelated-domain>) are rejected;
 * that's what let junk like contact@vietnam.travel through before.
 */
export function isPlausibleEmail(email: string, ctx: EmailContext = {}): boolean {
  const e = normalizeEmail(email);
  if (!e) return false;
  if (isJunkEmail(e)) return false;
  if (BKASH.test(e)) return false;
  if (JUNK_TLD.test(e)) return false;
  if (/^\d+$/.test(e.split("@")[0])) return false;

  const [local, domain] = e.split("@");
  const siteDomain = String(ctx.siteDomain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const siteSld = siteDomain ? siteDomain.split(".").slice(-2).join(".") : "";
  const emailSld = domain.split(".").slice(-2).join(".");

  // The school's own domain is the strongest signal.
  if (siteSld && (emailSld === siteSld || emailSld.endsWith(siteSld))) return true;

  const isWebmail = WEBMAIL.test(e);
  if (isWebmail) {
    // A school-flavoured local part, or any explicit mailto link on the site.
    return SCHOOLISH_LOCAL.test(local) || ctx.fromMailto === true;
  }

  // Non-webmail: only accept an explicitly linked contact address on an
  // organisation-ish domain when it came from the school's own site.
  return ctx.fromMailto === true && ORG_TLD.test(domain);
}

/**
 * Rank already-approved addresses so the most likely admissions contact is
 * chosen first. Assumes the caller has already run the sendability gate.
 */
export function rankAdmissionsEmail(emails: string[]): string | null {
  const valid = [...new Set(emails.map(normalizeEmail).filter((e): e is string => !!e))];
  if (!valid.length) return null;
  return (
    valid.find((e) => /admission|principal|office|director|enquir/i.test(e.split("@")[0])) ??
    valid.find((e) => /school|academy|info|contact|admin/i.test(e.split("@")[0])) ??
    valid[0]
  );
}

/** Pick the best admissions-style address from validated candidates. */
export function pickAdmissionsEmail(emails: string[], ctx: EmailContext = {}): string | null {
  const valid = [...new Set(emails.map(normalizeEmail).filter((e): e is string => !!e && isPlausibleEmail(e, ctx)))];
  if (!valid.length) return null;
  return (
    valid.find((e) => /admission|principal|office|director|enquir/i.test(e.split("@")[0])) ??
    valid.find((e) => /school|academy|info|contact|admin/i.test(e.split("@")[0])) ??
    valid[0]
  );
}

/* -------------------------------------------------------------------------- */
/*  Site ownership — the check that stops the wrong-domain email loop         */
/* -------------------------------------------------------------------------- */

/** Split a name/host into comparable lowercase word tokens. */
export function wordTokens(s: string): string[] {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
}

/** Tokens in a school name that actually identify it (generics removed). */
export function distinctiveTokens(schoolName: string): string[] {
  return wordTokens(schoolName).filter((t) => !GENERIC_NAME_WORDS.has(t));
}

/**
 * Indian school names are very often written as initials — "K P S School
 * Hyderabad", "D P S R.K. Puram", "S V I College". Dropping single letters
 * during tokenisation would erase the only identifying part of the name, so
 * the initials are folded back together as one token.
 */
export function acronymToken(schoolName: string): string | null {
  const words = String(schoolName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.]+/g, " ")
    .split(/[\s.]+/)
    .filter(Boolean)
    .filter((w) => w.length === 1 && /[a-z]/.test(w));
  if (words.length < 2) return null;
  return words.join("");
}

export interface SiteOwnership {
  /** True only when the domain can be attributed to this specific school. */
  owned: boolean;
  /** How sure we are, for display and for weighting. */
  confidence: "high" | "medium" | "none";
  reason: string;
  /** Registrable domain (last two labels), lower-cased, no "www.". */
  domain: string;
}

export function registrableDomain(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  // Handle common two-part public suffixes (co.in, ac.in, edu.in, org.in…).
  const two = parts.slice(-2).join(".");
  if (/^(co|ac|edu|gov|net|org|firm|ind|gen|sch|nic)\.[a-z]{2}$/i.test(two)) return parts.slice(-3).join(".");
  return two;
}

/** Domains that host many unrelated organisations — never a single school's. */
const SHARED_HOSTING = [
  "github.io", "netlify.app", "vercel.app", "pages.dev", "web.app",
  "firebaseapp.com", "blogspot.", "wordpress.com", "wixsite.com", "weebly.com",
  "myclassboard.com", "classplus.in", "zoho.com", "google.com", "sites.google.com",
  "mystrikingly.com", "jimdosite.com", "business.site", "square.site",
];

function isSharedHost(domain: string): boolean {
  return SHARED_HOSTING.some((h) => domain === h || domain.endsWith(`.${h}`) || domain.includes(h));
}

const EDU_TLD = /\.(ac\.in|edu\.in|edu|sch\.in|k12\.[a-z]{2}|ac\.[a-z]{2}|gov\.in)$/i;

/** TLDs that essentially never host an Indian school's own site. */
const NEVER_SCHOOL_TLD = /\.(dev|app|io|co|xyz|tech|online|site|info|biz|shop|store|website|live|cloud|ai|me|cc|tv|ly|sh|fm|gg|to|page|link|click|one|space|fun|top|vip|work|design|studio|agency|digital|solutions|software|host|press|wiki|blog)$/i;

/**
 * Decide whether a website genuinely belongs to this school.
 *
 * This is the fix for the bug that produced the junk outreach: OpenStreetMap
 * and a loose web search both handed the pipeline unrelated domains
 * (poki.com for a school, vedantu.com for a school, reddit.com for a college).
 * The organizer then scraped an email from that unrelated site, and the email
 * "passed" validation because it matched the same wrong domain.
 *
 * Matching one word is never enough on its own — that is exactly how
 * "Angel Heart Montessori" matched angel.com (a cruise line) and "Hoodi High
 * School" matched hoodi.dev (a software shop). A partial hostname match is only
 * accepted when the page itself confirms the school name.
 */
export function siteBelongsToSchool(
  siteUrl: string | null | undefined,
  schoolName: string | null | undefined,
  opts: { pageTitle?: string | null; pageText?: string | null; state?: string | null; address?: string | null } = {}
): SiteOwnership {
  const empty: SiteOwnership = { owned: false, confidence: "none", reason: "no website to check", domain: "" };
  if (!siteUrl) return empty;
  let hostname: string;
  try {
    hostname = new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname;
  } catch {
    return { ...empty, reason: "unparseable website URL" };
  }
  const domain = registrableDomain(hostname);
  if (!domain) return { ...empty, reason: "unparseable website URL" };

  if (isJunkDomain(domain)) {
    return { owned: false, confidence: "none", reason: `${domain} is a platform/aggregator, not a school`, domain };
  }
  if (isSharedHost(domain)) {
    return { owned: false, confidence: "none", reason: `${domain} is a shared host (many schools per domain)`, domain };
  }
  if (NEVER_SCHOOL_TLD.test(domain)) {
    return { owned: false, confidence: "none", reason: `${domain} uses a ${domain.split(".").pop()} domain, not a school domain`, domain };
  }
  if (GOV_PORTAL_RE.test(hostname)) {
    return {
      owned: false,
      confidence: "none",
      reason: `${domain} is a government/board portal covering many schools, not one school's own site`,
      domain,
    };
  }
  if (PORTAL_HOST_LABEL_RE.test(hostname)) {
    return {
      owned: false,
      confidence: "none",
      reason: `${domain} is a publisher/shop host, not the school's own site`,
      domain,
    };
  }

  const name = distinctiveTokens(schoolName ?? "");
  // Initials carry the whole name for schools like "K P S School Hyderabad".
  const acronym = name.length ? null : acronymToken(schoolName ?? "");
  const nameTokens = name.length ? name : acronym ? [acronym] : [];
  const hostTokens = wordTokens(hostname);
  const hostBlob = hostname.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pageBlob = `${opts.pageTitle ?? ""} ${opts.pageText ?? ""}`;

  /**
   * "Right name, wrong school" guard. Many schools share a name across states,
   * so a matching name on an educational page is not enough on its own: Stella
   * Maris School (Karnataka) matched a women's arts college in Chennai, and
   * Radiant School (Assam) matched an English academy in Surat. The page has to
   * be located in the same place as the school.
   */
  const conflict = locationConflict(pageBlob, opts.state, opts.address);
  if (conflict) {
    return { owned: false, confidence: "none", reason: conflict, domain };
  }
  const hostConflict = locationConflict(hostname, opts.state, opts.address);
  if (hostConflict && !hostBlob.includes(String(opts.state ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))) {
    return { owned: false, confidence: "none", reason: hostConflict, domain };
  }

  /**
   * School domains usually squash the name together rather than splitting it:
   * "Mother Teresa Memorial School" lives on motherteresamemorial.edu.in, and
   * "St Peters College" on stpeters.edu.in. Comparing whole words only ever
   * matched the ones that happened to be hyphenated, so the joined form and
   * plain substring containment are checked too.
   */
  const hostHas = (t: string) => hostTokens.includes(t) || (t.length >= 4 && hostBlob.includes(t));

  // Nothing identifying is left in the name — it was only category vocabulary,
  // as in a lead literally called "School" or "Higher Primary School". There is
  // then no way to tell this school from any other, so no domain can be confirmed
  // as its own. Previously an edu/gov domain that merely said "school" was
  // accepted here, which is how a generic lead got attached to jk.gov.in.
  if (!nameTokens.length) {
    return {
      owned: false,
      confidence: "none",
      reason: `"${schoolName}" has no identifying words, so ${domain} cannot be confirmed as its own site`,
      domain,
    };
  }

  const hostShared = nameTokens.filter((t) => hostHas(t));
  // An initialism is too short for the substring rule, so it is matched against
  // the start of a hostname label instead: "K P S School Hyderabad" on
  // kpsghyderabad.ac.in.
  if (acronym && !hostShared.length && hostTokens.some((t) => t.startsWith(acronym))) {
    hostShared.push(acronym);
  }
  const joined = nameTokens.join("");
  const joinedMatches = joined.length >= 8 && hostBlob.includes(joined);
  const title = (opts.pageTitle ?? "").toLowerCase();
  const titleTokens = title ? wordTokens(title) : [];
  const titleShared = titleTokens.length ? nameTokens.filter((t) => titleTokens.includes(t)) : [];

  /**
   * Corroboration bar. One matching word is never enough to confirm a partial
   * match, however confident that word looks on its own: "Angel" is in both
   * "Angel Heart Montessori" and "Angel Cruises", so a single shared word
   * cannot tell a school apart from a cruise line. A partial hostname match
   * must be backed by at least two of the school's own words on the page.
   */
  const needed = Math.min(nameTokens.length, 2);
  const titleCorroborates =
    titleShared.length >= needed && hostShared.every((t) => titleTokens.includes(t));

  /**
   * A school whose name reduces to one or two distinctive words cannot be
   * confirmed by its domain, because plenty of companies are named after
   * schools (radiant.in is an IT distributor, angel.com a cruise line). Such a
   * name must additionally be backed by real school vocabulary on the page.
   */
  const signals = schoolSignalScore(`${opts.pageTitle ?? ""} ${opts.pageText ?? ""}`);
  const nameIsWeak = nameTokens.length < 3;
  const schoolConfirmed = signals >= 2 && !readsCommercial(`${opts.pageTitle ?? ""} ${opts.pageText ?? ""}`);
  if (nameIsWeak && !schoolConfirmed) {
    return {
      owned: false,
      confidence: "none",
      reason: `"${schoolName}" is a short name and ${domain} shows no school content (${signals} school signals) — not enough to confirm`,
      domain,
    };
  }

  // STRONG: the whole distinctive school name is in the hostname, either as
  // separate words or squashed into one label.
  if (hostShared.length === nameTokens.length || (joinedMatches && hostShared.length >= Math.ceil(nameTokens.length / 2))) {
    return {
      owned: true,
      confidence: "high",
      reason: `full school name "${hostShared.join(" ") || joined}" appears in ${domain}`,
      domain,
    };
  }

  // PARTIAL: some words match the hostname, but the page must confirm it before
  // we accept — this is what separates a real school from angel.com.
  if (hostShared.length) {
    if (titleCorroborates) {
      return {
        owned: true,
        confidence: hostShared.length >= 2 ? "high" : "medium",
        reason: `domain ${domain} carries "${hostShared.join(" ")}" and the page title confirms "${titleShared.join(" ")}"`,
        domain,
      };
    }
    return {
      owned: false,
      confidence: "none",
      reason: `${domain} only shares "${hostShared.join(", ")}" with "${schoolName}" and the page does not confirm it`,
      domain,
    };
  }

  // No shared word — the page title is the only remaining evidence, and it has
  // to reproduce the school's own words rather than a single common term.
  if (titleShared.length === nameTokens.length && nameTokens.length >= needed && titleShared.length > 0) {
    return {
      owned: true,
      confidence: "high",
      reason: `page title matches school name exactly (${titleShared.join(", ")})`,
      domain,
    };
  }

  if (EDU_TLD.test(domain)) {
    return {
      owned: false,
      confidence: "none",
      reason: `${domain} looks institutional but shares no word with "${schoolName}"`,
      domain,
    };
  }

  return {
    owned: false,
    confidence: "none",
    reason: `${domain} shares no word with "${schoolName}" — assumed unrelated`,
    domain,
  };
}

/** True when the domain is a known platform / marketplace, never a school. */
export function isJunkDomain(domainOrEmail: string): boolean {
  const raw = domainOrEmail.toLowerCase().includes("@") ? domainOrEmail.split("@")[1] : domainOrEmail;
  const sld = raw.replace(/^www\./, "").split(".").slice(-2).join(".");
  return JUNK_DOMAINS.some((d) => sld === d || sld.startsWith(d));
}

/**
 * The gate the sender and the boot quarantine both use.
 *
 * An address is only sendable when it survives junk filtering AND its domain is
 * provably the school's own. A webmail address is accepted only when it was
 * explicitly published as a mailto: contact on the school's verified site.
 */
export function isSendableEmail(
  email: string,
  ctx: EmailContext & { siteVerified?: boolean } = {}
): { ok: boolean; reason: string } {
  const e = normalizeEmail(email);
  if (!e) return { ok: false, reason: "not a valid address" };
  if (isJunkEmail(e)) return { ok: false, reason: "filtered as a service/junk address" };
  if (BKASH.test(e)) return { ok: false, reason: "non-India domain" };
  if (JUNK_TLD.test(e)) return { ok: false, reason: "suspicious top-level domain" };

  const [local, domain] = e.split("@");
  if (/^\d+$/.test(local)) return { ok: false, reason: "numeric local part" };

  const siteDomain = registrableDomain(String(ctx.siteDomain ?? "").replace(/^https?:\/\//, ""));
  const emailDomain = registrableDomain(domain);

  if (isJunkDomain(emailDomain)) {
    return { ok: false, reason: `${emailDomain} is a platform, not a school` };
  }

  // Webmail (gmail/yahoo/...): only trustworthy when the school's own verified
  // site published it as an explicit contact link.
  if (WEBMAIL.test(e)) {
    if (ctx.siteVerified && ctx.fromMailto) return { ok: true, reason: "published mailto on verified school site" };
    return { ok: false, reason: "free webmail address is not proof of ownership" };
  }

  // The school's own domain is acceptable — but ONLY once we have proven the
  // website belongs to this school. Unverified websites are exactly what caused
  // the junk-address problem.
  if (siteDomain && emailDomain === siteDomain) {
    if (!ctx.siteVerified) {
      return { ok: false, reason: `domain matches an unverified website (${siteDomain})` };
    }
    return { ok: true, reason: `address is on the school's verified domain ${siteDomain}` };
  }

  if (ctx.siteVerified && ctx.fromMailto && ORG_TLD.test(domain)) {
    return { ok: true, reason: "published as a contact address on the school's verified site" };
  }

  return { ok: false, reason: `${emailDomain} is not the school's domain (${siteDomain || "unknown"})` };
}

/** Approximate India land box (deg). Unknown coords are treated as fine. */
export function isInIndiaBox(lat?: number | null, lon?: number | null): boolean {
  if (lat == null || lon == null) return true;
  return lon >= 67 && lon <= 97.5 && lat >= 6 && lat <= 37.5;
}
/** Scripts used by neighbouring countries but not by Indian schools. */
const FOREIGN_SCRIPT_RE = /[\u1000-\u109F\u0E00-\u0E7F\u0E80-\u0EFF\u1780-\u17FF\u2000]/u;
const FOREIGN_NOTE_RE = /basic education (high|middle|primary) school|bhasa|buddha(?:dharma)?\s*education|(^|\s)(dps|gis|ssc)\s+(scholarship|exam)/i;

/**
 * India's states and union territories. A loose lat/lon box is not enough: the
 * box covering eastern India also contains all of Bangladesh, most of Nepal and
 * the Myanmar borderlands, which is how 15% of discovered leads turned out to be
 * foreign schools. The reverse-geocoded state is the reliable signal, so it is
 * matched against this allowlist.
 *
 * Deliberately separate from the `INDIAN_STATES` city map above, which normalises
 * place names to a canonical state and is not an allowlist.
 */
const INDIAN_ADMIN_UNITS = new Set([
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa",
  "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka", "kerala",
  "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland",
  "odisha", "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura",
  "uttar pradesh", "uttarakhand", "west bengal",
  // union territories and the NCT
  "andaman and nicobar islands", "chandigarh", "dadra and nagar haveli and daman and diu",
  "daman and diu", "daman", "diu", "delhi", "nct of delhi", "new delhi",
  "jammu and kashmir", "ladakh", "lakshadweep", "puducherry", "pondicherry",
]);

/** True when a reverse-geocoded state names an Indian state or union territory. */
export function isIndianState(state: string | null | undefined): boolean {
  if (!state) return false;
  const s = state
    .toLowerCase()
    .replace(/\s*state$/, "")
    .replace(/[.\s]+$/, "")
    .trim();
  return INDIAN_ADMIN_UNITS.has(s);
}

/**
 * Guard against cross-border / foreign schools sneaking past the discovery
 * bbox (state boxes along the border can include overseas land). The resolved
 * state is checked when available, which is far more precise than coordinates.
 */
export function isForeignLead(
  lat: number | null | undefined,
  lon: number | null | undefined,
  name: string,
  state?: string | null
): boolean {
  if (state && !isIndianState(state)) return true;
  if (!isInIndiaBox(lat, lon)) return true;
  if (FOREIGN_SCRIPT_RE.test(name)) return true;
  return false;
}