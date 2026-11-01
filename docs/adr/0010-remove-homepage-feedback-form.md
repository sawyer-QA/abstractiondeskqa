# ADR-0010: Remove the homepage feedback form and retire Formly

## Status

Accepted — 2026-11-01.

## Context

index.html carried a public feedback form that posted directly from the browser
to a third-party endpoint, formly.email. It had two anti-spam measures, a honeypot
field and a Cloudflare Turnstile widget, and both ran only in the browser. The
submit handler checked them and then disabled both fields before the form posted,
so neither value reached Formly and nothing on any server verified them. Bots
could skip the page and POST straight to the Formly endpoint.

The form received only spam and zero real submissions.

## Decision

Remove the homepage feedback form and retire the Formly integration (T-33). This
removes the form section, its submit handler, its CSS, and the Turnstile loader
from index.html, along with every link to the form: on index.html and on six other
pages (404.html, cmo-tool.html, hbips-tool.html, lkw-tool.html, lookup.html,
sep1-tool.html).

Turnstile and the Apps Script verifier stay in service on lookup.html, which loads
its own copy of the Turnstile script. Nothing in the T-03a or T-11 decisions is
superseded: lookup's submissions pass through a server path that rejects a missing
or invalid token, which is the property the homepage form never had.

The removal may be revisited if the traffic mix changes. Any future contact channel
must verify on a server path the client cannot skip.

## Consequences

- index.html no longer loads a script from challenges.cloudflare.com or posts to
  a third party. It no longer depends on Formly.
- The site has no general contact channel. The "Found something incorrect?" prompt
  in the work-in-progress banner went with the form. lookup.html's curator-reviewed
  submission paths are unaffected.
- A free-text field that sent user input to a third party is gone, which removes
  one place clinical text could have been pasted (ADR-0003).
- Shutting off the Formly account is separate from this change and outside the
  repo. The form's access key stays in git history, and stops working once the
  account is shut off.

## Alternatives considered

- **Keep the form as it was.** Rejected: its checks were bypassable by a direct
  POST, and it delivered only spam.
- **Keep the form and add server-side verification.** Rejected for now: it would
  mean building and maintaining a verified write path for a form with no real
  submissions. This is the required shape if a contact channel returns.
- **Hide the form and leave the code in place.** Rejected: it would keep dead code
  and the third-party key in the page.

## References

- T-33 — removal ticket.
- T-03a, T-11 — Turnstile on lookup.html, client side and server-side verification.
- ADR-0003 — PHI-free by design.
