#!/usr/bin/env python3
"""End-to-end tests: the real index.html in headless Chromium against a mocked GitHub API (no network).

    pip install playwright && playwright install chromium
    python tests/e2e/run.py            # all tests
    python tests/e2e/run.py notes ETag # only tests whose name contains one of the words
"""
import hashlib, http.server, json, os, subprocess, sys, tempfile, threading, traceback, csv
from functools import partial
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INDEX = "file://" + os.path.join(ROOT, "index.html")


def node(code):
    return subprocess.run(["node", "-e", code], cwd=ROOT, check=True, capture_output=True, text=True).stdout


ROUTES = json.loads(node("process.stdout.write(JSON.stringify(require('./tests/fake-github.js').sampleRoutes()))"))
SNAPSHOT = node("""
const C=require('./src/core.js'),F=require('./tests/fake-github.js');
(async()=>{const cfg={sources:'storytold',keyword:'craft',aggregates:'Labtoso/Artcraft',depth:1,archived:false};
const res=await C.fetchCatalog(C.createClient({fetchImpl:F.createFetch(F.sampleRoutes())}),cfg.sources,cfg);
process.stdout.write(JSON.stringify(C.encodeSnapshot(res,cfg,'2026-11-15T03:00:00Z')))})()""")

CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "ETag, X-RateLimit-Remaining, X-RateLimit-Reset"}


class Mock:
    """Fake api.github.com with ETag / 304 support and a request log."""
    def __init__(self, routes=None):
        self.routes = json.loads(json.dumps(routes or ROUTES))
        self.log = []
        self.n304 = 0

    def __call__(self, route):
        req = route.request
        if req.method == "OPTIONS":
            return route.fulfill(status=204, headers=CORS)
        u = urlparse(req.url); q = parse_qs(u.query)
        self.log.append(u.path)
        data = self.routes.get(u.path)
        if data is None:
            return route.fulfill(status=404, json={"message": "Not Found"}, headers=CORS)
        if isinstance(data, list):
            per, page = int(q.get("per_page", ["30"])[0]), int(q.get("page", ["1"])[0])
            data = data[(page - 1) * per: page * per]
        etag = '"' + hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest() + '"'
        if req.headers.get("if-none-match") == etag:
            self.n304 += 1
            return route.fulfill(status=304, headers={**CORS, "etag": etag})
        route.fulfill(status=200, json=data, headers={**CORS, "etag": etag})


class Env:
    def __init__(self, pw, mock=None, url=INDEX, viewport=(1440, 860), prefs=None):
        self.browser = pw.chromium.launch()
        self.ctx = self.browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, accept_downloads=True)
        self.errors = []
        self.mock = mock or Mock()
        self.ctx.route("https://api.github.com/**", self.mock)
        self.page = self.ctx.new_page()
        self.page.on("pageerror", lambda e: self.errors.append("pageerror: " + str(e)))
        self.page.on("console", lambda m: self.errors.append("console: " + m.text) if m.type in ("error", "warning") and "404" not in m.text else None)
        self.page.goto(url)
        for k, v in (prefs or {}).items():
            self.page.evaluate("([k,v])=>localStorage.setItem(k,v)", [k, v])
        if prefs:
            self.page.reload()

    def refresh(self):
        self.page.click("#refreshBtn")
        self.page.wait_for_selector("#refreshBtn:text('Refresh')")
        self.page.wait_for_timeout(250)

    def count(self):
        return self.page.inner_text("#count")

    def close(self):
        assert not self.errors, self.errors
        self.browser.close()


def eq(a, b, msg=""):
    assert a == b, f"{msg}: expected {b!r}, got {a!r}"


# ---------------------------------------------------------------------------------------------------------------------
def test_refresh_filters_reset(pw):
    e = Env(pw); p = e.page
    p.wait_for_selector("#status:text('No data yet')")
    e.refresh()
    eq(e.count(), "10 / 10 assets", "after refresh")
    p.select_option("select[data-key=extension]", ".exe"); eq(e.count(), "1 / 10 assets", "exe")
    p.select_option("select[data-key=extension]", ""); p.select_option("select[data-key=architecture]", "x64")
    p.select_option("select[data-key=extension]", ".msi"); eq(e.count(), "4 / 10 assets", "msi+x64")
    p.click("#resetBtn"); eq(e.count(), "10 / 10 assets", "reset")
    p.fill("#search", "anicraft windows"); eq(e.count(), "3 / 10 assets", "search")
    p.keyboard.press("Escape") if False else p.click("#resetBtn")
    p.check("#hideMeta"); eq(e.count(), "9 / 10 assets", "hide metadata")
    e.close()


