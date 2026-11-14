# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/) · versioning: [SemVer](https://semver.org/).

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
