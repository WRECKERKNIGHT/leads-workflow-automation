"use client";

import { useEffect } from "react";
import { startPolling, stopPolling, useAgencyState } from "@/lib/client/state";
import AgencyHeader from "@/components/office/AgencyHeader";
import ApprovalQueue from "@/components/office/ApprovalQueue";
import InboxPanel from "@/components/office/InboxPanel";
import EventFeed from "@/components/office/EventFeed";

export default function OfficePage() {
  const state = useAgencyState();
  useEffect(() => {
    startPolling(1500);
    return () => stopPolling();
  }, []);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5">
      <AgencyHeader smtp={state?.smtp} />
      <h2 className="mb-4 font-mono text-sm font-semibold text-slate-200">
        Operations Floor <span className="text-slate-500">— approval queue, inbox & live feed</span>
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ApprovalQueue state={state} />
        <InboxPanel state={state} />
        <EventFeed state={state} />
      </div>
      <p className="mt-4 text-[11px] text-slate-500">
        Approve a drafted message to send it. Replies flow into the Response Manager and get classified as Interested / Needs more information / Not interested / Wrong contact / Unclear.
      </p>
    </main>
  );
}