#!/usr/bin/env node
// TestFlight expiry watcher. A TestFlight build stops working 90 days after upload; when a
// client's or tester's build expires, the first sign is usually someone telling you the
// app is dead. Run this daily (cron or launchd).
//
// Two sources, in order of preference:
//  1. App Store Connect API: real upload dates for every build. Set ASC_KEY_ID,
//     ASC_ISSUER_ID and ASC_KEY_PATH (an API key with the App Manager role).
//  2. The hand-kept `testflight` dates in fleet.json. Always works.
//
// Writes data/testflight.json ({ uploads }) which the dashboard reads, prints builds inside
// 21 days of expiry, and exits 1 if any.
import fs from "node:fs";
import path from "node:path";
import { testflightExpiry } from "../lib/fleet.mjs";
import { ascConfig, latestBuilds } from "../lib/asc.mjs";
import { now, readJSON, writeJSON } from "../lib/store.mjs";

// .env.local is not auto-loaded in a plain node run, so read it here.
try {
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const items = readJSON("fleet.json", []);
let uploads = {};
let source = "fleet.json dates";
let error = null;
try {
  const config = ascConfig();
  if (config) {
    const builds = await latestBuilds(config);
    uploads = Object.fromEntries(Object.entries(builds).map(([name, b]) => [name, b.uploaded]));
    source = `App Store Connect (${Object.keys(uploads).length} apps)`;
  }
} catch (e) {
  error = e.message;
  console.error(`App Store Connect lookup failed: ${error}. Falling back to fleet.json dates.`);
}

const rows = testflightExpiry(items, now(), uploads);
writeJSON("testflight.json", { at: new Date().toISOString(), source, error, uploads });
for (const r of rows) {
  const tag = r.level === "expired" ? "EXPIRED" : `${r.daysLeft}d left`;
  console.log(`${tag.padEnd(10)} ${r.name}, uploaded ${r.uploaded} (${r.source})`);
}
const urgent = rows.filter((r) => r.level !== "ok").length;
console.log(`${rows.length} builds tracked from ${source}; ${urgent} need a new upload`);
process.exitCode = urgent ? 1 : 0;
