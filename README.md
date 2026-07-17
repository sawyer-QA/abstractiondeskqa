# AbstractionDeskQA

[![CI](https://github.com/sawyer-QA/abstractiondeskqa/actions/workflows/ci.yml/badge.svg)](https://github.com/sawyer-QA/abstractiondeskqa/actions/workflows/ci.yml)

A free toolkit for hospital core measure abstractors — quick-reference tools and a searchable Q&A bank for TJC/CMS core measure abstraction (SEP-1, LKW, CMO, HBIPS). Live at **[abstractiondeskqa.com](https://abstractiondeskqa.com)**.

## Why

Core measure abstraction leans on dense, frequently-revised specification manuals. These tools distill the parts abstractors hit most often — time-zero reasoning, exclusion criteria, priority resolution — into fast, self-contained reference pages, plus a crowd-sourced Q&A bank curated from real abstraction questions.

## Tools

| Tool | Page | What it does |
|---|---|---|
| Q&A Lookup | [lookup.html](lookup.html) | Search/filter a curated Q&A bank, browse by tag, submit new questions for curator review |
| SEP-1 | [sep1-tool.html](sep1-tool.html) | Time Zero (SSPT) reasoning — SIRS/organ dysfunction detection, bundle windows |
| Last Known Well | [lkw-tool.html](lkw-tool.html) | LKW priority resolution, quiz, and walkthroughs |
| CMO | [cmo-tool.html](cmo-tool.html) | CMO exclusion classification and quiz |
| HBIPS | [hbips-tool.html](hbips-tool.html) | HBIPS-2/3 hours, strata, and rate calculations |
| Abstractly | [abstractly.html](abstractly.html) | A clinical-terminology word game |

## Architecture

Static multi-page site, GitHub Pages, **no build step** — each tool is a self-contained HTML file. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram, component inventory, data flow, and architecture decision records.

Notable design decision: this project is **PHI-free by design** ([ADR-0003](docs/adr/0003-phi-free-by-design.md)) — no patient chart data is ever transmitted or stored. Tools operate only on user-entered abstractions, client-side.

## Local development

There is no build step. Clone the repo and open any `.html` file directly in a browser, or serve the directory statically (e.g. `npx http-server .`) if you need same-origin fetches (relevant to `lookup.html`, which calls an external Google Apps Script API).

## Content & contributions

The Q&A bank is crowd-sourced and curator-reviewed. `lookup.html` accepts new question submissions directly in the tool. Submitted content is reviewed before publication and is provided as-is for educational use — see [Disclaimer](#disclaimer) below.

## Disclaimer

These tools are for educational and workflow-support purposes only. They do not replace your hospital's official abstraction guidance, the current TJC/CMS specifications manual, or your organization's compliance/quality department. Always verify against the current specification manual version for your reporting period.

## License

Code is licensed under the [MIT License](LICENSE). Q&A bank content is community-submitted and curator-reviewed; it is provided as-is for educational use without a separate formal content license.
