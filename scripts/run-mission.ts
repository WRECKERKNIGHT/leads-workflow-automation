/**
 * run-mission.ts — launch an all-India discovery mission and drive it fully
 * through the pipeline from the command line. Headless/cron usage.
 *
 *   npm run run-mission -- --state Bihar --category School --limit 20 --process
 *
 * If --state is omitted the lead machine sweeps a random Indian state each run,
 * covering all India over time.
 */
import { runDiscovery, INDIA_STATES } from "@/agents/discovery";
import { processQueues } from "@/agents/pipeline";
import { getDb } from "@/lib/db";

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  getDb(); // ensure migrations run

  const state = arg("state")?.trim() ?? INDIA_STATES[Math.floor(Math.random() * INDIA_STATES.length)];
  const category = arg("category", "School") ?? "School";
  const limit = Math.min(120, Math.max(1, Number(arg("limit", "40")) || 40));

  console.log(`[run-mission] Discovering ${category}s in ${state} (all India), limit ${limit}`);

  const missionId = await runDiscovery({ state, category, limit });
  console.log(`[run-mission] Mission #${missionId} started`);

  if (has("process")) {
    console.log("[run-mission] Processing pipeline queues...");
    const res = await processQueues();
    console.log(`[run-mission] Pipeline progressed ${res.progressed} folder(s)`);
  }

  console.log("[run-mission] Done.");
}

main().catch((err) => {
  console.error("[run-mission] Fatal:", err);
  process.exit(1);
});