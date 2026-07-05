# AbstractionDeskQA — Architectural Audit
**Scope:** Full static source audit of `sawyer-QA/abstractiondeskqa` (live at abstractiondeskqa.com) + rendered homepage review
**Date:** July 5, 2026 · **Repo state:** HEAD `4486061` (pushed June 7, 2026)
**Method:** Cloned the public repo and analyzed all source directly. Every finding cites file:line evidence. Confidence is High unless noted. Screenshots were not capturable in this environment; every claim is verifiable in source at the cited line.

---

## 1. Executive Summary

AbstractionDeskQA is a 7-tool static toolkit for core measure abstractors: eight self-contained HTML files (~7,400 lines, ~483 KB source total), zero build system, hosted on GitHub Pages with a custom domain. One page (lookup.html) is dynamic — it pulls its Q&A bank and tag taxonomy live from a Google Apps Script / Google Sheets backend with a 5-minute localStorage cache and an embedded seed fallback.

**What's genuinely strong:** The domain content is the moat — the tag taxonomy in lookup.html (stroke timing, treatment, disposition aliases mapped to real chart language) is something no generic dev could produce. Engineering instincts are visible: consistent `esc()` output encoding, Cloudflare Turnstile on the public form, cache-with-TTL-and-seed-fallback resilience pattern, Atkinson Hyperlegible (an accessibility-first typeface), a deliberate AI-crawler policy in robots.txt, empty states, and error toasts. This is not a naive project.

**What holds it back:** Three different design systems across seven pages. The flagship tool (lookup.html) is the least accessible page and doesn't share the site's branding. An output-encoding gap allows attribute-context XSS through the curated-content path. A render-blocking unversioned-CDN script on every page. A near-empty README on a public repo that *is* the portfolio artifact. And the single-file-per-tool architecture has crossed the line where duplication (7 copies of nav, footer, tokens) is now the main source of the inconsistencies.

**Scores** (justification in §9):

| Dimension | Score | One-line rationale |
|---|---|---|
| Overall maturity | 5.5 / 10 | Real product with real users in mind; pre-professionalization (no tests, docs, CI, design system) |
| Production readiness | 6 / 10 | It works, degrades gracefully, and can't lose PHI (there is none) — but has an XSS gap, no observability on failures, and an unauthenticated public write endpoint |
| Portfolio impact (current) | 5 / 10 | Impressive to abstractors; invisible to hiring managers because the repo tells no story |
| Portfolio impact (after the 2-week plan in §10) | 8 / 10 | Domain depth + visible engineering discipline is a rare combination |

---

## 2. Application Map & Information Architecture

```
abstractiondeskqa.com  (GitHub Pages, CNAME, custom domain)
│
├── index.html ......... Marketing/landing. Feedback form → formly.email + Cloudflare Turnstile
├── lookup.html ........ FLAGSHIP. Q&A bank + tag taxonomy.
│                        Data: Google Apps Script (Sheets) → 5-min localStorage cache → SEED fallback
│                        Write path: public POST for community submissions → "curator review" queue
│                        Extras: tag manager, paste-import modal w/ auto-tag detection, print-based PDF export
├── sep1-tool.html ..... SEP-1 Time Zero calculator (SIRS/OD detection, SSPT reasoning). Largest page (92 KB)
├── lkw-tool.html ...... LKW resolution + quiz + walkthroughs. DARK theme
├── cmo-tool.html ...... CMO classification + quiz + walkthroughs. DARK theme (shares lkw's token set)
├── hbips-tool.html .... HBIPS-2/3 hours + strata calculator. Light theme. NO analytics tag
├── abstractly.html .... Wordle-style clinical term game. Light theme
├── 404.html ........... Custom 404 w/ Sawyer mascot (487 KB unoptimized JPEG). NO analytics tag
├── robots.txt ......... Deliberate: search engines allowed, GPTBot/OAI/Google-Extended etc. blocked
├── sitemap.xml ........ All 7 public pages
└── README.md .......... 19 bytes ("# abstractiondeskqa"). No LICENSE.
```

