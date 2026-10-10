import { getInstitution, listInboxThreads, markThreadClassified, pushOfficeEvent, updateInstitution, logAgent } from "@/lib/db/repo";
import { complete } from "@/lib/llm/openrouter";
import type { ReplyClassification } from "@/agents/types";
import { REPLY_CLASSIFICATION_LABELS } from "@/agents/types";
import { config } from "@/lib/config";

/**
 * Reply Manager — reads inbound replies and classifies them
 * (Interested / Needs info / Not interested / Wrong contact / Unclear),
 * then flags the folder for a human follow-up.
 */
export async function classifyReply(threadId: number): Promise<ReplyClassification | null> {
  const thread = listInboxThreads(200).find((t) => t.id === threadId);
  if (!thread || !thread.last_body) return null;

  const inst = thread.institution_id ? getInstitution(thread.institution_id) : null;

  const classification = await classify(thread.last_body);
  markThreadClassified(threadId, classification);
  updateInstitution(thread.institution_id, {
    stage: "reply",
    folder_status: classification === "not_interested" ? "needs_human" : "in_progress",
    last_agent: "reply_manager",
  });

  const label =
    REPLY_CLASSIFICATION_LABELS[classification as ReplyClassification] ??
    REPLY_CLASSIFICATION_LABELS.unclear;

  pushOfficeEvent("classify", `📱 Reply classified: ${label}${inst ? ` · ${inst.name}` : ""}`, {
    agentId: "reply_manager",
    icon: "📱",
    data: { classification },
  });
  logAgent("reply_manager", `Classified thread #${threadId} → ${classification}`, { institutionId: inst?.id });

  return classification as ReplyClassification;
}

const OPTIONS: ReplyClassification[] = ["interested", "curious", "not_interested", "wrong_contact", "unclear"];

async function classify(body: string): Promise<ReplyClassification> {
  if (config.mockMode || !config.openrouterApiKey) {
    if (/yes|interested|price|pricing|quote|demo|call|meeting|more info|thank you for reaching/i.test(body)) return "interested";
    if (/maybe|not sure|tell me more|how much|cost/i.test(body)) return "curious";
    if (/no|not interested|remove|don't|stop/i.test(body)) return "not_interested";
    return "unclear";
  }

  try {
    const out = await complete(
      [
        {
          role: "system",
          content:
            "You classify email replies from school administrators about a school-management demo pitch. Answer with exactly one JSON token: interested, curious, not_interested, wrong_contact, or unclear.",
        },
        { role: "user", content: `Reply from institution:\n"""${body.slice(0, 1200)}"""\nOptions: ${OPTIONS.join(", ")}` },
      ],
      { temperature: 0 }
    );
    const token = out.text.trim().toLowerCase();
    const match = OPTIONS.find((o) => token.includes(o));
    return match ?? "unclear";
  } catch {
    return "unclear";
  }
}

/** Schedule a real follow-up run for any unhandled classified threads. */
export async function processUnclassified() {
  const threads = listInboxThreads(200).filter((t) => t.classification === null && (t.kind ?? "reply") === "reply");
  for (const t of threads.slice(0, 5)) {
    await classifyReply(t.id);
  }
  return threads.length;
}