def test_downloads_column_sorts_numerically(pw):
    e = Env(pw); p = e.page; e.refresh()
    heads = p.eval_on_selector_all("thead th", "e=>e.map(x=>x.textContent)")
    assert any(h.startswith("Downloads") for h in heads), heads
    idx = [h.startswith("Downloads") for h in heads].index(True) + 1
    p.click(f"thead th:nth-child({idx})"); p.click(f"thead th:nth-child({idx})")  # ascending then descending
    vals = [int(v.replace(",", "")) for v in p.eval_on_selector_all(f"tbody tr td:nth-child({idx})", "e=>e.map(x=>x.textContent)")]
    assert vals == sorted(vals, reverse=True) and len(vals) == 10, vals
    e.close()


def test_columns_menu_persist_and_fit(pw):
    e = Env(pw); p = e.page; e.refresh()
    p.click("#colsMenu summary")
    p.uncheck("#colsList label:has-text('Version') input")
    p.check("#colsList label:has-text('SHA256') input")
    heads = p.eval_on_selector_all("thead th", "e=>e.map(x=>x.textContent)")
    assert not any(h.startswith("Version") for h in heads) and any(h.startswith("SHA256") for h in heads), heads
    p.reload(); p.wait_for_selector("tbody tr")
    heads = p.eval_on_selector_all("thead th", "e=>e.map(x=>x.textContent)")
    assert not any(h.startswith("Version") for h in heads), "column choice persists"
    names = [h.rstrip("▲▼") for h in heads]
    sha = names.index("SHA256") ; fn = names.index("File Name")
    widths = lambda: p.eval_on_selector_all("colgroup col", "e=>e.map(x=>parseInt(x.style.width))")
    before = widths()
    p.click("#colsMenu summary"); p.click("#colsFit"); p.wait_for_timeout(200)
    after = widths()
    assert after[sha] == before[sha], f"SHA256 width must not change {before[sha]} -> {after[sha]}"
    assert after[fn] != before[fn], "other columns are fitted"
    assert all(60 <= w <= 640 for i, w in enumerate(after) if i > 0 and i != sha), after
    e.close()


