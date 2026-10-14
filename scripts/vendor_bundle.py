"""Pin, copy and verify complete local distributions without downloading anything."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "backend/vendor-lock.json"
VENDOR = ROOT / "backend/vendor"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(root):
    result = {}
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()):
            raise ValueError("Links are not supported in vendor distributions")
        if path.is_file():
            result[path.relative_to(root).as_posix()] = digest(path)
    return result


def verify(root, manifest):
    for component in ("engine", "runtime"):
        if inventory(root / component) != manifest["files"][component]:
            raise ValueError(f"Checksum or file inventory mismatch: {component}")


def record(engine, runtime):
    if LOCK.exists():
        raise ValueError("Lock already exists. Review a dependency change separately before replacing it.")
    for root, required in ((engine, ("languagetool-server.jar", "server.properties", "COPYING.txt")),
                           (runtime, ("release", "bin/javaw.exe", "bin/java.exe", "legal"))):
        for name in required:
            if not (root / name).exists():
                raise ValueError("Incomplete distribution")
    with zipfile.ZipFile(engine / "libs/languagetool-core.jar") as jar:
        properties = jar.read("META-INF/maven/org.languagetool/languagetool-core/pom.properties").decode()
    version = next(line.split("=", 1)[1] for line in properties.splitlines() if line.startswith("version="))
    release = dict(line.split("=", 1) for line in (runtime / "release").read_text().splitlines() if "=" in line)
    if release["OS_ARCH"].strip('"') != "x86_64":
        raise ValueError("Windows x64 runtime required")
    manifest = dict(schema=1, recorded_at=datetime.now(timezone.utc).isoformat(),
                    engine_version=version, engine_distribution=engine.name,
                    runtime_version=release["JAVA_RUNTIME_VERSION"].strip('"'),
                    runtime_vendor=release["IMPLEMENTOR"].strip('"'),
                    provenance={"engine": "Existing V2 local distribution; original archive checksum unavailable",
                                "runtime": "Existing V2 Eclipse Adoptium installation copied in full; original archive checksum unavailable",
                                "engine_project": "https://github.com/languagetool-org/languagetool",
                                "runtime_project": "https://github.com/adoptium/temurin25-binaries",
                                "release_gate": "Verify original archive provenance and redistribution before public release"},
                    files={"engine": inventory(engine), "runtime": inventory(runtime)})
    LOCK.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Recorded complete V2 distributions; inspect vendor-lock.json before preparation.")


def prepare(engine, runtime):
    manifest = json.loads(LOCK.read_text(encoding="utf-8"))
    for name, source in (("engine", engine), ("runtime", runtime)):
        if inventory(source) != manifest["files"][name]:
            raise ValueError(f"Unpinned source: {name}")
        target = VENDOR / name
        # Refuse stale files instead of destructive cleanup or silently merging versions.
        if target.exists() and any(target.iterdir()):
            if inventory(target) != manifest["files"][name]:
                raise ValueError(f"Vendor {name} already contains a different distribution")
        else:
            shutil.copytree(source, target, dirs_exist_ok=True)
    verify(VENDOR, manifest)
    shutil.copy2(LOCK, VENDOR / "vendor-manifest.json")
    print("Private runtime and complete engine verified.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("record", "prepare", "verify"))
    parser.add_argument("--engine", type=Path)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--root", type=Path, default=VENDOR)
    args = parser.parse_args()
    if args.action == "verify":
        verify(args.root, json.loads(LOCK.read_text(encoding="utf-8")))
        print("All pinned checksums match.")
    else:
        if args.engine is None or args.runtime is None:
            parser.error("Explicit local --engine and --runtime sources are required")
        (record if args.action == "record" else prepare)(args.engine.resolve(), args.runtime.resolve())


if __name__ == "__main__":
    main()
