#!/usr/bin/env node
// Uptime check for every fleet item with a URL. Writes data/fleet-health.json, prints a
// one-screen report, and exits 1 when an item recorded as live is actually down.
//   node scripts/fleet-check.mjs [--dry]
import { checkFleet, statusDrift, validateFleet } from "../lib/fleet.mjs";
import { readJSON, writeJSON } from "../lib/store.mjs";

const items = readJSON("fleet.json", []);
const problems = validateFleet(items);
if (problems.length) {
  console.error(`fleet.json has problems:\n- ${problems.join("\n- ")}`);
  process.exit(2);
}
const results = await checkFleet(items);
for (const r of results) console.log(`${r.ok ? "UP  " : "DOWN"}  ${String(r.status || "---").padEnd(4)} ${r.name.padEnd(24)} ${r.ok ? `${r.ms}ms` : r.reason}`);
const drift = statusDrift(items, results);
console.log(`${results.length} checked · ${results.filter((r) => r.ok).length} up · ${results.filter((r) => !r.ok).length} down`);
for (const d of drift) console.log(`  marked live but down: ${d.name} (${d.reason})`);
if (!process.argv.includes("--dry")) writeJSON("fleet-health.json", { checkedAt: new Date().toISOString(), results });
process.exitCode = drift.length ? 1 : 0;
