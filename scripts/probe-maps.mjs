const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const q = "Radiant School Guwahati Assam";
const url = `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" } });
const html = await res.text();
console.log("len", html.length, "status", res.status);

// The place payload lives in APP_INITIALIZATION as a big escaped JS array.
const idx = html.indexOf("APP_INITIALIZATION");
console.log("APP_INITIALIZATION at", idx);
const blob = html.slice(idx, idx + 400000);

// Look for the fields Google uses for a place card.
const probes = [
  ["phone (intl)", /\[\[\["[^"]*","[^"]*"\],\"([\d\s+()-]{9,20})\"\]/g],
  ["website", /\"(https?:\/\/(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}[^\"\\]*)\"/gi],
  ["rating", /\"([0-9]\.[0-9]),[0-9]{3,},\"/g],
  ["addr", /\"([0-9]{1,4}\s+[A-Za-z][^\"]{5,60}(?:Road|nagar|street|lane)[^\"]{0,40})\"/gi],
  ["tel link", /tel:([+\d\s()-]{9,20})/g],
];
for (const [name, re] of probes) {
  const m = [...blob.matchAll(re)].slice(0, 6).map((x) => x[1]);
  console.log(`${name}: ${m.length} -> ${JSON.stringify(m.slice(0, 5))}`);
}

// Places embedded as a JSON array of arrays: find the school name to anchor.
const nameHit = blob.indexOf("Radiant");
console.log("\nname 'Radiant' at", nameHit);
if (nameHit > 0) console.log("context:", JSON.stringify(blob.slice(Math.max(0, nameHit - 300), nameHit + 700)));
