import dns from "node:dns/promises";
import net from "node:net";

/** Resolve a domain's MX records, best-effort. */
async function mxFor(domain) {
  try {
    const recs = await dns.resolveMx(domain);
    if (recs?.length) {
      return recs.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    }
  } catch {
    /* fall through to A record */
  }
  try {
    await dns.resolve4(domain);
    return [domain];
  } catch {
    return [];
  }
}

/**
 * Ask the receiving mail server whether a mailbox exists, using SMTP RCPT TO.
 * Never sends DATA — no message is ever transmitted or delivered.
 */
function rcptProbe(host, address, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: 25 });
    let stage = "connect";
    let buf = "";
    let from = "verify@wreckerai.in";
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve({ host, ...result });
    };
    const timer = setTimeout(() => finish({ code: null, accepted: null, error: "timeout" }), timeoutMs);

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const raw of lines) {
        const code = Number(raw.slice(0, 3));
        const text = raw.slice(4);
        if (stage === "connect" && code === 220) {
          stage = "helo";
          socket.write("HELO verifier.wreckerai.in\r\n");
        } else if (stage === "helo" && code === 250) {
          stage = "mail";
          socket.write(`MAIL FROM:<${from}>\r\n`);
        } else if (stage === "mail" && code === 250) {
          stage = "rcpt";
          socket.write(`RCPT TO:<${address}>\r\n`);
        } else if (stage === "rcpt") {
          if (code === 250 || code === 251) {
            clearTimeout(timer);
            finish({ code, accepted: true, smtp: text });
          } else if (code === 550 || code === 551 || code === 553 || code === 552) {
            clearTimeout(timer);
            finish({ code, accepted: false, smtp: text });
          } else if (code >= 400) {
            clearTimeout(timer);
            finish({ code, accepted: null, smtp: text });
          }
        }
      }
    });
    socket.on("error", (e) => {
      clearTimeout(timer);
      finish({ code: null, accepted: null, error: e.message });
    });
  });
}

const targets = [
  "info@radiant.edu.in",
  "admissions@radiant.edu.in",
  "definitely-not-a-real-mailbox-99871@radiant.edu.in",
  "harshithardik312@gmail.com",
  "zzz-nonexistent-abcxyz123@gmail.com",
  "info@trbseniorsecondaryschool.com",
  "hello@poki.com",
];

for (const addr of targets) {
  const domain = addr.split("@")[1];
  const mx = await mxFor(domain);
  if (!mx.length) {
    console.log(`${addr}\n   -> NO MX (domain does not accept mail)\n`);
    continue;
  }
  const r = await rcptProbe(mx[0], addr);
  const verdict = r.error ? `ERROR ${r.error}` : r.accepted === true ? "EXISTS" : r.accepted === false ? "REJECTED" : "UNKNOWN";
  console.log(`${addr}\n   mx=${mx[0]} code=${r.code} -> ${verdict}${r.smtp ? ` (${r.smtp.slice(0, 60)})` : ""}\n`);
}
