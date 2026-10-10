"use client";

import { useCallback, useEffect, useState } from "react";

/** Payload of GET /api/workflow — every number the workflow board shows. */
export interface WorkflowPayload {
  workflow: {
    stages: {
      key: string;
      label: string;
      count: number;
      sitting: number;
      blocked: number;
      note: string;
    }[];
    totals: Record<string, number>;
    emailHealth: {
      mailbox: Record<string, number>;
      sources: Record<string, number>;
      domains: { domain: string; count: number }[];
    };
    funnel: { label: string; value: number }[];
  };
  verifications: {
    id: number;
    institution_id: number;
    email: string;
    status: string;
    reason: string | null;
    checks_json: string | null;
    auto_approved: number;
    created_at: string;
    institution_name: string | null;
  }[];
  verificationCounts: Record<string, number>;
  verifierCache: { mailboxes: number; domains: number; catchAllDomains: number };
  pricing: { setupFee: number; annualMaintenance: number; summary: string };
  autoApprove: boolean;
}

let cached: WorkflowPayload | null = null;
let inflight: Promise<WorkflowPayload | null> | null = null;
const subs = new Set<() => void>();

async function load(): Promise<WorkflowPayload | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/workflow", { cache: "no-store" });
      if (!res.ok) return cached;
      cached = (await res.json()) as WorkflowPayload;
      subs.forEach((f) => f());
      return cached;
    } catch {
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useWorkflow(pollMs = 4000) {
  const [data, setData] = useState<WorkflowPayload | null>(cached);

  const refresh = useCallback(() => {
    void load().then((d) => d && setData(d));
  }, []);

  useEffect(() => {
    const handler = () => load().then((d) => d && setData(d));
    subs.add(handler);
    if (!cached) refresh();
    const t = setInterval(refresh, pollMs);
    return () => {
      subs.delete(handler);
      clearInterval(t);
    };
  }, [pollMs, refresh]);

  return { data, refresh };
}

export async function runVerifierNow(): Promise<{ checked: number; approved: number; blocked: number }> {
  const res = await fetch("/api/outreach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: 0, action: "verify-all" }),
  });
  const out = (await res.json()) as { checked: number; approved: number; blocked: number };
  await load();
  return out;
}
