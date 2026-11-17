const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("VERSION, package.json and index.html agree", () => {
  const version = read("VERSION").trim();
  assert.match(version, /^\d+\.\d+\.\d+/);
  assert.equal(JSON.parse(read("package.json")).version, version);
  assert.ok(read("index.html").includes(`content="GitHub Releases Explorer ${version}"`), "run: node scripts/build.mjs");
});

test("index.html is self-contained and small", () => {
  const html = read("index.html");
  assert.ok(Buffer.byteLength(html) < 200 * 1024, "index.html must stay under 200 KB");
  assert.ok(!/<script[^>]+src=/i.test(html), "no external scripts");
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html), "no external stylesheets");
  const hosts = new Set([...html.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
  for (const h of hosts) assert.ok(["api.github.com", "github.com", "www.w3.org", "schemas.openxmlformats.org", "schemas.microsoft.com"].includes(h) || h.endsWith("openxmlformats.org"), "unexpected host: " + h);
});

test("index.html ships a strict Content-Security-Policy", () => {
  const html = read("index.html");
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(csp, "CSP meta tag missing");
  assert.match(csp[1], /default-src 'none'/);
  assert.match(csp[1], /connect-src 'self' https:\/\/api\.github\.com(;|$)/);
  assert.ok(!/unsafe-eval/.test(csp[1]));
});

test("incoming/ folder and workflows exist (full checkout only)", () => {
  // The incoming-update workflow verifies a staged copy without .github/ and incoming/, so only check a real checkout.
  if (!fs.existsSync(path.join(root, ".github"))) return;
  assert.ok(fs.existsSync(path.join(root, "incoming", "README.md")));
  for (const f of ["ci.yml", "incoming-update.yml", "release.yml"]) assert.ok(fs.existsSync(path.join(root, ".github", "workflows", f)), f);
});
