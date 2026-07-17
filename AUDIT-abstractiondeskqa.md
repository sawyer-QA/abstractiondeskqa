# AbstractionDeskQA — Architectural Audit
**Scope:** Full static source audit of `sawyer-QA/abstractiondeskqa` (live at abstractiondeskqa.com) + rendered homepage review
**Date:** July 5, 2026 · **Repo state:** HEAD `4486061` (pushed June 7, 2026)
**Method:** Cloned the public repo and analyzed all source directly. Every finding cites file:line evidence. Confidence is High unless noted. Screenshots were not capturable in this environment; every claim is verifiable in source at the cited line.

---

## 1. Executive Summary

AbstractionDeskQA is a 7-tool static toolkit for core measure abstractors: eight self-contained HTML files (~7,400 lines, ~483 KB source total), zero build system, hosted on GitHub Pages with a custom domain. One page (lookup.html) is dynamic — it reads its Q&A bank and tag taxonomy from a static `data/qa.json`, regenerated nightly from a Google Apps Script / Google Sheets backend, cached in localStorage with a 12-hour TTL, with an embedded seed fallback.

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

**F-21 🔴 html-validate config never actually loaded — `.htmlvalidate.json` (was `.html-validate.json`)**
Two independent bugs compounded. (1) The config file was named `.html-validate.json` (hyphenated), which isn't one of html-validate's auto-discovered filenames (`.htmlvalidate.json`/`.js`/`.cjs`/`.mjs`), and `ci.yml`'s `npx html-validate "*.html"` step passes no `--config` flag — so CI has been running html-validate with no project config at all since T-06 first wired it up. (2) Once renamed, the file also carried a top-level `overrides` key, which isn't part of html-validate's config schema (`extends`/`rules`/`elements`/`plugins`/`transform`/`root` only) and would have made html-validate exit 1 before validating a single file the moment the config actually loaded. Net effect: every earlier ticket/note asserting a specific `heading-level`/`void-style` severity was actually running in CI has been describing intent, not observed behavior — the config has been either a silent no-op or (post-rename, pre-schema-fix) a hard crash the whole time. **Fix:** rename to `.htmlvalidate.json`; drop `overrides`; move the one remaining per-file carve-out (`lookup.html`'s heading-level gap) to a scoped inline `html-validate-disable-next` directive. **Effort:** S. **Impact:** this is the actual CI safety net for the whole site — until this lands, `html-validate` in Actions has never meaningfully run.

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

**T-12 · Fix heading-level skip (lookup/sep1/lkw/cmo)** — P2 · Files: lookup.html, sep1-tool.html, lkw-tool.html, cmo-tool.html · Surfaced during T-06 while wiring html-validate: all four pages jump `<h1>` straight to `<h3>` with no `<h2>`, tripping the `heading-level` rule (set to `warn` rather than `error` in `.html-validate.json` pending this fix). lookup.html's instance is already covered by T-05's "heading order" plan item; the other three aren't scoped by any existing ticket. AC: `heading-level` passes at `error` severity on all four pages; visual heading hierarchy unchanged (insert/retarget `<h2>` as appropriate, don't just relabel `<h3>`→`<h2>` if that breaks the visual size/weight expectations — check each page's CSS first) · Effort: 0.5–1d.

