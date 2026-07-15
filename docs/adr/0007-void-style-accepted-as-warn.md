# ADR-0007: Accept void-style as a permanent warn, not a normalization target

## Status

Accepted.

## Context

`html-validate`'s `void-style` rule governs whether void elements (`<br>`,
`<meta>`, `<input>`, etc.) are written with a self-closing slash
(`<br />`) or omitted (`<br>`). T-13 (2026-07-09) removed an invalid
top-level `overrides` key and, in doing so, dropped an explicit `void-style`
override, leaving the rule at `html-validate:recommended`'s own default
(`error`, `"omit"`). At the time the codebase was measured at ~88% `omit` /
~12% `selfclosing`.

This session's raw CI job-log triage (T-22) flagged `void-style` as one of
the largest single rule categories among the 119 errors failing PR #1. A
direct grep against the current source measured the real count: 36
self-closing void-element instances across four pages (cmo-tool.html 4,
index.html 3, lkw-tool.html 18, lookup.html 11) -- sep1-tool.html,
hbips-tool.html, abstractly.html, and 404.html have zero. No single file
owns the convention and there is no consistent per-file pattern among the
four that do.

Both styles are valid HTML5; the trailing slash on a void element is
optional and parses identically with or without it in every browser. There
is no accessibility, behavior, or rendering difference between the two --
this is a pure stylistic convention, unlike `no-inline-style` (T-23,
maintainability/CSP-adjacent) or `prefer-native-element`'s remaining
`role="button"` instances (T-24, a real semantics/keyboard-operability
concern).

## Decision

Downgrade `void-style` to `warn` in `.htmlvalidate.json` permanently, and
do not open a ticket to normalize the codebase to one convention. This is a
deliberate acceptance of the mixed-convention state, not deferred work:
there is no plan to converge on `omit` or `selfclosing` sitewide, because
neither choice buys anything a lint-clean CI run doesn't already provide
once the rule is a warning instead of a hard failure.

## Consequences

- `void-style` violations no longer fail CI; they still surface as
  warnings in `html-validate` output for visibility.
- No ticket owns re-tightening this rule to `error` -- unlike T-23/T-24,
  which are explicitly scoped to eventually re-tighten their rules, this
  is intended to stay at `warn` indefinitely.
- Future pages/edits are free to use either convention without tripping
  CI; reviewers should not request a specific style during review, since
  none is enforced or targeted.

## Alternatives considered

- **Pick one convention (`omit` or `selfclosing`) and normalize all 36
  instances now.** Rejected as this session's scope: it's a pure
  find-and-replace with zero functional benefit, and would have displaced
  the actual fixes (`no-implicit-input-type`, the semantic-element
  conversions) this ticket needed to land. If ever done, it belongs to its
  own ticket, not folded into T-22.
- **Leave `void-style` at `error` and fix the 36 instances as part of
  T-22.** Rejected: it's one of the largest error counts of the five rules
  triaged, entirely cosmetic, and fixing it wouldn't reduce any real risk --
  it would just consume the session on a stylistic pass while the
  genuinely load-bearing rules (`no-implicit-input-type`,
  `no-trailing-whitespace`) waited.

## References

- T-13 -- original config-loading fix that (unintentionally) left
  `void-style` at its `recommended` default.
- T-22 -- the html-validate-to-green pass whose triage surfaced this as
  one of the largest single error buckets and prompted this decision.
