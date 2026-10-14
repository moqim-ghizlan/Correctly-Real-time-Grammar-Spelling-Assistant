import json
import sys
from unittest.mock import Mock

from correctly_server import app
from correctly_server.engine import State


def test_smoke_exit_code_fails_if_owned_process_does_not_stop(monkeypatch, tmp_path):
    engine = Mock(state=State.RUNNING)
    engine.process.pid = 123
    engine.settings.port = 8081
    engine.stop.return_value = False
    monkeypatch.setattr(app, "check", lambda *args, **kwargs: {"matches": [{}], "language": {"code": args[2]}})
    destination = tmp_path / "smoke.json"
    assert app.smoke(engine, destination) == 1
    report = json.loads(destination.read_text())
    assert not report["ok"] and not report["stopped"]


def test_failed_start_smoke_still_cleans_up(tmp_path):
    engine = Mock(state=State.ERROR)
    engine.stop.return_value = True
    destination = tmp_path / "smoke.json"
    assert app.smoke(engine, destination) == 1
    engine.stop.assert_called_once()
    assert json.loads(destination.read_text())["state"] == "ERROR"


def test_isolated_smoke_mutex_does_not_block_running_user_tray(monkeypatch, tmp_path):
    mutex = Mock()
    mutex.acquire.return_value = False
    factory = Mock(return_value=mutex)
    monkeypatch.setattr(app, "Singleton", factory)
    monkeypatch.setattr(sys, "argv", ["CorrectlyServer", "--smoke-test", str(tmp_path / "report.json"), "--port", "18084"])
    assert app.main() == 2
    factory.assert_called_once_with(r"Local\CorrectlyServer.V3.Smoke.18084")


def test_shutdown_does_not_acquire_the_tray_singleton(monkeypatch):
    from correctly_server import shutdown as shutdown_module
    factory = Mock()
    control = Mock(return_value=True)
    monkeypatch.setattr(shutdown_module, "shutdown", control)
    monkeypatch.setattr(app, "Singleton", factory)
    monkeypatch.setattr(sys, "argv", ["CorrectlyServer", "--shutdown"])
    assert app.main() == 0
    control.assert_called_once()
    factory.assert_not_called()
