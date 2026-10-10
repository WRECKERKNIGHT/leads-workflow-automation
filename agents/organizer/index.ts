import { runAgentTask } from "@/lib/agents/runner";
import { getInstitution, updateInstitution, pushOfficeEvent, saveAgentOutput, logAgent, setStage } from "@/lib/db/repo";
import { fetchPage, internalLinks } from "@/lib/scraping/web";
import { lookupGoogleMaps, lookupJustDial, findVerifiedWebsite, findVerifiedWebsiteViaPlaces, reverseGeocode } from "@/lib/scraping/directory";
import { config } from "@/lib/config";
import {
  isJunkEmail,
  normalizeEmail,
  rankAdmissionsEmail,
  siteBelongsToSchool,
  registrableDomain,
  isSendableEmail,
  type EmailContext,
} from "@/lib/validation";
import type { CheerioAPI } from "cheerio";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?91[\s-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{5}[\s.-]?\d{4,5}/g;

const NEVER_SCRAPE = /justdial|sulekha|indiamart|facebook|instagram|youtube|twitter|linkedin|pinterest|tiktok|threads\.net|whatsapp|wikipedia|play\.google|gstatic|cloudflare|googletagmanager/i;

function extract($: CheerioAPI, html: string, out: { emails: Set<string>; mailto: Set<string>; phones: Set<string>; sites: string[]; }, url: string) {
  const page = html.slice(0, 300_000);
  for (const m of page.matchAll(EMAIL_RE)) {
    const e = normalizeEmail(m[0]);
    if (e && !/png|jpe?g|gif|svg|example/i.test(e)) out.emails.add(e);
  }
  for (const m of page.matchAll(PHONE_RE)) out.phones.add(m[0].replace(/\s+/g, ""));
  $('a[href^="mailto:"]').each((_, el) => {
    const e = normalizeEmail($(el).attr("href") ?? "");
    if (e) out.mailto.add(e);
  });
  if (!out.sites.includes(url)) out.sites.push(url);
}

/**
 * Lead Organizer — finds REAL contact details for each discovered school.
 *
 * The bug this agent used to have: it trusted whatever `website` came off the
 * lead (usually a stale OpenStreetMap tag) and scraped that page for emails.
 * When the tag was wrong — poki.com for a school, vedantu.com for a school —
 * it collected a real email belonging to an unrelated company, and the
 * plausibility check passed because the address matched the same wrong domain.
 * That is what filled the inbox with bounces.
 *
 * Now the website must be PROVEN to belong to the school before a single email
 * is read from it, and Google Maps / JustDial are consulted to find the real one.
 */
export async function runLeadOrganizer(institutionId: number): Promise<void> {
  const inst = getInstitution(institutionId);
  if (!inst) return;

  const already = Boolean(inst.admissions_email || inst.email || inst.phone);

  await runAgentTask({
    agentId: "lead_organizer",
    institutionId,
    taskLabel: `Organizing contacts for ${inst.name}`,
    fn: async (ctx) => {
      ctx.task(`Finding contact details for ${inst.name}`);
      const found = {
        emails: new Set<string>(),
        mailto: new Set<string>(),
        phones: new Set<string>(),
        socials: [] as { kind: string; url: string }[],
        sites: [] as string[],
      };
      const sources: string[] = [];

      // 1) OSM tags are only a starting hint — never a trusted address.
      for (const e of [inst.email, inst.admissions_email].filter(Boolean)) {
        const n = normalizeEmail(e ?? "");
        if (n) found.emails.add(n);
      }
      if (inst.phone) found.phones.add(inst.phone);
      if (inst.email || inst.admissions_email) sources.push("osm_tag");

      // 2) PROVE the website belongs to this school. An unproven site is worse
      //    than no site at all, so it gets cleared rather than scraped.
      ctx.progress(25, "Verifying the website belongs to this school");
      let site: string | null = null;
      let siteVerified = false;
      let siteReason = "no website";
      let lastVerdict: ReturnType<typeof siteBelongsToSchool> = {
        owned: false,
        confidence: "none",
        reason: "not checked",
        domain: "",
      };

      /**
       * The state recorded on a discovered lead is frequently wrong — leads
       * with Bengaluru coordinates were stored as "Andhra Pradesh" — so the
       * coordinates are treated as the source of truth for where this school
       * actually is, and the recorded state is only a fallback.
       */
      const place = await reverseGeocode(inst.lat, inst.lon);
      const city = place.city ?? cityFromAddress(inst.address);
      const state = place.state ?? inst.state;
      if (city) sources.push("reverse_geocode");

      /**
       * A candidate URL is only ever accepted after the page has been fetched
       * and its title checked against the school name. Searching for a website
       * and then believing the result is what put cruise-line and software
       * domains into the school database.
       */
      const acceptCandidate = async (candidate: string): Promise<boolean> => {
        const probe = await fetchPage(candidate, { timeoutMs: 12000 });
        lastVerdict = siteBelongsToSchool(probe.finalUrl || candidate, inst.name, {
          pageTitle: probe.title,
          pageText: probe.text,
          state,
          address: inst.address,
        });
        return probe.ok && lastVerdict.owned;
      };

      if (inst.website) {
        const probe = await fetchPage(inst.website, { timeoutMs: 12000 });
        lastVerdict = siteBelongsToSchool(probe.finalUrl || inst.website, inst.name, {
          pageTitle: probe.title,
          pageText: probe.text,
          state,
          address: inst.address,
        });
        if (lastVerdict.owned) {
          site = probe.finalUrl || inst.website;
          siteVerified = true;
          siteReason = lastVerdict.reason;
        } else {
          siteReason = `rejected lead website ${inst.website} — ${lastVerdict.reason}`;
          updateInstitution(institutionId, { website: null, site_verified: 0, site_match_reason: siteReason });
        }
      }

      // 3) If the lead's site is not proven, go find the school's real one.
      if (!siteVerified) {
        ctx.progress(35, `Searching Google Maps and JustDial${city ? ` near ${city}` : ""}`);
        const [maps, jd] = await Promise.all([
          lookupGoogleMaps({ schoolName: inst.name, city, state, address: inst.address, lat: inst.lat, lon: inst.lon }).catch(() => null),
          lookupJustDial({ schoolName: inst.name, city, state, address: inst.address, lat: inst.lat, lon: inst.lon }).catch(() => null),
        ]);

        if (maps?.phone) {
          found.phones.add(maps.phone);
          sources.push("google_maps");
        }
        if (jd?.phone) {
          found.phones.add(jd.phone);
          sources.push("justdial");
        }
        for (const e of [...(maps?.emails ?? []), ...(jd?.emails ?? [])]) found.emails.add(e);

        /**
         * Google Places is asked first: it is the only source that returns a
         * school's own `website` field, and it answers even when every search
         * engine is bot-blocking us. It still has to clear the same live-page
         * gate, so a wrong listing cannot get through.
         */
        if (!siteVerified) {
          ctx.progress(40, "Asking Google Places for the official listing");
          const official = await findVerifiedWebsiteViaPlaces({
            schoolName: inst.name,
            city,
            state,
            address: inst.address,
            lat: inst.lat,
            lon: inst.lon,
          });
          if (official.website) {
            site = official.website;
            siteVerified = true;
            siteReason = `found via ${official.source} — ${official.reason}`;
            sources.push(official.source);
          }
        }

        // A directory may hand us the school's website directly. It is only
        // trusted after the page itself is fetched and its title confirms the
        // school — a bare domain match is exactly how angel.com and hoodi.dev
        // slipped through before.
        for (const candidate of [jd?.website, maps?.website].filter(Boolean) as string[]) {
          if (siteVerified) break;
          if (NEVER_SCRAPE.test(candidate)) continue;
          if (site && registrableDomain(candidate) === registrableDomain(site)) continue;
          if (!(await acceptCandidate(candidate))) continue;
          site = candidate;
          siteVerified = true;
          siteReason = `found via directory — ${lastVerdict.reason}`;
          break;
        }

        if (!siteVerified) {
          ctx.progress(45, "Searching the web for a provable school website");
          const hunt = await findVerifiedWebsite({
            schoolName: inst.name,
            city,
            state,
            address: inst.address,
            lat: inst.lat,
            lon: inst.lon,
          });
          if (hunt.website && (await acceptCandidate(hunt.website))) {
            site = hunt.website;
            siteVerified = true;
            siteReason = `found via ${hunt.source} — ${lastVerdict.reason}`;
            sources.push(hunt.source);
          } else if (hunt.website) {
            siteReason = `rejected ${hunt.website} — ${lastVerdict.reason}`;
          } else {
            siteReason = hunt.reason;
          }
        }
      }

      // 4) Only now do we read a page — and only the proven school site.
      if (site) {
        ctx.progress(50, `Scraping verified site ${registrableDomain(site)}`);
        const visited = new Set<string>();
        const page = await fetchPage(site);
        if (page.ok && page.$) {
          // Re-check with the live title: the strongest signal available.
          const live = siteBelongsToSchool(page.finalUrl || site, inst.name, {
            pageTitle: page.title,
            pageText: page.text,
            state,
            address: inst.address,
          });
          if (!live.owned) {
            siteVerified = false;
            siteReason = `live check failed — ${live.reason}`;
            pushOfficeEvent("warning", `⚠ ${inst.name}: ${registrableDomain(site)} failed the live ownership check`, {
              agentId: "lead_organizer",
              icon: "⚠",
            });
          } else {
            siteReason = live.reason;
            visited.add(site);
            extract(page.$, page.html, found as never, site);
            detectSocials(page.$, site, found.socials);
            sources.push("school_website");

            for (const cand of internalLinks(page.$, site)
              .filter((l) => /contact|admission|reach|campus|touch|enquir|about/i.test(l))
              .slice(0, 6)) {
              if (visited.has(cand)) continue;
              if (!sameSite(cand, site)) continue;
              visited.add(cand);
              if (!config.mockMode) await delay(config.scrapeDelayMs ?? 900);
              const sub = await fetchPage(cand);
              if (sub.ok && sub.$) {
                extract(sub.$, sub.html, found as never, cand);
                detectSocials(sub.$, cand, found.socials);
              }
              if (found.emails.size) break;
            }

            if (!found.emails.size) {
              try {
                const origin = new URL(site).origin;
                for (const path of ["/contact", "/contact-us", "/contactus", "/admissions", "/admission", "/about"]) {
                  const cand = origin + path;
                  if (visited.has(cand)) continue;
                  visited.add(cand);
                  if (!config.mockMode) await delay(600);
                  const sub = await fetchPage(cand, { timeoutMs: 12000 });
                  if (sub.ok && sub.$) extract(sub.$, sub.html, found as never, cand);
                  if (found.emails.size) break;
                }
              } catch {
                /* malformed website URL — skip probing */
              }
            }
          }
        }
      }

      ctx.progress(65, `Candidate emails: ${found.emails.size}, phones: ${found.phones.size}`);

      // 5) The sendability gate. Ownership of the domain is now mandatory, so an
      //    address harvested from an unrelated site can never be selected.
      const siteDomain = site ? registrableDomain(site) : null;
      const ctxObj: EmailContext = { siteDomain, schoolName: inst.name, fromMailto: false };

      const mailtoValidated: string[] = [];
      const htmlValidated: string[] = [];
      for (const e of found.emails) {
        if (isJunkEmail(e)) continue;
        const fromMailto = found.mailto.has(e);
        const gate = isSendableEmail(e, { ...ctxObj, fromMailto, siteVerified });
        if (gate.ok) (fromMailto ? mailtoValidated : htmlValidated).push(e);
      }

      const merge = (arr: string[]) => [...new Set(arr)];
      const mailtoList = merge(mailtoValidated);
      const htmlList = merge(htmlValidated);

      const finalEmail = rankAdmissionsEmail([...mailtoList, ...htmlList]);

      const cleanPhone = [...found.phones].map((p) => p.replace(/[^\d+]/g, "")).find((p) => /^(\+91|91)?[6-9]\d{9}$/.test(p)) ?? null;
      const phone = cleanPhone || inst.phone || null;

      // Only a proven site may be stored. Keeping an unproven URL around is what
      // let a wrong domain masquerade as a school's site on the next run.
      const finalSite = siteVerified ? site : null;

      // Provenance must describe how *this address* was found, not how the site
      // was found — an address taken from the school's own contact page is not
      // the same thing as one lifted from an OSM tag.
      const emailSource = finalEmail
        ? mailtoList.includes(finalEmail)
          ? "school_website"
          : htmlList.includes(finalEmail)
            ? sources.includes("school_website")
              ? "school_website"
              : "verified_school_site"
            : "osm_tag"
        : null;

updateInstitution(institutionId, {
        email: finalEmail,
        admissions_email: finalEmail,
        phone,
        whatsapp_available: phone ? 1 : 0,
        website: finalSite,
        site_verified: siteVerified ? 1 : 0,
        site_match_reason: siteReason,
        contact_source: emailSource,
        website_up: found.sites.length ? 1 : inst.website_up,
        verified_contact: finalEmail ? 1 : 0,
        ...(city ? { city } : {}),
      });

      saveAgentOutput("lead_organizer", institutionId, {
        emails: [...mailtoList, ...htmlList],
        rejected: [...found.emails].filter((e) => !mailtoList.includes(e) && !htmlList.includes(e)),
        mailto: [...found.mailto],
        phones: [...found.phones],
        socials: found.socials,
        sites: found.sites,
        siteVerified,
        siteReason,
        sources,
        finalEmail,
      });

      if (finalEmail) {
        pushOfficeEvent("organize", `🗂️ ${inst.name}: ${finalEmail} (${sources[0] ?? "school site"})`, {
          agentId: "lead_organizer",
          icon: "🗂️",
          data: { site, siteReason },
        });
        ctx.progress(100, `Contact verified for ${inst.name}${already ? " (refreshed)" : ""}`);
      } else {
        setStage(institutionId, "done", "ready", "lead_organizer");
        pushOfficeEvent("step", `⏭️ Skipped ${inst.name} — no provable email (${siteReason})`, {
          agentId: "lead_organizer",
          icon: "⏭️",
        });
        logAgent("lead_organizer", `Skipped ${inst.name}: ${siteReason}`, { institutionId });
        ctx.progress(100, `Skipped ${inst.name} — no provable email`);
      }
    },
  });
}

/** Keep scraping inside the school's own domain. */
/** Best-effort city from a free-text address, used when geocoding is unavailable. */
function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = /,\s*([A-Za-z][A-Za-z .'-]{2,40}?)(?:,|\s-\s|$)/.exec(address);
  return m ? m[1].trim() : null;
}

function sameSite(candidate: string, site: string): boolean {
  try {
    return registrableDomain(new URL(candidate).hostname) === registrableDomain(new URL(site).hostname);
  } catch {
    return false;
  }
}

function detectSocials($: CheerioAPI, url: string, out: { kind: string; url: string }[]) {
  if (!$) return;
  const kinds: Record<string, RegExp> = {
    instagram: /instagram\.com/,
    facebook: /facebook\.com/,
    linkedin: /linkedin\.com/,
    youtube: /youtube\.com/,
  };
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    for (const [kind, re] of Object.entries(kinds)) {
      if (re.test(href)) {
        out.push({ kind, url: href });
        return;
      }
    }
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}