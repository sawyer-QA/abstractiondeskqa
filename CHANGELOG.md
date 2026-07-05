# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- Self-hosted the Phosphor icon webfont (regular + duotone weights) under `assets/phosphor/` on all 8 pages, replacing the synchronous `<script src="https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.js">` with two local `<link rel="stylesheet">` tags. Removes a render-blocking, unminified third-party script and its unpkg SPOF risk (audit finding F-02 / ticket T-02).

### Security

- Added the Cloudflare Turnstile widget to all 3 submission paths in `lookup.html` (add-entry panel, tag-manager add-tag, paste modal); each submission now requires a completed challenge token attached to the payload (audit finding F-03 / ticket T-03a — client-side half). **Not yet a real mitigation**: the Apps Script backend does not verify the token server-side, so this does not close F-03 on its own. Server-side verification is tracked as ticket T-11, blocked on Apps Script source living outside this repo.
- Fixed `esc()` in `lookup.html` to also escape `"` and `'` (previously escaped only `& < >`), closing the attribute-boundary XSS gap identified in audit finding F-01 / ticket T-01. Note: this closes the risk for all plain-text and non-JS-attribute uses of `esc()`; the inline `onclick="..."` sites still carry residual risk because browsers HTML-decode attribute values before compiling inline event-handler script, so an escaped `'` decodes back to a literal quote before the nested JS string is parsed. Full closure of that vector requires replacing inline `onclick` handlers with delegated `addEventListener` + `data-*` attributes (tracked separately, not part of T-01's scope).
