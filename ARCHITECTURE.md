# ARCHITECTURE.md — AbstractionDeskQA
> Living architecture document. Update with every change that alters structure, data flow, dependencies, or decisions. Each PR that changes architecture must touch this file, the changelog, and (if a decision was made) an ADR.

**Status date:** 2026-07-05 · **Baseline:** commit `4486061`

## 1. System Overview

Static multi-page toolkit for hospital core measure abstractors. GitHub Pages hosting, custom domain (CNAME), no build step, no server-side code owned by this repo. One page (lookup.html) consumes an external Google Apps Script API backed by Google Sheets.

```
┌────────────────────────────── abstractiondeskqa.com (GitHub Pages) ─┐
│ index  lookup  sep1  lkw  cmo  hbips  abstractly  404               │
│   │       │                                                        │
│   │       ├─ GET entries/tags ──► Google Apps Script ──► Sheets    │
│   │       ├─ POST submissions ──► (same, curator review queue)     │
│   │       └─ cache: localStorage (5-min TTL) → SEED fallback       │
│   └─ feedback POST ──► formly.email (+ Cloudflare Turnstile)       │
│ all pages ──► GA4 · Google Fonts · phosphor icons (self-hosted) · BMC│
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Component Inventory

| Component | File | Purpose | External deps | State |
|---|---|---|---|---|
| Landing | index.html | Marketing, feedback form | formly.email, Turnstile, GA4 | none |
| Q&A Lookup | lookup.html | Search/filter Q&A bank, tag taxonomy, community submissions, print-PDF export | Apps Script/Sheets, GA4 | localStorage caches (`qc-sheets-cache-v1`, `qc-local-tags-v2`), module-level lets |
| SEP-1 Tool | sep1-tool.html | Time Zero (SSPT) reasoning: SIRS/OD detection, bundle windows | GA4 | in-memory |
| LKW Tool | lkw-tool.html | LKW priority resolution + quiz + walkthroughs (dark theme) | GA4 | in-memory |
| CMO Tool | cmo-tool.html | CMO exclusion classification + quiz (dark theme) | GA4 | in-memory |
| HBIPS Tool | hbips-tool.html | HBIPS-2/3 hours, strata, rates | ⚠ no GA4 | in-memory |
| Abstractly | abstractly.html | Clinical-term word game | GA4 | in-memory |
| 404 | 404.html | Custom not-found (Sawyer mascot) | ⚠ no GA4 | none |
| Icons | `assets/phosphor/{regular,duotone}.css` + woff2/woff | Self-hosted Phosphor webfont (regular + duotone weights, the only two in use) | none (was unpkg) | static asset |

## 3. Data Flow — lookup.html

1. Load → check `qc-sheets-cache-v1` (TTL 5 min). Hit → render, refresh in background. Miss → parallel GET entries + tags from `SCRIPT_URL`.
2. Fetch failure → `entries = [...SEED]` (embedded fallback), tag defaults merged. **Known gap:** no user-visible stale/offline indicator, no failure telemetry.
3. User submissions (add panel, paste modal) → client-side auto-tag detection → review chips → POST JSON to `SCRIPT_URL` → sheet row awaiting curator approval. **Known gap:** no bot protection or rate limit on this path (index form has Turnstile; this doesn't).
4. Render: full innerHTML template re-render; interactivity via inline onclick handlers calling globals.

## 4. Dependency Map (external)

| Dependency | Used by | Risk notes |
|---|---|---|
| Google Apps Script + Sheets | lookup | Quotas, cold-start latency, no SLA. Planned: nightly export to static `data/qa.json` (see ADR-0002 status) |
| Google Fonts | all pages | lookup loads a disjoint second type system with duplicate requests |
| formly.email + Turnstile | index | Healthy |
| Cloudflare Turnstile | lookup (client-side widget only, T-03a) | Widget + token attached to all 3 submission POSTs; **not yet enforced** — Apps Script doesn't verify the token yet (T-11, external to this repo) |
| GA4 `G-QJPP46JWX3` | 6/8 pages | Pageviews only; no event telemetry |
| BuyMeACoffee widget | 7 pages | Cosmetic |

## 5. Cross-Cutting Conventions (target state)

- **Output encoding:** single shared `esc()` escaping `& < > " '`. (T-01: lookup.html's `esc()` now escapes quotes too. Still two divergent escapers — not yet unified into shared `site.js` — see T-04.)
- **Design tokens:** one `assets/tokens.css`; per-tool theme via `data-theme`. (Baseline: 7 divergent `:root` blocks, 3 visual systems.)
- **Breakpoints:** 640px (mobile), 900px (tablet). (Baseline: 6 ad-hoc values.)
- **Events:** delegated `addEventListener`, no new inline `onclick`.
- **Spec logic:** pure functions in `assets/spec-logic/`, unit-tested against manual-cited cases; page files only wire UI.

