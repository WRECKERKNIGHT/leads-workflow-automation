"use client";

import { useEffect } from "react";
import { startPolling, stopPolling, useAgencyState } from "@/lib/client/state";
import AgencyHeader from "@/components/office/AgencyHeader";
import LeadsDirectory from "@/components/office/LeadsDirectory";

export default function LeadsPage() {
  const state = useAgencyState();
  useEffect(() => {
    startPolling(1500);
    return () => stopPolling();
  }, []);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5">
      <AgencyHeader smtp={state?.smtp} />
      <LeadsDirectory state={state} />
    </main>
  );
}