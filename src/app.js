/* GitHub Releases Explorer - UI. Talks to Core only; all text is set with textContent / DOM nodes (never innerHTML). */
(() => {
  "use strict";
  const C = Core;
  const PROJECT_URL = "https://github.com/zigh2/GitHub_Releases_Explorer";
  const ROW_H = 34, OVERSCAN = 12, ACT_W = 78;
  const NUMERIC = new Set(["size_mb", "downloads"]);
  const FILTER_LABELS = { application: "All applications", platform: "All platforms", architecture: "All architectures",
    package_type: "All package types", extension: "All extensions", variant: "All variants", prerelease: "All release types" };
  const DEFAULT_COLS = ["application", "version", "published", "platform", "architecture", "package_type", "extension", "variant",
    "file_name", "size_mb", "downloads", "repository"];
  const PRESETS = [
    { name: "Windows x64 installers", filters: { platform: "Windows", architecture: "x64", package_type: "Installer" }, hideMeta: true },
    { name: "Linux packages", filters: { platform: "Linux" }, hideMeta: true },
    { name: "macOS", filters: { platform: "macOS" }, hideMeta: true },
    { name: "Everything", filters: {}, hideMeta: false },
  ];
  const $ = (id) => document.getElementById(id);

  // ---- storage: localStorage for small settings, IndexedDB for data (no 5 MB ceiling) ------------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    json(k, d) { try { const v = JSON.parse(store.get(k, "null")); return v === null ? d : v; } catch (_) { return d; } },
  };
  const db = (() => {
    let opened = null;
    const open = () => (opened ||= new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
      const r = indexedDB.open("ghre", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("http"); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
    const run = (name, mode, fn) => open().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(name, mode), req = fn(t.objectStore(name));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = t.onabort = () => reject(t.error);
    })).catch(() => undefined);
    return { get: (s, k) => run(s, "readonly", (o) => o.get(k)), set: (s, k, v) => run(s, "readwrite", (o) => o.put(v, k)), clear: (s) => run(s, "readwrite", (o) => o.clear()) };
  })();
  const etags = { get: (u) => db.get("http", u), set: (u, v) => db.set("http", u, v) };

  const state = {
    rows: [], view: [], releases: {}, sortKey: store.json("ghre.sort", {}).key || "application", sortDir: store.json("ghre.sort", {}).dir || 1,
    search: "", hideMeta: false, onlyNew: false, filters: {}, selected: null, newKeys: new Set(), seenAt: "",
    cols: store.json("ghre.cols", DEFAULT_COLS).filter((k) => C.KEYS.includes(k)), widths: store.json("ghre.widths", {}), views: store.json("ghre.views", []),
    sources: store.get("ghre.sources", C.DEFAULT_SOURCE), keyword: store.get("ghre.keyword", C.DEFAULT_KEYWORD),
    aggregates: store.get("ghre.aggregates", C.DEFAULT_AGGREGATES), archived: store.get("ghre.archived", "0") === "1",
    depth: Number(store.get("ghre.depth", "1")) || 1, token: "", abort: null,
  };
  if (!state.cols.length) state.cols = DEFAULT_COLS.slice();
  C.FILTER_KEYS.forEach((k) => (state.filters[k] = ""));
  const config = () => ({ sources: state.sources, keyword: state.keyword, aggregates: state.aggregates, depth: state.depth, archived: state.archived });

  // ---- helpers -----------------------------------------------------------------------------------------------------
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k in n ? (n[k] = v) : n.setAttribute(k, v);
    kids.forEach((c) => n.append(c));
    return n;
  };
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "");
  const fmt = (key, v) => {
    if (v === undefined || v === null) return "";
    if (key === "published") return String(v).slice(0, 16).replace("T", " ");
    if (key === "size_mb") return Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (key === "downloads") return Number(v).toLocaleString();
    return String(v);
  };
  const setStatus = (t) => { $("status").textContent = t; $("status").title = t; };
  const colDef = (key) => C.COLUMNS.find((c) => c.key === key);
  const widthOf = (key) => state.widths[key] || colDef(key).width;
  const visibleCols = () => state.cols.map(colDef).filter(Boolean).sort((a, b) => C.KEYS.indexOf(a.key) - C.KEYS.indexOf(b.key));

  // ---- theme -------------------------------------------------------------------------------------------------------
  function applyTheme(mode) {
    document.documentElement.dataset.theme = mode;
    $("themeBtn").textContent = mode === "dark" ? "☀  Light mode" : "☾  Dark mode";
  }
  $("themeBtn").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next); store.set("ghre.theme", next);
  };

  // ---- data --------------------------------------------------------------------------------------------------------
  function setData(rows, releases) {
    state.rows = rows.map((r) => ({ ...r, _rk: C.releaseKey(r), _v: C.versionKey(r.version), _new: false,
      _h: [r.application, r.version, r.platform, r.architecture, r.package_type, r.extension, r.variant, r.file_name, r.repository, r.source, r.sha256].join(" ").toLowerCase() }));
    state.releases = releases || {};
    state.selected = null;
    computeNew();
    buildFilters();
    recompute();
    renderNotes();
  }
  function describe(prefix, iso) { return `${prefix} ${state.rows.length.toLocaleString()} assets` + (iso ? ` (${iso.replace("T", " ").slice(0, 16)} UTC)` : ""); }

  // ---- new releases since you last looked ----------------------------------------------------------------------------
  function computeNew() {
    let seenAt = store.get("ghre.seenAt", "");
    const newest = state.rows.reduce((m, r) => (r.published > m ? r.published : m), "");
    if (!seenAt && newest) { seenAt = newest; store.set("ghre.seenAt", seenAt); } // first visit: nothing is "new" yet
    state.seenAt = seenAt;
    state.newKeys = new Set();
    for (const r of state.rows) { r._new = !!seenAt && r.published > seenAt; if (r._new) state.newKeys.add(r._rk); }
    const n = state.newKeys.size, bar = $("newbar");
    bar.hidden = n === 0;
    if (!n) state.onlyNew = false;
    $("newText").textContent = `${n} new release${n === 1 ? "" : "s"} since ${seenAt.slice(0, 10)}`;
    $("newOnly").textContent = state.onlyNew ? "Show all" : "Show only new";
  }
  $("newOnly").onclick = () => { state.onlyNew = !state.onlyNew; $("newOnly").textContent = state.onlyNew ? "Show all" : "Show only new"; recompute(); };
  $("newSeen").onclick = () => {
    const stamp = new Date().toISOString();
    store.set("ghre.seenAt", stamp > state.seenAt ? stamp : state.seenAt);
    state.onlyNew = false; computeNew(); recompute();
  };

  // ---- filtering / sorting -----------------------------------------------------------------------------------------
  function buildFilters() {
    const box = $("filters");
    box.textContent = "";
    for (const key of C.FILTER_KEYS) {
      const values = [...new Set(state.rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      if (state.filters[key] && !values.includes(state.filters[key])) state.filters[key] = "";
      const sel = el("select", { ariaLabel: FILTER_LABELS[key] });
      sel.append(el("option", { value: "", textContent: FILTER_LABELS[key] }));
      values.forEach((v) => sel.append(el("option", { value: v, textContent: v })));
      sel.value = state.filters[key];
      sel.classList.toggle("active", !!sel.value);
      sel.onchange = () => { state.filters[key] = sel.value; sel.classList.toggle("active", !!sel.value); recompute(); };
      sel.dataset.key = key;
      box.append(sel);
    }
  }
  function recompute() {
    const tokens = state.search.toLowerCase().split(/\s+/).filter(Boolean);
    const active = Object.entries(state.filters).filter(([, v]) => v);
    let view = state.rows.filter((r) =>
      (!state.hideMeta || !C.NON_PACKAGE_TYPES.has(r.package_type)) && (!state.onlyNew || r._new) &&
      active.every(([k, v]) => r[k] === v) && tokens.every((t) => r._h.includes(t)));
    const { sortKey: key, sortDir: dir } = state;
    const cmp = NUMERIC.has(key) ? (a, b) => a[key] - b[key]
      : key === "version" ? (a, b) => (a._v < b._v ? -1 : a._v > b._v ? 1 : 0)
      : (a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { sensitivity: "base", numeric: true });
    state.view = view.slice().sort((a, b) => cmp(a, b) * dir);
    $("count").textContent = `${state.view.length.toLocaleString()} / ${state.rows.length.toLocaleString()} assets`;
    wrap.scrollTop = 0;
    paint(); // synchronous: no blank frame after sorting / filtering
  }
  function resetFilters() {
    state.search = ""; state.hideMeta = false; state.onlyNew = false;
    C.FILTER_KEYS.forEach((k) => (state.filters[k] = ""));
    $("search").value = ""; $("hideMeta").checked = false; $("newOnly").textContent = "Show only new";
    buildFilters(); recompute();
  }

  // ---- table: virtualised rows, sortable headers, draggable column borders -------------------------------------------
  const wrap = $("wrap");
  let table, tbody, colgroup;
  const totalWidth = () => ACT_W + visibleCols().reduce((n, c) => n + widthOf(c.key), 0);
  function buildTable() {
    wrap.textContent = "";
    table = el("table");
    colgroup = el("colgroup");
    colgroup.append(el("col", { style: `width:${ACT_W}px` }));
    const cols = visibleCols();
    cols.forEach((c) => colgroup.append(el("col", { style: `width:${widthOf(c.key)}px` })));
    table.style.width = totalWidth() + "px";
    const thead = el("thead"), tr = el("tr");
    tbody = el("tbody");
    tr.append(el("th", { className: "act", textContent: "Get" }));
    cols.forEach((c, i) => {
      const th = el("th", { title: "Click to sort · drag the right edge to resize · double-click it to fit all columns", className: NUMERIC.has(c.key) ? "num" : "" });
      th.append(c.header);
      if (state.sortKey === c.key) th.append(el("span", { className: "arrow", textContent: state.sortDir === 1 ? "▲" : "▼" }));
      th.onclick = () => {
        state.sortDir = state.sortKey === c.key ? -state.sortDir : 1; state.sortKey = c.key;
        store.set("ghre.sort", JSON.stringify({ key: state.sortKey, dir: state.sortDir })); buildTable(); recompute();
      };
      const grip = el("span", { className: "grip" });
      grip.onclick = (e) => e.stopPropagation();
      grip.ondblclick = (e) => { e.stopPropagation(); autofit(); };
      grip.onpointerdown = (e) => startResize(e, c.key, i + 1, grip);
      th.append(grip);
      tr.append(th);
    });
    thead.append(tr);
    table.append(colgroup, thead, tbody);
    wrap.append(table);
  }
  function startResize(e, key, colIndex, grip) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = widthOf(key);
    grip.setPointerCapture(e.pointerId);
    grip.classList.add("drag");
    const move = (ev) => {
      state.widths[key] = Math.max(50, Math.round(startW + ev.clientX - startX));
      colgroup.children[colIndex].style.width = state.widths[key] + "px";
      table.style.width = totalWidth() + "px";
    };
    const up = () => {
      grip.classList.remove("drag");
      grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
      store.set("ghre.widths", JSON.stringify(state.widths));
    };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
  }
  /** Fit every visible column to its content (header + all rows) - except the SHA256 digest, which keeps its width. */
  function autofit() {
    const ctx = document.createElement("canvas").getContext("2d");
    const cs = getComputedStyle(document.body);
    const font = `${cs.fontSize} ${cs.fontFamily}`;
    const memo = new Map();
    const measure = (text, f) => { const k = f + "|" + text; let w = memo.get(k); if (w === undefined) { ctx.font = f; w = ctx.measureText(text).width; memo.set(k, w); } return w; };
    const step = Math.max(1, Math.floor(state.rows.length / 4000)); // sample very large catalogs
    for (const c of visibleCols()) {
      if (c.key === "sha256") continue;
      let w = measure(c.header, "700 " + font) + 46;
      for (let i = 0; i < state.rows.length; i += step) w = Math.max(w, measure(fmt(c.key, state.rows[i][c.key]), font) + 24);
      state.widths[c.key] = Math.min(640, Math.max(60, Math.ceil(w)));
    }
    store.set("ghre.widths", JSON.stringify(state.widths));
    buildTable(); paint();
    setStatus("Columns fitted to their content (SHA256 unchanged).");
  }
  let queued = 0;
  function paintSoon() { cancelAnimationFrame(queued); queued = requestAnimationFrame(paint); } // coalesces scroll / resize events
  function paint() {
    if (!table) buildTable();
    const n = state.view.length, cols = visibleCols();
    if (!n) {
      tbody.textContent = "";
      const tr = el("tr"), td = el("td", { colSpan: cols.length + 1, className: "empty",
        textContent: state.rows.length ? "No assets match the current filters." : "No data yet - click “Refresh from GitHub”." });
      td.style.height = "auto"; tr.append(td); tbody.append(tr);
      return;
    }
    const top = Math.max(0, wrap.scrollTop - 40), vh = wrap.clientHeight || 600;
    const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN), last = Math.min(n, Math.ceil((top + vh) / ROW_H) + OVERSCAN);
    const spacer = (h) => { const r = el("tr"), d = el("td", { colSpan: cols.length + 1 }); d.style.cssText = `height:${h}px;padding:0`; r.append(d); return r; };
    const frag = document.createDocumentFragment();
    if (first > 0) frag.append(spacer(first * ROW_H));
    for (let i = first; i < last; i++) frag.append(rowEl(state.view[i], cols));
    if (last < n) frag.append(spacer((n - last) * ROW_H));
    tbody.textContent = "";
    tbody.append(frag);
  }
  function rowEl(r, cols) {
    const tr = el("tr");
    if (state.selected === r) tr.className = "sel";
    const act = el("td", { className: "act" });
    const url = safeUrl(r.download_url);
    if (url) act.append(el("a", { href: url, target: "_blank", rel: "noopener noreferrer", title: "Download " + r.file_name, textContent: "⬇" }));
    const copy = el("button", { title: "Copy download URL", textContent: "⧉" });
    copy.onclick = (e) => { e.stopPropagation(); copyText(r.download_url, "Download URL copied"); };
    act.append(copy);
    tr.append(act);
    for (const c of cols) {
      const text = fmt(c.key, r[c.key]);
      const td = el("td", { textContent: text, title: ["file_name", "download_url", "release_url", "sha256", "repository"].includes(c.key) ? text : "" });
      if (NUMERIC.has(c.key)) td.className = "num";
      if (c.key === "application" && r._new) { td.className = "isnew"; td.title = "Published after " + state.seenAt.slice(0, 10); }
      tr.append(td);
    }
    tr.onclick = () => { state.selected = state.selected === r ? null : r; paint(); renderNotes(); };
    tr.ondblclick = () => { const u = safeUrl(r.download_url || r.release_url); if (u) window.open(u, "_blank", "noopener"); };
    return tr;
  }
  wrap.addEventListener("scroll", () => paintSoon(), { passive: true });
  window.addEventListener("resize", () => paintSoon());
  // Shift + wheel scrolls sideways (identical on every browser / OS).
  wrap.addEventListener("wheel", (e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    wrap.scrollLeft += (e.deltaX || e.deltaY) * (e.deltaMode === 1 ? 40 : 1);
  }, { passive: false });

  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); setStatus(msg); }
    catch (_) {
      const ta = el("textarea", { value: text }); document.body.append(ta); ta.select();
      try { document.execCommand("copy"); setStatus(msg); } catch (__) { setStatus("Copy failed"); }
      ta.remove();
    }
  }

  // ---- release notes panel (collapsed by default) --------------------------------------------------------------------
  function inline(text, parent) {
    const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/[^)\s]+\)|https:\/\/[^\s<>)]*[^\s<>).,;:!?])/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) parent.append(el("strong", { textContent: t.slice(2, -2) }));
      else if (t.startsWith("`")) parent.append(el("code", { textContent: t.slice(1, -1) }));
      else if (t.startsWith("[")) { const i = t.indexOf("]("); parent.append(el("a", { href: t.slice(i + 2, -1), textContent: t.slice(1, i), target: "_blank", rel: "noopener noreferrer" })); }
      else parent.append(el("a", { href: t, textContent: t.length > 60 ? t.slice(0, 57) + "…" : t, target: "_blank", rel: "noopener noreferrer" }));
      last = m.index + t.length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }
  /** A deliberately small, safe Markdown subset: headings, lists, quotes, code, bold, links. */
  function markdown(src) {
    const root = document.createDocumentFragment();
    const lines = src.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n").split("\n");
    let list = null, code = null;
    for (const line of lines) {
      if (/^```/.test(line)) { if (code) { root.append(code); code = null; } else { code = el("pre"); code.append(el("code")); } list = null; continue; }
      if (code) { code.firstChild.textContent += (code.firstChild.textContent ? "\n" : "") + line; continue; }
      let m;
      if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { if (!list) { list = el("ul"); root.append(list); } const li = el("li"); inline(m[1], li); list.append(li); continue; }
      list = null;
      if (!line.trim()) continue;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { const h = el("h" + Math.min(6, Math.max(3, m[1].length + 1))); inline(m[2], h); root.append(h); }
      else if ((m = /^>\s?(.*)$/.exec(line))) { const q = el("blockquote"); inline(m[1], q); root.append(q); }
      else if (/^-{3,}$/.test(line.trim())) root.append(el("hr"));
      else { const p = el("p"); inline(line, p); root.append(p); }
    }
    if (code) root.append(code);
    return root;
  }
  function renderNotes() {
    const box = $("notesBody"), row = state.selected;
    $("notesTitle").textContent = row ? `— ${row.application} ${row.version}` : "— select a row";
    if (!$("notes").open) return;
    box.textContent = "";
    if (!row) { box.append(el("p", { className: "muted", textContent: "Click a row in the table to see the notes of its release." })); return; }
    const note = state.releases[row._rk];
    const head = el("div", { className: "notehead" });
    head.append(el("strong", { textContent: note && note.name ? note.name : `${row.application} ${row.version}` }));
    head.append(el("span", { className: "muted", textContent: ` · ${row.repository} · ${String(row.published).slice(0, 10)}${row.prerelease === "Yes" ? " · prerelease" : ""}` }));
    const url = safeUrl((note && note.url) || row.release_url);
    if (url) head.append(" ", el("a", { href: url, target: "_blank", rel: "noopener noreferrer", textContent: "Open on GitHub ↗" }));
    box.append(head);
    box.append(note && note.body.trim() ? markdown(note.body) : el("p", { className: "muted", textContent: "This release has no description." }));
    if (!note) box.lastChild.textContent = "No notes stored for this release (refresh to fetch them).";
  }
  $("notes").addEventListener("toggle", renderNotes);

  // ---- columns & saved views -----------------------------------------------------------------------------------------
  function buildColumnsMenu() {
    const pop = $("colsList");
    pop.textContent = "";
    for (const c of C.COLUMNS) {
      const cb = el("input", { type: "checkbox", checked: state.cols.includes(c.key) });
      cb.onchange = () => {
        state.cols = cb.checked ? [...state.cols, c.key] : state.cols.filter((k) => k !== c.key);
        if (!state.cols.length) { state.cols = [c.key]; cb.checked = true; }
        store.set("ghre.cols", JSON.stringify(state.cols)); buildTable(); paint();
      };
      pop.append(el("label", { className: "check item" }, cb, c.header));
    }
  }
  $("colsReset").onclick = () => { state.cols = DEFAULT_COLS.slice(); state.widths = {}; store.set("ghre.cols", JSON.stringify(state.cols)); store.set("ghre.widths", "{}"); buildColumnsMenu(); buildTable(); paint(); };
  $("colsFit").onclick = () => { $("colsMenu").open = false; autofit(); };

  const currentView = () => ({ search: state.search, hideMeta: state.hideMeta, onlyNew: state.onlyNew, filters: { ...state.filters },
    sortKey: state.sortKey, sortDir: state.sortDir, cols: state.cols.slice() });
  function applyView(v) {
    state.search = v.search || ""; state.hideMeta = !!v.hideMeta; state.onlyNew = !!v.onlyNew && state.newKeys.size > 0;
    C.FILTER_KEYS.forEach((k) => (state.filters[k] = (v.filters && v.filters[k]) || ""));
    if (v.sortKey) { state.sortKey = v.sortKey; state.sortDir = v.sortDir || 1; }
    if (v.cols && v.cols.length) { state.cols = v.cols.filter((k) => C.KEYS.includes(k)); store.set("ghre.cols", JSON.stringify(state.cols)); buildColumnsMenu(); }
    $("search").value = state.search; $("hideMeta").checked = state.hideMeta;
    $("newOnly").textContent = state.onlyNew ? "Show all" : "Show only new";
    buildFilters(); buildTable(); recompute();
  }
  function buildViewsMenu() {
    const list = $("viewsList");
    list.textContent = "";
    const add = (view, removable, idx) => {
      const row = el("div", { className: "viewrow" });
      const b = el("button", { textContent: view.name, title: "Apply this view" });
      b.onclick = () => { $("viewsMenu").open = false; applyView(view); setStatus(`View “${view.name}” applied.`); };
      row.append(b);
      if (removable) { const x = el("button", { className: "x", textContent: "✕", title: "Delete this view" }); x.onclick = () => { state.views.splice(idx, 1); store.set("ghre.views", JSON.stringify(state.views)); buildViewsMenu(); }; row.append(x); }
      list.append(row);
    };
    PRESETS.forEach((p) => add(p, false));
    if (state.views.length) list.append(el("div", { className: "sep" }));
    state.views.forEach((v, i) => add(v, true, i));
  }
  $("viewSave").onclick = () => {
    const name = $("viewName").value.trim();
    if (!name) { $("viewName").focus(); return; }
    state.views = state.views.filter((v) => v.name !== name).concat({ name, ...currentView() });
    store.set("ghre.views", JSON.stringify(state.views)); $("viewName").value = ""; buildViewsMenu(); setStatus(`View “${name}” saved.`);
  };
  $("viewName").addEventListener("keydown", (e) => { if (e.key === "Enter") $("viewSave").click(); });

  // ---- loading: cache (IndexedDB) -> snapshot (catalog.json) -> live ------------------------------------------------
  async function fetchSnapshot() {
    if (!/^https?:$/.test(location.protocol)) return null; // a plain file:// page has no snapshot next to it
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch("catalog.json", { signal: ctl.signal, cache: "no-cache" });
      clearTimeout(timer);
      return res.ok ? C.decodeSnapshot(await res.json()) : null;
    } catch (_) { return null; }
  }
  async function loadInitial(forceLive) {
    const want = C.signature(config());
    const [cachedRaw, snap] = await Promise.all([db.get("kv", "catalog"), fetchSnapshot()]);
    const cached = cachedRaw ? C.decodeSnapshot(cachedRaw) : null;
    const matches = (d) => d && C.signature(d.config) === want;
    const candidates = [matches(cached) && { d: cached, kind: "cached", at: cached.generatedAt }, matches(snap) && { d: snap, kind: "snapshot", at: snap.generatedAt }]
      .filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1));
    if (candidates.length) {
      const best = candidates[0];
      setData(best.d.rows, best.d.releases);
      setStatus(best.kind === "snapshot" ? `${describe("Loaded snapshot of", best.at)} - click “Refresh from GitHub” for live data.` : describe("Loaded cached", best.at));
      if (best.kind === "snapshot") db.set("kv", "catalog", C.encodeSnapshot(best.d, best.d.config, best.d.generatedAt));
      return; // (a share link whose data is already stored needs no live fetch)
    }
    if (cached) { setData(cached.rows, cached.releases); setStatus(describe("Showing cached", cached.generatedAt) + " from different settings - click “Refresh from GitHub” to update."); }
    else { setData([], {}); setStatus("No data yet - click “Refresh from GitHub”."); }
    if (forceLive) refresh();
  }

  // ---- refresh -----------------------------------------------------------------------------------------------------
  async function refresh() {
    if (state.abort) { state.abort.abort(); setStatus("Cancelling…"); return; }
    if (!C.parseSources(state.sources).length) { alert("Open Settings and enter a GitHub organization, user or owner/repo."); return; }
    const ctl = new AbortController();
    state.abort = ctl;
    $("refreshBtn").textContent = "Cancel";
    const bar = $("progress"); bar.hidden = false; bar.removeAttribute("value");
    setStatus("Discovering repositories…");
    try {
      const client = C.createClient({ token: state.token, signal: ctl.signal, cache: etags });
      const res = await C.fetchCatalog(client, state.sources, {
        aggregates: state.aggregates, keyword: state.keyword, includeArchived: state.archived, depth: state.depth, signal: ctl.signal,
        onProgress: (done, total, name) => { bar.max = Math.max(total, 1); bar.value = done; setStatus(`Checked ${name} (${done}/${total})`); },
      });
      const stored = C.encodeSnapshot(res, config());
      setData(res.rows, res.releases);
      await db.set("kv", "catalog", stored);
      const s = client.stats;
      let msg = `Scanned ${res.scanned} repositories; retrieved ${res.rows.length.toLocaleString()} assets in ${s.requests} requests` + (s.notModified ? ` (${s.notModified} unchanged, free)` : "") + ".";
      if (res.skippedDuplicates) msg += ` Ignored ${res.skippedDuplicates} duplicate aggregate assets.`;
      if (res.errors.length) msg += ` ${res.errors.length} repositories could not be read.`;
      setStatus(msg);
      if (res.errors.length) alert("Refresh completed with warnings:\n\n" + res.errors.slice(0, 10).join("\n"));
    } catch (err) {
      if (err instanceof C.Cancelled) setStatus("Refresh cancelled - previous data kept.");
      else { setStatus("Refresh failed - previous data kept."); alert("GitHub refresh failed:\n\n" + err.message); }
    } finally {
      state.abort = null; bar.hidden = true; $("refreshBtn").textContent = "Refresh from GitHub";
    }
  }

  // ---- export (always every column of the visible rows) ----------------------------------------------------------------
  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = el("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function exportRows(kind) {
    $("exportMenu").open = false;
    if (!state.view.length) { alert("There are no visible rows to export."); return; }
    const name = `github_releases_${new Date().toISOString().slice(0, 10)}.${kind}`;
    if (kind === "csv") download(name, C.toCSV(state.view), "text/csv;charset=utf-8");
    else if (kind === "json") download(name, C.toJSON(state.view), "application/json");
    else download(name, C.toXLSX(state.view), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setStatus(`Exported ${state.view.length.toLocaleString()} rows to ${name}`);
  }
  document.querySelectorAll("[data-export]").forEach((b) => (b.onclick = () => exportRows(b.dataset.export)));
  // one popover open at a time; click outside closes
  document.querySelectorAll("details.menu").forEach((m) => m.addEventListener("toggle", () => { if (m.open) document.querySelectorAll("details.menu").forEach((o) => { if (o !== m) o.open = false; }); }));
  document.addEventListener("click", (e) => document.querySelectorAll("details.menu[open]").forEach((m) => { if (!m.contains(e.target)) m.open = false; }));

  // ---- settings & share links ----------------------------------------------------------------------------------------
  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (!p.has("source")) return false;
    state.sources = p.get("source");
    state.keyword = p.get("filter") || "";
    state.aggregates = p.get("aggregates") || "";
    state.depth = [1, 3, 5, 10].includes(Number(p.get("depth"))) ? Number(p.get("depth")) : 1;
    state.archived = p.get("archived") === "1";
    return true;
  }
  function shareHash() {
    const p = new URLSearchParams({ source: C.normSources(state.sources) });
    if (state.keyword) p.set("filter", state.keyword);
    if (state.aggregates) p.set("aggregates", C.normSources(state.aggregates));
    if (state.depth > 1) p.set("depth", String(state.depth));
    if (state.archived) p.set("archived", "1");
    return "#" + p.toString().replace(/%2F/g, "/").replace(/%2C/g, ",");
  }
  function persistSettings() {
    store.set("ghre.sources", state.sources); store.set("ghre.keyword", state.keyword); store.set("ghre.aggregates", state.aggregates);
    store.set("ghre.depth", String(state.depth)); store.set("ghre.archived", state.archived ? "1" : "0");
  }
  const dlg = $("settings");
  const fillSettings = () => {
    $("sources").value = state.sources; $("keyword").value = state.keyword; $("aggs").value = state.aggregates;
    $("depth").value = String(state.depth); $("archived").checked = state.archived; $("token").value = state.token;
  };
  function readForm() {
    state.sources = $("sources").value.trim(); state.keyword = $("keyword").value.trim(); state.aggregates = $("aggs").value.trim();
    state.depth = Number($("depth").value) || 1; state.archived = $("archived").checked; state.token = $("token").value.trim();
  }
  $("settingsBtn").onclick = () => { fillSettings(); dlg.showModal(); };
  $("settingsCancel").onclick = () => dlg.close();
  $("settingsExample").onclick = () => {
    state.sources = C.DEFAULT_SOURCE; state.keyword = C.DEFAULT_KEYWORD; state.aggregates = C.DEFAULT_AGGREGATES; state.depth = 1; state.archived = false;
    fillSettings();
  };
  $("settingsCopy").onclick = () => { readForm(); copyText(location.href.split("#")[0] + shareHash(), "Share link copied"); };
  $("settingsClear").onclick = async () => {
    await Promise.all([db.clear("kv"), db.clear("http")]);
    ["ghre.seenAt"].forEach((k) => { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } });
    setStatus("Cached catalog and HTTP cache cleared. Click “Refresh from GitHub” to download again.");
  };
  $("settingsSave").onclick = () => {
    readForm(); persistSettings();
    try { history.replaceState(null, "", location.pathname + location.search + shareHash()); } catch (_) { /* file:// in some browsers */ }
    dlg.close(); setStatus("Settings saved - click “Refresh from GitHub” to apply them.");
  };

  // ---- wiring ------------------------------------------------------------------------------------------------------
  $("search").addEventListener("input", (e) => { state.search = e.target.value; recompute(); });
  $("hideMeta").addEventListener("change", (e) => { state.hideMeta = e.target.checked; recompute(); });
  $("resetBtn").onclick = resetFilters;
  $("refreshBtn").onclick = refresh;
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); $("search").focus(); }
    else if (e.key === "Escape" && !dlg.open && !document.querySelector("details.menu[open]")) resetFilters();
  });

  applyTheme(document.documentElement.dataset.theme || "light");
  $("subtitle").title = PROJECT_URL;
  const before = C.signature(config());
  const fromLink = readHash();
  const changed = fromLink && C.signature(config()) !== before;
  if (changed) persistSettings();
  buildColumnsMenu(); buildViewsMenu(); buildTable(); paint();
  // A share link that differs from what is stored loads its own data straight away; otherwise cache / snapshot first.
  loadInitial(changed);
})();
