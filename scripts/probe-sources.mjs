const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function probe(label, url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9", ...(opts.headers ?? {}) },
      redirect: "follow",
    });
    const body = await res.text();
    const emails = [...new Set((body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).map((s) => s.toLowerCase()))].filter(
      (e) => !/\.(png|jpg|jpeg|gif|svg|js)$/i.test(e) && !/^xpert|@2x|@3x|wixpress|sentry/i.test(e)
    );
    const phones = [...new Set((body.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s.-]?\d{5}/g) ?? []))];
    console.log(`\n### ${label}`);
    console.log(`  ${res.status} len=${body.length} final=${res.url.slice(0, 110)}`);
    console.log(`  emails(${emails.length}): ${emails.slice(0, 6).join(", ") || "-"}`);
    console.log(`  phones(${phones.length}): ${phones.slice(0, 6).join(", ") || "-"}`);
    // JustDial embeds listings in JSON-ish blobs; look for the marker.
    console.log(`  markers: jd-track=${/jd-?track|JustDial Data/i.test(body)} store=${/"storeDetail"|\\"storeName\\"/i.test(body)}`);
    return { body, final: res.url };
  } catch (e) {
    console.log(`\n### ${label}\n  ERROR ${e.message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

await probe("JD guwahati schools list", "https://www.justdial.com/Guwahati/Schools/1");
await probe("JD search q", "https://www.justdial.com/Guwahati/Search/School");
await probe("JD deeplink", "https://www.justdial.com/Guwahati/Schools/103410/1");
await probe("GOOGLE pb endpoint", "https://www.google.com/maps/preview/search?q=" + encodeURIComponent("Radiant School Guwahati"));
await probe("GOOGLE place data", "https://www.google.com/maps/place/Radiant+School+Guwahati/data=!4m2!4m1!1s0:0x0:0x0");
