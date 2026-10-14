"""Build into artifacts/, preserving the extension's dist/ and every vendor file."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import zipfile

from vendor_bundle import ROOT, LOCK, VENDOR, digest, verify


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=ROOT / "artifacts")
    parser.add_argument("--skip-archive", action="store_true")
    args = parser.parse_args()
    if sys.platform != "win32" or struct.calcsize("P") != 8:
        raise SystemExit("Build on Windows with an x64 interpreter")
    if sys.version_info[:3] != (3, 14, 8):
        raise SystemExit("Pinned build interpreter: CPython 3.14.8")
    requirements = ROOT / "backend/requirements-build.txt"
    for line in requirements.read_text().splitlines():
        if "==" in line and not line.startswith("#"):
            name, expected = line.split("==")
            if importlib.metadata.version(name) != expected:
                raise SystemExit("Build dependency differs from lock: " + name)
    manifest = json.loads(LOCK.read_text(encoding="utf-8"))
    verify(VENDOR, manifest)
    out = args.output_dir.resolve()
    if out == ROOT or out.is_relative_to(VENDOR) or VENDOR.is_relative_to(out):
        raise SystemExit("Use a dedicated build output directory outside vendor")
    bundle = out / "Correctly-V3-Windows-x64"
    if bundle.exists():
        raise SystemExit("Build output already exists. Archive or remove it explicitly before rebuilding.")
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
                    "--distpath", str(out), "--workpath", str(ROOT / "backend/build"),
                    str(ROOT / "backend/correctly.spec")], check=True)
    for name in ("engine", "runtime"):
        shutil.copytree(VENDOR / name, bundle / name)
    shutil.copy2(LOCK, bundle / "vendor-manifest.json")
    for name in ("README_INSTALL.md", "VERSION.txt"):
        shutil.copy2(ROOT / "backend" / name, bundle / name)
    licenses = bundle / "licenses"
    licenses.mkdir()
    shutil.copy2(ROOT / "docs/LICENSES-THIRD-PARTY.md", licenses)
    shutil.copy2(VENDOR / "engine/COPYING.txt", licenses / "LanguageTool-COPYING.txt")
    shutil.copytree(VENDOR / "engine/third-party-licenses", licenses / "languagetool")
    # Java notices remain complete in runtime/legal; collect Python package notices too.
    for name in ("pystray", "Pillow", "six", "PyInstaller"):
        distribution = importlib.metadata.distribution(name)
        for entry in distribution.files or []:
            if any(token in str(entry).lower() for token in ("license", "copying", "notice")):
                source = Path(distribution.locate_file(entry))
                if source.is_file():
                    destination = licenses / name / str(entry).replace("..", "_")
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, destination)
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if not python_license.is_file():
        raise SystemExit("Missing Python license")
    shutil.copy2(python_license, licenses / "Python-LICENSE.txt")
    verify(bundle, manifest)
    if args.skip_archive:
        print("Built verified onedir bundle: " + str(bundle))
        return
    archive = out / "Correctly-V3-Windows-x64.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as package:
        for file in sorted(bundle.rglob("*")):
            if file.is_file():
                package.write(file, file.relative_to(out))
    archive.with_suffix(".zip.sha256").write_text(digest(archive) + "  " + archive.name + "\n", encoding="ascii")
    print("Built portable bundle and SHA-256 archive: " + str(archive))


if __name__ == "__main__":
    main()
