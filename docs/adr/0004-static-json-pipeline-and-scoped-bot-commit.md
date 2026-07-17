# ADR-0004: Nightly static JSON export for lookup.html, with a scoped bot-commit exception to main

## Context

lookup.html fetches Q&A entries and tag definitions live from Google Apps Script/Sheets
on every cold load (TD-4 in ARCHITECTURE.md). This couples every visitor's page load to
Apps Script's quota, cold-start latency, and availability, with no SLA. ADR-0002
anticipated resolving this via "nightly export to versioned static JSON, Sheets remains
authoring surface."

The standing project rule (CLAUDE.md) is that nothing lands on `main` outside a reviewed
PR. But the ticket's freshness requirement — data regenerated nightly with a commit per
change — is undermined if a human has to manually merge a PR every night; the data would
only be as fresh as the last merge.

## Decision

1. lookup.html's read path fetches a same-origin static file, `data/qa.json`, instead of
   calling Apps Script directly on cold load. The file is regenerated nightly by a
   scheduled GitHub Action (`scripts/sync-qa-data.mjs`) that calls the same two Apps
   Script endpoints the page already used. The read chain is strictly
   `localStorage cache → data/qa.json → SEED (with visible badge)` — no live-Sheets
   fallback tier was added between the static file and SEED; that was considered and
   rejected, since it would reintroduce the exact per-visitor Apps Script coupling this
   ADR exists to remove, just on a rarer path instead of the primary one.
2. A scoped, explicit exception to the no-direct-main-commit rule: the nightly workflow
   may commit directly to `main`, but ONLY the file `data/qa.json`, authored as
   `github-actions[bot]`. The workflow verifies via `git diff --name-only` that
   `data/qa.json` is the sole changed path before committing/pushing; if any other file
   differs, the workflow fails without committing.
3. The workflow includes a PHI-pattern scrubber over every fetched entry
   (question/answer/source/tags) before writing the file. It checks for labeled
   identifiers (MRN/SSN/DOB/Patient Name/Account #), SSN-shaped strings, long 7–10-digit
   runs, and birth/admission/discharge-dated strings — but a date only counts as a hit
   when it sits within 30 characters of a PHI label (`DOB`, `born`, `admitted`,
   `discharged`, etc.); a bare date alone is not flagged, since the Q&A bank already
   contains legitimate date-shaped content (spec-manual version citations, in-scenario
   timestamps like "04/01"/"04/02") that would otherwise false-positive. If any field
   matches, the job fails without writing or committing `data/qa.json`.
4. Sheets remains the sole authoring surface — curator submissions (add-entry, add-tag,
   paste modal) continue to POST live to Apps Script; only the read path changes.

## Status

Accepted — 2026-07-05 (per T-07).

## Consequences

- lookup.html cold-load p95 improves (same-origin static fetch vs. cross-origin Apps
  Script call) and per-visitor Apps Script quota usage drops to near zero for reads.
- `main` can now receive commits outside a human-reviewed PR, but the blast radius is
  contractually limited to a single generated data file, enforced by an automated guard
  (fails closed on any other diff) rather than by convention alone.
- Freshness is bounded by the nightly cadence (~24h) plus client `CACHE_TTL` (12h) —
  worst case a client sees data up to ~36h stale, an accepted tradeoff for removing live
  coupling.
- Because there is no live-Sheets fallback tier, an outage or misconfiguration of
  `data/qa.json` itself (bad deploy, CDN hiccup, or no successful sync having run yet)
  falls straight through to SEED with a visible badge, rather than quietly recovering via
  a live Apps Script call. This is an intentional tradeoff: it keeps the read path's
  dependency surface small and auditable, at the cost of a slightly wider blast radius
  for that specific failure mode.
- The PHI scrubber is a heuristic safety net (regex pattern match), not a guarantee — it
  catches obvious accidental PHI entry by a curator before it reaches the public static
  file/repo, but is not a substitute for curator discipline under ADR-0003. The
  label-proximity requirement on date patterns trades a small amount of scrubber recall
  (a birth/admission date more than 30 characters from any label would not be caught) for
  a much lower false-positive rate against legitimate spec/scenario content.
- New failure mode: if Apps Script is down or returns empty data at sync time, the job
  exits non-zero and leaves the last-known-good `data/qa.json` in place (no partial/empty
  overwrite).
- The initial `data/qa.json` committed alongside this ADR contains real content — 16 live
  entries fetched from Apps Script — not a placeholder skeleton. No Node.js runtime was
  available in the environment that authored this change, so `scripts/sync-qa-data.mjs`
  itself couldn't be run directly; however Python was available and the Apps Script
  endpoint was reachable from that machine, so the fetch-and-scrub logic was ported to a
  one-off Python script to bootstrap the file (0 PHI-scrubber hits across all 16 entries).
  That Python script is **not committed** to the repo — it was a throwaway equivalent of
  `scripts/sync-qa-data.mjs` used once for this bootstrap; the Node script in
  `.github/workflows/sync-qa-data.yml` is the sole source of truth for ongoing nightly
  regeneration.

## Alternatives considered

- Keep live Sheets fetch on every cold load (status quo): rejected — this is exactly the
  latency/quota risk (TD-4) the ticket exists to close.
- Add a live-Sheets fallback tier between the static file and SEED
  (`cache → static → live Sheets → SEED`): rejected — reintroduces the per-visitor Apps
  Script call this ADR exists to remove, just gated behind a rarer failure condition
  instead of being the primary path. The two-tier chain plus a visible SEED badge already
  satisfies the ticket's acceptance criteria.
- Nightly job opens a PR instead of committing directly: rejected as the default —
  defeats "regenerated nightly" freshness unless someone merges daily; kept as a fallback
  option if the direct-commit exception is later revoked.
- No PHI scrubber, rely on curator discipline alone (per ADR-0003): rejected — the
  static file becomes a new, permanent, public, versioned artifact in the repo; a
  heuristic pre-commit check is cheap insurance against a single curator mistake becoming
  part of git history.
- Bare-date PHI matching with no label-proximity requirement: rejected — false-positives
  on legitimate spec-citation and in-scenario timestamp content already in the Q&A bank,
  which would make the scrubber noisy enough to be ignored or disabled.