def test_drag_resize_and_double_click_fit(pw):
    e = Env(pw); p = e.page; e.refresh()
    widths = lambda: p.eval_on_selector_all("colgroup col", "e=>e.map(x=>parseInt(x.style.width))")
    before = widths()
    box = p.locator("thead th:nth-child(2) .grip").bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x + 120, y, steps=6); p.mouse.up()
    after = widths()
    assert 110 <= after[1] - before[1] <= 130, (before[1], after[1])
    p.reload(); p.wait_for_selector("tbody tr")
    assert widths()[1] == after[1], "width persists"
    box = p.locator("thead th:nth-child(2) .grip").bounding_box()
    p.mouse.dblclick(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    assert "fitted" in p.inner_text("#status")
    assert widths()[1] != after[1]
    e.close()


def test_views_presets_and_custom(pw):
    e = Env(pw); p = e.page; e.refresh()
    p.click("#viewsMenu summary"); p.click("#viewsList >> text=Windows x64 installers")
    eq(e.count(), "5 / 10 assets", "preset")
    p.click("#resetBtn")
    p.fill("#search", "effectcraft"); p.click("#viewsMenu summary"); p.fill("#viewName", "My effect view"); p.click("#viewSave")
    p.click("#resetBtn"); eq(e.count(), "10 / 10 assets", "reset")
    p.reload(); p.wait_for_selector("tbody tr")
    p.click("#viewsMenu summary"); p.click("#viewsList >> text=My effect view")
    eq(e.count(), "2 / 10 assets", "custom view survives reload"); eq(p.input_value("#search"), "effectcraft")
    p.click("#viewsMenu summary"); p.click("#viewsList .viewrow:has-text('My effect view') .x")
    assert p.locator("#viewsList >> text=My effect view").count() == 0
    e.close()


def test_release_notes_panel_is_collapsed_and_safe(pw):
    mock = Mock()
    mock.routes["/repos/storytold/anicraft/releases"][0]["body"] = (
        "## What's new\n- **Fast** `mode`\n- [ok](https://example.com/x) and [bad](javascript:alert(1))\n"
        "<img src=x onerror=alert(1)>\n<script>alert(1)</script>\nSee https://github.com/a/b/pull/7.\n")
    e = Env(pw, mock); p = e.page; e.refresh()
    assert p.evaluate("document.getElementById('notes').open") is False, "collapsed by default"
    p.click("tbody tr:has-text('anicraft-0.2.1-windows-x64.msi')")
    assert "Anicraft 0.2.1" in p.inner_text("#notesTitle")
    p.click("#notes summary"); p.wait_for_selector("#notesBody h3")
    body = "#notesBody"
    assert p.locator(f"{body} strong:text('Fast')").count() == 1 and p.locator(f"{body} code:text('mode')").count() == 1
    assert p.locator(f"{body} a[href='https://example.com/x']").count() == 1
    assert p.locator(f"{body} a[href^='javascript']").count() == 0 and p.locator(f"{body} img, {body} script").count() == 0
    assert "<img src=x" in p.inner_text(body), "raw HTML is shown as text, never executed"
    assert p.locator(f"{body} a[href='https://github.com/a/b/pull/7']").count() == 1, "trailing dot not part of the link"
    p.click("tbody tr:has-text('effectcraft-0.24.1-windows-x64.msi')")
    assert "Notes for v0.24.1" in p.inner_text(body)
    e.close()


def test_new_releases_banner(pw):
    e = Env(pw, prefs={"ghre.seenAt": "2026-11-08T00:00:00Z"}); p = e.page; e.refresh()
    assert p.is_visible("#newbar"), "banner visible"
    assert "3 new releases since 2026-11-08" in p.inner_text("#newText"), p.inner_text("#newText")
    assert p.locator("td.isnew").count() >= 1
    p.click("#newOnly"); eq(e.count(), "6 / 10 assets", "only new rows")
    p.click("#newSeen"); assert not p.is_visible("#newbar"); eq(e.count(), "10 / 10 assets", "all rows again")
    p.reload(); p.wait_for_selector("tbody tr"); assert not p.is_visible("#newbar"), "stays dismissed"
    e.close()


def test_first_visit_has_no_new_releases(pw):
    e = Env(pw); e.refresh(); assert not e.page.is_visible("#newbar"); e.close()


def test_large_catalog_survives_reload_via_indexeddb(pw):
    mock = Mock()
    mock.routes["/orgs/storytold/repos"] = [{"name": "bigcraft", "full_name": "storytold/bigcraft", "archived": False}]
    rels = []
    for r in range(10):
        assets = [{"id": r * 100000 + i, "name": f"bigcraft-0.{r}.0-linux-x86_64-{'x' * 40}-{i}.deb", "size": 1048576 * (i % 90 + 1), "download_count": i,
                   "digest": "sha256:" + "ef" * 32, "browser_download_url": f"https://github.com/dl/{r}/{i}-{'y' * 60}.deb"} for i in range(1500)]
        rels.append({"id": r + 1, "tag_name": f"v0.{r}.0", "name": f"v0.{r}.0", "published_at": f"2026-10-{r + 1:02d}T00:00:00Z", "prerelease": False,
                     "draft": False, "assets": assets, "html_url": "https://github.com/r", "body": "notes " * 50})
    mock.routes["/repos/storytold/bigcraft/releases"] = rels
    mock.routes["/repos/storytold/bigcraft/releases/1/assets"] = rels[0]["assets"]
    e = Env(pw, mock, prefs={"ghre.depth": "10", "ghre.aggregates": ""}); p = e.page; e.refresh()
    eq(e.count(), "15,000 / 15,000 assets", "refresh")
    size = p.evaluate("JSON.stringify(Object.assign({}, localStorage)).length")
    assert size < 20000, f"data must not live in localStorage ({size} bytes)"
    p.reload(); p.wait_for_selector("tbody tr"); p.wait_for_timeout(300)
    eq(e.count(), "15,000 / 15,000 assets", "after reload (IndexedDB)")
    assert "cached" in p.inner_text("#status")
    # virtual rows: DOM stays small
    assert p.eval_on_selector_all("tbody tr", "e=>e.length") < 80
    e.close()


def test_conditional_requests_make_second_refresh_free(pw):
    e = Env(pw); p = e.page; e.refresh()
    first = len(e.mock.log); assert e.mock.n304 == 0
    e.refresh()
    assert e.mock.n304 > 0 and "unchanged" in p.inner_text("#status"), p.inner_text("#status")
    assert e.mock.n304 >= first - 3, (e.mock.n304, first)
    e.close()


def test_snapshot_over_http_loads_without_api_calls(pw):
    site = tempfile.mkdtemp()
    open(os.path.join(site, "index.html"), "w").write(open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())
    open(os.path.join(site, "catalog.json"), "w").write(SNAPSHOT)
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=site)
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        e = Env(pw, url=f"http://127.0.0.1:{srv.server_port}/index.html"); p = e.page
        p.wait_for_selector("tbody tr:has-text('.msi')")
        eq(e.count(), "10 / 10 assets", "snapshot rows"); assert "snapshot" in p.inner_text("#status"), p.inner_text("#status")
        eq(e.mock.log, [], "no GitHub API call needed")
        # settings that differ from the snapshot do not use it
        p.click("#settingsBtn"); p.fill("#sources", "someone-else"); p.click("#settingsSave"); p.reload(); p.wait_for_timeout(500)
        assert "different settings" in p.inner_text("#status") or "snapshot" not in p.inner_text("#status"), p.inner_text("#status")
        e.close()
    finally:
        srv.shutdown()


