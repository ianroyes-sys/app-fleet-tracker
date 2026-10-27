---
name: Ship Gate
slug: ship-gate
purpose: An app is not "done" until an agent has proven it builds, runs, and looks right. Manual trigger, one app at a time.
model: sonnet
cwd: .
max_passes: 8
max_minutes: 60
outbound: none
schedule_hours: none
---

# GOAL

Take one named app from "I think it's done" to **verified shippable** by iterating until
objective checks pass, not until it feels finished. Move it to `testflight` or `live` in
`data/fleet.json` only after this gate passes.

The target is the app path written in `state/ship-gate.target`. If that file is missing or
empty, stop immediately with `STATUS: blocked` and say the target wasn't set.

# ON EACH PASS

Detect the app type and run the right gate.

**iOS (SwiftUI):**
1. `xcodebuild` a clean build for the simulator. Zero errors. Count warnings; don't ignore them.
2. Boot the simulator, launch the app, screenshot the first three screens.
3. Review the screenshots: spacing, typography, real hierarchy, no default-looking chrome, and
   empty, loading and error states handled. Name what's wrong specifically ("the list has no
   empty state"), not "could be more polished".
4. Fix the highest-value defect. Rebuild. Re-screenshot. Compare.

**Web (Next.js or similar):**
1. `npm run build`: zero errors, and read every warning.
2. Start the server, load the main routes, screenshot each at 375px and desktop width.
3. Check: does any page scroll horizontally at 375px? Do loading and empty states exist? Does
   dark/light hold? Is the type scale consistent?
4. Fix the worst one. Rebuild. Re-verify.

Record every pass's screenshots and verdicts in the receipt so the improvement is visible.

# DONE-WHEN

All of these are true:

- The build exits 0.
- The app launches and the primary flow completes without a crash.
- Every screen in the primary flow has an intentional empty, loading, and error state.
- No screen scrolls horizontally at 375px (web) or clips content on the smallest supported device (iOS).
- You have screenshots from **this pass** proving the above.

Or MAX_PASSES is hit, in which case report exactly which criterion is still failing.

# VERIFY

- Paste the build's exit code and the error/warning counts.
- List the screenshot paths taken this pass. A verdict without a screenshot from this pass does not count.
- For each DONE-WHEN criterion, state pass/fail and the evidence.

# GUARDRAILS

- Never commit, push, tag, upload to TestFlight, or deploy. This gate proves readiness; the owner ships.
- Do not restructure the app's architecture to make a check pass. Fix the defect.
- Design rules in the project's own `CLAUDE.md` or `AGENTS.md` outrank your taste. Read them first.
