// Inlines src/ into a single self-contained index.html.  Usage: node scripts/build.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");

export function build() {
  const version = read("VERSION").trim();
  const core = read("src/core.js").replace(/\n?if \(typeof module[^\n]*\n?$/, "\n"); // drop the Node-only export line
  const html = read("src/index.template.html")
    .replace("/*__CSS__*/", () => read("src/style.css").trim())
    .replace("/*__CORE__*/", () => core.trim())
    .replace("/*__APP__*/", () => read("src/app.js").trim())
    .replace("</title>", () => `</title>\n<meta name="generator" content="GitHub Releases Explorer ${version}">`);
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = build();
  const out = join(root, "index.html");
  if (process.argv.includes("--check")) {
    if (!existsSync(out) || readFileSync(out, "utf8").replace(/\r\n/g, "\n") !== html) {
      console.error("index.html is out of date - run: node scripts/build.mjs");
      process.exit(1);
    }
    console.log("index.html is up to date");
  } else {
    writeFileSync(out, html);
    console.log(`index.html written (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
  }
}
