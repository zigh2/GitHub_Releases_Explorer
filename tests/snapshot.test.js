const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const C = require("../src/core.js");
const F = require("./fake-github.js");

test("buildSnapshot produces a compact, decodable catalog", async () => {
  const { buildSnapshot } = await import("../scripts/snapshot.mjs");
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "snapshot.config.json"), "utf8"));
  const { snapshot, result, requests } = await buildSnapshot({ config, fetchImpl: F.createFetch(F.sampleRoutes()), now: new Date("2026-11-15T03:00:00Z") });
  assert.equal(snapshot.generatedAt, "2026-11-15T03:00:00.000Z");
  assert.equal(C.signature(snapshot.config), C.signature(config));
  assert.equal(C.decodeSnapshot(snapshot).rows.length, result.rows.length);
  assert.ok(requests > 0 && requests < 20);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  fs.writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(snapshot));
  assert.ok(fs.statSync(path.join(dir, "catalog.json")).size < JSON.stringify(result.rows).length); // arrays beat objects
});

test("snapshot.config.json is valid and uses the example defaults", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "snapshot.config.json"), "utf8"));
  assert.equal(config.sources, C.DEFAULT_SOURCE);
  assert.ok(C.parseSources(config.sources).length >= 1);
});
