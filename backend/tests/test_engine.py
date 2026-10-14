import subprocess
import threading
from unittest.mock import Mock

import pytest

from correctly_server.engine import Engine, State
from correctly_server.settings import Settings
from test_paths import make_paths


def controller(tmp_path, **kwargs):
    process = Mock(pid=123)
    process.poll.return_value = None
    def terminated():
        process.poll.return_value = 0
    process.terminate.side_effect = terminated
    process.kill.side_effect = terminated
    popen = Mock(return_value=process)
    values = dict(popen=popen, probe=Mock(return_value=True), available=lambda _: True,
                  owns_listener=lambda pid, port: True)
    values.update(kwargs)
    settings = Settings(startup_timeout=0.03, poll_interval=0.001, stop_timeout=0.01)
    return Engine(make_paths(tmp_path), settings, **values), process, popen


def test_launch_preserves_protocol_private_runtime_and_environment(tmp_path, monkeypatch):
    engine, child, popen = controller(tmp_path)
    for key in ("JAVA_HOME", "CLASSPATH", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS"):
        monkeypatch.setenv(key, "untrusted option")
    engine.start()
    assert engine.state == State.RUNNING
    args, kwargs = popen.call_args
    assert args[0][0] == str(engine.paths.javaw)
    assert "--public" not in args[0] and "--allow-origin" not in args[0] and "--verbose" not in args[0]
    assert kwargs["shell"] is False and kwargs["cwd"] == str(engine.paths.engine)
    assert kwargs["stdout"] == kwargs["stderr"] == subprocess.DEVNULL
    assert "JAVA_HOME" not in kwargs["env"] and "JDK_JAVA_OPTIONS" not in kwargs["env"]
    engine.start()
    assert popen.call_count == 1
    assert engine.stop()
    child.terminate.assert_called_once()
    assert engine.state == State.STOPPED and engine.process is None


def test_conflict_never_launches_or_terminates_unknown_process(tmp_path):
    engine, child, popen = controller(tmp_path, available=lambda _: False)
    engine.start()
    assert engine.state == State.PORT_CONFLICT
    popen.assert_not_called()
    engine.stop()
    child.terminate.assert_not_called()


def test_response_from_another_listener_cannot_be_ready(tmp_path):
    engine, child, _ = controller(tmp_path, owns_listener=lambda pid, port: False)
    engine.start()
    assert engine.state == State.ERROR
    child.terminate.assert_called_once()


def test_missing_runtime_is_actionable(tmp_path):
    engine, _, popen = controller(tmp_path)
    engine.paths.javaw.unlink()
    engine.start()
    assert engine.state == State.ERROR
    assert engine.error == "Fichier manquant : runtime/bin/javaw.exe"
    popen.assert_not_called()


def test_failed_launch_does_not_expose_private_error(tmp_path):
    engine, _, popen = controller(tmp_path)
    popen.side_effect = ValueError("private user text")
    engine.start()
    assert engine.state == State.ERROR
    assert "private" not in engine.error


def test_startup_timeout_terminates_owned_child(tmp_path):
    engine, child, _ = controller(tmp_path, probe=lambda *_: False)
    engine.start()
    assert engine.state == State.ERROR and engine.process is None
    child.terminate.assert_called_once()


def test_early_exit_not_ready(tmp_path):
    engine, child, _ = controller(tmp_path)
    child.poll.return_value = 1
    engine.start()
    assert engine.state == State.ERROR
    child.terminate.assert_not_called()


def test_cancel_during_probe_cannot_publish_running(tmp_path):
    entered, released = threading.Event(), threading.Event()
    def probe(*_):
        entered.set()
        released.wait(2)
        return True
    engine, child, _ = controller(tmp_path, probe=probe)
    thread = threading.Thread(target=engine.start)
    thread.start()
    assert entered.wait(2)
    engine.cancel_start()
    released.set()
    thread.join(2)
    assert not thread.is_alive()
    assert engine.state == State.STOPPED
    child.terminate.assert_called_once()


def test_monitor_detects_crash_and_allows_retry(tmp_path):
    engine, child, popen = controller(tmp_path)
    engine.start()
    child.poll.return_value = 1
    engine.monitor()
    assert engine.state == State.ERROR and engine.process is None
    child.poll.return_value = None
    engine.start()
    assert engine.state == State.RUNNING and popen.call_count == 2
    engine.stop()


def test_unhealthy_monitor_is_bounded(tmp_path):
    probe = Mock(return_value=True)
    engine, child, _ = controller(tmp_path, probe=probe)
    engine.start()
    probe.return_value = False
    engine.monitor()
    engine.monitor()
    assert engine.state == State.RUNNING
    engine.monitor()
    assert engine.state == State.ERROR and engine.process is None
    child.terminate.assert_called_once()


def test_monitor_does_not_wait_for_startup_lock(tmp_path):
    engine, _, _ = controller(tmp_path)
    with engine._operation:
        engine.monitor()


def test_stop_escalates_only_retained_child(tmp_path):
    engine, child, _ = controller(tmp_path)
    engine.start()
    child.terminate.side_effect = None
    child.wait.side_effect = [subprocess.TimeoutExpired("owned", 1), 0]
    assert engine.stop()
    child.kill.assert_called_once()


def test_stop_failure_keeps_child_handle_and_prevents_duplicate(tmp_path):
    engine, child, popen = controller(tmp_path)
    engine.start()
    child.terminate.side_effect = OSError("denied")
    assert not engine.stop()
    assert engine.process is child and engine.state == State.ERROR
    engine.start()
    assert popen.call_count == 1


def test_restart_stops_then_starts(tmp_path):
    engine, child, popen = controller(tmp_path)
    engine.start()
    next_child = Mock(pid=124)
    next_child.poll.return_value = None
    popen.return_value = next_child
    engine.restart()
    child.terminate.assert_called_once()
    assert engine.state == State.RUNNING and engine.process is next_child


@pytest.mark.parametrize("args", [{"port": 0}, {"port": 65536}, {"startup_timeout": 0}, {"stop_timeout": -1}])
def test_invalid_settings_rejected(args):
    with pytest.raises(ValueError):
        Settings(**args)
