# ADR-0001: Single-file-per-tool, no build step

## Status

Accepted (retroactive).

## Context

This project is built and maintained by a solo developer and hosted on GitHub Pages. The tools need to be trivially copyable and shareable — a colleague should be able to save a single HTML file and use it offline, or a curator should be able to open one file and understand the whole tool without a build pipeline.

## Decision

Each tool is a single self-contained HTML file (structure, styles, and script inline or via plain `<link>`/`<script>` tags to static assets). There is no bundler, no framework, no package manager, and no build/compile step between editing a file and it being deployable.

## Consequences

- Duplication across pages (nav, footer, design tokens, escaping helpers, etc.) is managed via shared static assets (`assets/*.css`, `assets/*.js`) referenced with plain `<link>`/`<script>` tags, not via a bundler or templating layer.
- Deploys are just a `git push` to `main` — GitHub Pages serves the files directly, with no CI build artifact to produce or cache.
- Any drift between pages (e.g. divergent `esc()` implementations, divergent `:root` token blocks) has to be caught by convention and review, not by a shared compiled module — see the Cross-Cutting Conventions in ARCHITECTURE.md §5 and the shared-assets extraction tracked as T-04.
- This decision should be revisited if the number of tools grows past roughly 10 pages, or if a genuine framework-level need emerges (e.g. client-side routing, component state management beyond what plain DOM + closures can handle cleanly).

## Alternatives considered

- **A static site generator (e.g. Eleventy, Astro) with a build step.** Rejected: adds a build/deploy pipeline and a templating abstraction for a project that, at 8 pages, doesn't yet need one, and would work against the "single file is the whole tool" shareability goal.
- **A frontend framework (React/Vue) with bundling.** Rejected for the same reason, plus it would require a build step GitHub Pages doesn't provide natively, meaning either committing built output or adding CI-driven builds — more infrastructure than the current scope justifies.
