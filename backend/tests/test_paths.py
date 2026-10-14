import sys

import pytest

from correctly_server.paths import Paths, bundle_root, data_root


def make_paths(root):
    paths = Paths(root)
    for file in (paths.java, paths.javaw, paths.jar, paths.config,
                 paths.engine / "libs/languagetool-core.jar"):
        file.parent.mkdir(parents=True, exist_ok=True)
        file.touch()
    (paths.engine / "org").mkdir()
    return paths


def test_source_paths_do_not_follow_cwd(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    expected = bundle_root()
    monkeypatch.chdir(tmp_path)
    assert bundle_root() == expected
    assert expected.name == "vendor"


def test_frozen_paths_use_exe_siblings_not_internal(monkeypatch, tmp_path):
    root = tmp_path / "dossier déplacé"
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(root / "CorrectlyServer.exe"))
    monkeypatch.setattr(sys, "_MEIPASS", str(root / "_internal"), raising=False)
    assert bundle_root() == root


@pytest.mark.parametrize("relative", ["runtime/bin/java.exe", "runtime/bin/javaw.exe",
    "engine/languagetool-server.jar", "engine/server.properties", "engine/libs/languagetool-core.jar"])
def test_missing_file_names_are_relative(tmp_path, relative):
    paths = make_paths(tmp_path)
    paths.validate()
    (tmp_path / relative).unlink()
    with pytest.raises(ValueError, match=relative):
        paths.validate()


def test_local_data_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    assert data_root() == tmp_path / "Correctly"


def test_missing_local_data_directory_is_explicit(monkeypatch):
    monkeypatch.delenv("LOCALAPPDATA", raising=False)
    with pytest.raises(RuntimeError):
        data_root()
