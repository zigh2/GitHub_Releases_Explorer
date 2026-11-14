/* GitHub Releases Explorer - UI. Talks to Core only; all table text is set with textContent. */
(() => {
  "use strict";
  const C = Core;
  const PROJECT_URL = "https://github.com/zigh2/GitHub_Releases_Explorer";
  const ROW_H = 34, OVERSCAN = 12;
  const FILTER_LABELS = { application: "All applications", platform: "All platforms", architecture: "All architectures",
    package_type: "All package types", extension: "All extensions", variant: "All variants", prerelease: "All release types" };
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
  };

  const state = {
    rows: [], view: [], sortKey: "application", sortDir: 1, search: "", hideMeta: false, filters: {}, selected: null,
    sources: store.get("ghre.sources", C.DEFAULT_SOURCE), keyword: store.get("ghre.keyword", C.DEFAULT_KEYWORD),
    aggregates: store.get("ghre.aggregates", C.DEFAULT_AGGREGATES), archived: store.get("ghre.archived", "0") === "1",
    depth: Number(store.get("ghre.depth", "1")) || 1, token: "", abort: null, fetchedAt: store.get("ghre.fetchedAt", ""),
  };
  C.FILTER_KEYS.forEach((k) => (state.filters[k] = ""));
  // Share links: index.html#source=storytold&filter=craft&aggregates=Labtoso/Artcraft&depth=3&archived=1
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
  const norm = (text) => C.parseSources(text).map((e) => (e.repo ? `${e.owner}/${e.repo}` : e.owner)).join(",");
  function shareHash() {
    const p = new URLSearchParams({ source: norm(state.sources) });
    if (state.keyword) p.set("filter", state.keyword);
    if (state.aggregates) p.set("aggregates", norm(state.aggregates));
    if (state.depth > 1) p.set("depth", String(state.depth));
    if (state.archived) p.set("archived", "1");
    return "#" + p.toString().replace(/%2F/g, "/").replace(/%2C/g, ",");
  }
  function persistSettings() {
    store.set("ghre.sources", state.sources); store.set("ghre.keyword", state.keyword); store.set("ghre.aggregates", state.aggregates);
    store.set("ghre.depth", String(state.depth)); store.set("ghre.archived", state.archived ? "1" : "0");
  }

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
    return String(v);
  };
  const setStatus = (t) => { $("status").textContent = t; $("status").title = t; };

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
  function prepare(rows) {
    return rows.map((r) => ({ ...r, _h: [r.application, r.version, r.platform, r.architecture, r.package_type, r.extension,
      r.variant, r.file_name, r.repository, r.source, r.sha256].join(" ").toLowerCase(), _v: C.versionKey(r.version) }));
  }
  function setRows(rows) {
    state.rows = prepare(rows);
    buildFilters();
    recompute();
  }
  function loadCache() {
    try {
      const cached = JSON.parse(store.get("ghre.catalog", "null"));
      if (cached && Array.isArray(cached.rows) && cached.rows.length) {
        setRows(cached.rows);
        setStatus(`Loaded ${cached.rows.length} cached assets` + (state.fetchedAt ? ` (refreshed ${state.fetchedAt.replace("T", " ").slice(0, 16)} UTC)` : ""));
        return;
      }
    } catch (_) { /* ignore a corrupt cache */ }
    setRows([]);
    setStatus("No cached data yet - click “Refresh from GitHub”.");
  }

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
      (!state.hideMeta || !C.NON_PACKAGE_TYPES.has(r.package_type)) &&
      active.every(([k, v]) => r[k] === v) && tokens.every((t) => r._h.includes(t)));
    const { sortKey: key, sortDir: dir } = state;
    const cmp = key === "size_mb" ? (a, b) => a.size_mb - b.size_mb
      : key === "version" ? (a, b) => (a._v < b._v ? -1 : a._v > b._v ? 1 : 0)
      : (a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? ""), undefined, { sensitivity: "base", numeric: true });
    view = view.slice().sort((a, b) => cmp(a, b) * dir);
    state.view = view;
    $("count").textContent = `${view.length.toLocaleString()} / ${state.rows.length.toLocaleString()} assets`;
    renderTable(true);
  }
  function resetFilters() {
    state.search = ""; state.hideMeta = false;
    C.FILTER_KEYS.forEach((k) => (state.filters[k] = ""));
    $("search").value = ""; $("hideMeta").checked = false;
    buildFilters(); recompute();
  }

  // ---- virtualised table -------------------------------------------------------------------------------------------
  const wrap = $("wrap");
  let thead, tbody, table;
  function buildTable() {
    wrap.textContent = "";
    table = el("table");
    const cg = el("colgroup");
    cg.append(el("col", { style: "width:78px" }));
    C.COLUMNS.forEach((c) => cg.append(el("col", { style: `width:${c.width}px` })));
    table.style.width = 78 + C.COLUMNS.reduce((n, c) => n + c.width, 0) + "px";
    thead = el("thead"); tbody = el("tbody");
    const tr = el("tr");
    tr.append(el("th", { className: "act", textContent: "Get" }));
    C.COLUMNS.forEach((c) => {
      const th = el("th", { title: "Sort by " + c.header, className: c.numeric ? "num" : "" });
      th.append(c.header);
      if (state.sortKey === c.key) th.append(el("span", { className: "arrow", textContent: state.sortDir === 1 ? "▲" : "▼" }));
      th.onclick = () => { state.sortDir = state.sortKey === c.key ? -state.sortDir : 1; state.sortKey = c.key; buildTable(); recompute(); };
      tr.append(th);
    });
    thead.append(tr);
    table.append(cg, thead, tbody);
    wrap.append(table);
  }
  function renderTable(resetScroll) {
    if (!table) buildTable();
    if (resetScroll) wrap.scrollTop = 0;
    paint();
  }
  function paint() {
    const n = state.view.length;
    if (!n) {
      tbody.textContent = "";
      const empty = el("tr"), td = el("td", { colSpan: C.COLUMNS.length + 1, className: "empty",
        textContent: state.rows.length ? "No assets match the current filters." : "No data yet - click “Refresh from GitHub”." });
      td.style.height = "auto"; empty.append(td); tbody.append(empty);
      return;
    }
    const top = Math.max(0, wrap.scrollTop - 40), vh = wrap.clientHeight || 600;
    const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
    const last = Math.min(n, Math.ceil((top + vh) / ROW_H) + OVERSCAN);
    const frag = document.createDocumentFragment();
    const spacer = (h) => { const r = el("tr"); r.style.height = h + "px"; r.append(el("td", { colSpan: C.COLUMNS.length + 1 })); r.firstChild.style.height = h + "px"; r.firstChild.style.padding = "0"; return r; };
    if (first > 0) frag.append(spacer(first * ROW_H));
    for (let i = first; i < last; i++) frag.append(rowEl(state.view[i]));
    if (last < n) frag.append(spacer((n - last) * ROW_H));
    tbody.textContent = "";
    tbody.append(frag);
  }
  function rowEl(r) {
    const tr = el("tr");
    if (state.selected === r) tr.className = "sel";
    const act = el("td", { className: "act" });
    const url = safeUrl(r.download_url);
    if (url) act.append(el("a", { href: url, target: "_blank", rel: "noopener noreferrer", title: "Download " + r.file_name, textContent: "⬇" }));
    const copy = el("button", { title: "Copy download URL", textContent: "⧉" });
    copy.onclick = (e) => { e.stopPropagation(); copyText(r.download_url, "Download URL copied"); };
    act.append(copy);
    tr.append(act);
    for (const c of C.COLUMNS) {
      const text = fmt(c.key, r[c.key]);
      tr.append(el("td", { className: c.numeric ? "num" : "", textContent: text, title: ["file_name", "download_url", "release_url", "sha256", "repository"].includes(c.key) ? text : "" }));
    }
    tr.onclick = () => { state.selected = state.selected === r ? null : r; paint(); };
    tr.ondblclick = () => { const u = safeUrl(r.download_url || r.release_url); if (u) window.open(u, "_blank", "noopener"); };
    return tr;
  }
  let raf = 0;
  wrap.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }, { passive: true });
  window.addEventListener("resize", () => paint());
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
      const client = C.createClient({ token: state.token, signal: ctl.signal });
      const res = await C.fetchCatalog(client, state.sources, {
        aggregates: state.aggregates, keyword: state.keyword, includeArchived: state.archived, depth: state.depth, signal: ctl.signal,
        onProgress: (done, total, name) => { bar.max = Math.max(total, 1); bar.value = done; setStatus(`Checked ${name} (${done}/${total})`); },
      });
      state.fetchedAt = new Date().toISOString();
      setRows(res.rows);
      const saved = store.set("ghre.catalog", JSON.stringify({ rows: res.rows }));
      store.set("ghre.fetchedAt", state.fetchedAt);
      let msg = `Scanned ${res.scanned} repositories; retrieved ${res.rows.length} assets.`;
      if (res.skippedDuplicates) msg += ` Ignored ${res.skippedDuplicates} duplicate aggregate assets.`;
      if (res.errors.length) msg += ` ${res.errors.length} repositories could not be read.`;
      if (!saved) msg += " (too large to cache offline)";
      setStatus(msg);
      if (res.errors.length) alert("Refresh completed with warnings:\n\n" + res.errors.slice(0, 10).join("\n"));
    } catch (err) {
      if (err instanceof C.Cancelled) setStatus("Refresh cancelled - previous data kept.");
      else { setStatus("Refresh failed - previous data kept."); alert("GitHub refresh failed:\n\n" + err.message); }
    } finally {
      state.abort = null; bar.hidden = true; $("refreshBtn").textContent = "Refresh from GitHub";
    }
  }

  // ---- export ------------------------------------------------------------------------------------------------------
  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = el("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function exportRows(kind) {
    $("exportMenu").open = false;
    if (!state.view.length) { alert("There are no visible rows to export."); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `github_releases_${stamp}.${kind}`;
    if (kind === "csv") download(name, C.toCSV(state.view), "text/csv;charset=utf-8");
    else if (kind === "json") download(name, C.toJSON(state.view), "application/json");
    else download(name, C.toXLSX(state.view), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    setStatus(`Exported ${state.view.length.toLocaleString()} rows to ${name}`);
  }
  document.querySelectorAll("[data-export]").forEach((b) => (b.onclick = () => exportRows(b.dataset.export)));
  document.addEventListener("click", (e) => { const m = $("exportMenu"); if (m.open && !m.contains(e.target)) m.open = false; });

  // ---- settings ----------------------------------------------------------------------------------------------------
  const dlg = $("settings");
  const fillSettings = () => {
    $("sources").value = state.sources; $("keyword").value = state.keyword; $("aggs").value = state.aggregates;
    $("depth").value = String(state.depth); $("archived").checked = state.archived; $("token").value = state.token;
  };
  $("settingsBtn").onclick = () => { fillSettings(); dlg.showModal(); };
  $("settingsCancel").onclick = () => dlg.close();
  $("settingsExample").onclick = () => {
    state.sources = C.DEFAULT_SOURCE; state.keyword = C.DEFAULT_KEYWORD; state.aggregates = C.DEFAULT_AGGREGATES; state.depth = 1; state.archived = false;
    fillSettings();
  };
  $("settingsCopy").onclick = () => {
    readForm(); copyText(location.href.split("#")[0] + shareHash(), "Share link copied");
  };
  function readForm() {
    state.sources = $("sources").value.trim(); state.keyword = $("keyword").value.trim(); state.aggregates = $("aggs").value.trim();
    state.depth = Number($("depth").value) || 1; state.archived = $("archived").checked; state.token = $("token").value.trim();
  }
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
    else if (e.key === "Escape" && !dlg.open) resetFilters();
  });

  applyTheme(document.documentElement.dataset.theme || "light");
  $("subtitle").title = PROJECT_URL;
  const signature = () => [norm(state.sources), state.keyword, norm(state.aggregates), state.depth, state.archived].join("|");
  const before = signature();
  const fromLink = readHash();
  const changed = fromLink && signature() !== before;
  if (changed) persistSettings();
  buildTable();
  loadCache();
  // A share link that differs from what is cached (or arrives with nothing cached) loads its own data straight away.
  if (fromLink && (changed || !state.rows.length)) refresh();
})();
