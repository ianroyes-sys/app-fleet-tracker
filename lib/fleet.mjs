// Pure fleet logic: statuses, counts, filters, validation, uptime verdicts and TestFlight
// expiry. No file or network access except through an injected fetch, so every rule is
// covered by lib/fleet.test.mjs.

const DAY = 86_400_000;

export const STATUSES = ["live", "testflight", "building", "validating", "paused", "local"];
export const PLATFORMS = ["ios", "web", "ios+web"];
export const TESTFLIGHT_DAYS = 90; // builds stop working 90 days after upload
export const WARN_DAYS = 21;

export function statusCounts(items) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const i of items) if (i.status in counts) counts[i.status]++;
  return counts;
}

export function filterFleet(items, { needsOnly = false, search = "" } = {}) {
  const q = search.trim().toLowerCase();
  return items.filter((i) => (!needsOnly || i.needs) && (!q || `${i.name} ${i.tagline}`.toLowerCase().includes(q)));
}

export function validateFleet(items) {
  const problems = [];
  const seen = new Set();
  for (const [n, i] of items.entries()) {
    const at = i?.name || `#${n}`;
    if (!i?.name) problems.push(`${at}: missing name`);
    if (seen.has(i?.name)) problems.push(`${at}: duplicate name`);
    seen.add(i?.name);
    if (!STATUSES.includes(i?.status)) problems.push(`${at}: status must be one of ${STATUSES.join(", ")}`);
    if (i?.platform && !PLATFORMS.includes(i.platform)) problems.push(`${at}: platform must be one of ${PLATFORMS.join(", ")}`);
    if (i?.url && !/^https?:\/\//.test(i.url)) problems.push(`${at}: url must start with http(s)://`);
    if (i?.testflight && !/^\d{4}-\d{2}-\d{2}$/.test(i.testflight)) problems.push(`${at}: testflight must be YYYY-MM-DD`);
    if (i?.color && !/^#[0-9a-f]{3,8}$/i.test(i.color)) problems.push(`${at}: color must be a hex value`);
  }
  return problems;
}

/**
 * Decide whether a fetched page is really the app, not a host's error shell.
 * A 200 can still be dead: an expired or missing deployment, a paused database,
 * or an empty body all count as down.
 */
const DEAD_SIGNS = [
  [/DEPLOYMENT_NOT_FOUND|The deployment could not be found/i, "Vercel: deployment not found"],
  [/This deployment is temporarily paused|DEPLOYMENT_PAUSED/i, "Vercel: deployment paused"],
  [/DEPLOYMENT_DISABLED|has been disabled/i, "host: deployment disabled"],
  [/Project paused|project is paused/i, "backend project paused"],
  [/Application error: a (client|server)-side exception has occurred/i, "app error boundary"],
  [/There isn't a GitHub Pages site here/i, "GitHub Pages: no site"],
];

export function classifyResponse({ status, body = "" }) {
  for (const [re, reason] of DEAD_SIGNS) if (re.test(body)) return { ok: false, reason };
  if (status >= 500) return { ok: false, reason: `HTTP ${status}` };
  if (status >= 400) return { ok: false, reason: status === 404 ? "HTTP 404" : `HTTP ${status}` };
  if (!body.trim()) return { ok: false, reason: "empty body" };
  if (/<html/i.test(body) && !/<title[^>]*>\s*[^<\s][^<]*<\/title>/i.test(body)) return { ok: false, reason: "page has no title" };
  return { ok: true, reason: "ok" };
}

/** Fetch one item's URL and return a verdict. Never throws. */
export async function checkShip(item, fetchImpl = fetch, timeoutMs = 15_000) {
  const started = Date.now();
  try {
    const r = await fetchImpl(item.url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    const body = (await r.text()).slice(0, 200_000);
    const verdict = classifyResponse({ status: r.status, body });
    return { name: item.name, url: item.url, finalUrl: r.url || item.url, status: r.status, ...verdict, ms: Date.now() - started };
  } catch (e) {
    const reason = e?.name === "TimeoutError" ? "timeout" : `unreachable (${e?.cause?.code || e?.message || "error"})`;
    return { name: item.name, url: item.url, status: 0, ok: false, reason, ms: Date.now() - started };
  }
}

/** Check every item that has a URL, a few at a time. */
export async function checkFleet(items, fetchImpl = fetch, { concurrency = 4 } = {}) {
  const queue = items.filter((i) => i.url);
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await checkShip(item, fetchImpl));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Items whose recorded status disagrees with the latest check: marked live but down,
 * or marked anything else but answering fine. These are what an agent or a person should fix
 * in fleet.json.
 */
export function statusDrift(items, results) {
  const byName = new Map(results.map((r) => [r.name, r]));
  const drift = [];
  for (const i of items) {
    const r = byName.get(i.name);
    if (!r) continue;
    if (i.status === "live" && !r.ok) drift.push({ name: i.name, recorded: "live", observed: "down", reason: r.reason });
  }
  return drift;
}

/**
 * TestFlight expiry for items with a last-upload date. `uploads` (name -> ISO timestamp,
 * e.g. from App Store Connect) overrides the hand-kept `testflight` date.
 */
export function testflightExpiry(items, now = new Date(), uploads = {}) {
  const rows = [];
  for (const i of items) {
    const key = (i.ascName || i.name).toLowerCase();
    const uploaded = uploads[key] || (i.testflight ? `${i.testflight}T12:00:00Z` : null);
    if (!uploaded) continue;
    const t = new Date(uploaded).getTime();
    if (Number.isNaN(t)) continue;
    const daysLeft = Math.ceil((t + TESTFLIGHT_DAYS * DAY - new Date(now).getTime()) / DAY);
    rows.push({
      name: i.name,
      uploaded: new Date(t).toISOString().slice(0, 10),
      daysLeft,
      level: daysLeft <= 0 ? "expired" : daysLeft <= WARN_DAYS ? "warn" : "ok",
      source: uploads[key] ? "app-store-connect" : "fleet.json",
    });
  }
  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Disk usage verdict from statfs numbers. */
export function diskLevel(usedPct) {
  return usedPct >= 92 ? "red" : usedPct >= 85 ? "warn" : "ok";
}
