# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/) · versioning: [SemVer](https://semver.org/).

## [3.1.2] - 2026-11-17

### Fixed
- **Release workflow failed when started manually with a tag typed without `v`** (`3.1.1`): checkout looked for a branch/tag literally named
  `3.1.1`. The tag is now normalised (`3.1.1`, `v3.1.1` and `refs/tags/v3.1.1` all work), validated with a clear error that lists the existing
  tags, and can be created from the selected branch with the new `create_tag` option.
- The release now refuses to publish when `VERSION` does not match the tag.
- Pages workflow moved to the Node 24 majors: `configure-pages@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`.

### Changed
- **Script-injection hygiene**: no `${{ }}` expression is interpolated into a shell script any more; values travel through `env:`.
- *Incoming update* copies files with `cp -a` instead of `rsync` (no dependency on the runner image, which is now Ubuntu 26.04).
- `tests/workflows.test.js` guards all of this (no expressions in `run:`, no Node-20 actions, no end-of-life Node in CI, referenced files exist,
  tag normalisation present, no shell globs in `npm test`). Every workflow script is also syntax-checked with `bash -n` before release.

## [3.1.1] - 2026-11-17

### Fixed
- **CI failed on Node 20**: `node --test "tests/*.test.js"` relies on glob support that only exists from Node 21. Tests now run through
  `scripts/test.mjs`, which passes explicit file names and works on every Node version.

### Changed
- CI matrix is now Node 22 and 24 (Node 20 reached end-of-life in April 2026); `engines` is `>=20`.
- Workflows use `actions/checkout@v6`, `actions/setup-node@v6`, `actions/setup-python@v6` (Node 24 runtimes) - this removes the
  "Node.js 20 is deprecated" warnings. The UI-test job is pinned to `ubuntu-24.04`.

## [3.1.0] - 2026-11-17

### Added
- **Download counts** (`Downloads` column, numeric sort, in every export).
- **Columns menu** (show / hide, reset), **draggable column borders**, and **double-click to fit all columns to their content** except SHA256; remembered.
- **Saved views**: built-in presets (Windows x64 installers, Linux packages, macOS, Everything) and your own named views.
- **What's new**: banner with the number of releases published since you last marked things as seen, `NEW` badges, *Show only new*, *Mark all as seen*.
- **Release notes panel** (collapsed by default) with a small, safe Markdown renderer (no HTML injection, https links only).
- **`catalog.json` snapshot** (`scripts/snapshot.mjs`, `snapshot.config.json`) published with the app on GitHub Pages; the page uses it when its settings match, with zero API calls.
- **Pages workflow** (`pages.yml`): deploys on every change and every 6 hours; also called by *Incoming update*.
- **Playwright UI tests** (`tests/e2e/`, 12 scenarios) and an `e2e` job in CI.
- `docs/ARCHITECTURE.md`.

### Changed
- The catalog and the HTTP cache moved from `localStorage` to **IndexedDB** (no 5 MB ceiling; 15,000 rows tested).
- **Conditional requests (`ETag`)**: unchanged resources are answered by free `304`s; the status line reports them.
- Repositories are scanned **6 in parallel**, and the latest-release lookup asks for a small page instead of 100 releases.
- Sorting / filtering paints synchronously (no blank frame); `Settings` gained *Clear cache*.

## [3.0.0] - 2026-11-14

### Changed (breaking)
- **Renamed to GitHub Releases Explorer** (it was "ArtCraft Releases Explorer"). Browser storage keys changed from `acx.*` to
  `ghre.*`, so settings and the cached catalog start fresh. The release file is now `GitHubReleasesExplorer-<version>.html`.
- **No longer tied to one organization.** Settings accept any mix of organizations, users and `owner/repo` entries (or GitHub URLs),
  an optional repository-name filter, optional aggregate/mirror repositories and *Include archived*. The built-in values
  (`storytold`, filter `craft`, aggregate `Labtoso/Artcraft`) remain only as the **example defaults** (`Use example` button).

### Added
- **Share links**: `index.html#source=storytold&filter=craft&depth=3` opens the page and loads that data. `Copy link` in Settings builds one.
- **Content-Security-Policy**: the page can only run its own inline code and only contact `api.github.com`.
- Documentation: screenshots, `docs/COMPARISON.md` (comparison with `gh release`, eget, brows, Release Viewer,
  GithubStarsManager, JASP modules-app), `docs/PUBLISHING.md` (repository settings checklist), social-preview image, Code of Conduct.
- Tests: multi-source scanning, direct `owner/repo`, URL parsing, archived repositories, CSP guard.

### Fixed
- Settings dialog: the *History depth* drop-down no longer stretches vertically.

## [2.0.0] - 2026-11-14
- Rewrite: Python/Qt desktop app (130 MB unpacked) replaced by a single ~50 KB `index.html` with zero dependencies; built-in XLSX writer;
  virtualised table; Node test runner; Node-based CI / release / incoming-update workflows.

## [1.1.x]
- Python/Qt desktop application: CSV-export fix, duplicate-application fix, history depth, light/dark mode, reset filters,
  Shift + wheel scrolling, `incoming/` workflow (see git history).
