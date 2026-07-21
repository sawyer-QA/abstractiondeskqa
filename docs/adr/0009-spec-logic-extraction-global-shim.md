# ADR-0009: Spec-logic extraction mechanism — global shim (not ES modules)

## Status

Accepted — 2026-07-20.

## Context

T-08 (spec-logic unit test harness) required the SEP-1 Time-Zero logic to be
callable from a Node test process, which meant extracting it out of the inline
<script> in sep1-tool.html into a standalone file (assets/spec-logic/sep1.js).
The page itself loads over file:// during local development (per README.md's
documented workflow) and wires its calculator through inline onclick="build()"
handlers. Any extraction mechanism therefore had to satisfy three constraints at
once: keep the inline onclick handlers working, keep file:// local development
working, and let the same file be require()'d by node:test (ADR-0008). The repo
runs no bundler and no build step (ADR-0001), so a compile-time module transform
was not an option.

## Decision

Extract the logic as a global shim: plain top-level declarations in
assets/spec-logic/sep1.js, loaded via a synchronous <script src> before the
page's own inline script, matching the existing pattern in assets/site.js. A
guarded CommonJS tail (if (typeof module !== 'undefined' && module.exports) { ... })
exports the same symbols for node:test without affecting browser execution. The
extraction is behavior-neutral: resolveTimeZero() is a 1:1 transcription of the
former inline logic, including its pre-existing quirks, which are preserved and
locked by explicit test cases rather than fixed here.

## Consequences

- The page keeps working unchanged over file:// and through its inline onclick
  handlers — the extracted symbols are ordinary globals, available to the inline
  script exactly as they were when inline.
- node:test loads the same file via require() with no build step, no bundler, and
  no package.json, consistent with ADR-0001 and ADR-0008.
- The global names live on window in the browser — accepted, because each page
  loads only its own spec-logic module, so there is no cross-module namespace
  collision to manage at this project's scale.
- This pattern is the template for the future lkw/cmo/hbips extractions, which
  will follow the same shim-plus-guarded-tail shape once proven here for SEP-1.

## Alternatives considered

- ES modules (type="module" with import/export): rejected — module scripts do
  not leak their top-level bindings to the global scope, which breaks the page's
  inline onclick="build()" handlers, and module loading is subject to CORS rules
  that fail under the file:// local-development workflow README.md documents.
  Reworking every page away from inline handlers and file:// to adopt ES modules
  is out of scope for T-08 and cuts against ADR-0001's no-build-step posture.
- UMD wrapper: rejected — the namespacing a UMD wrapper buys is unnecessary here,
  because each page loads only its own single spec-logic module. It adds
  boilerplate for a multi-consumer problem this project does not have.

This decision records the extraction mechanism used in T-08 commit 1 and is the
reference for subsequent spec-logic extractions.
