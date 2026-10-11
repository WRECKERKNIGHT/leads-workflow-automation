/**
 * scaffold-db.mjs — create/reset the SQLite database and its schema.
 *
 * Usage: npm run scaffold-db
 *
 * Nukes the existing DB (and WAL/SHM). The schema itself is applied on first
 * access by lib/db/index.ts migrate().
 */
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data");
const dbPath = join(dataDir, "agencyos.db");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

for (const suffix of ["", "-wal", "-shm"]) {
  const p = dbPath + suffix;
  if (existsSync(p)) rmSync(p, { force: true });
}

console.log(`Scaffolded a fresh database at ${dbPath} (schema applies on first boot)`);

// Apply the schema immediately so tooling can use the DB right away.
import { spawnSync } from "node:child_process";
const tsNode = join(root, "node_modules", "ts-node", "dist", "bin.js");
const apply = spawnSync(
  process.execPath,
  ["-e", `require('ts-node').register({ transpileOnly: true, project: '${join(root, "tsconfig.json").replace(/\\/g, "/")}' }); const { getDb } = require('${join(root, "lib/db/index.ts").replace(/\\/g, "/")}'); getDb();`],
  { encoding: "utf8", cwd: root }
);
if (apply.status !== 0) {
  console.error(apply.stderr || apply.stdout);
  process.exit(apply.status ?? 1);
}
console.log("Schema applied.");