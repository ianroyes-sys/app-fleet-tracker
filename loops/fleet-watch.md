---
name: Fleet Watch
slug: fleet-watch
purpose: Every live app and site stays actually alive, and the fleet board always tells the truth.
model: sonnet
cwd: .
max_passes: 4
max_minutes: 30
width: true
outbound: none
schedule_hours: 7,19
schedule_minute: 22
---

# GOAL

A builder who ships a lot forgets what's broken. This prompt, run twice a day by a scheduled
agent, keeps `data/fleet.json` a true statement about the portfolio and makes sure nothing is
silently down. `scripts/fleet-check.mjs` is the deterministic half of this job; the agent adds
judgment and one real diagnostic step per failure.

Items to check are whatever `data/fleet.json` lists with a `url`.

# ON EACH PASS

1. Run `node scripts/fleet-check.mjs`. It fetches every URL, follows redirects, and marks a page
   down when it is a host error shell (deployment not found or paused, app error boundary,
   empty body, missing title) even if the status code is 200. It writes `data/fleet-health.json`.
2. **Width: fan out** for anything the script can't judge. One cheap worker per failed or
   suspicious item: open the page, confirm it renders its own content, and return a small
   structured verdict. Merge every verdict.
3. For each failed item, take one real diagnostic step: check the hosting provider's latest
   deployment state for that project, or whether its database is paused.
4. Update `data/fleet.json` so `status` and `needs` match what you observed. An item that 404s
   is not `live`; give it a `needs` line naming the actual next action.
5. Write a one-screen report: every item, its status, and what changed since the last run.

# DONE-WHEN

- Every item with a URL has been fetched **this run**.
- Every status field matches the observed reality.
- Every newly broken item has a `needs` line naming the next action.
- Or MAX_PASSES is hit.

# VERIFY

- State the count: checked / up / down / changed.
- For each status you *changed*, quote the evidence (HTTP code or the error text you saw).
- Confirm `data/fleet.json` still parses: `node -e "JSON.parse(require('fs').readFileSync('data/fleet.json','utf8'))"`.

# GUARDRAILS

- Read-only against the outside world. Do not redeploy, restore, unpause, or delete anything.
  Broken items become `needs` lines for the owner, not autonomous repairs.
- Do not add items that aren't the owner's. Do not remove items; mark them `paused`.
