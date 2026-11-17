# Architecture

One file to ship, a few small files to maintain.

```
src/core.js   ──┐  classification · GitHub client (retries, ETag, rate-limit) · catalog · XLSX/CSV/JSON · snapshot codec
src/app.js    ──┤  UI: table, filters, views, columns, notes, new-release tracking, storage, loading
src/style.css ──┼─►  scripts/build.mjs  ─►  index.html   (everything inlined, no external requests)
src/index.template.html ┘
scripts/snapshot.mjs  (uses core.js)  ─►  catalog.json   (published next to index.html by the Pages workflow)
```

## Data flow

1. **Start-up** - look for data in this order: the IndexedDB cache and `catalog.json` (only when the page is served over http/https);
   take the newest one whose *settings signature* (sources, filter, aggregates, depth, archived) equals the current settings.
   Otherwise show whatever is cached, flagged as "different settings".
2. **Refresh** - `fetchCatalog` discovers repositories, then scans them 6 at a time. Each request carries `If-None-Match` when an `ETag`
   is cached, so unchanged resources return a free `304`. Results are written to IndexedDB as a compact snapshot.
3. **Render** - rows are filtered / sorted in memory and painted by a virtualised table (only visible rows exist in the DOM).

## Storage

| What | Where | Why |
|---|---|---|
| catalog, release notes | IndexedDB `kv/catalog` | no 5 MB limit, structured clone |
| HTTP bodies + ETags | IndexedDB `http` | conditional requests |
| settings, columns, widths, views, theme, "seen" date | `localStorage` | tiny, synchronous |
| personal access token | memory only | never persisted |

## Security model

- Strict CSP: `default-src 'none'`; scripts and styles only inline; `connect-src 'self' https://api.github.com`.
- All dynamic text is inserted with `textContent` / DOM nodes - there is no `innerHTML`. Release notes go through a small Markdown
  renderer that only emits `strong`, `code`, headings, lists, quotes, `pre` and **https** links (`rel="noopener noreferrer"`).
- CSV / XLSX exports neutralise formula injection; the XLSX writer is dependency-free.
- *Incoming update* unpacks archives defensively (zip-slip, symlinks, size limits) and never lets an archive replace `.github/`.

## Tests

`npm test` (38 tests, Node's built-in runner, offline fake GitHub API) and `python tests/e2e/run.py` (12 Playwright scenarios against the
built `index.html`, mocked API with ETag support, a local http server for the snapshot case).
