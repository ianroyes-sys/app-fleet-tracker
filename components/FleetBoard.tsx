"use client";

// FLEET CONTROL: every app and site in the portfolio, its release state, whether it is
// actually up, how long its TestFlight build has left, and what it needs from you next.

import { useState } from "react";
import styles from "@/components/ui.module.css";
import { STATUSES, filterFleet, statusCounts } from "@/lib/fleet.mjs";
import type { ExpiryRow, FleetItem, FleetStatus, HealthResult, InfraCheck } from "@/lib/types";

const STATUS_META: Record<FleetStatus, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "text-[#7ef0b2] border-[#7ef0b2]/30 bg-[#7ef0b2]/5" },
  testflight: { label: "TESTFLIGHT", cls: "text-ice border-ice/30 bg-ice/5" },
  building: { label: "BUILDING", cls: "text-gold border-gold/30 bg-gold/5" },
  validating: { label: "VALIDATING", cls: "text-ember border-ember/30 bg-ember/5" },
  paused: { label: "PAUSED", cls: "text-fog border-white/15 bg-white/5" },
  local: { label: "LOCAL", cls: "text-[#c4b5fd] border-[#c4b5fd]/30 bg-[#c4b5fd]/5" },
};
const LEVEL_COLOR = { ok: "#7ef0b2", warn: "#ffc861", red: "#ff5e5b" } as const;

type Props = {
  items: FleetItem[];
  health: HealthResult[];
  drift: { name: string; reason: string }[];
  expiry: ExpiryRow[];
  machine: InfraCheck[];
};

export default function FleetBoard({ items, health, drift, expiry, machine }: Props) {
  const [needsOnly, setNeedsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const shown = filterFleet(items, { needsOnly, search });
  const counts = statusCounts(items);
  const healthOf = (name: string) => health.find((h) => h.name === name);
  const expiryOf = (name: string) => expiry.find((e) => e.name === name);
  const needsCount = items.filter((i) => i.needs).length;

  return (
    <div className={`${styles.page} ${styles.ice}`}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Build systems / Fleet control</p>
          <h1 className={styles.title}>Everything you’re building.</h1>
          <p className={styles.subtitle}>
            From the first working prototype to the app someone opens every day. Your projects, their next move, and the
            machine underneath.
          </p>
        </div>
        <div className={styles.heroAside}>
          <strong>{items.length}</strong>
          <span>
            PROJECTS IN THE FLEET
            <br />
            {counts.live} marked live
          </span>
        </div>
      </header>

      <div className={styles.statusRail}>
        {STATUSES.map((s) =>
          counts[s] ? (
            <div key={s}>
              <strong>{counts[s]}</strong>
              {STATUS_META[s].label}
            </div>
          ) : null,
        )}
      </div>

      <div className="card mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
        <p className="seclabel">The machine</p>
        {machine.map((c) => (
          <div key={c.id} className="flex items-center gap-2" title={c.detail || ""}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOR[c.level], boxShadow: `0 0 8px ${LEVEL_COLOR[c.level]}` }} />
            <span className="font-mono text-[10px] tracking-wider text-fog">{c.label}</span>
            <span className="font-mono text-[10px] text-mist">{c.value}</span>
          </div>
        ))}
      </div>

      {drift.length > 0 && (
        <p className={styles.error} role="alert">
          Marked live but down: {drift.map((d) => `${d.name} (${d.reason})`).join(" · ")}. Update fleet.json or fix the deploy.
        </p>
      )}

      <div className={styles.toolbar}>
        <p className={styles.sectionHead}>{shown.length} projects shown</p>
        <input
          className={styles.search}
          aria-label="Search fleet"
          placeholder="Find a project…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button onClick={() => setNeedsOnly(!needsOnly)} className={styles.filter} aria-pressed={needsOnly}>
          Needs you · {needsCount}
        </button>
      </div>

      <div className={styles.grid}>
        {shown.map((item) => {
          const meta = STATUS_META[item.status] ?? STATUS_META.paused;
          const h = healthOf(item.name);
          const e = expiryOf(item.name);
          const inner = (
            <div className={styles.project}>
              <div className={styles.projectTop}>
                <span className={styles.monogram} style={{ color: item.color, borderColor: `${item.color}40` }} aria-hidden="true">
                  {item.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex items-center gap-1.5">
                  {h && (
                    <span
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-widest ${
                        h.ok ? "border-[#7ef0b2]/25 text-[#7ef0b2]/80" : "border-coral/40 text-coral"
                      }`}
                      title={h.reason}
                    >
                      {h.ok ? "UP" : "DOWN"}
                    </span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-widest ${meta.cls}`}>{meta.label}</span>
                </span>
              </div>
              <h2 className="text-[15px] font-medium tracking-tight text-white">{item.name}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-fog">{item.tagline}</p>
              {e && (
                <p
                  className={`mt-3 font-mono text-[10px] tracking-widest ${
                    e.level === "expired" ? "text-coral" : e.level === "warn" ? "text-gold" : "text-fog/60"
                  }`}
                >
                  {e.level === "expired" ? "TESTFLIGHT BUILD EXPIRED" : `TESTFLIGHT · ${e.daysLeft}D LEFT`}
                </p>
              )}
              {item.needs && (
                <p className="mt-3 border-t border-hairline pt-3 text-[12px] leading-relaxed text-gold/90">
                  <span className="font-mono text-[9px] tracking-widest text-ember">NEEDS YOU · </span>
                  {item.needs}
                </p>
              )}
              {item.url && (
                <p className="mt-auto pt-3 font-mono text-[10px] text-fog transition-colors group-hover:text-ice">
                  {item.url.replace(/^https?:\/\//, "")} ↗
                </p>
              )}
            </div>
          );
          return item.url ? (
            <a key={item.name} href={item.url} target="_blank" rel="noreferrer" className="group">
              {inner}
            </a>
          ) : (
            <div key={item.name} className="group">
              {inner}
            </div>
          );
        })}
      </div>

      {shown.length === 0 && (
        <div className={styles.empty}>
          <p className="seclabel mb-2">{items.length ? "All clear" : "Empty fleet"}</p>
          <p className="text-sm text-fog">
            {!items.length
              ? "Add your first project to data/fleet.json."
              : search
                ? "No projects match this search. Try another name."
                : "No projects in this filter are waiting on you."}
          </p>
        </div>
      )}
    </div>
  );
}
