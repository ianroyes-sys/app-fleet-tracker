import { NextResponse } from "next/server";
import { statusCounts, statusDrift, testflightExpiry } from "@/lib/fleet.mjs";
import { diskCheck, loadFleet, now } from "@/lib/store.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const f = loadFleet();
  return NextResponse.json({
    counts: statusCounts(f.items),
    items: f.items,
    health: f.health,
    drift: statusDrift(f.items, f.health.results),
    testflight: testflightExpiry(f.items, now(), f.uploads),
    machine: { disk: diskCheck(), pending: f.infra.pending ?? [] },
  });
}
