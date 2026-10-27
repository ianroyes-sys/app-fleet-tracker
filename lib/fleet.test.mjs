import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  checkFleet,
  checkShip,
  classifyResponse,
  diskLevel,
  filterFleet,
  statusCounts,
  statusDrift,
  testflightExpiry,
  validateFleet,
} from "./fleet.mjs";
import { ascToken, latestBuilds } from "./asc.mjs";

const NOW = new Date("2026-01-20T15:00:00Z");
const fleet = JSON.parse(fs.readFileSync(new URL("../data/example/fleet.json", import.meta.url), "utf8"));
const page = (title = "Tally") => `<!doctype html><html><head><title>${title}</title></head><body>hi</body></html>`;
const fakeFetch = (routes) => async (url) => {
  const r = routes[url];
  if (r instanceof Error) throw r;
  return { status: r.status, url, text: async () => r.body };
};

test("example fleet is valid and counted", () => {
  assert.deepEqual(validateFleet(fleet), []);
  assert.deepEqual(statusCounts(fleet), { live: 3, testflight: 2, building: 1, validating: 1, paused: 1, local: 2 });
});

test("filter by needs and search", () => {
  assert.equal(filterFleet(fleet, { needsOnly: true }).length, 5);
  assert.deepEqual(filterFleet(fleet, { search: "BAKERY" }).map((i) => i.name), ["Harbor Orders"]);
});

test("validation catches bad records", () => {
  const problems = validateFleet([
    { name: "A", status: "shipped", url: "ftp://x", testflight: "soon", color: "red", platform: "android" },
    { name: "A", status: "live" },
  ]);
  assert.equal(problems.length, 6);
});

test("classifyResponse sees through host error pages", () => {
  assert.deepEqual(classifyResponse({ status: 200, body: page() }), { ok: true, reason: "ok" });
  assert.equal(classifyResponse({ status: 404, body: "The deployment could not be found on Vercel. DEPLOYMENT_NOT_FOUND" }).reason, "Vercel: deployment not found");
  assert.equal(classifyResponse({ status: 200, body: "<html><body>Application error: a client-side exception has occurred</body></html>" }).reason, "app error boundary");
  assert.equal(classifyResponse({ status: 200, body: "   " }).reason, "empty body");
  assert.equal(classifyResponse({ status: 200, body: "<html><head><title> </title></head></html>" }).reason, "page has no title");
  assert.equal(classifyResponse({ status: 503, body: page() }).reason, "HTTP 503");
  assert.equal(classifyResponse({ status: 200, body: '{"ok":true}' }).ok, true, "non-HTML endpoints only need a body");
});

test("checkShip and checkFleet never throw and report drift", async () => {
  const f = fakeFetch({
    "https://harbor-orders.example": { status: 200, body: page("Harbor Orders") },
    "https://tally.example": { status: 404, body: "DEPLOYMENT_NOT_FOUND" },
    "https://cedarandco.example": new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }),
    "https://pitchboard.example": { status: 200, body: page("Pitchboard") },
  });
  const one = await checkShip({ name: "x", url: "https://cedarandco.example" }, f);
  assert.equal(one.ok, false);
  assert.equal(one.reason, "unreachable (ENOTFOUND)");

  const results = await checkFleet(fleet, f, { concurrency: 2 });
  assert.equal(results.length, 4);
  assert.deepEqual(results.filter((r) => !r.ok).map((r) => r.name), ["Cedar & Co. site", "Tally"]);
  assert.deepEqual(statusDrift(fleet, results).map((d) => d.name), ["Tally", "Cedar & Co. site"]);
});

test("TestFlight expiry from hand dates, overridden by real upload dates", () => {
  const rows = testflightExpiry(fleet, NOW);
  assert.deepEqual(
    rows.map((r) => [r.name, r.daysLeft, r.level]),
    [
      ["Riverside Classes", -2, "expired"],
      ["Harbor Orders", 21, "warn"],
      ["Northside Members", 44, "ok"],
    ],
  );
  const real = testflightExpiry(fleet, NOW, { "riverside classes": "2026-01-19T09:00:00Z" });
  const rc = real.find((r) => r.name === "Riverside Classes");
  assert.equal(rc.level, "ok");
  assert.equal(rc.source, "app-store-connect");
});

test("ASC token is a valid ES256 JWT and the build lookup maps names", async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const token = ascToken({ keyId: "TESTKEY123", issuerId: "00000000-0000-0000-0000-000000000000", privateKey: pem, now: 1_700_000_000_000 });
  const [h, b, s] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "ES256", kid: "TESTKEY123", typ: "JWT" });
  const body = JSON.parse(Buffer.from(b, "base64url"));
  assert.equal(body.exp - body.iat, 1200);
  assert.equal(body.aud, "appstoreconnect-v1");
  assert.ok(crypto.verify("sha256", Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));

  const calls = [];
  const f = async (url) => {
    calls.push(url);
    const json = url.includes("/v1/apps")
      ? { data: [{ id: "1", attributes: { name: "Harbor Orders" } }, { id: "2", attributes: {} }] }
      : { data: [{ attributes: { uploadedDate: "2026-01-02T10:00:00Z", version: "14", processingState: "VALID" } }] };
    return { ok: true, json: async () => json };
  };
  const builds = await latestBuilds({ keyId: "K", issuerId: "I", privateKey: pem }, f);
  assert.deepEqual(builds, { "harbor orders": { uploaded: "2026-01-02T10:00:00Z", version: "14", state: "VALID" } });
  assert.equal(calls.length, 2);
});

test("disk levels", () => {
  assert.equal(diskLevel(70), "ok");
  assert.equal(diskLevel(86), "warn");
  assert.equal(diskLevel(95), "red");
});
