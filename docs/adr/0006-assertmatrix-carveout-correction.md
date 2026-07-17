# ADR-0006: Correct the 404.html assertMatrix carve-out (assertMatrix is additive, not override)

## Status

Accepted.

## Context

ADR-0005 formalized 404.html's known, accepted `color-contrast` false
positive (its `aria-hidden` decorative watermark) as a CI exception:
`categories:accessibility` `error`/0.95 on the 7 tool pages, `warn`/0.95 on
404.html, implemented via `lighthouserc.json`'s `assertMatrix`. The shipped
config did not do that -- it read (compacted to one line per entry):

`"assertMatrix": [ { "matchingUrlPattern": ".*", "assertions": { "categories:performance": ["warn", {...}], "categories:accessibility": ["error", {"minScore":0.95}] } }, { "matchingUrlPattern": "/404\\.html$", "assertions": { "categories:accessibility": ["warn", {"minScore":0.95}] } } ]`

`lighthouse-ci`'s `assertMatrix` entries are additive: every entry whose
`matchingUrlPattern` matches a given URL has its assertions applied to that
URL -- a later matching entry does not override an earlier one's assertions
on the same category. `404.html` matches both `.*` and `/404\.html$`, so it
inherited **both** the `error` assertion from the first entry and the `warn`
assertion from the second. The `error` assertion still fails CI regardless
of the `warn` entry also being present. The 7 tool pages, matching only
`.*`, correctly ran at `error` and passed. In practice this meant 404.html
was the sole CI failure on every run -- the exact failure ADR-0005 set out to
prevent.

ADR-0005's diagnosis of the underlying Lighthouse finding (the watermark's
`color-contrast` audit is a genuine, harmless false positive, `aria-hidden`
doesn't exempt it, darkening or converting the watermark isn't worth it) is
unaffected and remains correct. Only the Decision section's belief that the
two-entry `assertMatrix` achieved the carve-out was wrong.

## Decision

Restructure `assertMatrix` into three entries so the strict `error`
assertion structurally cannot match `404.html`:

```json
"assertMatrix": [
  {
    "matchingUrlPattern": ".*",
    "assertions": { "categories:performance": ["warn", { "minScore": 0.9 }] }
  },
  {
    "matchingUrlPattern": "^(?!.*404\\.html).*",
    "assertions": { "categories:accessibility": ["error", { "minScore": 0.95 }] }
  },
  {
    "matchingUrlPattern": "/404\\.html$",
    "assertions": { "categories:accessibility": ["warn", { "minScore": 0.95 }] }
  }
]
```

The `.*` catch-all now carries only the performance assertion, shared by
every page. The accessibility `error` assertion moves to its own entry
whose pattern is a negative lookahead excluding any URL containing
`404.html` -- so a tool page matches entries 1 and 2 (perf warn + a11y
error), while 404.html matches entries 1 and 3 (perf warn + a11y warn) and
never entry 2. This also means any new page added to `lighthouserc.json`'s
`collect.url` list in the future defaults to the strict `error` gate
automatically, without needing to be added to an allowlist.

## Consequences

- The operational outcome ADR-0005 already documented -- 404.html can't
  hard-fail CI on this one known, accepted finding, while the 7 substantive
  pages get real `error`-tier enforcement -- is now actually true of the
  shipped config, confirmed by a green `lighthouse-ci` job on the PR that
  carries this fix (not a local run -- see below).
- `assertMatrix`'s additive semantics apply to any future edit of this file.
  Any new scoped exception must follow the same pattern: exclude the
  excepted URL(s) from the strict entry's pattern, not just add a separate
  looser entry and assume it "wins."
- Local Lighthouse (DevTools or a plain `lighthouse` CLI run) does not
  evaluate `assertMatrix` at all -- it's a `lighthouse-ci`-only construct.
  A clean local score, as ADR-0005's session confirmed 404.html had, says
  nothing about whether the CI gate config is correct. Verifying
  `assertMatrix` changes requires an actual `lighthouse-ci` CI run.

## Alternatives considered

- **Explicit alternation of the 7 tool-page filenames** in the strict
  entry's `matchingUrlPattern` (e.g.
  `^/(index|lookup|sep1-tool|lkw-tool|cmo-tool|hbips-tool|abstractly)\.html$`)
  instead of a negative lookahead. Viable and considered the fallback if the
  lookahead misbehaves in CI, but not the primary choice: it's an allowlist,
  so a page added later to `collect.url` without also being added here
  silently gets **no** accessibility assertion at all (not even `warn`)
  until someone remembers to update this list -- worse than the lookahead's
  failure mode, where new pages default to the strict gate.
- **Leave `assertMatrix` as shipped and rely on manual review to catch
  404.html failures.** Rejected: defeats the point of a CI gate, and is the
  exact situation ADR-0005 already rejected once (a sitewide `warn` because
  of one page's known issue) -- this would effectively regress to that, just
  with extra config complexity and a false sense of enforcement.

## References

- ADR-0005 -- the original watermark-exception decision this ADR corrects
  the implementation of.
