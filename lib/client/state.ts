import { useEffect, useRef, useState } from "react";

export interface AgencyState {
  stats: {
    agentsOnline: number;
    agentsWorking: number;
    agentsThinking: number;
    agentsWaiting: number;
    agentsError: number;
    agentsReviewing: number;
    agentsNeedsHuman: number;
    totalLeads: number;
    leadsToday: number;
    sent: number;
    pendingApproval: number;
    demos: number;
    byStage: Record<string, number>;
    byCategory: Record<string, number>;
    replies: { replies: number; interested: number; curious: number; notInterested: number; wrongContact: number; unclear: number };
    noWebsite: number;
    noApp: number;
    mobilePoor: number;
    highPriorityOpportunities: number;
  };
  smtp?: { configured: boolean; host: string; fromEmail: string; senderName: string };
  institutions: any[];
  agentRuns: any[];
  logs: any[];
  pipelineEvents: any[];
  officeEvents: any[];
  missions: any[];
  outreach: any[];
  demos: any[];
  appointments: any[];
  inbox: any[];
  cursor: number;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let latest: AgencyState | null = null;
let loading = false;

function broadcast() {
  for (const l of listeners) l();
}

export async function refreshState(): Promise<AgencyState | null> {
  loading = true;
  try {
    const res = await fetch(`/api/state?since=${latest?.cursor ?? 0}`, { cache: "no-store" });
    const data = (await res.json()) as AgencyState;
    latest = data;
    broadcast();
    return data;
  } catch {
    return latest;
  } finally {
    loading = false;
  }
}

export function startPolling(intervalMs = 1500) {
  if (pollTimer) return;
  const tick = async () => {
    await refreshState();
    pollTimer = setTimeout(tick, intervalMs);
  };
  tick();
}

export function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export function useAgencyState(): AgencyState | null {
  const [, force] = useState(0);

  useEffect(() => {
    const handler = () => force((n) => n + 1);
    listeners.add(handler);
    if (!latest) refreshState();
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return latest;
}

export { latest as currentState };