// In-memory stand-in for the GitHub REST API (no network in tests).
function response(status, payload, headers = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, headers: { get: (k) => (h.has(k.toLowerCase()) ? h.get(k.toLowerCase()) : null) }, json: async () => payload };
}
function createFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(url);
    calls.push(u.pathname);
    const route = routes[u.pathname];
    if (route === undefined) return response(404, { message: "Not Found" });
    if (route && route.__response) return route.__response;
    if (Array.isArray(route)) {
      const perPage = Number(u.searchParams.get("per_page") || 30), page = Number(u.searchParams.get("page") || 1);
      return response(200, route.slice((page - 1) * perPage, page * perPage));
    }
    return response(200, route);
  };
  fn.calls = calls;
  return fn;
}
const asset = (id, name, size = 1024 * 1024) => ({ id, name, size, digest: "sha256:" + "ab".repeat(32), browser_download_url: `https://github.com/dl/${name}` });
const release = (id, tag, published, assets, extra = {}) => ({ id, tag_name: tag, name: tag, published_at: published, prerelease: false, draft: false, assets, html_url: `https://github.com/rel/${tag}`, ...extra });
const repo = (owner, name, archived = false) => ({ name, full_name: `${owner}/${name}`, archived });

function sampleRoutes() {
  const org = "storytold";
  return {
    [`/orgs/${org}/repos`]: [repo(org, "artcraft"), repo(org, "anicraft"), repo(org, "effectcraft"), repo(org, "docs"), repo(org, "oldcraft", true)],
    [`/repos/${org}/artcraft/releases`]: [
      release(10, "artcraft-v0.41.1", "2026-11-07T02:49:42Z", [asset(1, "ArtCraft_0.41.1_x64-setup.exe"), asset(2, "ArtCraft_0.41.1_x64_en-US.msi"), asset(3, "ArtCraft_0.41.1_universal.dmg"), asset(4, "SHA256SUMS.txt")]),
      release(9, "artcraft-v0.40.0", "2026-10-01T00:00:00Z", [asset(5, "ArtCraft_0.40.0_x64-setup.exe"), asset(6, "ArtCraft_0.40.0_x64_en-US.msi")]),
      release(8, "artcraft-v0.39.0", "2026-09-01T00:00:00Z", [asset(7, "ArtCraft_0.39.0_x64-setup.exe")], { draft: true }),
    ],
    [`/repos/${org}/anicraft/releases`]: [release(20, "v0.2.1", "2026-11-12T01:41:19Z", [asset(11, "anicraft-0.2.1-windows-x64.msi"), asset(12, "anicraft-0.2.1-windows-x64-portable.zip"), asset(13, "anicraft-0.2.1-windows-x64-symbols.zip")])],
    [`/repos/${org}/effectcraft/releases`]: [release(30, "v0.24.1", "2026-11-12T00:23:40Z", [asset(21, "effectcraft-0.24.1-windows-x64.msi"), asset(22, "effectcraft-0.24.1-linux-x86_64.deb")])],
    // aggregate repository: one release per application, all named after the repository
    "/repos/Labtoso/Artcraft/releases": [
      release(40, "v0.23.1", "2026-11-11T00:58:52Z", [asset(31, "effectcraft-0.23.1-windows-x64.msi"), asset(32, "effectcraft-0.23.1-linux-x86_64.deb")], { prerelease: true }),
      release(41, "v0.5.0", "2026-11-10T00:00:00Z", [asset(33, "pdfcraft-0.5.0-windows-x64.msi")], { prerelease: true }),
    ],
  };
}
module.exports = { response, createFetch, asset, release, repo, sampleRoutes };
