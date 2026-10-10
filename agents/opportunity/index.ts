import { runAgentTask } from "@/lib/agents/runner";
import { getInstitution, updateInstitution, pushOfficeEvent, saveAgentOutput } from "@/lib/db/repo";

/**
 * Opportunity Finder — translates research findings into a concrete, honest
 * pitch ("no app found" → "optional parent/student portal", not "you are losing
 * leads"). Assigns a plan tier based on verified observations.
 */
export async function runOpportunityFinder(institutionId: number): Promise<void> {
  const inst = getInstitution(institutionId);
  if (!inst) return;

  await runAgentTask({
    agentId: "opportunity_finder",
    institutionId,
    taskLabel: `Finding opportunity for ${inst.name}`,
    fn: async (ctx) => {
      const findings: string[] = [];
      if (!inst.website_up) findings.push("No accessible website found");
      if (inst.app_status === "app_not_found") findings.push("No matching official app found in checked sources");
      if (inst.mobile_friendly === 0) findings.push("Website does not appear mobile-optimized");
      if (inst.has_admission_form === 0) findings.push("No visible online admission/enquiry form");
      if (inst.has_fee_payment === 0) findings.push("No visible online fee payment option");

      const type =
        findings.length === 0
          ? "existing_school_app"
          : findings[0] === "No accessible website found"
            ? "digital_presence"
            : "admission_enquiry_demo";

      const priority = !inst.website_up ? "High" : inst.app_status === "app_not_found" ? "High" : inst.mobile_friendly === 0 ? "Medium" : "Low";

      let plan_tier = "basic";
      if (!inst.website_up || findings.length >= 3) plan_tier = "premium";
      else if (findings.length >= 1 || inst.student_strength) plan_tier = "standard";

      updateInstitution(institutionId, {
        opportunity_type: type,
        opportunity_reason: findings.join(" · ") || "Has a working site; could still benefit from a school app demo",
        opportunity_priority: priority,
        plan_tier,
      });

      saveAgentOutput("opportunity_finder", institutionId, { findings, type, priority, plan_tier });

      pushOfficeEvent("opportunity", `🎯 ${inst.name}: ${findings.length} findings → ${plan_tier} tier`, {
        agentId: "opportunity_finder",
        icon: "🎯",
      });
      ctx.progress(100, `Opportunity: ${type} (${priority})`);
    },
  });
}