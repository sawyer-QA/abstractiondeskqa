# ADR-0002: Google Sheets as content CMS

## Status

Accepted, amendment proposed.

## Context

The Q&A bank behind `lookup.html` is authored and curated by a non-developer (the curator reviews and edits entries/tags). The project has zero backend budget and no server it owns. A spreadsheet is a CMS the curator already knows, requires no hosting, and is editable from any device.

## Decision

Google Sheets is the source-of-truth content store for the Q&A bank. A Google Apps Script deployment (external to this repo) exposes the sheet as a JSON API (`SCRIPT_URL`). `lookup.html` fetches entries/tags from this API on load, caches the result in `localStorage` with a 5-minute TTL, and falls back to an embedded `SEED` dataset if the fetch fails.

## Consequences

- Zero backend hosting cost; the curator edits content in a spreadsheet UI with no code involved.
- `lookup.html` couples the live tool's availability and latency to Google Apps Script's cold-start behavior and quota limits, with no SLA (tracked as TD-4).
- There's no version history/diffability for content changes beyond whatever Sheets' own revision history provides — no commit-level provenance for Q&A content the way there is for code.
- User submissions (new questions) write back to the same sheet via the Apps Script API as a curator-review queue, which is a public write endpoint — currently protected client-side by a Cloudflare Turnstile widget (T-03a) but not yet enforced server-side (T-11; tracked as TD-7).

## Amendment under consideration

Nightly export of the Sheets content to a versioned static `data/qa.json` committed to this repo (tracked as T-07), with Sheets remaining the authoring surface. This would fix the latency/quota/availability exposure of hitting the live API on every cold load, and would add git-level provenance/diffability for content changes — while keeping the curator's non-dev editing workflow unchanged.

## Alternatives considered

- **A headless CMS (e.g. Contentful, Sanity).** Rejected: adds a paid or rate-limited third-party dependency and a new authoring UI for the curator to learn, for a benefit (structured content modeling) this project's simple entry/tag schema doesn't need.
- **Content committed directly as JSON/Markdown in the repo, edited via PRs.** Rejected as the primary authoring path: the curator is not a developer and shouldn't need to use git to edit Q&A content. (This is effectively what the T-07 nightly-export amendment adds as a read path, without changing the authoring path.)
