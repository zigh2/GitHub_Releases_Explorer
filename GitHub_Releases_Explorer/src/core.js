/* GitHub Releases Explorer - core logic (no DOM): classification, GitHub client, catalog, exports. */
const Core = (() => {
  "use strict";

  // ---- columns (single source of truth for the table, CSV, XLSX and JSON) ------------------------------------------
  const COLUMNS = [
    { key: "application", header: "Application", width: 150 },
    { key: "version", header: "Version", width: 100 },
    { key: "published", header: "Published", width: 150 },
    { key: "prerelease", header: "Prerelease", width: 100 },
    { key: "platform", header: "Platform", width: 100 },
    { key: "architecture", header: "Architecture", width: 115 },
    { key: "package_type", header: "Package Type", width: 130 },
    { key: "extension", header: "Extension", width: 105 },
    { key: "variant", header: "Variant", width: 100 },
    { key: "file_name", header: "File Name", width: 400 },
    { key: "size_mb", header: "Size (MB)", width: 100, numeric: true },
    { key: "sha256", header: "SHA256", width: 150 },
    { key: "repository", header: "Repository", width: 200 },
    { key: "source", header: "Source", width: 100 },
    { key: "download_url", header: "Download URL", width: 380 },
    { key: "release_url", header: "Release URL", width: 320 },
  ];
  const KEYS = COLUMNS.map((c) => c.key);
  const HEADERS = COLUMNS.map((c) => c.header);
  const FILTER_KEYS = ["application", "platform", "architecture", "package_type", "extension", "variant", "prerelease"];
  const NON_PACKAGE_TYPES = new Set(["Metadata", "Signature", "Update Info"]);

  // ---- classification --------------------------------------------------------------------------------------------
  const EXTENSIONS = [
    ".oci-manifest.json", ".pkg.tar.zst", ".app.tar.gz", ".tar.gz", ".tar.xz", ".tar.bz2", ".tar.zst", ".appimage",
    ".flatpak", ".zsync", ".msixbundle", ".msix", ".appx", ".7z", ".zip", ".msi", ".exe", ".dmg", ".pkg", ".deb",
    ".rpm", ".apk", ".snap", ".json", ".txt", ".asc", ".sig", ".sha256", ".zst", ".gz", ".xz",
  ];
  const SIGNATURE_SUFFIXES = [".asc", ".sig", ".minisig", ".sha256", ".sha256sum"];
  const tokenRe = (...words) => new RegExp("(?<![a-z0-9])(?:" + words.join("|") + ")(?![a-z0-9])");
  const RE = {
    arm64: tokenRe("arm64", "aarch64", "armv8"),
    x64: tokenRe("x86[_-]64", "amd64", "x64", "win64"),
    x86: tokenRe("i386", "i686", "x86", "win32", "ia32"),
    riscv: tokenRe("riscv64", "riscv"),
    arm32: tokenRe("armv7l?", "armhf", "arm32"),
    universal: tokenRe("universal", "universal2"),
    windows: tokenRe("windows", "win32", "win64", "win"),
    mac: tokenRe("macos", "darwin", "osx", "mac"),
    linux: tokenRe("linux"),
    freebsd: tokenRe("freebsd"),
    cli: tokenRe("cli"),
    web: tokenRe("web"),
    server: tokenRe("server"),
  };
  const has = (name, ...tokens) => tokens.some((t) => name.includes(t));
  const endsWithAny = (s, list) => list.some((x) => s.endsWith(x));

  function extensionOf(fileName) {
    const lower = fileName.toLowerCase();
    for (const ext of EXTENSIONS) if (lower.endsWith(ext)) return ext;
    const dot = lower.lastIndexOf(".");
    if (dot > 0 && lower.length - dot <= 8) return lower.slice(dot);
    return "(none)";
  }
  function detectPlatform(name, ext) {
    if (RE.freebsd.test(name)) return "FreeBSD";
    if (RE.windows.test(name) || [".exe", ".msi", ".msix", ".msixbundle", ".appx"].includes(ext)) return "Windows";
    if (RE.mac.test(name) || [".dmg", ".pkg", ".app.tar.gz"].includes(ext)) return "macOS";
    if (RE.linux.test(name) || [".appimage", ".deb", ".rpm", ".flatpak", ".snap", ".pkg.tar.zst", ".zsync"].includes(ext)) return "Linux";
    if (ext === ".apk") return "Android";
    return "Unknown";
  }
  function detectArchitecture(name) {
    if (RE.arm64.test(name)) return "ARM64";
    if (RE.x64.test(name)) return "x64";
    if (RE.riscv.test(name)) return "RISC-V 64";
    if (RE.arm32.test(name)) return "ARM32";
    if (RE.x86.test(name)) return "x86";
    if (RE.universal.test(name)) return "Universal";
    return "Unknown";
  }
  function detectVariant(name) {
    if (has(name, "-symbols", "_symbols", ".pdb")) return "Symbols";
    if (RE.cli.test(name)) return "CLI";
    if (RE.web.test(name)) return "Web";
    if (RE.server.test(name)) return "Server";
    return "Desktop";
  }
  function detectPackageType(name, ext, variant) {
    if (endsWithAny(name, SIGNATURE_SUFFIXES) || name.includes(".oci.sig")) return "Signature";
    if (has(name, "sha256sums", "checksum", "sbom", "attestation") || ext === ".txt") return "Metadata";
    if (ext === ".zsync" || ext === ".oci-manifest.json") return "Update Info";
    if (variant === "Symbols") return "Debug Symbols";
    if (ext === ".flatpak") return "Flatpak";
    if (ext === ".snap") return "Snap";
    if (ext === ".pkg.tar.zst") return "Arch Package";
    if (has(name, "portable", "no-install", "noinstall")) return "Portable";
    if ([".exe", ".msi", ".msix", ".msixbundle", ".appx", ".dmg", ".pkg", ".deb", ".rpm", ".apk"].includes(ext)) return "Installer";
    if (ext === ".appimage") return "Portable";
    if ([".zip", ".7z", ".tar.gz", ".tar.xz", ".tar.bz2", ".tar.zst", ".app.tar.gz", ".gz", ".xz"].includes(ext)) return "Archive";
    return "Other";
  }
  function classify(fileName) {
    const name = fileName.toLowerCase();
    const ext = extensionOf(fileName);
    const variant = detectVariant(name);
    let platform = detectPlatform(name, ext);
    let architecture = detectArchitecture(name);
    if (variant === "Web" && platform === "Unknown") { platform = "Web"; architecture = "Any"; }
    return { platform, architecture, package_type: detectPackageType(name, ext, variant), extension: ext, variant };
  }

  const APP_PREFIX = /^(?<app>[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z][A-Za-z0-9]*)*?)(?:[-_](?:cli|web|server|launcher))?[-_]v?\d+\.\d+/;
  const VERSION_RE = /v?(\d+(?:\.\d+)+(?:[-+.][0-9A-Za-z.]+)?)/;
  const titleCase = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const appNameFromRepo = (repo) => repo.replace(/[-_]+/g, " ").trim().split(/\s+/).filter(Boolean).map(titleCase).join(" ");
  function appNameFromAsset(fileName) {
    const m = APP_PREFIX.exec(fileName);
    return m ? appNameFromRepo(m.groups.app) : null;
  }
  function cleanVersion(tag) {
    const m = VERSION_RE.exec(tag || "");
    return m ? m[1] : tag || "";
  }
  /** Zero-padded so plain string comparison sorts 0.10.0 after 0.9.0. */
  function versionKey(version) {
    const parts = String(version || "").match(/\d+/g);
    return parts ? parts.map((p) => p.padStart(10, "0")).join(".") : "";
  }

  // ---- GitHub client ---------------------------------------------------------------------------------------------
  const GITHUB_API = "https://api.github.com";
  const PER_PAGE = 100;
  const EMBEDDED_ASSETS_SUSPECT = 30;
  class GitHubError extends Error { constructor(m) { super(m); this.name = "GitHubError"; } }
  class RateLimitError extends GitHubError { constructor(m) { super(m); this.name = "RateLimitError"; } }
  class NotFoundError extends GitHubError { constructor(m) { super(m); this.name = "NotFoundError"; } }
  class Cancelled extends Error { constructor() { super("Cancelled"); this.name = "Cancelled"; } }

  function createClient({ fetchImpl, token = "", retries = 3, backoffMs = 1500, signal = null } = {}) {
    const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token && token.trim()) headers.Authorization = "Bearer " + token.trim();

    async function get(url, params = {}) {
      const u = new URL(url);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
      let last = null;
      for (let attempt = 0; attempt < retries; attempt++) {
        if (signal && signal.aborted) throw new Cancelled();
        let res;
        try {
          res = await doFetch(u.toString(), { headers, signal });
        } catch (err) {
          if (err && err.name === "AbortError") throw new Cancelled();
          last = err;
          await sleep(backoffMs * (attempt + 1));
          continue;
        }
        const status = res.status;
        if ((status === 403 || status === 429) && res.headers.get("X-RateLimit-Remaining") === "0") {
          const reset = Number(res.headers.get("X-RateLimit-Reset"));
          const when = reset ? new Date(reset * 1000).toLocaleTimeString() : "later";
          throw new RateLimitError(`GitHub API rate limit reached (resets at ${when}). Add a personal access token in Settings and refresh again.`);
        }
        if (status === 404) throw new NotFoundError("Not found: " + url);
        if (status >= 500) { last = new GitHubError(`GitHub returned HTTP ${status} for ${url}`); await sleep(backoffMs * (attempt + 1)); continue; }
        if (status >= 400) {
          let detail = "";
          try { detail = (await res.json()).message || ""; } catch (_) { /* ignore */ }
          throw new GitHubError(`HTTP ${status} for ${url}` + (detail ? ": " + detail : ""));
        }
        return res.json();
      }
      throw new GitHubError("Could not reach GitHub: " + (last && last.message ? last.message : last));
    }

    async function paginate(url, params = {}, limit = null) {
      const items = [];
      for (let page = 1; ; page++) {
        const batch = await get(url, { ...params, per_page: PER_PAGE, page });
        if (!batch || !batch.length) break;
        items.push(...batch);
        if (limit !== null && items.length >= limit) return items.slice(0, limit);
        if (batch.length < PER_PAGE) break;
      }
      return items;
    }

    async function discoverRepositories(owner, keyword = "craft", includeArchived = false) {
      let repos;
      try {
        repos = await paginate(`${GITHUB_API}/orgs/${owner}/repos`, { type: "public", sort: "full_name" });
      } catch (err) {
        if (!(err instanceof NotFoundError)) throw err;
        repos = await paginate(`${GITHUB_API}/users/${owner}/repos`, { type: "owner", sort: "full_name" });
      }
      const kw = keyword.toLowerCase();
      return repos.filter((r) => (r.name || "").toLowerCase().includes(kw) && (includeArchived || !r.archived));
    }

    async function listReleases(fullName, count = 1) {
      count = Math.max(1, count);
      const releases = await paginate(`${GITHUB_API}/repos/${fullName}/releases`, {}, count + 5);
      return releases.filter((r) => !r.draft).slice(0, count);
    }

    async function allAssets(fullName, release) {
      let assets = [...(release.assets || [])];
      if (assets.length >= EMBEDDED_ASSETS_SUSPECT && release.id != null) {
        try { assets = await paginate(`${GITHUB_API}/repos/${fullName}/releases/${release.id}/assets`); }
        catch (err) { if (err instanceof RateLimitError || err instanceof Cancelled) throw err; }
      }
      return assets;
    }
    return { get, paginate, discoverRepositories, listReleases, allAssets };
  }

  // ---- rows & catalog --------------------------------------------------------------------------------------------
  function buildRows(repo, release, assets, { source = "Repository", inferAppFromAsset = false } = {}) {
    const repoName = repo.name || repo.full_name.split("/").pop();
    const defaultApp = appNameFromRepo(repoName);
    const tag = release.tag_name || release.name || "";
    const published = release.published_at || release.created_at || "";
    return assets.map((asset) => {
      const fileName = asset.name || "";
      const c = classify(fileName);
      const app = (inferAppFromAsset ? appNameFromAsset(fileName) : null) || defaultApp;
      return {
        application: app, version: cleanVersion(tag), published, prerelease: release.prerelease ? "Yes" : "No",
        platform: c.platform, architecture: c.architecture, package_type: c.package_type, extension: c.extension,
        variant: c.variant, file_name: fileName, size_mb: Math.round(((asset.size || 0) / 1024 / 1024) * 100) / 100,
        sha256: (asset.digest || "").replace("sha256:", ""), repository: repo.full_name, source,
        download_url: asset.browser_download_url || "", release_url: release.html_url || "",
      };
    });
  }

  // Defaults are only an *example* (the Craft apps by the storytold organization); every one is editable in Settings.
  const DEFAULT_SOURCE = "storytold";
  const DEFAULT_KEYWORD = "craft";
  const DEFAULT_AGGREGATES = "Labtoso/Artcraft";
  const AGGREGATE_SCAN_RELEASES = 30;
  const stamp = (row) => `${row.published}|${versionKey(row.version)}`;

  /** "storytold, microsoft/winget-cli https://github.com/cli/cli" -> [{owner}, {owner, repo}, ...] */
  function parseSources(text) {
    const out = [], seen = new Set();
    for (let item of String(text || "").split(/[\s,;]+/)) {
      item = item.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
      if (!item) continue;
      const [owner, repo, ...rest] = item.split("/");
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner || "") || (repo !== undefined && !/^[A-Za-z0-9._-]+$/.test(repo)) || rest.length > 2) continue;
      const key = (repo ? `${owner}/${repo}` : owner).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(repo ? { owner, repo } : { owner });
    }
    return out;
  }

  function dedupeAggregate(orgRows, aggRows) {
    const newest = new Map();
    for (const r of orgRows) {
      const k = r.application.toLowerCase();
      if (!newest.has(k) || stamp(r) > newest.get(k)) newest.set(k, stamp(r));
    }
    const kept = [];
    let dropped = 0;
    for (const r of aggRows) {
      const seen = newest.get(r.application.toLowerCase());
      if (seen !== undefined && seen >= stamp(r)) { dropped++; continue; }
      kept.push(r);
    }
    return { kept, dropped };
  }

  /**
   * sources: organisation / user names and/or owner/repo entries (array of parseSources() items, or a string).
   * keyword: only organisation/user repositories whose name contains it are scanned ("" = all). Direct owner/repo entries ignore it.
   * aggregates: repositories that mirror *other* applications' releases (application is inferred from file names).
   */
  async function fetchCatalog(client, sources, { aggregates = [], depth = 1, keyword = "", includeArchived = false, onProgress = null, signal = null } = {}) {
    const check = () => { if (signal && signal.aborted) throw new Cancelled(); };
    const entries = typeof sources === "string" ? parseSources(sources) : sources;
    const aggList = (typeof aggregates === "string" ? parseSources(aggregates) : aggregates).filter((a) => a.repo);
    if (!entries.length) throw new GitHubError("Enter at least one organization, user or owner/repo in Settings.");
    const result = { rows: [], errors: [], scanned: 0, skippedDuplicates: 0 };

    const targets = new Map();
    for (const entry of entries) {
      check();
      if (entry.repo) { targets.set(`${entry.owner}/${entry.repo}`.toLowerCase(), { name: entry.repo, full_name: `${entry.owner}/${entry.repo}` }); continue; }
      try {
        for (const r of await client.discoverRepositories(entry.owner, keyword, includeArchived)) targets.set(r.full_name.toLowerCase(), r);
      } catch (err) {
        if (err instanceof RateLimitError || err instanceof Cancelled) throw err;
        if (!(err instanceof GitHubError)) throw err;
        result.errors.push(`${entry.owner}: ${err.message}`);
      }
    }
    const aggKeys = new Set(aggList.map((a) => `${a.owner}/${a.repo}`.toLowerCase()));
    const list = [...targets.entries()].filter(([k]) => !aggKeys.has(k)).map(([, r]) => r);
    if (!list.length && !aggList.length && !result.errors.length) throw new GitHubError(`No public repositories${keyword ? ` containing '${keyword}'` : ""} were found.`);
    const total = list.length + aggList.length;
    let done = 0;
    const orgRows = [];

    for (const repo of list) {
      check();
      try {
        for (const release of await client.listReleases(repo.full_name, depth)) {
          orgRows.push(...buildRows(repo, release, await client.allAssets(repo.full_name, release)));
        }
      } catch (err) {
        if (err instanceof RateLimitError || err instanceof Cancelled) throw err;
        if (!(err instanceof GitHubError)) throw err;
        result.errors.push(`${repo.full_name}: ${err.message}`);
      }
      onProgress && onProgress(++done, total, repo.full_name);
    }

    const aggRows = [];
    for (const agg of aggList) {
      check();
      const full = `${agg.owner}/${agg.repo}`;
      const repo = { name: agg.repo, full_name: full };
      try {
        const used = new Map();
        for (const release of await client.listReleases(full, AGGREGATE_SCAN_RELEASES)) {
          const rows = buildRows(repo, release, await client.allAssets(full, release), { source: "Aggregate", inferAppFromAsset: true });
          for (const app of [...new Set(rows.map((r) => r.application))].sort()) {
            if ((used.get(app) || 0) >= depth) continue;
            used.set(app, (used.get(app) || 0) + 1);
            aggRows.push(...rows.filter((r) => r.application === app));
          }
        }
      } catch (err) {
        if (err instanceof RateLimitError || err instanceof Cancelled) throw err;
        if (!(err instanceof GitHubError)) throw err;
        result.errors.push(`${full}: ${err.message}`);
      }
      onProgress && onProgress(++done, total, full);
    }
    const { kept, dropped } = dedupeAggregate(orgRows, aggRows);
    result.rows = [...orgRows, ...kept];
    result.skippedDuplicates = dropped;
    result.scanned = total;
    if (!result.rows.length && result.errors.length) throw new GitHubError("No release assets were retrieved.\n" + result.errors.slice(0, 8).join("\n"));
    return result;
  }

  // ---- exports ---------------------------------------------------------------------------------------------------
  const val = (row, key) => (row[key] === undefined || row[key] === null ? "" : row[key]);
  const csvSafe = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v);
  function csvCell(v) {
    const s = String(csvSafe(v));
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    const lines = [HEADERS.map(csvCell).join(",")];
    for (const r of rows) lines.push(KEYS.map((k) => csvCell(val(r, k))).join(","));
    return "\uFEFF" + lines.join("\r\n") + "\r\n"; // BOM so Excel detects UTF-8
  }
  function toJSON(rows) {
    return JSON.stringify(rows.map((r) => Object.fromEntries(KEYS.map((k) => [k, val(r, k)]))), null, 2);
  }

  // Minimal XLSX writer (stored ZIP, inline strings) - no dependencies.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const u16 = (v) => [v & 255, (v >>> 8) & 255];
    const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const [name, text] of files) {
      const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(DOS_DATE),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]);
      chunks.push(local, nameB, data);
      central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(DOS_DATE),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(offset)]), nameB);
      offset += local.length + nameB.length + data.length;
    }
    const centralSize = central.reduce((n, c) => n + c.length, 0);
    const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0)]);
    const all = [...chunks, ...central, end];
    const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
    let pos = 0;
    for (const c of all) { out.set(c, pos); pos += c.length; }
    return out;
  }
  const xmlEsc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const colName = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  function toXLSX(rows) {
    const cell = (ref, v, style) => {
      if (typeof v === "number") return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    };
    let sheet = `<row r="1">${HEADERS.map((h, i) => cell(colName(i) + "1", h, ' s="1"')).join("")}</row>`;
    rows.forEach((r, n) => {
      sheet += `<row r="${n + 2}">${KEYS.map((k, i) => cell(colName(i) + (n + 2), val(r, k), "")).join("")}</row>`;
    });
    const widths = COLUMNS.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.round(c.width / 7))}" customWidth="1"/>`).join("");
    const last = colName(KEYS.length - 1) + (rows.length + 1);
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
    return zipStore([
      ["[Content_Types].xml", `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
      ["_rels/.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `${X}<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Release Assets" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", `${X}<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4FBF"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ["xl/worksheets/sheet1.xml", `${X}<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheet}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`],
    ]);
  }

  return {
    COLUMNS, KEYS, HEADERS, FILTER_KEYS, NON_PACKAGE_TYPES, DEFAULT_SOURCE, DEFAULT_KEYWORD, DEFAULT_AGGREGATES,
    classify, extensionOf, appNameFromRepo, appNameFromAsset, cleanVersion, versionKey,
    createClient, buildRows, fetchCatalog, dedupeAggregate, parseSources,
    GitHubError, RateLimitError, NotFoundError, Cancelled,
    toCSV, toJSON, toXLSX, crc32,
  };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Core;
