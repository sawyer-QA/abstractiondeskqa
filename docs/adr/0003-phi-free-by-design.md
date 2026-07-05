# ADR-0003: PHI-free by design

## Status

Accepted.

## Context

This project's tools support hospital core measure abstraction — a workflow that necessarily involves patients' clinical charts. The tools are hosted on public GitHub Pages, use a third-party Google Sheets/Apps Script backend, and (for `lookup.html`) accept public write submissions. None of this infrastructure is HIPAA-compliant or intended to be, and it must never become a vector for handling protected health information (PHI).

## Decision

No feature may transmit or store patient chart data. All tools operate exclusively on user-entered abstractions — dates, criteria checkboxes, free-text reasoning about de-identified scenarios — never on identifiable patient information. This applies to every data path: localStorage caches, the Google Sheets/Apps Script backend, GA4 analytics, and any future feature.

## Consequences

- Every tool's inputs are designed around abstracted/de-identified fields (e.g. "time of triage," "SIRS criteria met") rather than anything resembling a chart excerpt or patient identifier.
- Any future feature proposal that would send clinical text to a server, analytics endpoint, or third-party API requires flagging to the project lead first and a new ADR — this is a hard gate, not a style preference (see CLAUDE.md guardrails).
- This constraint has to be actively maintained as the project adds features (e.g. the Q&A submission path, T-07's static JSON pipeline) — it's a design discipline, not something enforced by the infrastructure itself, since nothing here has PHI-grade access controls or encryption.

## Alternatives considered

- **Accept PHI with added security controls (encryption at rest, access logging, BAA with Google).** Rejected outright: this is a solo-maintained, no-budget, static-hosted project. Taking on PHI would require infrastructure, legal agreements (BAAs), and compliance obligations far beyond this project's scope and resourcing, for no benefit — the tools don't need real patient data to teach/support abstraction reasoning.
