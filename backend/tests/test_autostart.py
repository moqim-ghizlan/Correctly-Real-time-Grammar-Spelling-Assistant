import base64
from pathlib import Path
import subprocess
import sys
from unittest.mock import Mock

import pytest

from correctly_server import autostart


def test_sources_and_temporary_bundles_are_ineligible(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", False, raising=False)
    assert not autostart.eligible(tmp_path / "CorrectlyServer.exe")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    assert not autostart.eligible(tmp_path / "CorrectlyServer.exe")


def test_repository_marker_blocks_autostart_after_plans_move(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(autostart.tempfile, "gettempdir", lambda: str(tmp_path / "other-temp"))
    repository = tmp_path / "repository"
    repository.mkdir()
    target = repository / "artifacts" / "CorrectlyServer.exe"
    assert autostart.eligible(target)
    (repository / "createSetup.cmd").touch()
    assert not autostart.eligible(target)


def test_unstable_autostart_rejected_before_execution(tmp_path):
    runner = Mock()
    with pytest.raises(ValueError):
        autostart.set_enabled(True, tmp_path / "CorrectlyServer.exe", tmp_path / "start.lnk", runner=runner)
    runner.assert_not_called()


def test_unicode_quotes_and_marker_in_managed_shortcut(monkeypatch, tmp_path):
    monkeypatch.setattr(autostart, "eligible", lambda _: True)
    runner = Mock(return_value=Mock(returncode=0))
    autostart.set_enabled(True, tmp_path / "l'été" / "CorrectlyServer.exe", tmp_path / "start.lnk", runner=runner)
    args, kwargs = runner.call_args
    script = base64.b64decode(args[0][-1]).decode("utf-16-le")
    assert "l''été" in script and autostart.MARKER in script
    assert "Unmanaged shortcut" in script
    assert kwargs["stdout"] == kwargs["stderr"] == subprocess.DEVNULL
    assert "-NonInteractive" in args[0]


def test_disable_guards_unknown_shortcut(tmp_path):
    runner = Mock(return_value=Mock(returncode=0))
    autostart.set_enabled(False, shortcut=tmp_path / "start.lnk", runner=runner)
    script = base64.b64decode(runner.call_args.args[0][-1]).decode("utf-16-le")
    assert script.index("Unmanaged shortcut") < script.index("Remove-Item -LiteralPath")


def test_real_com_shortcut_create_remove_and_refuse_unknown(monkeypatch, tmp_path):
    # A private test link, never the user's real Startup directory.
    monkeypatch.setattr(autostart, "eligible", lambda _: True)
    target = tmp_path / "dossier déplacé" / "CorrectlyServer.exe"
    target.parent.mkdir()
    target.touch()
    link = tmp_path / "test.lnk"
    autostart.set_enabled(True, target, link)
    assert link.is_file()
    autostart.set_enabled(False, target, link)
    assert not link.exists()
    link.write_bytes(b"unmanaged link")
    original = link.read_bytes()
    with pytest.raises(RuntimeError):
        autostart.set_enabled(False, target, link)
    assert link.read_bytes() == original