def test_theme_scroll_exports_share_link(pw):
    e = Env(pw); p = e.page; e.refresh()
    p.click("#themeBtn"); eq(p.evaluate("document.documentElement.dataset.theme"), "dark")
    p.hover("tbody tr:nth-child(3)"); p.keyboard.down("Shift"); p.mouse.wheel(0, 250); p.keyboard.up("Shift"); p.wait_for_timeout(150)
    assert p.evaluate("document.getElementById('wrap').scrollLeft") > 0, "Shift + wheel scrolls sideways"
    for kind in ("csv", "xlsx", "json"):
        p.click("#exportMenu summary")
        with p.expect_download() as d: p.click(f"[data-export={kind}]")
        d.value.save_as(os.path.join(tempfile.gettempdir(), f"e2e.{kind}"))
    rows = list(csv.reader(open(os.path.join(tempfile.gettempdir(), "e2e.csv"), encoding="utf-8-sig")))
    assert len(rows) == 11 and "Downloads" in rows[0] and "id" not in [h.lower() for h in rows[0]], rows[0]
    assert len(json.load(open(os.path.join(tempfile.gettempdir(), "e2e.json")))) == 10
    p2 = e.ctx.new_page(); p2.on("pageerror", lambda x: e.errors.append(str(x)))
    p2.goto(INDEX + "#source=storytold/anicraft&depth=1"); p2.wait_for_selector("tbody tr")
    p2.wait_for_selector("#refreshBtn:text('Refresh')"); p2.wait_for_timeout(300)
    eq(p2.inner_text("#count"), "3 / 3 assets", "share link loads its own data")
    e.close()


TESTS = [v for k, v in sorted(globals().items()) if k.startswith("test_")]

if __name__ == "__main__":
    words = sys.argv[1:]
    failed = 0
    with sync_playwright() as pw:
        for t in TESTS:
            if words and not any(w.lower() in t.__name__.lower() for w in words):
                continue
            try:
                t(pw); print("PASS", t.__name__)
            except Exception:
                failed += 1; print("FAIL", t.__name__); traceback.print_exc()
    print(f"\n{len(TESTS) if not words else '?'} tests, {failed} failed")
    sys.exit(1 if failed else 0)
