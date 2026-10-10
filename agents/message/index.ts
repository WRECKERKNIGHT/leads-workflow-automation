import { runAgentTask } from "@/lib/agents/runner";
import { getInstitution, updateInstitution, addToOutreachQueue, pushOfficeEvent, saveAgentOutput, listDemos } from "@/lib/db/repo";
import { complete } from "@/lib/llm/openrouter";
import { AGENCY_BRAND, OFFER_SUMMARY } from "@/agents/types";
import { config } from "@/lib/config";

/**
 * Message Writer — generates a personalized, evidence-based email using the
 * research + demo facts sheet + the WreckerAI student profile. Never invents
 * claims the research didn't verify. Lands in the approval queue.
 */
export async function runMessageWriter(institutionId: number): Promise<void> {
  const inst = getInstitution(institutionId);
  if (!inst) return;

  const demos = listDemos(50).find((d) => d.institution_id === institutionId);
  const demoBody = demos?.body ?? "";

  await runAgentTask({
    agentId: "message_writer",
    institutionId,
    taskLabel: `Writing message for ${inst.name}`,
    fn: async (ctx) => {
      ctx.progress(30, "Drafting personalized message");

      const observations = [
        inst.website_up ? `We saw the public website at ${inst.website}.` : "We could not find an accessible public website.",
        inst.app_status === "app_not_found" ? "We did not find a matching official app in public app-store searches." : `App status: ${inst.app_status}.`,
        inst.mobile_friendly === 0 ? "The website does not appear optimized for mobile phones." : null,
        inst.has_admission_form === 0 ? "We did not see an online admission/enquiry form." : null,
      ].filter(Boolean).join(" ");

      const contactName = inst.principal_name ?? inst.owner_name ?? null;
      const greeting = contactName ? `Dear ${contactName},` : "Hello,";

      const prompt = [
        `You are ${AGENCY_BRAND.name}, a student developer. You are writing outreach to a ${inst.category ?? "local business"} named ${inst.name}.`,
        `Write a short, warm, honest, personalized outreach email (max 140 words). Tone: modest student, no hype, no unverified claims.`,
        ``,
        `PRICING — state it exactly like this, never any other figure:`,
        `${OFFER_SUMMARY}.`,
        `Rs 50,000 is a ONE-TIME setup fee, NOT a per-year price. The only recurring amount is Rs 2,000 per year for maintenance.`,
        `Never write "50,000 per year", "₹50,000/year" or any yearly price above Rs 2,000.`,
        ``,
        `Use these VERIFIED observations only: ${observations}.`,
        `Reference a short personalised demo preview you put together for ${inst.name}.`,
        ``,
        `Available facts sheet for context (do NOT repeat it all):`,
        demoBody.slice(0, 1500),
        ``,
        `Format the reply with a "Subject:" line on the first line, a blank line, then the body starting with "${greeting}".`,
        `Sender sign-off: ${config.senderName} — ${config.senderRole}.`,
      ].join("\n");

      let subject = `A simple digital concept for ${inst.name}`;
      let body = "";

      if (config.mockMode || !config.openrouterApiKey) {
        body = [
          greeting,
          "",
          `I'm ${config.senderName}, ${config.senderRole}.`,
          "",
          observations,
          "",
          `I put together a short demonstration of a simple digital package for ${inst.name} and would love to walk you through it.`,
          ``,
          `It costs ${OFFER_SUMMARY} — a one-time setup, and the only yearly charge is maintenance.`,
          ``,
          `Would you be open to a quick look?`,
          "",
          `Warm regards,`,
          `[${config.senderName} — ${config.senderRole}]`,
        ].join("\n");
      } else {
        try {
          const out = await complete([{ role: "user", content: prompt }], { temperature: 0.7, maxTokens: 600 });
          const text = out.text.trim();
          const subjMatch = /^subject:\s*(.+?)\s*(?:$|[\r\n]+)/i.exec(text);
          if (subjMatch) subject = (subjMatch[1]).replace(/^["']|["']$/g, "");
          body = text.replace(/^subject:\s*[^\r\n]+\s*/i, "").trim();
        } catch {
          body = [
            greeting,
            "",
            `I'm ${config.senderName}, ${config.senderRole}.`,
            "",
            observations,
            "",
            `I prepared a short demonstration of a simple digital package for ${inst.name}.`,
            `It costs ${OFFER_SUMMARY}.`,
            ``,
            `Would you like to take a look?`,
            "",
            `Regards, ${config.senderName}`,
          ].join("\n");
        }
      }

      addToOutreachQueue(institutionId, "email", subject, body);
      updateInstitution(institutionId, { message_subject: subject, message_body: body, stage: "message", folder_status: "awaiting_approval", research_notes: demos?.body ?? null });

      saveAgentOutput("message_writer", institutionId, { subject, body, demo: demos?.id ?? null });

      pushOfficeEvent("draft", `📧 Email drafted for ${inst.name} → awaiting approval`, {
        agentId: "message_writer",
        icon: "📧",
      });
      ctx.progress(100, "Message drafted — awaiting human approval");
    },
  });
}