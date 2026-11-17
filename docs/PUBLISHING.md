# Publishing checklist (GitHub repository settings)

Do this once after creating the repository - it is what makes the project look finished.

**About box**
- *Description:* `Browse, filter and export the release assets of any GitHub organization, user or repository. One small HTML file - no install.`
- *Website:* your GitHub Pages URL (below).
- *Topics:* `github`, `github-api`, `releases`, `release-assets`, `downloads`, `release-explorer`, `single-file`, `vanilla-js`, `dark-mode`, `csv-export`, `xlsx`
- Tick *Releases* and *Packages: off*.

**Social preview** - Settings → General → Social preview → upload `docs/social-preview.png` (1280×640).

**GitHub Pages (live demo + automatic data)** - Settings → Pages → Build and deployment → **Source: GitHub Actions**. The *Pages*
workflow then publishes `index.html` and a fresh `catalog.json` (see `snapshot.config.json`) on every change, every 6 hours, and
after each *Incoming update*. Run it once manually from the *Actions* tab (*Pages → Run workflow*) to get the first deployment.
Share ready-made views with links such as
`https://<user>.github.io/<repo>/#source=storytold&filter=craft` (the page loads that data on open).

**Actions** - Settings → Actions → General → Workflow permissions → *Read and write* (needed by *Incoming update* and *Release*).

**Branch protection (optional)** - require the *CI* checks on `main`.

**Releasing manually** - Actions → *Release* → *Run workflow*: type the tag (`3.1.2` or `v3.1.2` both work). If the tag does not exist yet,
tick *create_tag* to create it from the selected branch. `VERSION` must equal the tag, otherwise the run stops with an explanation.

**First release** - bump `VERSION` + `package.json`, update `CHANGELOG.md`, `node scripts/build.mjs`, then either push the tag
`v3.0.0` or drop the project zip in `incoming/`. The *Release* workflow attaches `GitHubReleasesExplorer-3.0.0.html` and its SHA256.
