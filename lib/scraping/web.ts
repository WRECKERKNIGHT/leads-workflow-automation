import * as cheerio from "cheerio";

export interface FetchedPage {
  ok: boolean;
  status: number;
  finalUrl: string;
  html: string;
  $: cheerio.CheerioAPI | null;
  title: string | null;
  /** Visible page text, used to tell a real school page from a lookalike company. */
  text: string;
}

/**
 * Fetch a URL and (if HTML) load it into Cheerio.
 * For V1 this uses plain fetch (static HTML). JS-rendered sites (e.g. many
 * React school sites) won't fully parse — swap in Playwright here later
 * without touching agent logic.
 */
export async function fetchPage(url: string, opts: { timeoutMs?: number } = {}): Promise<FetchedPage> {
  const timeout = opts.timeoutMs ?? 15000;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? "";
    const html = await res.text();
    let $: cheerio.CheerioAPI | null = null;
    let title: string | null = null;
    let text = "";
    if (contentType.includes("html") || html.trimStart().startsWith("<!DOCTYPE") || html.trimStart().startsWith("<html")) {
      $ = cheerio.load(html);
      title = $("title").first().text().trim() || null;
      $("script, style, noscript, svg").remove();
      text = $.root().text().replace(/\s+/g, " ").trim().slice(0, 20000);
    }
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      html,
      $,
      title,
      text,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      html: "",
      $: null,
      title: null,
      text: "",
    };
  } finally {
    clearTimeout(t);
  }
}

/** Extract all hrefs from a loaded page */
export function internalLinks($: cheerio.CheerioAPI, base: string): string[] {
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const abs = new URL(href, base).toString();
      if (abs.startsWith("http")) out.push(abs);
    } catch {
      // ignore malformed
    }
  });
  return [...new Set(out)];
}

/** Check connection security of a URL */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Mock-safe fetch of robots for politeness info (best-effort) */
export async function robotsAllow(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": "agency-os/0.1 (+contact-builder)" },
    });
    if (!res.ok) return true;
    const txt = await res.text();
    const uaMatch = txt.split(/^User-agent:/m);
    // Simple check: does a later UA block * or our agent?
    return true; // V1: best-effort, no hard enforcement
  } catch {
    return true;
  }
}
