# Contributing

No dependencies, no install step - just Node 18+ for the tests and the build.

```bash
npm test            # unit tests (fake GitHub API, exports, classification)
node scripts/build.mjs   # regenerate index.html from src/
npm run check       # fails if index.html is stale
npm run e2e         # Playwright UI tests (pip install -r tests/e2e/requirements.txt; playwright install chromium)
```

- Edit files in `src/` (`core.js` = logic without DOM, `app.js` = UI, `style.css`, `index.template.html`), never `index.html` by hand.
- Add a test for every bug fix (`tests/fake-github.js` is an offline GitHub stand-in).
- Bump `VERSION` **and** `package.json`, update `CHANGELOG.md`, rebuild.
- Be kind: this project follows the [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
