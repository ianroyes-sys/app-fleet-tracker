export type FleetStatus = "live" | "testflight" | "building" | "validating" | "paused" | "local";
export type FleetItem = {
  name: string;
  tagline: string;
  status: FleetStatus;
  platform?: "ios" | "web" | "ios+web";
  url?: string;
  testflight?: string;
  ascName?: string;
  needs?: string;
  color: string;
};
export type HealthResult = { name: string; url: string; finalUrl?: string; ok: boolean; status: number; reason: string; ms: number };
export type ExpiryRow = { name: string; uploaded: string; daysLeft: number; level: "expired" | "warn" | "ok"; source: string };
export type InfraCheck = { id: string; label: string; value: string; level: "ok" | "warn" | "red"; detail?: string };
