export async function register() {
  // Only run in the Node.js server runtime (not edge, not client).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutonomousEngine } = await import("./lib/autonomous/engine");
    startAutonomousEngine();
  }
}
