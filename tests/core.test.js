const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/core.js");
const F = require("./fake-github.js");

// Mirrors the built-in example defaults: storytold organisation, "craft" name filter, Labtoso/Artcraft aggregate.
const run = (routes = F.sampleRoutes(), opts = {}, sources = "storytold") => {
  const { includeAggregate = true, ...rest } = opts;
  const client = C.createClient({ fetchImpl: F.createFetch(routes), backoffMs: 0 });
  return C.fetchCatalog(client, sources, { keyword: "craft", aggregates: includeAggregate ? C.DEFAULT_AGGREGATES : [], ...rest });
};
const files = (res, ext) => res.rows.filter((r) => r.extension === ext).map((r) => r.file_name).sort();

test("classification: platform / architecture / package type", () => {
  const cases = [
    ["ArtCraft_0.41.1_x64-setup.exe", "Windows", "x64", "Installer"],
    ["wordcraft-windows-x64.msi", "Windows", "x64", "Installer"],
    ["photocraft-windows-x64-portable.zip", "Windows", "x64", "Portable"],
    ["photocraft-windows-x64.zip", "Windows", "x64", "Archive"],
    ["soundcraft-linux-aarch64.AppImage", "Linux", "ARM64", "Portable"],
    ["anicraft-0.2.1-freebsd-x86_64.tar.gz", "FreeBSD", "x64", "Archive"],
    ["ArtCraft_universal.app.tar.gz", "macOS", "Universal", "Archive"],
    ["a-linux-riscv64.deb", "Linux", "RISC-V 64", "Installer"],
    ["a-0.1-linux-x86_64.flatpak", "Linux", "x64", "Flatpak"],
    ["a-0.1-linux-x86_64.pkg.tar.zst", "Linux", "x64", "Arch Package"],
    ["a-0.1-linux-x86_64.pkg.tar.zst.sig", "Linux", "x64", "Signature"],
    ["a-0.1-linux-x86_64.AppImage.zsync", "Linux", "x64", "Update Info"],
    ["SHA256SUMS.txt", "Unknown", "Unknown", "Metadata"],
    ["a-0.1-windows-x64-symbols.zip", "Windows", "x64", "Debug Symbols"],
  ];
  for (const [name, platform, architecture, pkg] of cases) {
    const c = C.classify(name);
    assert.deepEqual([c.platform, c.architecture, c.package_type], [platform, architecture, pkg], name);
  }
  assert.equal(C.classify("app-cli-1.0-macos-universal.zip").variant, "CLI");
  assert.equal(C.classify("app-web-1.0.zip").platform, "Web");
});

test("names and versions", () => {
  assert.equal(C.appNameFromRepo("craft-anything"), "Craft Anything");
  assert.equal(C.appNameFromAsset("effectcraft-cli-0.23.1-macos-universal.zip"), "Effectcraft");
  assert.equal(C.appNameFromAsset("SHA256SUMS.txt"), null);
  assert.equal(C.cleanVersion("artcraft-v0.41.1"), "0.41.1");
  assert.equal(C.cleanVersion("language-packs-2"), "language-packs-2");
  assert.ok(C.versionKey("0.10.0") > C.versionKey("0.9.0"));
});

test("repositories are filtered by name and archive state", async () => {
  const res = await run(undefined, { includeAggregate: false });
  assert.deepEqual([...new Set(res.rows.map((r) => r.application))].sort(), ["Anicraft", "Artcraft", "Effectcraft"]);
});

test("latest release only by default; drafts ignored", async () => {
  const res = await run(undefined, { includeAggregate: false });
  assert.deepEqual(files(res, ".exe"), ["ArtCraft_0.41.1_x64-setup.exe"]);
});

test("history depth finds older .exe installers", async () => {
  const res = await run(undefined, { includeAggregate: false, depth: 3 });
  assert.deepEqual(files(res, ".exe"), ["ArtCraft_0.40.0_x64-setup.exe", "ArtCraft_0.41.1_x64-setup.exe"]);
});

test("regression: aggregate assets are not labelled 'Artcraft' and do not duplicate it", async () => {
  const res = await run();
  for (const r of res.rows) if (r.file_name.startsWith("effectcraft")) assert.equal(r.application, "Effectcraft");
  const art = res.rows.filter((r) => r.application === "Artcraft");
  assert.ok(art.every((r) => r.repository === "storytold/artcraft"));
});

