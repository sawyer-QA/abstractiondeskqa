# ADR-0008: Test runner — node:test (not vitest)

## Status

Accepted — 2026-07-19.

## Context

T-08 (spec-logic unit test harness) was originally scoped in the backlog as
"→ assets/spec-logic/*.js + vitest." That wording predates the project's
no-build-step / zero-dependency posture hardening into an explicit constraint
(ADR-0001), and predates Node.js being installed locally (v24.18.0), which the
original ticket had listed as a blocker. As of this writing the repo runs no
third-party test tooling and carries no npm dependency tree.

## Decision

Use Node's built-in test runner, node:test (with node:assert), for the
spec-logic unit tests. No third-party test framework is added.

## Consequences

- No new third-party runtime/dev dependency for testing; consistent with
  ADR-0001's dependency-light philosophy.
- Fewer conveniences than a full framework (no watch mode, no bundled coverage
  UI, a leaner assertion set) — accepted as the cost of staying dependency-free
  at this project's scale.

## Alternatives considered

- vitest (the original ticket wording): rejected for this context — it would
  introduce the repo's first npm dependency tree, cutting against ADR-0001's
  dependency-light stance. Its ergonomic benefits don't outweigh that at an
  8-page static site's scale. Revisitable via a superseding ADR if the project
  later outgrows ADR-0001's stated threshold.
- Other micro-runners / hand-rolled harness: rejected — each is either a
  dependency for what node:test already covers, or reinvents it with no benefit.

This decision replaces the "vitest" references in the T-08 planning
documentation.
