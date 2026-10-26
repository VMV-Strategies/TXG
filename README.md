# THREE X | Venture Intelligence

An offline-first Progressive Web App for modelling a Canada–U.S. venture that hosts FIBA 3x3 events in Toronto (2027–2029, with an optional 2030–2032 extension). It covers deal structure, cross-border tax, CCPC control, not-for-profit participation, event economics, sponsorship and ticketing, and investor returns. Every number can be explained in plain English, and the explanation is built from the same calculation that produced the number.

> **Not legal, tax or investment advice.** The app is a structured way to see consequences and open questions. Every result shows its evidence status, and anything marked *assumption*, *forecast* or *unsupported* needs professional review before anyone relies on it.

## What it does

| Area | Module |
|---|---|
| Overview | Dashboard with headline metrics, issues and explain sheets |
| Structure | Entity Map (drag/drop, relationship inspector), Deal Lab (12 structures and a CCPC control analysis), What If? (sliders with per-knob attribution), Money Flow (Sankey with sources/uses reconciliation), Follow the Dollar |
| Analysis | Tax Intelligence (versioned rule engine with citations), Event Financials, Revenue & Sponsorship, Scenario Comparison (weighted optimizer and Pareto), Recommendations |
| Operations | FIBA Operations (requirements register and venue analysis), Project Operations (tasks and dependencies), Foundation (NFP Act analysis), Document Library (offline search with citations; workbook import and reconciliation) |
| Output | Reports (10 types: print to PDF, CSV, XLSX), Settings (encrypted backup/restore, fact-pack import, delete all, install guide) |

The full feature list, with honest status and the backlog, is in [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md).

## Quick start

```bash
npm install
npm run build        # → dist/
npm run preview      # http://localhost:4173
npm run dev          # watch + serve
```

Requires Node 20 or later. Dependencies are pinned to exact versions.

## Checks

```bash
npm run typecheck    # tsc --noEmit (strict)
npm test             # 61 unit tests (node:test via tsx)
npm run test:e2e     # 18 Playwright tests (desktop + iPhone 13), including offline reopen
npm run check        # all of the above plus build
```

The e2e suite serves `dist/` from a sub-path (`/three-x-vi/`) to reproduce GitHub Pages project hosting.

## Your data stays on your device

The repository and the deployed build contain **synthetic demonstration data only**. Real corporate filings, workbooks, contracts and fact packs are imported in the browser and stored in IndexedDB on that device. They are never bundled, uploaded or committed. See [docs/PRIVACY.md](docs/PRIVACY.md).

- **Documents:** Document Library → Add documents (PDF, DOCX, XLSX, CSV, TXT, MD)
- **Corporate facts:** Settings → Private fact pack → Import (`format: "threex-fact-pack"`)
- **Statute library:** `npm run legal-pack -- <out> <statute-dir> …` builds a folder of split plain-text statutes from texts you hold locally. Drag that folder's files into the Document Library.

## Deploying

The app is plain static files with relative paths and hash routing, so it works from any sub-path, including GitHub Pages. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), which also covers installing on iPhone.

## Documentation

- [Architecture and stack trade-offs](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Privacy](docs/PRIVACY.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Sources and limitations](docs/SOURCES_AND_LIMITATIONS.md)
- [Feature status and backlog](docs/FEATURE_STATUS.md)
- [Deployment and iPhone install](docs/DEPLOYMENT.md)