test("older aggregate copies are dropped, unique aggregate apps kept", async () => {
  const res = await run();
  const eff = res.rows.filter((r) => r.application === "Effectcraft");
  assert.deepEqual([...new Set(eff.map((r) => r.repository))], ["storytold/effectcraft"]);
  const pdf = res.rows.filter((r) => r.application === "Pdfcraft");
  assert.ok(pdf.length && pdf.every((r) => r.source === "Aggregate"));
  assert.equal(res.skippedDuplicates, 2);
});

test("version cleaned, digest parsed, symbols classified", async () => {
  const res = await run(undefined, { includeAggregate: false });
  const exe = res.rows.find((r) => r.file_name.endsWith("x64-setup.exe"));
  assert.equal(exe.version, "0.41.1");
  assert.equal(exe.sha256, "ab".repeat(32));
  assert.equal(exe.size_mb, 1);
  assert.equal(res.rows.find((r) => r.file_name.includes("symbols")).package_type, "Debug Symbols");
});

test("pagination collects every repository", async () => {
  const routes = F.sampleRoutes();
  routes["/orgs/storytold/repos"] = Array.from({ length: 130 }, (_, i) => F.repo("storytold", `x${i}craft`));
  for (let i = 0; i < 130; i++) routes[`/repos/storytold/x${i}craft/releases`] = [];
  const res = await run(routes, { includeAggregate: false });
  assert.equal(res.scanned, 130);
});

test("assets beyond the embedded list are paginated", async () => {
  const routes = F.sampleRoutes();
  const many = Array.from({ length: 150 }, (_, i) => F.asset(1000 + i, `anicraft-0.2.1-linux-x86_64-${i}.deb`));
  routes["/repos/storytold/anicraft/releases"] = [F.release(20, "v0.2.1", "2026-11-12T01:41:19Z", many.slice(0, 100))];
  routes["/repos/storytold/anicraft/releases/20/assets"] = many;
  const res = await run(routes, { includeAggregate: false });
  assert.equal(res.rows.filter((r) => r.application === "Anicraft").length, 150);
});

test("falls back to a user account when the organisation does not exist", async () => {
  const routes = F.sampleRoutes();
  routes["/users/storytold/repos"] = routes["/orgs/storytold/repos"];
  delete routes["/orgs/storytold/repos"];
  assert.ok((await run(routes, { includeAggregate: false })).rows.length > 0);
});

test("rate limit aborts with a clear message", async () => {
  const routes = F.sampleRoutes();
  routes["/repos/storytold/anicraft/releases"] = { __response: F.response(403, { message: "rate" }, { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "1760000000" }) };
  await assert.rejects(run(routes, { includeAggregate: false }), (e) => e instanceof C.RateLimitError && /rate limit/.test(e.message));
});

test("one failing repository is reported, not fatal", async () => {
  const routes = F.sampleRoutes();
  routes["/repos/storytold/anicraft/releases"] = { __response: F.response(404, { message: "Not Found" }) };
  const res = await run(routes, { includeAggregate: false });
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /anicraft/);
  assert.ok(res.rows.length > 0);
});

test("transient server errors are retried", async () => {
  const routes = F.sampleRoutes();
  let n = 0;
  const base = F.createFetch(routes);
  const flaky = async (url, init) => (new URL(url).pathname.endsWith("/effectcraft/releases") && n++ < 2 ? F.response(502, {}) : base(url, init));
  const client = C.createClient({ fetchImpl: flaky, backoffMs: 0 });
  const res = await C.fetchCatalog(client, "storytold", { keyword: "craft" });
  assert.ok(res.rows.some((r) => r.application === "Effectcraft"));
});

test("cancellation stops the refresh", async () => {
  const ctl = new AbortController();
  ctl.abort();
  const client = C.createClient({ fetchImpl: F.createFetch(F.sampleRoutes()), signal: ctl.signal });
  await assert.rejects(C.fetchCatalog(client, "storytold", { keyword: "craft", aggregates: C.DEFAULT_AGGREGATES, signal: ctl.signal }), (e) => e instanceof C.Cancelled);
});

// ---- exports ------------------------------------------------------------------------------------------------------
const ROW = { application: "Artcraft", version: "0.41.1", published: "2026-11-07T02:49:42Z", prerelease: "No", platform: "Windows",
  architecture: "x64", package_type: "Installer", extension: ".exe", variant: "Desktop", file_name: "ArtCraft_0.41.1_x64-setup.exe",
  size_mb: 40.05, sha256: "", repository: "storytold/artcraft", source: "Repository", download_url: "https://x/a.exe", release_url: "https://x/r",
  id: "internal", fetched_at: "internal" };

