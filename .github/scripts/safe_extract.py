#!/usr/bin/env python3
"""Safely unpack the archive dropped into incoming/.

Usage: safe_extract.py <archive.zip> <staging-dir>

* rejects path traversal ("zip slip"), absolute paths and symlinks
* rejects archives that are suspiciously large
* never lets the archive touch .git/, .github/ or incoming/
* flattens a single wrapping folder (GitHub_Releases_Explorer/…)
* prints the project root (the folder that holds VERSION) on stdout
"""

from __future__ import annotations

import shutil
import stat
import sys
import zipfile
from pathlib import PurePosixPath, Path

MAX_FILES = 5_000
MAX_TOTAL_BYTES = 300 * 1024 * 1024
PROTECTED = {".git", ".github", "incoming"}
JUNK = {"__MACOSX", ".DS_Store", "Thumbs.db", "__pycache__"}
REQUIRED = ("VERSION", "index.html", "src/core.js", "package.json")


def fail(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: safe_extract.py <archive.zip> <staging-dir>")
    archive, staging = Path(sys.argv[1]), Path(sys.argv[2])
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    with zipfile.ZipFile(archive) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_FILES:
            fail(f"archive has {len(infos)} entries (limit {MAX_FILES})")
        if sum(i.file_size for i in infos) > MAX_TOTAL_BYTES:
            fail("archive is larger than 300 MB when unpacked")
        for info in infos:
            name = PurePosixPath(info.filename.replace("\\", "/"))
            if name.is_absolute() or ".." in name.parts:
                fail(f"unsafe path in archive: {info.filename}")
            if stat.S_ISLNK(info.external_attr >> 16):
                fail(f"symbolic links are not allowed: {info.filename}")
            if any(part in JUNK for part in name.parts):
                continue
            target = staging.joinpath(*name.parts)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)

    root = staging
    while True:  # unwrap "Project/…" folders
        entries = [p for p in root.iterdir()]
        if len(entries) == 1 and entries[0].is_dir() and not (root / "VERSION").exists():
            root = entries[0]
        else:
            break

    for protected in PROTECTED:  # the archive may never replace these
        victim = root / protected
        if victim.is_dir():
            shutil.rmtree(victim)
        elif victim.exists():
            victim.unlink()

    missing = [r for r in REQUIRED if not (root / r).exists()]
    if missing:
        fail("archive does not look like this project, missing: " + ", ".join(missing))
    print(root)


if __name__ == "__main__":
    main()
