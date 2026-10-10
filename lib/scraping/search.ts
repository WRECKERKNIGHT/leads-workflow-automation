import { fetchPage } from "./web";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: "ddg" | "bing";
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Free, no-API-key web search (DuckDuckGo HTML + Bing HTML fallback).
 * Used by the Lead Organizer to find contact pages, JustDial / Google Maps
 * listings and admissions emails for schools that lack an OSM website tag.
 */
export async function webSearch(query: string, max = 6): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  const seen = new Set<string>();

  const push = (r: SearchResult) => {
    if (seen.has(r.url)) return;
    if (!/^(https?:)/i.test(r.url)) return;
    // Skip obvious noise.
    if (/javascript:|google\.com\/search|w3\.org|wikipedia\.org\/(?:Search|Free)?/.test(r.url)) return;
    seen.add(r.url);
    out.push(r);
  };

  // 1) DuckDuckGo HTML (no key, no JS).
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) {
      const html = (await res.text()).slice(0, 400_000);
      const blocks = html.split(/class="result__body"/g).slice(1);
      for (const b of blocks.slice(0, 8)) {
        const url = /result__a[^>]*href="([^"?]+)/.exec(b)?.[1];
        const title = /result__a[^>]*>\s*([^<]+)/.exec(b)?.[1];
        const snippet = /result__snippet[^>]*>\s*([\s\S]*?)<\/a>/.exec(b)?.[1]?.replace(/<[^>]+>/g, "").trim();
        if (url) push({ title: decode(title ?? url), url: decode(url), snippet: decode(snippet ?? ""), source: "ddg" });
      }
    }
  } catch {
    /* fall through to bing */
  }

  // 2) Bing HTML (fallback when DDG yields nothing).
  if (out.length < 4) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res2 = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`, {
        headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res2.ok) {
        const html = (await res2.text()).slice(0, 500_000);
        const blocks = html.split('<li class="b_algo"').slice(1);
        for (const b of blocks.slice(0, 8)) {
          const rawUrl = /<a href="([^"]+)"[^>]*h="ID=SERP/.exec(b)?.[1] ?? /<a href="(https?:\/\/[^"]+)"/.exec(b)?.[1];
          const title = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(b)?.[1]?.replace(/<[^>]+>/g, "").trim();
          const snippet = /<p[^>]*>([\s\S]*?)<\/p>/.exec(b)?.[1]?.replace(/<[^>]+>/g, "").trim();
          if (rawUrl) push({ title: decode(title ?? rawUrl), url: decode(rawUrl), snippet: decode(snippet ?? ""), source: "bing" });
        }
        // Fallback: Bing's <cite> elements reliably expose the result domains.
        if (out.length < 4) {
          const cites = [...html.matchAll(/<cite[^>]*>([\s\S]*?)<\/cite>/g)].map((m) =>
            m[1].replace(/<[^>]+>/g, "").trim()
          );
          for (const c of cites.slice(0, 10)) {
            const domain = c.split(/\s|\u203a|›|\/›/)[0].trim();
            if (!domain) continue;
            const url = domain.startsWith("http") ? domain : `https://${domain}`;
            push({ title: domain, url, snippet: "", source: "bing" });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return out.slice(0, max);
}

export interface Listing {
  source: string;
  phone?: string;
  email?: string;
  website?: string;
}

/**
 * Try to pull structured contact info out of a JustDial / Google Maps /
 * school-directory listing page. Best-effort regex extraction.
 */
export async function scrapeListing(url: string, source: string): Promise<Listing | null> {
  try {
    const page = await fetchPage(url, { timeoutMs: 15000 });
    if (!page.ok || !page.$) return null;
    const html = page.html.slice(0, 250_000);

    const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRe = /(?:\+?91[\s-]?)?(?:\(?\d{3,5}\)?[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}/g;
    const emails = new Set<string>();
    for (const m of html.matchAll(emailRe)) {
      const e = m[0].toLowerCase();
      if (!/png|jpe?g|gif|svg|example|sentry|\.js@|wixpress/.test(e)) emails.add(e);
    }
    let phone: string | undefined;
    for (const m of html.matchAll(phoneRe)) {
      const digits = m[0].replace(/\D/g, "").slice(-10);
      if (/^[6-9]\d{9}$/.test(digits)) {
        phone = "+91 " + digits;
        break;
      }
    }

    let website: string | undefined;
    const $ = page.$;
    const wsHref = $('a[href^="http"]')
      .filter((_, el) => /website|visit site|www\./i.test($(el).text()))
      .first()
      .attr("href");
    if (wsHref && wsHref !== url) website = wsHref;

    if (!emails.size && !phone && !website) return null;
    return { source, phone, email: [...emails][0], website };
  } catch {
    return null;
  }
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s).replace(/[/]>+$/g, "").trim();
  } catch {
    return s;
  }
}