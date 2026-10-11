import type { AgentStatus, Stage } from "@/agents/types";
import { PIPELINE_STAGES, AGENT_DEPARTMENT } from "@/agents/types";

export const STAGE_ORDER: Stage[] = [...PIPELINE_STAGES];

export const STAGE_META: Record<Stage, { name: string; short: string; icon: string; accent: string; text: string; hex: string }> = {
  discovery: { name: "Discovery", short: "Discovery", icon: "🔍", accent: "border-emerald-400/40", text: "text-emerald-300", hex: "#10b981" },
  organizer: { name: "Lead Organizer", short: "Organize", icon: "🗂️", accent: "border-sky-400/40", text: "text-sky-300", hex: "#38bdf8" },
  research: { name: "Research", short: "Research", icon: "🎯", accent: "border-violet-400/40", text: "text-violet-300", hex: "#a78bfa" },
  opportunity: { name: "Opportunity", short: "Opportunity", icon: "🚀", accent: "border-amber-400/40", text: "text-amber-300", hex: "#fbbf24" },
  demo: { name: "Demo Build", short: "Demo", icon: "🎬", accent: "border-cyan-400/40", text: "text-cyan-300", hex: "#22d3ee" },
  message: { name: "Message", short: "Message", icon: "💬", accent: "border-orange-400/40", text: "text-orange-300", hex: "#fb923c" },
  sent: { name: "Sent", short: "Sent", icon: "📤", accent: "border-emerald-400/40", text: "text-emerald-300", hex: "#34d399" },
  reply: { name: "Replies", short: "Replies", icon: "📨", accent: "border-rose-400/40", text: "text-rose-300", hex: "#fb7185" },
  done: { name: "Completed", short: "Done", icon: "✅", accent: "border-emerald-400/40", text: "text-emerald-300", hex: "#34d399" },
};

export const AGENT_STATUS: Record<AgentStatus, { label: string; dot: string; hex: string }> = {
  working: { label: "🟢 Working", dot: "bg-emerald-500", hex: "#22c55e" },
  thinking: { label: "🔵 Thinking", dot: "bg-sky-500", hex: "#38bdf8" },
  waiting: { label: "🟡 Waiting", dot: "bg-amber-500", hex: "#fbbf24" },
  error: { label: "🔴 Error", dot: "bg-rose-500", hex: "#f43f5e" },
  reviewing: { label: "🟠 Reviewing", dot: "bg-orange-500", hex: "#fb923c" },
  needs_human: { label: "🟣 Needs Human", dot: "bg-violet-500", hex: "#a78bfa" },
  offline: { label: "Offline", dot: "bg-gray-600", hex: "#64748b" },
};

export const FOLDER_STATUS: Record<string, { label: string; dot: string; text: string }> = {
  ready: { label: "Ready", dot: "bg-emerald-500", text: "text-emerald-400" },
  in_progress: { label: "In Progress", dot: "bg-sky-500", text: "text-sky-400" },
  awaiting_approval: { label: "⚠ Needs Approval", dot: "bg-amber-500", text: "text-amber-400" },
  error: { label: "Error", dot: "bg-rose-500", text: "text-rose-400" },
  needs_human: { label: "Needs Human", dot: "bg-violet-500", text: "text-violet-400" },
};

export const AGENT_NAMES: Record<string, string> = {
  lead_finder: "Lead Finder",
  lead_organizer: "Lead Organizer",
  research_agent: "Research Agent",
  opportunity_finder: "Opportunity Finder",
  demo_builder: "Demo Builder",
  message_writer: "Message Writer",
  email_sender: "Email Sender",
  reply_manager: "Reply Manager",
};

export const AGENT_ICONS: Record<string, string> = {
  lead_finder: "🔍",
  lead_organizer: "🗂️",
  research_agent: "🕵️",
  opportunity_finder: "🚀",
  demo_builder: "🎬",
  message_writer: "💬",
  email_sender: "📤",
  reply_manager: "📨",
};

export function departmentOf(agentId: string): "Sales" | "Tech" {
  return AGENT_DEPARTMENT[agentId as keyof typeof AGENT_DEPARTMENT] === "tech" ? "Tech" : "Sales";
}

export function elapsedSince(iso: string | null): string {
  if (!iso) return "—";
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function timeStr(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return sameDay ? t : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${t}`;
}

export function shorten(n: string | null, max = 22): string {
  if (!n) return "—";
  return n.length > max ? n.slice(0, max - 1) + "…" : n;
}

export function host(u: string | null): string {
  if (!u) return "—";
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export function yesNo(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v ? "✓ Yes" : "✗ No";
}