## 6. Technical Debt Log

| ID | Debt | Interest | Status |
|---|---|---|---|
| TD-1 | 7× duplicated nav/footer/tokens with drift | Every global change = 7 edits | Open → T-04 |
| TD-2 | esc() misses quotes → attribute XSS | Security exposure via curated content | Partially resolved (T-01) — see note 2026-07-05 |
| TD-3 | No tests on spec logic | v5.19 spec changes (eff. 1/1/2027) land with zero regression net | Open → T-08 |
| TD-4 | Live Sheets coupling | Latency/quota/availability | Open → T-07 |
| TD-5 | Duplicate count-update block (lookup:673–681) | Dead code | Open |
| TD-6 | role="tablist" without tab semantics (lkw/cmo) | Broken AT contract | Open → T-10 |
| TD-7 | Unauthenticated public write endpoint (lookup submissions) | Curator-queue flood / Apps Script quota exhaustion (F-03) | Partially resolved (T-03a) — see note 2026-07-05; full closure needs T-11 |

## 7. ADR Index

- **[ADR-0001 — Single-file-per-tool, no build step](docs/adr/0001-single-file-per-tool-no-build-step.md).** *Accepted (retroactive).* Context: solo builder, GitHub Pages, tools must be trivially copyable/shareable. Consequence: duplication managed via shared `<link>`/`<script>` assets rather than a bundler; revisit if pages exceed ~10 or a framework need emerges.
- **[ADR-0002 — Google Sheets as content CMS](docs/adr/0002-google-sheets-as-content-cms.md).** *Accepted, amendment proposed.* Context: curator (non-dev) edits content; zero backend cost. Amendment under consideration: nightly export to versioned static JSON, Sheets remains authoring surface (fixes latency/quota, adds provenance/diffability).
- **[ADR-0003 — PHI-free by design](docs/adr/0003-phi-free-by-design.md).** *Accepted.* No user chart data is transmitted or stored; tools operate on user-entered abstractions client-side only. Any future feature that would transmit clinical text requires a new ADR.
- ADR template: `docs/adr/NNNN-title.md` → Context / Decision / Status / Consequences / Alternatives considered.

## 8. Changelog Discipline

`CHANGELOG.md`, Keep-a-Changelog format. Every user-visible change gets an entry; every spec-version-driven content change cites the manual version (e.g., "Updated per TJC v2026B / HIQR v5.19"). Commit style: `type(scope): summary` (e.g., `fix(lookup): escape quotes in esc()`).

## 9. Test & QA Baseline

Current coverage: **0%**. CI (`.github/workflows/ci.yml`, T-06): html-validate (`.html-validate.json`, extends `html-validate:recommended`), linkinator, Lighthouse CI (`lighthouserc.json`) against all 8 pages via `staticDistDir`. Gate status: perf ≥90 (error); a11y ≥95 (**warn only** — lookup.html and others don't clear this yet; flips to error once T-05 lands); `heading-level` (**warn only** — index.html is compliant, but lookup/sep1-tool/lkw-tool/cmo-tool skip h1→h3; T-05 covers lookup's fix, the other three are new, not-yet-ticketed debt worth a follow-up ticket). vitest for `assets/spec-logic/` once extracted (T-08) is still pending. Manual QA checklist per release: keyboard-only pass of lookup, print-export, submission round-trip, all pages at 375px/768px/1280px.

## 10. Why-This-Change Notes

(append-only; newest first)

