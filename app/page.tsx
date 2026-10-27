import FleetBoard from "@/components/FleetBoard";
import { statusDrift, testflightExpiry } from "@/lib/fleet.mjs";
import { diskCheck, loadFleet, now } from "@/lib/store.mjs";
import type { InfraCheck } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function Home() {
  const f = loadFleet();
  const pending = f.infra.pending ?? [];
  const machine: InfraCheck[] = [
    diskCheck(),
    {
      id: "pending",
      label: "PENDING KEYS",
      value: `${pending.length} waiting`,
      level: pending.length ? "warn" : "ok",
      detail: pending.map((p) => p.what).join(" · "),
    },
    {
      id: "uptime",
      label: "UPTIME CHECK",
      value: f.health.checkedAt ? `${f.health.results.filter((r) => r.ok).length}/${f.health.results.length} up` : "never run",
      level: f.health.results.some((r) => !r.ok) ? "red" : f.health.checkedAt ? "ok" : "warn",
      detail: f.health.checkedAt ? `checked ${f.health.checkedAt.slice(0, 16).replace("T", " ")} UTC` : "run npm run check",
    },
  ];
  return (
    <FleetBoard
      items={f.items}
      health={f.health.results}
      drift={statusDrift(f.items, f.health.results)}
      expiry={testflightExpiry(f.items, now(), f.uploads)}
      machine={machine}
    />
  );
}
