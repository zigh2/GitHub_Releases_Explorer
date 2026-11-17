<div align="center">

# GitHub Releases Explorer

**Browse, filter and export the release assets of any GitHub organization, user or repository.**<br>
One ~75 KB HTML file (23 KB gzipped) · no install · no dependencies · works offline after the first refresh

[![CI](https://github.com/zigh2/GitHub_Releases_Explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/zigh2/GitHub_Releases_Explorer/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/zigh2/GitHub_Releases_Explorer?sort=semver)](https://github.com/zigh2/GitHub_Releases_Explorer/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Size](https://img.shields.io/badge/size-75%20KB-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

[العربية](README.ar.md) · [Comparison with similar tools](docs/COMPARISON.md) · [Changelog](CHANGELOG.md)

<img src="docs/screenshots/light.png" alt="GitHub Releases Explorer in light mode, listing the release assets of the storytold organization" width="900">

</div>

## Why

GitHub shows releases one repository at a time. When an organization ships a dozen apps you end up opening a dozen pages to answer
*"which of them has a Windows x64 `.exe`?"*. This tool reads the GitHub API directly from your browser, flattens every release asset
into **one sortable, filterable table**, and exports exactly what you see to Excel, CSV or JSON.

## Quick start

1. Open [`index.html`](index.html) (double-click it, or host it on GitHub Pages). On Windows, `run.bat` opens it in an app-style window.
2. Click **Refresh from GitHub**. The built-in example scans the [`storytold`](https://github.com/storytold) organization.
3. Open **Settings** to point it at anything else, for example `microsoft/winget-cli`, `cli`, or `torvalds, microsoft/terminal`.

Share a ready-made view with a link: `index.html#source=storytold&filter=craft&depth=3`.

## Features

| | |
|---|---|
| **Any source** | organizations, users, `owner/repo`, or GitHub URLs - several at once, with an optional repository-name filter |
| **Asset-level table** | one row per file: application, version, date, platform, architecture, package type, extension, variant, size, **download count**, SHA256, links |
| **Smart classification** | OS / CPU / package type inferred from file names (Installer, Portable, Archive, Flatpak, Arch package, Signature, Symbols…) |
| **Filters & views** | application, platform, architecture, package type, extension, variant, release type, multi-word search, *Hide signatures & metadata*, **Reset filters** (`Esc`); **saved views** (built-in presets + your own) |
| **Columns** | show / hide any column, **drag a column border to resize**, **double-click it to fit every column to its content** (the SHA256 digest keeps its width); choices are remembered |
| **What's new** | a banner counts releases published since you last marked things as seen; `NEW` badges, *Show only new*, *Mark all as seen* |
| **Release notes** | a collapsible panel (closed by default) renders the notes of the selected row's release - safely, as text, never as HTML |
| **History depth** | latest 1 / 3 / 5 / 10 releases per repository - finds files that only older releases contain |
| **Aggregate repositories** | mirrors that republish other apps' files are mapped to the right application and de-duplicated |
| **Export** | the visible rows to **XLSX**, **CSV** (Excel-safe, formula-injection-safe) or **JSON** |
| **Fast** | rows are virtualised (15,000 rows: sort ≈ 80 ms, search ≈ 45 ms, cold start ≈ 0.25 s); repositories are fetched 6 at a time with small requests |
| **Frugal with the API** | conditional requests (`ETag`): an unchanged repository costs a free `304`; the catalog lives in IndexedDB (no 5 MB limit); on GitHub Pages a **`catalog.json` snapshot** gives visitors data with zero API calls |
| **Comfort** | light / dark mode, **Shift + wheel** horizontal scroll, sticky header, copy-link buttons, share links |
| **Private by design** | no server, no tracking; a strict Content-Security-Policy allows only the page itself and `api.github.com`; the optional token stays in memory |

<details>
<summary>More screenshots</summary>

<img src="docs/screenshots/dark-filtered.png" alt="Dark mode with Windows / x64 / Installer filters applied" width="900">
<img src="docs/screenshots/columns-new.png" alt="Columns menu and the what's-new banner" width="900">
<img src="docs/screenshots/settings.png" alt="Settings dialog" width="900">

</details>

## How it compares

| | scope | output |
|---|---|---|
| **GitHub Releases Explorer** | many repositories at once | filterable asset table → XLSX / CSV / JSON |
| `gh release` (GitHub CLI) | one repository | list / download by pattern |
| eget | one repository | downloads a prebuilt binary |
| brows | one repository | terminal UI |
| Release Viewer | one repository | release notes |
| GithubStarsManager | your starred repositories | release timeline + asset filters |

Details, links and where the other tools are the better choice: **[docs/COMPARISON.md](docs/COMPARISON.md)**.

## Live demo with automatic data (GitHub Pages)

The *Pages* workflow publishes `index.html` plus `catalog.json` - a snapshot of the catalog described in
[`snapshot.config.json`](snapshot.config.json), rebuilt every 6 hours. Visitors see data immediately and spend none of their own
API quota; **Refresh from GitHub** still fetches live data. Change `snapshot.config.json` to snapshot another organization.
Setup: [docs/PUBLISHING.md](docs/PUBLISHING.md).

## GitHub API rate limit

Anonymous access allows 60 requests/hour and one refresh costs about one request per repository. A personal access token
(no scopes needed for public data) raises it to 5,000/hour - paste it in **Settings**; it is never stored.

## Updating the repository from a zip (`incoming/`)

Put **one** project `.zip` into [`incoming/`](incoming/README.md) and push: the *Incoming update* workflow unpacks it safely,
verifies it (tests + build check), replaces the project files, tags `v<VERSION>` and publishes a release.
One-time setup is in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Develop

```bash
npm test                 # Node >= 18, no dependencies: logic, exports, snapshot
node scripts/build.mjs   # src/ -> index.html   (npm run check verifies it is current)
pip install -r tests/e2e/requirements.txt && playwright install chromium
python tests/e2e/run.py  # 12 browser tests against the built page (mocked GitHub API)
```

| Path | Purpose |
|---|---|
| `src/core.js` | classification, GitHub client, catalog logic, CSV / JSON / XLSX writers (no DOM) |
| `src/app.js`, `style.css`, `index.template.html` | UI |
| `scripts/build.mjs`, `scripts/snapshot.mjs` | inline `src/` into `index.html`; build `catalog.json` |
| `tests/`, `tests/e2e/` | unit tests with an offline fake GitHub API; Playwright UI tests |
| `docs/` | architecture, comparison, publishing checklist, screenshots |
| `.github/` | CI, release and incoming-update workflows, issue / PR templates |

## FAQ

**Why are some columns `Unknown`?** Attributes come from file names; unusual naming can't be classified.
**Why a single HTML file?** It is trivially auditable, needs no installer, and the whole app is smaller than most icons.
**Does it download files for me?** No - it lists and links. Use `gh release download` or eget for automation.

## License

[MIT](LICENSE)
