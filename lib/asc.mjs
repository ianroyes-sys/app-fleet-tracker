// App Store Connect API: an ES256 JWT and the newest build per app. Used by
// scripts/testflight.mjs to replace hand-kept upload dates with real ones.
// Credentials come from env vars only (see .env.example); nothing is stored in the repo.

import crypto from "node:crypto";
import fs from "node:fs";

/** ES256 JWT for App Store Connect, 20-minute lifetime (Apple's maximum). */
export function ascToken({ keyId, issuerId, privateKey, now = Date.now() }) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const head = b64({ alg: "ES256", kid: keyId, typ: "JWT" });
  const body = b64({ iss: issuerId, iat, exp: iat + 1200, aud: "appstoreconnect-v1" });
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** Read ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH. Returns null when any is missing. */
export function ascConfig(env = process.env) {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) return null;
  return { keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, privateKey: fs.readFileSync(ASC_KEY_PATH, "utf8") };
}

/**
 * Newest build per app, keyed by lowercase app name:
 *   { "harbor orders": { uploaded, version, state } }
 */
export async function latestBuilds(config, fetchImpl = fetch) {
  const token = ascToken(config);
  const get = async (url) => {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`App Store Connect ${r.status}`);
    return r.json();
  };
  const builds = {};
  const apps = await get("https://api.appstoreconnect.apple.com/v1/apps?limit=200");
  for (const app of apps.data ?? []) {
    const name = app.attributes?.name;
    if (!name) continue;
    const bs = await get(`https://api.appstoreconnect.apple.com/v1/builds?filter[app]=${app.id}&limit=1&sort=-uploadedDate`);
    const b = bs.data?.[0]?.attributes;
    if (b?.uploadedDate) builds[name.toLowerCase()] = { uploaded: b.uploadedDate, version: b.version ?? null, state: b.processingState ?? null };
  }
  return builds;
}
