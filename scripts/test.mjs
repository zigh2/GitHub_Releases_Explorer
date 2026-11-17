// Runs every tests/*.test.js with Node's built-in runner. Passing explicit file names (instead of a glob) works on every Node version.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "tests");
const files = readdirSync(dir).filter((f) => f.endsWith(".test.js")).sort().map((f) => join(dir, f));
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
