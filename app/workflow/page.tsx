"use client";

import dynamic from "next/dynamic";

const WorkflowDashboard = dynamic(() => import("@/components/workflow/WorkflowDashboard"), {
  ssr: false,
  loading: () => (
    <main className="mx-auto max-w-[1500px] px-4 py-10 text-center font-mono text-xs text-slate-500">Loading workflow…</main>
  ),
});

export default function WorkflowPage() {
  return <WorkflowDashboard />;
}