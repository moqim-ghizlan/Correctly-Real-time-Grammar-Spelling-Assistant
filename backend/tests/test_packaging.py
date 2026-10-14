import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from vendor_bundle import inventory, verify


def test_verify_rejects_mutation_missing_and_extra_files(tmp_path):
    for component in ("runtime", "engine"):
        directory = tmp_path / component
        directory.mkdir()
        (directory / "file").write_bytes(b"pinned bytes")
    manifest = {"files": {name: inventory(tmp_path / name) for name in ("runtime", "engine")}}
    verify(tmp_path, manifest)
    path = tmp_path / "engine/file"
    path.write_bytes(b"changed")
    with pytest.raises(ValueError):
        verify(tmp_path, manifest)
    path.write_bytes(b"pinned bytes")
    extra = tmp_path / "runtime/extra"
    extra.touch()
    with pytest.raises(ValueError):
        verify(tmp_path, manifest)
    extra.unlink()
    path.unlink()
    with pytest.raises(ValueError):
        verify(tmp_path, manifest)


def test_lock_records_complete_engine_and_runtime():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / "vendor-lock.json").read_text(encoding="utf-8"))
    assert manifest["engine_version"] == "6.9-SNAPSHOT"
    assert "bin/javaw.exe" in manifest["files"]["runtime"]
    assert "conf/security/java.security" in manifest["files"]["runtime"]
    assert any(name.startswith("legal/") for name in manifest["files"]["runtime"])
    assert "languagetool-server.jar" in manifest["files"]["engine"]
    assert "libs/languagetool-core.jar" in manifest["files"]["engine"]
    assert any(name.startswith("org/languagetool/resource/fr/") for name in manifest["files"]["engine"])
    assert any(name.startswith("third-party-licenses/") for name in manifest["files"]["engine"])
