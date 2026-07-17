# ADR-0005: Accept 404.html's decorative watermark as a color-contrast exception

## Status

Accepted — assertMatrix mechanics superseded by ADR-0006 (see that ADR for
the corrected CI config).

## Context

`404.html`'s `.error-code` div renders a large "404" watermark at 15%
opacity behind Sawyer's portrait — a deliberate ghost-number-behind-portrait
composition, not literal informational text. It has carried
`aria-hidden="true"` since the page's original commit. A local Lighthouse
run (2026-07-14) confirms 404.html scores 95/100 accessibility with exactly
one failing audit: `color-contrast` on `div.error-code`. `aria-hidden`
does not exempt this finding — it removes the element from the
accessibility tree (screen readers), while `color-contrast` protects
sighted low-vision users regardless of AT exposure. Real accessible content
is unaffected either way: `<h1 class="error-title">Sawyer couldn't find
that page.</h1>` and the paragraph beneath it fully convey the 404 state on
their own, with no dependency on the watermark.

## Decision

Treat this single finding as an accepted false positive rather than change
`404.html`'s markup or visuals. Do not darken the watermark (would break the
intended design for zero assistive-tech benefit, since the element is
already outside the accessibility tree) and do not convert it to a
background-image/SVG asset (T-20's original 2026-07-11 framing — would add
a new binary asset or a nested font-fetch to a cosmetic-only fix on the
site's lowest-traffic page). Instead, formalize the exception in CI config:
`lighthouserc.json` elevates `categories:accessibility` to `error` at
`minScore: 0.95` for the 7 tool pages via `assertMatrix`, while `404.html`
keeps a scoped `warn`-tier override at the same threshold.

## Consequences

- `404.html` is the one page whose accessibility gate cannot hard-fail CI.
  A future edit that introduces a *different*, real issue on that page will
  only warn, not block — 404.html PRs need an eyeball pass on accessibility,
  not just a green check.
- The other 7 pages get real enforcement (`error`) for the first time;
  previously the gate was flat `warn` sitewide specifically because of this
  one page's finding.
- If the `assertMatrix` override for `404.html` is ever removed or the
  pattern typo'd, this known, accepted, cosmetic-only finding becomes a hard
  CI failure again with no obvious link back to why it's expected — the
  config carries this ADR as the reference point for that override.

## Alternatives considered

- **Darken the watermark to pass contrast as literal text.** Rejected: the
  faint ghost-number-behind-portrait look is the intended composition;
  darkening it breaks the design for a page most visitors land on by
  accident, with zero assistive-tech benefit since the text is already
  `aria-hidden`.
- **Convert the text node to a background-image/SVG so `color-contrast`
  doesn't apply to it as text at all.** Viable, but rejected for now: adds a
  new binary asset (or a nested webfont fetch for an SVG data URI) to
  guarantee pixel-identical rendering of a cosmetic-only false positive —
  disproportionate effort for a P4 ticket on a low-traffic page. A
  documented CI exception is lower-risk and fully reversible if priorities
  change.
- **Leave the sitewide accessibility gate at `warn` indefinitely rather than
  special-case 404.html.** Rejected: it was blocking real `error`-tier
  enforcement on all 7 substantive pages because of one decorative element
  on the site's least-visited page.