test("CSV: header row, quoting, BOM, no internal fields (regression)", () => {
  const csv = C.toCSV([ROW, { ...ROW, file_name: 'we"ird,name', application: "=HYPERLINK(1)" }]);
  assert.ok(csv.startsWith("\uFEFFApplication,Version,"));
  assert.ok(!/fetched_at|\bid\b/i.test(csv.split("\r\n")[0]));
  assert.ok(csv.includes('"we""ird,name"'));
  assert.ok(csv.includes("'=HYPERLINK(1)"));
  assert.equal(csv.trim().split("\r\n").length, 3);
});

test("JSON export uses only public keys", () => {
  const data = JSON.parse(C.toJSON([ROW]));
  assert.deepEqual(Object.keys(data[0]), C.KEYS);
});

test("XLSX is a valid stored ZIP with the expected parts", () => {
  const bytes = C.toXLSX([ROW, { ...ROW, file_name: "=SUM(1,1)" }]);
  assert.equal(Buffer.from(bytes.slice(0, 2)).toString(), "PK");
  const text = Buffer.from(bytes).toString("latin1");
  for (const part of ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]) assert.ok(text.includes(part), part);
  assert.ok(text.includes("=SUM(1,1)") && text.includes('t="inlineStr"'));
  assert.equal(C.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

// ---- generalisation (any organisation / user / repository) ---------------------------------------------------------
test("parseSources accepts names, owner/repo, URLs; drops junk and duplicates", () => {
  assert.deepEqual(C.parseSources("storytold, microsoft/winget-cli https://github.com/cli/cli.git;bad//x storytold"),
    [{ owner: "storytold" }, { owner: "microsoft", repo: "winget-cli" }, { owner: "cli", repo: "cli" }]);
  assert.deepEqual(C.parseSources(""), []);
});

test("an empty name filter scans every repository", async () => {
  const res = await run(undefined, { includeAggregate: false, keyword: "" });
  assert.ok(res.rows.some((r) => r.repository === "storytold/docs") === false); // docs has no releases route -> reported, not fatal
  assert.ok(res.errors.some((e) => /docs/.test(e)));
});

test("direct owner/repo sources ignore the name filter and need no discovery call", async () => {
  const fetchImpl = F.createFetch(F.sampleRoutes());
  const client = C.createClient({ fetchImpl, backoffMs: 0 });
  const res = await C.fetchCatalog(client, "storytold/anicraft", { keyword: "nomatch" });
  assert.deepEqual([...new Set(res.rows.map((r) => r.application))], ["Anicraft"]);
  assert.ok(!fetchImpl.calls.some((c) => c.endsWith("/repos") ));
});

test("several sources are merged without duplicates", async () => {
  const routes = F.sampleRoutes();
  routes["/orgs/other/repos"] = [F.repo("other", "toolcraft")];
  routes["/repos/other/toolcraft/releases"] = [F.release(90, "v1.0.0", "2026-11-01T00:00:00Z", [F.asset(91, "toolcraft-1.0.0-linux-x86_64.deb")])];
  const res = await run(routes, { includeAggregate: false }, "storytold, other, storytold/anicraft");
  assert.deepEqual([...new Set(res.rows.map((r) => r.repository))].sort(),
    ["other/toolcraft", "storytold/anicraft", "storytold/artcraft", "storytold/effectcraft"]);
});

test("archived repositories can be included on request", async () => {
  const routes = F.sampleRoutes();
  routes["/repos/storytold/oldcraft/releases"] = [F.release(70, "v0.1.0", "2025-01-01T00:00:00Z", [F.asset(71, "oldcraft-0.1.0-windows-x64.msi")])];
  const res = await run(routes, { includeAggregate: false, includeArchived: true });
  assert.ok(res.rows.some((r) => r.application === "Oldcraft"));
});

test("an unknown source is reported but does not hide the others", async () => {
  const res = await run(undefined, { includeAggregate: false }, "storytold, ghost-owner-404");
  assert.ok(res.errors.some((e) => /ghost-owner-404/.test(e)));
  assert.ok(res.rows.length > 0);
});

test("fetchCatalog requires a source", async () => {
  await assert.rejects(run(undefined, {}, ""), /at least one/);
});

// ---- 3.1: downloads, notes, ETag, concurrency, snapshot ------------------------------------------------------------
test("download counts and release notes are captured", async () => {
  const res = await run(undefined, { includeAggregate: false });
  const exe = res.rows.find((r) => r.file_name.endsWith("x64-setup.exe"));
  assert.equal(exe.downloads, 3); // fake: id 1 * 3
  assert.equal(res.releases[C.releaseKey(exe)].body, "Notes for artcraft-v0.41.1");
  assert.ok(Object.keys(res.releases).every((k) => res.rows.some((r) => C.releaseKey(r) === k))); // no orphan notes
});

test("long release notes are truncated", async () => {
  const routes = F.sampleRoutes();
  routes["/repos/storytold/anicraft/releases"][0].body = "x".repeat(50000);
  const res = await run(routes, { includeAggregate: false });
  assert.ok(Object.values(res.releases).every((n) => n.body.length <= 6000));
});

test("conditional requests: a second refresh is answered by 304s from the cache", async () => {
  const fetchImpl = F.withEtags(F.createFetch(F.sampleRoutes()));
  const store = new Map();
  const cache = { get: (u) => store.get(u), set: (u, v) => store.set(u, v) };
  const go = async () => {
    const client = C.createClient({ fetchImpl, backoffMs: 0, cache });
    const res = await C.fetchCatalog(client, "storytold", { keyword: "craft", aggregates: C.DEFAULT_AGGREGATES });
    return { res, stats: client.stats };
  };
  const first = await go();
  assert.equal(first.stats.notModified, 0);
  const second = await go();
  assert.equal(second.stats.notModified, second.stats.requests - 0); // every request was a free 304 (repos 404s aside)
  assert.deepEqual(second.res.rows, first.res.rows);
});

test("work is parallel but bounded, and result order is deterministic", async () => {
  const routes = F.sampleRoutes();
  routes["/orgs/storytold/repos"] = Array.from({ length: 20 }, (_, i) => F.repo("storytold", `r${String(i).padStart(2, "0")}craft`));
  for (let i = 0; i < 20; i++) routes[`/repos/storytold/r${String(i).padStart(2, "0")}craft/releases`] = [F.release(i + 1, "v1.0.0", "2026-11-01T00:00:00Z", [F.asset(i + 100, `r${i}craft-1.0.0-linux-x86_64.deb`)])];
  let inFlight = 0, peak = 0;
  const base = F.createFetch(routes);
  const slow = async (u, init) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return base(u, init); };
  const client = C.createClient({ fetchImpl: slow, backoffMs: 0 });
  const res = await C.fetchCatalog(client, "storytold", { keyword: "craft", concurrency: 4 });
  assert.ok(peak > 1 && peak <= 4, "peak " + peak);
  assert.deepEqual(res.rows.map((r) => r.repository), [...res.rows.map((r) => r.repository)].sort());
});

test("pool stops on the first error", async () => {
  let started = 0;
  await assert.rejects(C.pool([1, 2, 3, 4, 5, 6], 2, async (n) => { started++; if (n === 2) throw new Error("boom"); await new Promise((r) => setTimeout(r, 5)); }), /boom/);
  assert.ok(started < 6);
});

test("the latest-release lookup asks for a small page, not 100 releases", async () => {
  const fetchImpl = F.createFetch(F.sampleRoutes());
  const seen = [];
  const spy = async (u, i) => { seen.push(u); return fetchImpl(u, i); };
  await C.fetchCatalog(C.createClient({ fetchImpl: spy, backoffMs: 0 }), "storytold/anicraft", { depth: 1 });
  assert.ok(seen.some((u) => /releases\?per_page=6/.test(u)), seen.join("\n"));
});

test("snapshot round-trips and its signature ignores formatting", async () => {
  const res = await run();
  const cfg = { sources: "storytold", keyword: "craft", aggregates: "Labtoso/Artcraft", depth: 1, archived: false };
  const snap = JSON.parse(JSON.stringify(C.encodeSnapshot(res, cfg, "2026-11-15T00:00:00Z")));
  const back = C.decodeSnapshot(snap);
  assert.deepEqual(back.rows, res.rows.map((r) => Object.fromEntries(C.KEYS.map((k) => [k, r[k]]))));
  assert.deepEqual(back.releases, res.releases);
  assert.equal(snap.rows[0].length, C.KEYS.length); // compact: arrays, not objects
  assert.equal(C.signature({ ...cfg, sources: " Storytold ,storytold/ " }), C.signature(cfg));
  assert.notEqual(C.signature({ ...cfg, depth: 3 }), C.signature(cfg));
  assert.equal(C.decodeSnapshot({ v: 2 }), null);
});
