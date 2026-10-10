import { runAgentTask } from "@/lib/agents/runner";
import { getInstitution, updateInstitution, createDemo, pushOfficeEvent, saveAgentOutput } from "@/lib/db/repo";
import { PLAN_TIERS, AGENCY_BRAND, formatINR, OFFER_SUMMARY } from "@/agents/types";
import { config } from "@/lib/config";

/**
 * Demo Builder — EduSuite Pro template + facts sheet.
 * Produces a one-page pitch: what we verified, what EduSuite Pro would bring,
 * the recommended plan tier, and a live-demo link.
 */
export async function runDemoBuilder(institutionId: number): Promise<void> {
  const inst = getInstitution(institutionId);
  if (!inst) return;

  const tier =
    PLAN_TIERS.find((t) => t.id === (inst.plan_tier as never)) ?? PLAN_TIERS[0];
  const priceLine = `${formatINR(tier.setupFee)} one-time setup + ${formatINR(tier.annualMaintenance)}/year maintenance`;

  await runAgentTask({
    agentId: "demo_builder",
    institutionId,
    taskLabel: `Building demo for ${inst.name}`,
    fn: async (ctx) => {
      ctx.progress(30, "Assembling facts sheet");

      const verifiedFindings = [
        inst.website_up ? `Public website: ${inst.website}` : "Public website: none found",
        inst.app_status === "app_found" ? `Official app found: ${inst.app_evidence}` : "No matching official app found in checked sources",
        inst.mobile_friendly ? "Website is mobile-optimized" : "Website not confirmed mobile-optimized",
        inst.has_admission_form ? "Online admission/enquiry form visible" : "No visible online admission/enquiry form",
      ].join("\n");

      const body = [
        `# ${inst.name} — EduSuite Pro personalized demo (WreckerAI)`,
        ``,
        `**Institution:** ${inst.name} · ${inst.state ?? "India"}`,
        `**Plan:** ${tier.name}`,
        `**Price:** ${priceLine}`,
        ``,
        `## Verified observations (from public research)`,
        verifiedFindings,
        ``,
        `## What ${tier.name} includes`,
        tier.roles.map((r) => `- ${r}`).join("\n"),
        ``,
        `## Pricing`,
        `- ${formatINR(tier.setupFee)} one-time — setting up and handing over the complete system. This is a one-time fee, not a yearly charge.`,
        `- ${formatINR(tier.annualMaintenance)} per year — maintenance, hosting, support and updates.`,
        ``,
        `## Live demo`,
        config.demoBaseUrl,
        ``,
        `*Prepared by ${AGENCY_BRAND.name} — ${AGENCY_BRAND.tagline}.*`,
      ].join("\n");

      createDemo(institutionId, {
        plan_tier: tier.id,
        title: `Demo — ${inst.name}`,
        body,
        services: {
          plan: tier.name,
          setupFee: tier.setupFee,
          annualMaintenance: tier.annualMaintenance,
          priceLine,
          findings: verifiedFindings.split("\n"),
          demoUrl: config.demoBaseUrl,
        },
      });

      updateInstitution(institutionId, { plan_tier: tier.id, demo_notes: `${tier.name} · ${priceLine}` });

      saveAgentOutput("demo_builder", institutionId, { plan: tier, body });

      pushOfficeEvent("demo", `🎬 Demo ready for ${inst.name} (${tier.name})`, {
        agentId: "demo_builder",
        icon: "🎬",
      });
      ctx.progress(100, `Demo built — ${tier.name} plan`);
    },
  });
}