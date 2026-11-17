// Guards the GitHub Actions workflows against the mistakes that have bitten this project before.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const dir = path.join(root, ".github", "workflows");
const present = fs.existsSync(dir); // the staged copy used by "Incoming update" has no .github/
const workflows = present ? fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

/** Lines that belong to a `run:` script (indentation based - good enough for our own files). */
function runLines(text) {
  const out = [], lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    if (m[2] && !/^[|>][-+]?$/.test(m[2])) { out.push([i + 1, m[2]]); continue; }
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() && l.search(/\S/) <= indent + (lines[i].includes("- run:") ? 2 : 0)) break;
      out.push([j + 1, l]);
    }
  }
  return out;
}

test("workflows exist", () => { if (present) assert.ok(workflows.length >= 4); });

test("no ${{ }} expressions inside run: scripts (script-injection hygiene) - pass values through env:", () => {
  for (const f of workflows) {
    for (const [n, line] of runLines(read(f))) assert.ok(!line.includes("${{"), `${f}:${n} interpolates an expression into a shell script: ${line.trim()}`);
  }
});

test("actions that target the deprecated Node 20 runtime are not used", () => {
  for (const f of workflows) {
    const text = read(f);
    assert.ok(!/actions\/checkout@v[1-5]\b/.test(text), f + " uses an old checkout");
    assert.ok(!/actions\/setup-node@v[1-5]\b/.test(text), f + " uses an old setup-node");
    assert.ok(!/actions\/setup-python@v[1-5]\b/.test(text), f + " uses an old setup-python");
    assert.ok(!/actions\/configure-pages@v[1-5]\b/.test(text), f + " uses an old configure-pages");
    assert.ok(!/actions\/upload-pages-artifact@v[1-4]\b/.test(text), f + " uses an old upload-pages-artifact");
    assert.ok(!/actions\/deploy-pages@v[1-4]\b/.test(text), f + " uses an old deploy-pages");
  }
});

test("CI never tests on end-of-life Node versions", () => {
  if (!present) return;
  const m = /node:\s*\[([^\]]+)\]/.exec(read("ci.yml"));
  assert.ok(m, "node matrix not found");
  for (const v of m[1].split(",").map((s) => Number(s.replace(/["'\s]/g, "")))) assert.ok(v >= 22, "Node " + v + " is end-of-life");
});

test("files referenced by workflows exist", () => {
  if (!present) return;
  for (const f of ["scripts/snapshot.mjs", "scripts/test.mjs", "scripts/build.mjs", ".github/scripts/safe_extract.py", "snapshot.config.json", "tests/e2e/requirements.txt", "tests/e2e/run.py"]) {
    assert.ok(fs.existsSync(path.join(root, f)), f);
  }
});

test("the release workflow validates its tag input", () => {
  if (!present) return;
  const text = read("release.yml");
  assert.match(text, /tag="v\$\{raw#v\}"/, "tag is normalised to a leading v");
  assert.match(text, /VERSION must match the tag/);
});

test("the Pages workflow skips cleanly (notice, not an error) when Pages is not enabled", () => {
  if (!present) return;
  const text = read("pages.yml");
  assert.match(text, /build_type/);
  const steps = text.split(/\n(?=\s{6}- )/); // one chunk per step
  for (const action of ["actions/checkout", "actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"]) {
    const step = steps.find((s) => s.includes(`uses: ${action}@`));
    assert.ok(step, action + " step not found");
    assert.ok(step.includes("if: steps.pages.outputs.enabled == 'true'"), action + " must be gated on the Pages check");
  }
});

test("package.json test script does not rely on shell globs", () => {
  assert.ok(!/\*/.test(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.test));
});
