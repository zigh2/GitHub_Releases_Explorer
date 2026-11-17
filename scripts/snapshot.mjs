// Fetches the catalog for snapshot.config.json and writes a compact catalog.json (published next to index.html on GitHub Pages).
// Usage: GITHUB_TOKEN=... node scripts/snapshot.mjs [--config snapshot.config.json] [--out _site/catalog.json]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const C = require("../src/core.js");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildSnapshot({ config, token = "", fetchImpl = globalThis.fetch, now = new Date() }) {
  const client = C.createClient({ fetchImpl, token });
  const result = await C.fetchCatalog(client, config.sources, {
    keyword: config.keyword || "", aggregates: config.aggregates || "", depth: config.depth || 1, includeArchived: !!config.archived,
  });
  return { snapshot: C.encodeSnapshot(result, config, now.toISOString()), result, requests: client.stats.requests };
}

async function main() {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
  const configPath = resolve(root, arg("--config", "snapshot.config.json"));
  const out = resolve(root, arg("--out", "_site/catalog.json"));
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const { snapshot, result, requests } = await buildSnapshot({ config, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "" });
  mkdirSync(dirname(out), { recursive: true });
  const json = JSON.stringify(snapshot);
  writeFileSync(out, json);
  console.log(`catalog.json: ${result.rows.length} assets from ${result.scanned} repositories in ${requests} requests (${(json.length / 1024).toFixed(0)} KB)`);
  for (const e of result.errors) console.warn("warning: " + e);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