**T-13 · Fix html-validate config so it actually loads** — P1 · Files: `.htmlvalidate.json`, `lookup.html` · Resolves F-21 · Rename `.html-validate.json` → `.htmlvalidate.json` (auto-discovered name); remove the invalid top-level `overrides` key (not part of html-validate's config schema); remove the `void-style` override so `recommended`'s own `error`/`"omit"` default governs (the codebase is ~88% compliant with `omit`, ~12% with `selfclosing` — enforcing `selfclosing` would fail site-wide); replace the `lookup.html` heading-level carve-out with a scoped `<!-- html-validate-disable-next heading-level -->` immediately before its one offending `<h3>` (`lookup.html:301`), so `no-unused-disable` flags it as stale once T-05 fixes the underlying structure. AC: html-validate actually parses all 8 files in CI (previously it silently didn't); no config-schema crash; `lookup.html`'s known gap stays tracked, not silently dropped · Effort: 0.5d.

**T-14 · Sitewide `no-implicit-button-type` cleanup — CLOSED 2026-07-09 (Phase A)** — P2 · Files: index.html, sep1-tool.html, lkw-tool.html, cmo-tool.html, hbips-tool.html, abstractly.html · Depends: none (independent of T-05, which closes lookup.html's share as a byproduct of its button conversion) · **Scope corrected at close-out:** the original "125 instances" estimate and "footer span, plus any other inline-style residue" framing both undercounted once actually measured — real count was 106 missing `type=` attributes (76 in static markup, 30 inside JS template-literal render strings that html-validate can't see but were fixed anyway since the edit is equally mechanical/zero-risk either way) across cmo (31), lkw (37), sep1 (19), hbips (17), abstractly (1), index (1); 404.html had none. Separately, the CI baseline this ticket's original scope note relied on (AUDIT §13) turned out to be silently truncated — GitHub Actions caps check-run annotations at 10 errors per step, and html-validate runs as one step across all 8 files, so no prior "observed CI baseline" in this document was ever seeing the real violation count. Full inline-style cleanup (~230 static instances, real design-system work — see T-16) was descoped from this ticket at plan time rather than rushed as a rider. AC met: `no-implicit-button-type` zero across all 8 pages (lookup.html closed via T-05, the other 7 via this ticket). Also fixed as a tag-along: `cmo-tool.html`'s 2 self-closing `<meta/>` `void-style` regression (T-13 had resolved this sitewide; T-04's migration reintroduced it here, hidden by the same CI-annotation-cap issue). Effort: ~0.5d (vs. 1d original estimate — inline-style was the larger unscoped half).

**T-15 · Decide `role="navigation"` on `<nav class="site-nav">`** — P3 · Files: all pages using the shared site-nav (index.html's nav is page-local, out of scope) · Surfaced during T-04 (SESSION-7-HANDOFF.md): `role="navigation"` on `<nav>` is technically redundant (implicit landmark already) — left in deliberately on the T-04-migrated pages to match the pre-existing convention, called out explicitly as "an open a11y decision, not a CI failure... worth a deliberate yes/no later." Plan: pick one answer sitewide — keep `role="navigation"` everywhere (defense against AT/browser combos that mishandle the implicit landmark) or drop it everywhere (cleaner markup, satisfies `no-redundant-role` without a suppression). AC: one consistent, documented choice applied to every `<nav class="site-nav">`; `no-redundant-role` passes or is deliberately, visibly suppressed everywhere · Effort: 0.5d.

**T-16 · Sitewide inline-style → component/utility classes, deliberate design pass — CLOSED 2026-07-09** — P2 · Files: index.html, sep1-tool.html, lkw-tool.html, cmo-tool.html, hbips-tool.html, abstractly.html, 404.html · Depends: none · Split out of T-14 at close-out once real scope was measured: ~230 static-markup `style=` instances, not the "footer span" the original ticket text implied. **Real close-out numbers:** 225 instances converted (404.html 2, abstractly.html 3, index.html 21, hbips-tool.html 40, sep1-tool.html 32, cmo-tool.html 35, lkw-tool.html 92), sorted into component-default fixes (class's own default changed to match the near-universal override, e.g. hbips's `.section-label` 9/9), new small named classes (utility-scoped, e.g. `.gq-prompt`/`.gq-answers` shared across sep1/lkw/cmo), and semantic one-offs (small class named for content, e.g. lkw's priority-table cell classes). 3 instances deliberately left inline: 1 inside a non-live commented-out block (index.html), 2 JS-driven quiz-progress-bar initial widths (lkw/cmo) that `element.style.width` overwrites at runtime. Two real design decisions confirmed with the user before executing: footer brand-letter color converged to `var(--teal2)` sitewide (fixes lkw/cmo's light-theme-hardcoded-on-a-dark-page token drift); 404.html's duplicate "QA" nav text (leftover inline span alongside `.qa-badge`) deleted rather than preserved. `.cx-icon` in lkw-tool.html deliberately did NOT converge to cmo's dimmer icon-color convention — lkw's existing vivid per-variant icon colors were preserved exactly via explicit modifier rules, since changing them would have been an unrequested visual change to 16 elements. Did not touch the ~62 inline-style instances inside JS template-literal render strings (out of scope, per the original ticket text — html-validate can't parse JS string content as markup, so they don't affect the CI gate). AC met: `no-inline-style` zero in CI across all 8 pages for static markup (modulo the 3 documented exceptions above). Effort: ~1 session (research + 7 file batches), in line with the ~3-4d revised estimate.

**T-17 · Bring sep1-tool.html, hbips-tool.html to ≥0.95 Lighthouse accessibility, complete tablist pattern — CLOSED 2026-07-11** — P1 · Files: assets/site.css, sep1-tool.html, hbips-tool.html, assets/site.js · Depends: none · Context: gate flip to `error` (commit `e7b27a1`) was reverted to `warn` (commit `1f9b121`) the same session after CI showed 3 of 8 pages fail the enforced 0.95 accessibility threshold — sep1-tool.html 0.82 (worst offender), hbips-tool.html 0.86, 404.html 0.93. Diagnosis blocker (check-run annotations only return category-level scores, not audit IDs — see §13 note below) was resolved by running Lighthouse locally instead. **Result:** sep1-tool.html and hbips-tool.html both raised 0.82/0.86 → 1.00 (100) Lighthouse accessibility, across 4 commits: (1) `32b9aa8` — WCAG AA contrast fixes to `.site-qa-badge` background (`#0da8a5`→`#096461`), `.site-nav-brand-sub` color (`rgba(255,255,255,.4)`→`.75`), and `.notice-tip` color (`var(--teal)`→`#0a5f5d` literal override, both pages — `.notice-tip` is defined per-page, not shared); (2) `f596646` — `aria-label` added to 5 previously-unlabeled form inputs (sep1's `ev-time` row-template input + `tz-source` select; hbips's `denomAdmit`/`denomDisch`/`leaveDaysSimple`); (3) `353c784` — sep1's `.how-box-hdr` made keyboard-operable (`role="button" tabindex="0"` + an Enter/Space `onkeydown` calling the existing `toggleHow()`); (4) `2a68f75` — completed a full ARIA tablist on both pages' `.tool-tabs`/`.tab-btn`/`.tab-panel` widgets, mirroring T-10's `d396b12` lkw/cmo pattern exactly (`role="tablist"` on the container, `role="tab"` + `id` + `aria-controls` + roving `tabindex` on buttons, `role="tabpanel"` + `aria-labelledby` on panels, plus the same Arrow/Home/End keydown handler) — `assets/site.js`'s shared `switchTab()` was augmented in place rather than merged into `showTab()`, since the two still key off different class names, so the fix applies to both pages from one JS edit. Tab switching was verified working by both mouse click and keyboard navigation, not just audit-clean. **404.html deliberately left out of scope** — stays at 0.93, below the 0.95 gate; its one remaining contrast failure is the decorative `.error-code` watermark, a design decision rather than a quick fix. **Consequence: the Lighthouse accessibility gate stays at `warn`, not re-flipped to `error`** — re-flipping sitewide is blocked on 404.html and deferred until that page's watermark treatment is decided. See T-18 below for a related keyboard-operability gap surfaced while fixing `.how-box-hdr`.

**T-18 · `.help-btn` spans and hbips case-selector div are focusable but not keyboard-operable** — P2 · Files: hbips-tool.html (`.help-btn` spans ×6: h-admit, h-disch, h-leave, h-tstart, h-tend, h-eventdate; case-selector div, `hbips-tool.html:1524`) · Depends: none · Surfaced during T-17's `.how-box-hdr` fix (`353c784`): while checking the codebase for an existing keydown-handler convention to mirror, found the same bug class already present in two places, neither previously ticketed. `.help-btn` spans carry `role="button" tabindex="0"` (keyboard-focusable, announced as a button to AT) but have **no keydown handler at all** — only `onclick="toggleHelp(...)"` — so Tab-then-Enter or Tab-then-Space does nothing. The case-walkthrough selector div (`hbips-tool.html:1524`: `div.onkeydown = e => { if (e.key === 'Enter') showCase(i); };`) is halfway there — Enter works, Space doesn't, and native button-role widgets are expected to support both per the ARIA Authoring Practices. Plan: add an Enter/Space keydown handler to each, following T-17's `.how-box-hdr` pattern (`event.preventDefault()` + call the existing handler function). AC: every `role="button"`-carrying element sitewide responds to both Enter and Space, verified manually (Tab+Enter and Tab+Space both trigger the same action as a mouse click) — not just audit-clean, since neither Lighthouse nor axe-core reliably catches a *specific key* being unhandled · Effort: 0.5d.

---

## 13. Honest Scope Note (Phases 5 & 7)

Everything above is verified against your actual source. What this session *can't* do is the autonomous execute-verify-loop: I can't push to `sawyer-QA/abstractiondeskqa` or run Lighthouse/axe against live builds from chat. That loop — pick ticket, implement, run QA, regression-test, repeat, while auto-maintaining ARCHITECTURE.md, ADRs, and CHANGELOG on every change — is exactly what Claude Code in your repo does. Seed docs for the living-architecture system are provided alongside this report so the first Claude Code session starts from a documented baseline rather than a cold repo.

5-minute cache refs reviewed during T-07 (grep). Kept as history: CHANGELOG T-09 entry, ARCHITECTURE.md T-09 Why-note, ADR-0002 body (immutable decision record, superseded by ADR-0004 — not rewritten). Only this file's stale current-state line was corrected to the 12h static-JSON read path.

CI-baseline pass (`&` encoding + `.htmlvalidate.json`/`lighthouserc.json`): the six-rule "stays red" list below was a prediction made before T-13 fixed config loading; **observed reality from the actual CI run (commit `ad38c4c`, job `85410614189`)** is narrower — 10 errors total, only on `abstractly.html` and `404.html`, no other page: `no-inline-style` (5), `no-redundant-role` (4), `no-implicit-button-type` (1). `void-style` and `heading-level` are both **zero** everywhere, confirming the config is now schema-valid and `lookup.html`'s inline directive is working. `no-trailing-whitespace`, `prefer-native-element`, and `no-implicit-input-type` don't fire in this run at all — that part of the original prediction was wrong. Of the 3 rules that do fire: `no-inline-style` and `no-redundant-role` plausibly fall out of T-04's shared nav/footer/tokens migration once it touches these two pages; `no-implicit-button-type` (one button, `abstractly.html:451`) isn't clearly owned by any existing ticket. T-05 is scoped only to `lookup.html` and doesn't cover any of these three — the earlier "T-05 erases these" attribution was wrong regardless of the rule-count correction. Net: the real T-04/T-05 cleanup surface for html-validate is narrower than predicted. Attribute-value raw-`&` in `aria-label`/`meta[content]` was left un-encoded — not linter-flagged, no owning ticket. Lighthouse `categories:performance` is now `warn` instead of `error` — no owning ticket to re-tighten it.

**Correction (2026-07-09, T-14 scoping session) — every CI-baseline count above is unreliable, not just narrower than predicted.** GitHub Actions caps check-run annotations at **10 errors per step** (confirmed against GitHub's own community docs). `ci.yml`'s `html-validate` job runs `npx html-validate "*.html"` as a single step across all 8 files, so that 10-error budget is shared site-wide, not per file. Pulled the real check-run annotations for the current HEAD (`6a97218`, job `86137637148`) via the GitHub REST API (no `gh` CLI or Node available locally — same gap as T-05/T-06/T-13's sessions, confirmed again this session in both bash and PowerShell): 11 annotations total (1 unrelated Node-20-deprecation warning + exactly 10 failures — `cmo-tool.html` void-style ×2, `abstractly.html` no-inline-style ×3 + no-implicit-button-type ×1, `404.html` no-inline-style ×2 + no-redundant-role ×2). Ten failures on the nose is the tell: the tool is very likely finding far more violations across `sep1-tool.html`/`lkw-tool.html`/`hbips-tool.html`/`index.html` (which a direct grep of the source confirms — see T-14 for real counts) that never survive to be visible via the annotations API or the GitHub Checks UI, because `cmo-tool.html`'s + `abstractly.html`'s + `404.html`'s violations alone already exhaust the per-step budget before the tool reports anything else. **Every prior "observed CI baseline" note in this document (the `ad38c4c` pass above included) was reading a truncated list and describing it as complete.** Going forward: don't scope from CI annotations or the Checks tab — pull raw job logs (requires an authenticated token; unauthenticated API access 403s even on this public repo) or run `html-validate` locally with Node available. Grep-based static-markup counts are the only reliable ground truth in a Node-less environment.

**cmo-tool.html void-style regression, surfaced by the same real annotation pull:** 2 self-closing `<meta/>` tags at lines 4-5 (`<meta charset="UTF-8"/>`, `<meta name="viewport" content="width=device-width, initial-scale=1.0"/>`). T-13 believed `void-style` was zero sitewide after its fix; T-04's page migration reintroduced this specific instance in `cmo-tool.html` (the site's ~88%-`omit` convention — confirmed via `index.html`'s equivalent meta tags, which correctly omit the trailing slash — was not applied here). Folded into T-14's cmo-tool.html batch as a tag-along fix rather than a separate ticket, since it's the same file already being touched and a two-character-per-line change.

**Lighthouse-ci annotations have a different, unrelated blind spot from html-validate's 10-per-step cap (2026-07-11, T-17 gate-flip session):** flipped `lighthouserc.json`'s `categories:accessibility` assertion `warn`→`error` (commit `e7b27a1`) to test whether the site was actually clean under the stricter gate. It wasn't: 3 of 8 pages failed (sep1-tool.html 0.82, hbips-tool.html 0.86, 404.html 0.93 — all below the 0.95 minScore), so the flip was reverted the same session (`1f9b121`). Pulled the full, uncapped annotation set for the failing commit (`e7b27a1`, job `86579267339`) via the check-run annotations API — 10 annotations, none capped this time. But even at full fidelity, `lighthouse-ci`'s annotations only ever carry the category-level `categories.accessibility`/`categories.performance` `minScore` assertion result (e.g. "Expected >= 0.95, but found 0.82") — never the individual failing audit IDs (`color-contrast`, `label`, `heading-order`, etc.) that make up that score. Audit-level detail only exists in the per-page Lighthouse JSON reports, whose links are printed to the job's raw log by `treosh/lighthouse-ci-action` (`upload.target: temporary-public-storage`). The raw job-log endpoint (`/actions/jobs/{id}/logs`) 403s unauthenticated even on this public repo (same auth gap as the html-validate case above), and no workflow artifact is uploaded as a fallback (`GET .../artifacts` returned zero). **Net: for `lighthouse-ci` specifically, a local run is the only tokenless path to the actual failing rules** — the uncapped annotations API is necessary but not sufficient here, unlike html-validate where the annotation cap was the whole problem. See T-17.
