# Publishing checklist (GitHub repository settings)

Do this once after creating the repository - it is what makes the project look finished.

**About box**
- *Description:* `Browse, filter and export the release assets of any GitHub organization, user or repository. One 50 KB HTML file - no install.`
- *Website:* your GitHub Pages URL (below).
- *Topics:* `github`, `github-api`, `releases`, `release-assets`, `downloads`, `release-explorer`, `single-file`, `vanilla-js`, `dark-mode`, `csv-export`, `xlsx`
- Tick *Releases* and *Packages: off*.

**Social preview** - Settings → General → Social preview → upload `docs/social-preview.png` (1280×640).

**GitHub Pages (live demo)** - Settings → Pages → *Deploy from a branch* → `main` / `(root)`. The site is just `index.html`.
Share ready-made views with links such as
`https://<user>.github.io/<repo>/#source=storytold&filter=craft` (the page loads that data on open).

**Actions** - Settings → Actions → General → Workflow permissions → *Read and write* (needed by *Incoming update* and *Release*).

**Branch protection (optional)** - require the *CI* checks on `main`.

**First release** - bump `VERSION` + `package.json`, update `CHANGELOG.md`, `node scripts/build.mjs`, then either push the tag
`v3.0.0` or drop the project zip in `incoming/`. The *Release* workflow attaches `GitHubReleasesExplorer-3.0.0.html` and its SHA256.