**User flows (primary):**
1. *Reference lookup:* land → lookup.html → search chart language → expand card → (optionally) filter by tag → export print-PDF.
2. *Guided abstraction:* land → tool page → enter clinical findings → tool applies spec logic → reasoned answer.
3. *Contribution:* lookup.html → paste modal or add panel → auto-tag detection → review chips → POST to Apps Script → curator queue. (Good moderation design; see F-03 for the abuse-vector caveat.)
4. *Training:* quizzes inside lkw/cmo/hbips + Abstractly game.

**IA issues:** lookup.html has only a small "back to home" link (line 223) — no site nav, so the flagship is a dead-end that strands users from the other six tools (F-07). Tool naming drifts between the homepage cards, page titles, and nav labels ("SEP-1 Time Zero" vs "SEP-1 Tool"; lookup's title is "Stroke & ED Throughput · Q&A Bank" with no brand name — F-08).

---

## 3. Technology Stack Analysis

| Layer | Choice | Assessment |
|---|---|---|
| Hosting | GitHub Pages + CNAME | Right call for this stage. Constraint: no custom HTTP headers → no CSP, HSTS preload, or caching control |
| Frontend | Vanilla HTML/CSS/JS, one file per tool, no build step | Legitimate architecture (it's how your Insight Engine works too) — but only sustainable with *shared discipline*, which is now the gap |
| Icons | `@phosphor-icons/web@2.1.1` via unpkg, **`src/index.js`**, **synchronous in `<head>`** on all 8 pages | Wrong artifact (unminified source entry), render-blocking, third-party SPOF (F-02) |
| Fonts | Google Fonts. 6 pages: Atkinson Hyperlegible + DM Sans (+DM Mono). lookup.html: Bitter + Source Sans 3 + Source Code Pro, with duplicate `<link>`s | Two disjoint type systems; lookup loads ~6 families incl. duplicates (F-05, F-06) |
| Data (lookup) | Google Apps Script → Sheets, GET for entries/tags, POST for submissions | Pragmatic "Sheets-as-CMS." Fine for v1. No auth on write, no rate limiting, latency + quota risk (F-03, F-15) |
| Forms | formly.email + Cloudflare Turnstile | Solid, privacy-respecting choice ✅ |
| Analytics | GA4 (`G-QJPP46JWX3`) on 6 of 8 pages | hbips-tool.html and 404.html untracked (F-12) |
| CI/tests/lint | None | F-19 |

---

## 4. State Management & Data Flow (lookup.html)

```
page load
  → getCache() [localStorage 'qc-sheets-cache-v1', TTL 5 min]     (line ~563)
      hit  → render from cache, then background refresh            (lines 583–587)
      miss → Promise.all([ fetch(SCRIPT_URL), fetch(SCRIPT_URL+'?type=tags') ])
               ok   → entries/tagDefs → setCache() → render
               fail → entries = [...SEED]; mergeTagDefs([])        (line 577)
  local user tags: 'qc-local-tags-v2' merged into taxonomy         (lines 542–545)
state: module-level lets (entries, tagDefs, localTags, actTags, reviewStates…)
render: full innerHTML template-string re-render per interaction
```

This is a coherent, resilient pattern — deliberate offline degradation is more than most junior-built sites have. Two structural costs: (1) full-list innerHTML re-render on every keystroke/filter will degrade as the bank grows past a few hundred entries — no debounce on search, no incremental render; (2) all interactivity is wired through 61 inline `onclick=` attributes calling globals, which is what makes the XSS gap in F-01 exploitable and makes refactoring risky.

The other five tools are pure client-side state machines (form inputs → spec logic → rendered reasoning) with no persistence — appropriate, and their spec logic (SIRS detection, LKW priority rules) is the most defensible code on the site.

---

## 5. Findings Register (ranked by ROI)

Severity: 🔴 High · 🟠 Medium · 🟡 Low. Effort: S <2h · M ≤1d · L ≤1wk.

**F-01 🔴 Attribute-context XSS via incomplete output encoding — lookup.html:635**
`const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')` escapes HTML context but **not quotes**. Escaped output is then interpolated into single-quoted inline handlers: `onclick="addTagFilter('${esc(t)}')"` (lines 646–718, 792–802). A tag or entry field containing `'` breaks out of the JS string inside the attribute. Data originates from the Google Sheet — which accepts public submissions (curator-gated) — and from user-local tags (self-XSS). A curator approving an innocuous-looking submission containing an apostrophe payload ships stored XSS to every visitor. *Confidence: High (verified encode function + injection sites).*
**Fix:** escape `"` and `'` in `esc()` (2-line change, immediate), then structurally: replace inline handlers with `data-tag` attributes + one delegated `addEventListener` on the container. **Effort:** S (patch) / M (structural). **Impact:** closes the only real security hole; also unblocks CSP later.

**F-02 🔴 Render-blocking unminified third-party script on every page — all 8 files, line ~11**
`<script src="https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.js"></script>` — synchronous, in `<head>`, no `defer`, loading the package's *source* entry rather than a minified/CSS artifact, from unpkg (a SPOF with no SLA; if unpkg is slow, every page's first paint waits). **Fix:** self-host the phosphor webfont CSS (two small files) or at minimum switch to the minified dist + `defer`. **Effort:** S. **Impact:** first-paint improvement on all pages, removes external availability dependency.

**F-03 🟠 Unauthenticated public write endpoint — lookup.html:590, 835, 945**
`postJSON()` POSTs arbitrary JSON to the Apps Script with no Turnstile, no rate limiting, no size cap. The curator-review queue prevents content from going live unreviewed (good design ✅), but the endpoint can be scripted to flood the sheet (curator DoS, Apps Script quota exhaustion — quotas are per-day and low). The index.html feedback form got Turnstile; the lookup submission paths didn't. **Fix:** add Turnstile token to submission payloads and verify server-side in Apps Script; add a payload size check. **Effort:** M. **Impact:** protects the moderation workflow and the backend quota.

**F-04 🔴 Flagship page fails baseline accessibility — lookup.html**
The most-used page has: no skip link (all other tool pages have one), 3 aria attributes total (vs 43–47 on index/sep1/hbips), form labels without `for`/`id` association (lines 287–294: `<label class="flbl">` sibling to input, not wrapping, no `for`), heading jump h1→h3, and every interactive card/tag/chip is a `<div>`/`<span>` with `onclick` — invisible to keyboard and screen readers. Expandable Q&A cards (`togCard`) are unreachable without a mouse. For a tool whose audience includes clinicians using hospital lockdown browsers and assistive tech, this is the top UX finding too. **Fix:** skip link; `for`/`id` on all labels; make card headers `<button aria-expanded>`; tags as `<button>`; restore heading order. **Effort:** M–L. **Impact:** the flagship becomes usable by keyboard; largest single a11y win available.

**F-05 🟠 Three design systems on one site**
Evidence: `:root` token blocks have 7 different hashes; lkw+cmo are dark-mode (`--bg:#0f1923`, neon accents), index/sep1/hbips/abstractly are light navy/teal, lookup is a third palette (`#0d1f3c`/`#0b7a78` + Bitter/Source Sans type). Nav classnames drift (`nav` vs `site-nav`), aria-labels drift ("Main navigation" vs "Site navigation"), breakpoints drift (640/600/900/700/580/520px). This reads as three projects stapled together — the single biggest "amateur signal" to a reviewer, and it's pure duplication cost, not intent. **Fix:** extract one `tokens.css` + `site.css` (nav, footer, buttons, breakpoints) shared via `<link>`; pick light or dark per-tool *deliberately* via a `data-theme` attribute if you want to keep the dark abstraction tools. **Effort:** L (highest-leverage week you can spend). **Impact:** visual coherence + kills ~40% of duplicated CSS + makes every future page cheaper.

**F-06 🟠 Font loading waste — lookup.html head**
Six family requests including exact duplicates (Bitter ×2, Source Sans 3 ×2, Source Code Pro ×2). **Fix:** single consolidated `family=` URL; ideally converge on the site's DM Sans/Atkinson system per F-05. **Effort:** S. **Impact:** fewer connections, faster text paint.

**F-07 🟠 Flagship is a navigation dead-end — lookup.html:223**
Only a home link; no access to the other six tools. **Fix:** shared nav from F-05. **Effort:** S once F-05 exists. **Impact:** cross-tool discovery for the page with the most traffic.

**F-08 🟡 Branding/title inconsistency — lookup.html:title**
"Stroke & ED Throughput · Q&A Bank" — no brand, and the page now also serves HBIPS/SEP-1 content (its own counters prove it: `cnt-HBIPS`, line 674). Also stale relative to the product's own scope. **Fix:** "Q&A Lookup — AbstractionDeskQA." **Effort:** S.

**F-09 🟠 No Open Graph / Twitter card metadata — all pages (0 `og:` matches site-wide)**
"Share with your team" is a homepage CTA, but shared links unfurl with no image/description in Teams/Slack — where hospital quality teams actually live. **Fix:** og:title/description/image + twitter:card on all pages; one branded 1200×630 image. **Effort:** S. **Impact:** directly serves the product's stated growth loop.

**F-10 🟡 487 KB JPEG on the 404 page — 404.html:268**
`Sawyer-1.jpeg` is 487 KB (43% of the entire repo), unoptimized, no `width`/`height` (layout shift), no `loading` attr. **Fix:** resize/compress to WebP (~30–50 KB), add dimensions. **Effort:** S. (Sawyer stays. Sawyer is load-bearing brand equity.)

**F-11 🟠 ARIA tablist without tab semantics — lkw-tool.html, cmo-tool.html**
`<nav class="tabs" role="tablist">` but zero `aria-selected`, `role="tab"` state management, or arrow-key handling (grep for keydown/ArrowRight/aria-selected: 0 matches). Half-applied ARIA is worse than none — it announces an interaction model that doesn't work. **Fix:** either full tab pattern (roving tabindex + arrows) or drop the role. **Effort:** M.

**F-12 🟡 Analytics gaps — hbips-tool.html, 404.html**
GA4 present on 6 pages, absent on these two. You can't see HBIPS adoption or broken-link traffic. **Fix:** add the snippet. **Effort:** S. Related (F-12b): zero *event* telemetry anywhere — no search-query, tag-click, tool-completion, or export events, so you can't answer "which tool earns its keep." **Effort:** M.

**F-13 🟠 Contrast failures — shared tokens**
Computed ratios: `--ink-soft #6b7f94` on `--canvas #f7f9fc` = **3.91:1** (fails WCAG AA 4.5:1 for body text; used for secondary copy site-wide); amber `#c27a00` on white = **3.46:1** (fails even at large-text threshold for normal weights). Teal 5.03:1 and dark-theme muted 5.76:1 pass. **Fix:** darken ink-soft to ~#5a6d81, amber to ~#a36600. **Effort:** S (token change propagates… once F-05 exists; until then, 7 edits — which is F-05's point).

**F-14 🟡 No `prefers-reduced-motion` anywhere (0 matches site-wide)** despite CSS animations/transitions across pages. Given your motion-design background this is an easy, on-brand fix: one media query zeroing animation durations. **Effort:** S.

**F-15 🟠 Backend fragility — lookup.html data layer**
Apps Script cold starts add 1–3 s to first uncached load; daily quotas are low; the SEED fallback silently masks outages (users see stale/partial data with no indicator, and *you* get no signal — no error beacon). **Fix (near-term):** show a subtle "offline copy" badge when serving SEED/stale cache; log fetch failures as GA events. **Fix (later):** nightly GitHub Action exports the sheet to a static `data/qa.json` in the repo — Sheets stays the CMS, the site serves static JSON (fast, quota-free, versioned, diffable). **Effort:** M / M. **Impact:** the static-JSON move is the single best architecture upgrade available and a great interview story (content pipeline + provenance).

**F-16 🟡 Print-dialog "PDF export" — lookup.html:952–972**
`exportPDF()` opens a window and calls `window.print()` after 700 ms. Legitimate technique, but the UI says "Export as PDF," and the timeout is a race on slow machines. **Fix:** label it "Print / Save as PDF"; replace timeout with `onload`. **Effort:** S.

**F-17 🟡 Dead/duplicated code — lookup.html:673–681**
Count-update block duplicated verbatim (guarded version immediately followed by unguarded repeats). Symptomatic of no-review single-file editing. **Effort:** S.

**F-18 🟡 `escH` vs `esc` — sep1-tool.html:822 vs lookup.html:635**
Two hand-rolled escapers with different names *and different behavior* (escH handles quotes; esc doesn't — see F-01). Duplication turning into a security bug is the textbook argument for the shared-asset refactor. **Fix:** one shared `esc` in a shared `site.js`. **Effort:** S once shared assets exist.

**F-19 🟠 Repo tells no story — README.md (19 bytes), no LICENSE, no CI, commit log of "Update x.html"**
The repo is public and *is* the portfolio artifact, and it currently reads as a file dump. No screenshots, no architecture note, no "why," no license (legally: all-rights-reserved by default, which contradicts "free toolkit" and blocks contributions). **Fix:** real README (what/why/architecture diagram/screenshots/disclaimer), LICENSE (MIT for code; consider CC BY-NC for Q&A content), conventional commits going forward, and a minimal CI (html-validate + linkinator + Lighthouse CI). **Effort:** M. **Impact:** the highest ROI-per-hour item in this document for your stated job-search goal.

**F-20 🟡 No security.txt, no humans.txt, sitemap lacks `lastmod`** — polish items. **Effort:** S.

**Positive findings worth keeping (don't "fix" these):** consistent output-encoding *habit* (the bug is the function, not the discipline); Turnstile on the public form; cache-TTL-seed resilience; curator-review moderation gate; Atkinson Hyperlegible; deliberate robots.txt AI policy; honest "work in progress" banner and educational-use disclaimer (exactly right for a compliance-adjacent audience); empty states and error toasts present in lookup.

---

## 6. CSS / JS Architecture Review

**CSS:** ~130 KB across pages, of which an estimated 35–45% is duplicated structure (nav, footer, buttons, cards, breakpoints) re-implemented with drift. Custom properties are used everywhere (good instinct) but tokens are page-local, so they enable *local* consistency while guaranteeing *global* drift — the inverse of a design system. No methodology (BEM/utility) needed at this scale; a shared token file + shared component styles is the whole prescription.

**JS:** ~187 KB inline across pages. Patterns: module-level mutable state, global functions invoked by 166 inline `onclick` attributes site-wide, full innerHTML re-renders, `addEventListener` used 5 times total. No modules, no shared utilities (hence esc/escH). For the calculator tools this is acceptable — they're small state machines. For lookup.html, event delegation + a render that only touches changed regions is warranted before the Q&A bank scales. The spec-logic code (SIRS detection, LKW priority resolution, HBIPS strata math) is the genuinely valuable IP and deserves extraction into testable pure functions — which is also what makes unit testing possible at all (see ticket T-08).

---

## 7. Technical Debt Assessment

| Debt item | Interest being paid |
|---|---|
| 7× duplicated nav/footer/tokens | Every site-wide change = 7 edits; drift already visible (nav classnames, aria-labels, breakpoints, palettes) |
| Two escapers, one buggy | Became a security finding (F-01/F-18) |
| No shared JS | Bug fixes don't propagate; behavior drift between tools |
| No tests on spec logic | The one thing that *must* be right (v2026B rules) has zero regression protection — and v5.19/2027 changes are already scheduled on your calendar |
| Sheets live-fetch coupling | Availability and latency hostage to Apps Script quotas |
| Commit messages "Update x.html" | Repo history can't answer "what changed when the spec changed" — the exact provenance question your spec-version-diff skill exists to answer |

---

## 8. Missing Capabilities & Competitive Frame

Against the modern reference points a reviewer will unconsciously compare to (Linear/Notion-grade polish; in-domain: MCG, IPRO tools, Medisolv's ENCOR reference content): missing are dark-mode *choice* (vs. accidental per-page themes), keyboard-first navigation, deep links to individual Q&A entries (cards have `id="c-${e.id}"` but nothing reads `location.hash` — shareable links to a specific answer would be the killer feature for team leads), content versioning/provenance ("this answer reflects v2026B, last reviewed [date]" — *the* trust feature for a compliance audience and your differentiator), search analytics (which queries return zero results = your content roadmap), PWA/offline (abstractors on hospital VDI would benefit; the cache layer is already halfway there), and a changelog page (spec-driven updates are your cadence — make them visible).

---

## 9. Score Justifications

**Maturity 5.5/10:** Above the midpoint because the product concept, content depth, moderation workflow, and resilience patterns are real; capped because professionalization artifacts (tests, docs, CI, design system, telemetry) are absent. **Production readiness 6/10:** No PHI, graceful degradation, working forms with bot protection; docked for F-01, F-03, unmonitored failure modes, and no rollback story beyond git revert. **Portfolio 5→8:** Today, a hiring manager clicking the repo sees a 19-byte README and "Update index.html" ×50. After §10's two-week plan, they see a documented, tested, CI-verified, provenance-tracked healthcare content platform — which is a story almost no candidate has.

---

## 10. Roadmap (Phase 3)

**Quick wins (≤1 day, do this week):** F-01 quote-escaping patch · F-02 self-host icons · F-16 print onload · F-08 title · F-10 Sawyer compression · F-12 GA on 2 pages · F-13 token darkening · F-14 reduced-motion · F-09 OG tags · F-17 dead code.

**One-week project A — Shared foundation:** `assets/tokens.css`, `assets/site.css`, `assets/site.js` (esc, toast, nav); migrate all 7 pages; unify breakpoints; deliberate theming. Resolves F-05/06/07/18 and halves the cost of everything after.

**One-week project B — Repo professionalization:** README with architecture diagram + screenshots, LICENSE, CONTRIBUTING (you already accept submissions!), CHANGELOG, ADR-0001 (single-file architecture) and ADR-0002 (Sheets-as-CMS), GitHub Action CI: html-validate, linkinator, Lighthouse CI budget. Resolves F-19/20.

**Two-week project — Content pipeline v2:** nightly Action exports Sheets → `data/qa.json` (versioned, diffable); lookup reads static JSON with Sheets as fallback; per-entry provenance fields (`spec_version`, `last_reviewed`); deep-link `#c-{id}` support; zero-result search logging. Resolves F-15; creates the provenance story.

**Major features (1–2 months):** lookup a11y overhaul as a case study (F-04, F-11, before/after Lighthouse scores — publish it); PWA offline mode; spec-version diffing surfaced in-product (your spec-version-diff skill's output as a public changelog page — v5.19 lands 1/1/2027, and you already have the diff done); unified quiz engine extracted from the 3 duplicated quiz implementations.

**Enterprise/AI tier (the AbstractionDesk AI convergence):** this site is the *reference layer*; Desk Oracle is the *reasoning layer*. The roadmap that impresses is connecting them: natural-language Q&A over the same knowledge base (you've built the FTS5 + structured-output machinery already), team workspaces (your Path 2 SaaS architecture), inter-rater reliability analytics, fallout prediction from the Insight Engine framework, and anomaly detection on abstraction patterns. Phase 4's decision-intelligence capabilities (risk scoring, causal analysis, recommendation engine, KPI explanation) belong to that product, not this static site — the mistake would be bolting them on here rather than positioning this site as the trusted, citable content foundation the intelligent layer stands on.

---

## 11. Hiring-Manager Review (Phase 6)

**What impresses (Epic, Oracle Health, Optum, Medisolv-type reviewers):** the tag alias taxonomy — mapping "found on floor / unwitnessed / unable to determine lkw" to abstraction concepts is exactly the clinical-NLP grounding these teams struggle to hire for; the SEP-1 Time Zero reasoning tool (spec logic as executable code); the moderation pipeline; PHI-free-by-design architecture; the honest compliance disclaimer (reads as someone who understands regulated environments).

**What reads amateur (fixable):** empty README on a public repo; three visual systems; "Update index.html" commit history; no tests on compliance-critical logic; the flagship tool being the least accessible page.

**What reads enterprise (after §10):** ADRs, CI badges, Lighthouse budgets, provenance fields on clinical content, a published accessibility case study, and a changelog keyed to TJC spec versions — that last one is a signal literally no other candidate's portfolio will have.

**For the target roles** (Sr. Healthcare Data Analyst / Clinical Informatics / Healthcare AI): the elevator pitch this project should support is *"I built and operate a public clinical reference platform: content pipeline from curated source-of-truth to versioned static data, moderation workflow, accessibility-audited UI, CI-enforced quality gates, and a spec-version provenance model — used by real abstraction teams."* Every sentence of that is ≤2 weeks of work from being true.

---

## 12. Engineering Backlog (Phase 5 — top tickets)

**T-01 · Fix esc() quote escaping** — P0 · Files: lookup.html (then shared site.js) · Plan: add `"`→`&quot;`, `'`→`&#39;` · AC: payload `x'); alert(1);//` submitted as tag renders inert · Test: manual payload in tag + entry fields, all render paths (cards, cloud, pills, chips) · Regression: tag filtering, card expand, paste preview · Effort: 1h · Risk: none.

**T-02 · Replace phosphor unpkg src with self-hosted webfont CSS** — P0 · Files: all 8 · AC: zero unpkg requests; icons render; Lighthouse render-blocking audit clean · Test: visual pass all pages, offline icon render · Effort: 2h.

**T-03 · Turnstile on lookup submission paths** — P1 · Files: lookup.html + Apps Script · Depends: none · AC: POST without valid token rejected server-side · Test: curl without token → 4xx; happy path submits · Effort: 0.5d · Risk: Apps Script verification adds latency — acceptable.
Split on execution: the Apps Script project lives outside this git repo (deployed script only, no source under version control here), so the server-side half can't be authored/tested from this repo directly.
- **T-03a (this repo) · Turnstile widget + token attachment, client-side** — Done. Widget on all 3 submission paths (add-entry panel, tag-manager add-tag, paste modal); token required client-side before any of the three `postJSON()` calls fire; widget resets after every submit attempt. **The widget is decorative until T-11 ships** — nothing server-side rejects a missing/invalid token yet.
- **T-11 · Apps Script: verify Turnstile token server-side** — P1 · Depends: T-03a · Files: Apps Script `doPost` (external to this repo) · Plan: reference snippet drafted (not committed — hand it over when picking this up) · AC caveat: Apps Script web apps deployed as "Anyone" can't return an arbitrary HTTP status from `ContentService`; a thrown error is the closest available to "reject the request" and surfaces as HTTP 500, not 4xx as the original T-03 AC literally states. Recommend amending the AC to "non-2xx" or "error response body" rather than requiring 4xx specifically. Effort: 0.5d.

**T-04 · Shared assets extraction (tokens.css/site.css/site.js)** — P1 · Files: all 7 + 3 new · Depends: T-01 (ship the patch first, don't couple) · Plan: extract from index.html as canonical; migrate one page per commit; visual-diff each · AC: one nav/footer markup + one token set; per-page CSS shrinks ≥30%; no visual regressions beyond intended unification · Test: side-by-side screenshots per page per breakpoint · Effort: 4–5d · Risk: medium (visual regressions) — mitigate with per-page commits.

**T-05 · lookup.html accessibility overhaul** — P1 · Depends: T-04 · Plan: skip link, label `for`/`id`, card headers → `<button aria-expanded>`, tags → `<button>`, heading order, focus-visible styles · AC: axe-core 0 critical; full keyboard operation of search→filter→expand→export · Effort: 2–3d.

**T-06 · README/LICENSE/ADRs/CI** — P1 · AC: CI green on html-validate + linkinator + Lighthouse (perf ≥90, a11y ≥95 post-T-05) · Effort: 1–2d.

**T-07 · Sheets→static JSON pipeline** — P2 · Depends: T-06 (Action infra) · AC: `data/qa.json` regenerated nightly with commit per change; lookup first-load p95 <1s; SEED path only on total failure with visible badge · Effort: 3–4d.

**T-08 · Extract + unit-test spec logic** — P2 · Files: sep1/lkw/cmo/hbips → `assets/spec-logic/*.js` + vitest · AC: SIRS/OD detection, LKW priority, HBIPS strata each ≥15 cases from the spec manual, incl. the v5.19 changes you've already diffed (CCUS, SSPT sourcing) as *pending* tests · Effort: 4–5d · Impact: regression safety for the Jan 2027 spec update + the strongest interview artifact in the backlog.

**T-09 · Deep links + OG tags + zero-result logging** — P2 · Effort: 1d.
**T-10 · Tab pattern fix (lkw/cmo)** — P3 · Effort: 0.5d.

---

## 13. Honest Scope Note (Phases 5 & 7)

Everything above is verified against your actual source. What this session *can't* do is the autonomous execute-verify-loop: I can't push to `sawyer-QA/abstractiondeskqa` or run Lighthouse/axe against live builds from chat. That loop — pick ticket, implement, run QA, regression-test, repeat, while auto-maintaining ARCHITECTURE.md, ADRs, and CHANGELOG on every change — is exactly what Claude Code in your repo does. Seed docs for the living-architecture system are provided alongside this report so the first Claude Code session starts from a documented baseline rather than a cold repo.
