"""Validate installer inputs, pin every packaged file, and stage extension separately."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import struct
import zipfile

from vendor_bundle import ROOT, LOCK, digest, inventory, verify


def validate(bundle):
    bundle = bundle.resolve(strict=True)
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    for name in ("CorrectlyServer.exe", "_internal/python314.dll", "vendor-manifest.json",
                 "engine/languagetool-server.jar", "runtime/bin/javaw.exe", "runtime/bin/java.exe",
                 "engine/server.properties", "licenses/LanguageTool-COPYING.txt",
                 "licenses/Python-LICENSE.txt", "VERSION.txt", "README_INSTALL.md"):
        if not (bundle / name).is_file():
            raise ValueError("Incomplete bundle: " + name)
    for name in ("engine/org", "engine/libs", "runtime/legal", "licenses/languagetool"):
        if not (bundle / name).is_dir():
            raise ValueError("Incomplete resources: " + name)
    verify(bundle, lock)
    if json.loads((bundle / "vendor-manifest.json").read_text(encoding="utf-8")) != lock:
        raise ValueError("Vendor manifest differs from lock")
    executable = (bundle / "CorrectlyServer.exe").read_bytes()
    pe = struct.unpack_from("<I", executable, 0x3c)[0]
    if executable[pe:pe + 4] != b"PE\0\0" or struct.unpack_from("<H", executable, pe + 4)[0] != 0x8664:
        raise ValueError("Windows x64 executable required")
    if struct.unpack_from("<H", executable, pe + 24 + 68)[0] != 2:
        raise ValueError("GUI subsystem required")
    files = inventory(bundle)
    excluded = {".git", ".venv", "__pycache__", ".pytest_cache", "node_modules"}
    if any(excluded.intersection(Path(name).parts) or name.endswith(".log") for name in files):
        raise ValueError("Development caches or logs in installer input")
    return {"recorded_at": datetime.now(timezone.utc).isoformat(),
            "engine_version": lock["engine_version"], "runtime_version": lock["runtime_version"],
            "file_count": len(files), "bytes": sum((bundle / name).stat().st_size for name in files),
            "files": files}


def extension(destination):
    folder = ROOT / "dist"
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if manifest != json.loads((ROOT / "frontend/manifest.json").read_text(encoding="utf-8")):
        raise ValueError("Extension manifest differs from source; build the extension first")
    for name in (manifest["background"]["service_worker"],
                 manifest["action"]["default_popup"], manifest["options_page"],
                 *(script for entry in manifest["content_scripts"] for script in entry["js"]),
                 *manifest["icons"].values()):
        if not (folder / name).is_file():
            raise ValueError("Missing extension asset")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in inventory(folder):
            archive.write(folder / name, "dist/" + name)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--extension-zip", type=Path)
    args = parser.parse_args()
    report = validate(args.bundle)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.extension_zip:
        extension(args.extension_zip)
    print(f"Verified {report['file_count']} bundle files, {report['bytes']} bytes; engine/runtime unchanged")


if __name__ == "__main__":
    main()
