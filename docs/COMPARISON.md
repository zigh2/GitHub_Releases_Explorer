# How GitHub Releases Explorer compares

*Checked November 2026 against each project's own README / manual. Features change - follow the links for the latest.*

GitHub Releases Explorer answers one question: **"what files does this organization (or this list of repositories) publish, for which
platform, and how do I get them into a spreadsheet?"** Other tools answer neighbouring questions, so the honest comparison is about
*fit*, not about who is "better".

| | Form | Scope | What you get | Classifies files (OS / arch / package type) | Table export | Install |
|---|---|---|---|---|---|---|
| **GitHub Releases Explorer** | one HTML file (~75 KB, 23 KB gzipped) | **many repos at once**: an organization, a user, or an explicit `owner/repo` list | one row per release **asset**, filters, search, sort | **yes**, from file names | **XLSX, CSV, JSON** | none |
| [`gh release`](https://man.archlinux.org/man/gh-release-download.1.en) (GitHub CLI) | official CLI | one repository (`-R owner/repo`) | list releases, view, **download by glob pattern**, create/edit/upload | no (you write the pattern) | scripting only | install `gh` |
| [eget](https://github.com/zyedidia/eget) | CLI | one repository per run | finds and downloads/extracts a **prebuilt binary** for your system | detects for *installing*, not for browsing | no | single binary |
| [brows](https://x-cmd.com/install/brows) | terminal UI | one repository | two-pane list of releases and assets, Enter to download | no | no | install via x-cmd / brew |
| [Release Viewer](https://github.com/k-urtica/release-viewer) | web app | one repository | readable **release notes** with infinite scroll | no | no | hosted / self-host |
| [GithubStarsManager](https://github.com/AmintaCCCP/GithubStarsManager) | web / desktop app | **your starred** repositories | release timeline & subscriptions, **asset filters by platform and file type**, AI categorisation | filters by platform / type | not documented | app (data stays in the browser unless you add its backend) |
| [JASP modules-app](https://github.com/jasp-stats-modules/modules-app) | web app | **one ecosystem** (JASP modules) | search / filter and install modules from a prebuilt `index.json` | domain-specific | no | hosted |

## Where this project is different

- **Cross-repository asset table.** Most release tools are per-repository; this one flattens *every* repository of an organization
  into a single sortable, filterable table - handy for "which of these 20 apps ships an `.exe` for Windows x64?".
- **Spreadsheet-ready.** Exactly the visible rows go to Excel / CSV / JSON (the XLSX writer is built in, no library).
- **Zero footprint.** One static file: double-click it, host it on GitHub Pages, or attach it to an email. Strict
  Content-Security-Policy; the only host it can talk to is `api.github.com`.
- **Aggregate / mirror awareness.** Repositories that republish other apps' files are mapped back to the right application and
  de-duplicated against the original repositories.

## Where the others are better (use them instead when…)

- You want to **install or download automatically** - use `gh release download` or eget. This tool lists and links; it does not download for you.
- You need to **read release notes** - Release Viewer (or GitHub itself).
- You want **notifications / a feed of new releases** of what you starred - GithubStarsManager.
- You need **CI automation** - the GitHub CLI is the right tool; this app is interactive.

## Known limits of this project

- Anonymous GitHub API access is limited to 60 requests/hour; one refresh costs about one request per repository
  (use a personal access token for 5,000/hour).
- Platform / architecture / package type are **inferred from file names** - unusual naming shows `Unknown`.
- Public data (and whatever your optional token can read); no private-repo browsing UI beyond that.
- History depth is capped at the latest 10 releases per repository to stay within API limits.
