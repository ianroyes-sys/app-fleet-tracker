import type { FleetItem, HealthResult, InfraCheck } from "./types";
export const DATA_DIR: string;
export function readJSON<T = any>(file: string, fallback: T): T;
export function writeJSON(file: string, value: unknown): void;
export function now(env?: Record<string, string | undefined>): Date;
export function diskCheck(dir?: string): InfraCheck;
export function loadFleet(): {
  items: FleetItem[];
  health: { checkedAt: string | null; results: HealthResult[] };
  uploads: Record<string, string>;
  infra: { pending?: { what: string; since?: string }[] };
};