- **2026-07-05** — T-06: Added `README.md` (was 19 bytes), `LICENSE` (MIT, code only — the crowd-sourced Q&A content is noted in the README as as-is/educational-use rather than under a separate formal license, per F-19's "consider CC BY-NC" being explicitly a suggestion, not a requirement), promoted the three ADRs already narrated in §7 above into full `docs/adr/000N-*.md` files (Context/Decision/Status/Consequences/Alternatives-considered), and added a GitHub Actions CI workflow (`.github/workflows/ci.yml`) running html-validate, linkinator, and Lighthouse CI. T-06's AC as written targets "a11y ≥95 post-T-05," but T-04/T-05 (shared assets, lookup.html a11y overhaul) haven't landed — so the Lighthouse a11y assertion (`lighthouserc.json`) is set to `warn` rather than `error` for now, with a plan to flip it to `error` once T-05 ships. While setting up html-validate, found that `heading-level` (recommended ruleset, h1→h2→h3 without skipping) fails on lookup.html, sep1-tool.html, lkw-tool.html, and cmo-tool.html — all four skip straight from `<h1>` to `<h3>`. lookup.html's fix is already covered by T-05's "heading order" plan item; the other three aren't yet ticketed. Set `heading-level` to `warn` in `.html-validate.json` (same warn-not-error pattern as the a11y gate) rather than silently disabling it, so the gap stays visible in CI output. Flagging the 3 untracked pages as a candidate for a small new ticket rather than folding it into T-06 or T-05, since neither currently scopes them. Couldn't execute node/html-validate/lighthouse locally in this session (no Node.js in the environment) — the ruleset assessment above is from reading `html-validate:recommended`'s rule set and grepping the HTML source directly (heading tag sequence, `alt` coverage, duplicate `id`s), not from an actual tool run; the first live Actions run may need small config follow-ups.
- **2026-07-05** — T-03a: Added the Cloudflare Turnstile widget to all 3 lookup.html submission paths (add-entry panel `#turnstileAdd`, tag-manager add-tag `#turnstileTag`, paste modal `#turnstilePaste`) reusing the existing site key already deployed on index.html. Each `postJSON()` call now requires a token (client-side gate: `toast()` + abort if missing) and the payload carries `turnstileToken`; the widget resets after every submit attempt (success or failure) since Turnstile tokens are single-use. Split the ticket in two because the Apps Script backend behind `SCRIPT_URL` isn't in this git repo — there's no source to edit or redeploy from here. T-03a (this half) is done; **the widget is decorative until T-11 lands** — no server-side code rejects a missing/forged token yet, so this does not yet close F-03. Drafted a paste-ready `doPost` verification snippet for whoever picks up T-11 (kept out of the repo, handed over separately, since it's Apps Script source not part of this codebase). While drafting it, found the original T-03 AC ("curl without token → 4xx") isn't achievable as literally stated: Apps Script web apps deployed as "Anyone" always return HTTP 200 from `ContentService`; the only way to produce a non-2xx is to let `doPost` throw, which Apps Script surfaces as HTTP 500. Flagged in the backlog (T-11) rather than silently reinterpreting the AC.
- **2026-07-05** — T-02: Replaced the synchronous `<script src="https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.js">` on all 8 pages with two self-hosted `<link rel="stylesheet">` tags (`assets/phosphor/regular.css`, `assets/phosphor/duotone.css`), per F-02/TD (render-blocking unminified third-party script, unpkg SPOF). Grepped all icon `class="ph..."` usage across the repo first to confirm only the `ph` (regular) and `ph-duotone` weights are ever referenced — no `ph-bold`/`ph-fill`/`ph-light`/`ph-thin` usage — so only those two weight CSS files + their woff2/woff fonts were vendored (ttf/svg fallbacks dropped; woff2/woff cover all supported browsers). Verified by inspection: zero remaining `unpkg` references in any `.html` file, all 8 `<link>` pairs point at the new local paths, and the downloaded font files were checked as valid WOFF/WOFF2 binaries (not error-page HTML) before wiring them in.
- **2026-07-05** — T-01: `esc()` in lookup.html now escapes `"` and `'` in addition to `& < >` (was: HTML-context only, per F-01/TD-2). Verified by inspection of all ~20 call sites (tag chips, cards, tag-browser table, print view) — all pass through the same function, no path was bypassing it. Caveat worth recording: the majority of exploitable sites embed `esc()` output inside an `onclick="fn('...')"` handler, i.e. a JS string nested in an HTML attribute. Browsers HTML-decode an attribute's value *before* compiling it as the event handler's JS source, so an entity-escaped `&#39;` decodes back to a literal `'` right before the JS parser runs — meaning quote-escaping alone does not fully close the JS-string breakout for those specific sites, only the HTML-attribute-boundary risk and all non-JS/plain-text uses. Logging TD-2 as *partially* resolved rather than closed: full closure requires removing inline `onclick` handlers in favor of delegated `addEventListener` + `data-*` attributes, which is already the target-state convention above and overlaps with the T-04 shared-assets migration. Sequencing this correctly next time we touch lookup.html's event wiring will fully retire TD-2.
- **2026-07-05** — Baseline document created from full source audit. Rationale: establish the documented starting point so subsequent automated/agentic changes maintain architecture artifacts instead of accreting undocumented drift.
