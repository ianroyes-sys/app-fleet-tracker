// File-backed records. Reads `data/<file>` when present, else the fictional
// `data/example/<file>`. Scripts write machine output (health, testflight) to `data/`.

import fs from "node:fs";
import path from "node:path";
import { diskLevel } from "./fleet.mjs";

export const DATA_DIR = process.env.FLEET_DATA_DIR || path.join(process.cwd(), "data");
const EXAMPLE_DIR = path.join(process.cwd(), "data", "example");

export function readJSON(file, fallback) {
  for (const dir of [DATA_DIR, EXAMPLE_DIR]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch {
      /* try the next location */
    }
  }
  return fallback;
}

export function writeJSON(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = path.join(DATA_DIR, file);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(`${target}.tmp`, target);
}

/** DEMO_NOW pins the clock; the sample infra.json pins it to its `_demoNow`. */
export function now(env = process.env) {
  if (env.DEMO_NOW) return new Date(`${env.DEMO_NOW}T15:00:00Z`);
  const demo = readJSON("infra.json", {})._demoNow;
  return demo ? new Date(`${demo}T15:00:00Z`) : new Date();
}

/** Disk pressure for the volume the app runs on. */
export function diskCheck(dir = process.cwd()) {
  try {
    const s = fs.statfsSync(dir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const usedPct = Math.round(((total - free) / total) * 100);
    return { id: "disk", label: "DISK", value: `${usedPct}% used · ${(free / 1e9).toFixed(0)} GB free`, level: diskLevel(usedPct) };
  } catch {
    return { id: "disk", label: "DISK", value: "unreadable", level: "warn" };
  }
}

export function loadFleet() {
  return {
    items: readJSON("fleet.json", []),
    health: readJSON("fleet-health.json", { checkedAt: null, results: [] }),
    uploads: readJSON("testflight.json", { uploads: {} }).uploads || {},
    infra: readJSON("infra.json", { pending: [] }),
  };
}
