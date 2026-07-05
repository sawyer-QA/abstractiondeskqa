# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- Fixed `esc()` in `lookup.html` to also escape `"` and `'` (previously escaped only `& < >`), closing the attribute-boundary XSS gap identified in audit finding F-01 / ticket T-01. Note: this closes the risk for all plain-text and non-JS-attribute uses of `esc()`; the inline `onclick="..."` sites still carry residual risk because browsers HTML-decode attribute values before compiling inline event-handler script, so an escaped `'` decodes back to a literal quote before the nested JS string is parsed. Full closure of that vector requires replacing inline `onclick` handlers with delegated `addEventListener` + `data-*` attributes (tracked separately, not part of T-01's scope).
