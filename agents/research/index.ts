import { runAgentTask } from "@/lib/agents/runner";
import { getInstitution, updateInstitution, pushOfficeEvent, saveAgentOutput, pushPipelineEvent } from "@/lib/db/repo";
import { fetchPage } from "@/lib/scraping/web";
import type { AppStatus } from "@/agents/types";
import { config } from "@/lib/config";

/**
 * Research agent — audits a school's digital presence.
 * Answers "do they even have a website?" and "do they have an app?" so we pitch
 * EduSuite Pro only to schools that actually lack modern digital presence.
 */
export async function runResearchAgent(institutionId: number): Promise<void> {
  const inst = getInstitution(institutionId);
  if (!inst) return;

  await runAgentTask({
    agentId: "research_agent",
    institutionId,
    taskLabel: `Researching ${inst.name}`,
    fn: async (ctx) => {
      if (!inst.website) {
        pushPipelineEvent(institutionId, "research.no_website", { toStage: "research", agentId: "research_agent" });
        updateInstitution(institutionId, {
          website_up: 0,
          app_status: "app_not_found",
          research_confidence: "High",
          research_notes: "No website found in OpenStreetMap data.",
        });
        pushOfficeEvent("research", `🔍 ${inst.name}: NO website`, { agentId: "research_agent", icon: "🔍" });
        ctx.progress(100, "No website — flagged as opportunity");
        return;
      }

      ctx.progress(25, "Fetching website");
      const page = await fetchPage(inst.website, { timeoutMs: 20000 });
      if (!page.ok || !page.$) {
        updateInstitution(institutionId, {
          website_up: 0,
          app_status: "app_not_found",
          research_confidence: "Low",
          research_notes: `Website unreachable (${page.status}).`,
        });
        ctx.progress(100, "Website down — checked sources: website");
        return;
      }

      const $ = page.$;
      const html = page.html.toLowerCase();
      const viewport = (page.html.match(/<meta[^>]+name="viewport"[^>]*>/i) ?? [null])[0];
      const mobileFriendly = viewport ? 1 : 0;
      const hasAdmissionForm = /admission|enquiry|apply now|online form|register/i.test(
        page.html.slice(0, 400_000)
      ) && /<(form|button)[^>]*/i.test(page.html);
      const hasFeePayment = /fee|payment|pay online|upi/i.test(html);
      const hasChatbot = /chatbot|whatsapp float|tawk|tidio|intercom/i.test(html);
      const socialActive =
        $("a[href*='facebook.com'],a[href*='instagram.com'],a[href*='youtube.com']").length > 0 ? 1 : 0;
      const httpsSecure = inst.website?.startsWith("https://") ? 1 : 0;

      ctx.progress(55, "Checks: HTTPS, mobile, admission form, fees, chatbot, socials");

      // App availability — search Play Store via public search pages.
      const appStatus = await checkAppStatus(inst.name, ctx);

      updateInstitution(institutionId, {
        website_up: 1,
        https_secure: httpsSecure,
        mobile_friendly: mobileFriendly,
        app_status: appStatus.status,
        app_evidence: appStatus.evidence ?? null,
        sources_checked: appStatus.sources.join(", ") || null,
        research_confidence: "High",
        has_admission_form: hasAdmissionForm ? 1 : 0,
        has_fee_payment: hasFeePayment ? 1 : 0,
        has_chatbot: hasChatbot ? 1 : 0,
        social_active: socialActive,
        research_notes: `Title: ${page.title ?? "?"} · ${mobileFriendly ? "mobile-friendly" : "not mobile-optimized"} · ${httpsSecure ? "HTTPS" : "HTTP"}.`,
      });

      saveAgentOutput("research_agent", institutionId, {
        title: page.title,
        status: page.status,
        url: page.finalUrl,
        mobileFriendly,
        hasAdmissionForm,
        hasFeePayment,
        hasChatbot,
        socialActive,
        appStatus,
      });

      pushOfficeEvent("research", `🔍 ${inst.name}: app=${appStatus.status} · mobile=${mobileFriendly ? "yes" : "NO"}`, {
        agentId: "research_agent",
        icon: "🔍",
      });
      ctx.progress(100, `Research complete — ${appStatus.status}`);
    },
  });
}

interface AppCheckResult {
  status: AppStatus;
  evidence?: string;
  sources: string[];
}

async function checkAppStatus(
  name: string,
  ctx: { progress: (p: number, m?: string) => void }
): Promise<AppCheckResult> {
  const sources: string[] = [];
  ctx.progress(70, "Checking app stores");

  // 1. iTunes search API (free, keyless) — covers iOS side via searches.
  try {
    const itunes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(name + " school app")}&entity=software&limit=5`);
    if (itunes.ok) {
      const json = (await itunes.json()) as { resultCount: number; results: { trackName: string; sellerName: string }[] };
      const hit = json.results.find(
        (r) =>
          r.trackName.toLowerCase().includes("school") &&
          (r.trackName.toLowerCase().includes("parent") || r.trackName.toLowerCase().includes("student") || r.trackName.toLowerCase().includes("erp"))
      );
      sources.push("Apple App Store");
      if (hit) {
        return { status: "app_found", evidence: hit.trackName, sources };
      }
    }
  } catch {
    // ignore
  }

  // 2. Google Play search via the public JSON-ish search page.
  try {
    const play = await fetch(`https://play.google.com/store/search?q=${encodeURIComponent(name + " school app")}&c=apps`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (play.ok) {
      const text = await play.text();
      sources.push("Google Play");
      const appCard = /<a[^>]+href="\/store\/apps\/details[^"]*"[^>]*>([\s\S]*?)<\/a>/i.exec(text);
      const titleMatch = appCard ? /[A-Z][^<]{3,60}/.exec(appCard[1]) : null;
      if (titleMatch && /school|erp|parent|student/i.test(titleMatch[0])) {
        return { status: "app_found", evidence: titleMatch[0].trim(), sources };
      }
      if (!/no results|didn't match/i.test(text)) {
        return { status: "app_possible", sources };
      }
    }
  } catch {
    // ignore
  }

  return { status: "app_not_found", sources };
}