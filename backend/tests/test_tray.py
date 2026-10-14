import threading
import time
from unittest.mock import Mock

import pytest

from correctly_server.engine import State
from correctly_server import tray


class Icon:
    def __init__(self, *args, **kwargs):
        self.title = ""
        self.notifications = []
        self.stopped = threading.Event()
    def notify(self, text, title):
        self.notifications.append(text)
    def update_menu(self):
        pass
    def stop(self):
        self.stopped.set()


@pytest.fixture
def controller(monkeypatch, tmp_path):
    monkeypatch.setattr(tray.pystray, "Icon", Icon)
    engine = Mock(state=State.STOPPED, error="", process=None)
    engine.stop.return_value = True
    ui = tray.Tray(engine, tmp_path)
    yield ui, engine
    ui.closing.set()
    ui.executor.shutdown(wait=True, cancel_futures=True)


def wait_idle(ui):
    deadline = time.monotonic() + 2
    while ui.busy.is_set() and time.monotonic() < deadline:
        time.sleep(.001)
    assert not ui.busy.is_set()


def test_start_action_does_not_block_ui_and_rejects_duplicates(controller):
    ui, engine = controller
    entered, released = threading.Event(), threading.Event()
    def start():
        entered.set()
        released.wait(2)
    engine.start.side_effect = start
    ui.submit(engine.start)
    assert entered.wait(2)
    ui.submit(engine.start)
    released.set()
    wait_idle(ui)
    engine.start.assert_called_once()


def test_stop_cancels_starting_worker(controller):
    ui, engine = controller
    entered, cancelled = threading.Event(), threading.Event()
    def start():
        entered.set()
        cancelled.wait(2)
    engine.start.side_effect = start
    engine.cancel_start.side_effect = cancelled.set
    ui.submit(engine.start)
    assert entered.wait(2)
    ui.stop()
    wait_idle(ui)
    ui.executor.submit(lambda: None).result(timeout=2)
    engine.cancel_start.assert_called_once()
    engine.stop.assert_called_once()


def test_quit_stops_server_then_icon(controller):
    ui, engine = controller
    ui.quit()
    assert ui.icon.stopped.wait(2)
    assert ui.closing.is_set()
    engine.stop.assert_called_once()


def test_failed_stop_keeps_tray_available(controller):
    ui, engine = controller
    engine.stop.return_value = False
    engine.error = "Réessayez"
    ui.quit()
    ui.executor.submit(lambda: None).result(timeout=2)
    assert not ui.closing.is_set() and not ui.icon.stopped.is_set()
    assert "Réessayez" in ui.icon.notifications


def test_action_exception_does_not_display_private_text(controller):
    ui, _ = controller
    ui.submit(Mock(side_effect=RuntimeError("private user text")))
    wait_idle(ui)
    assert ui.icon.notifications
    assert "private" not in "".join(ui.icon.notifications)


def test_error_notifications_only_on_state_change(controller):
    ui, engine = controller
    engine.state = State.ERROR
    engine.error = "Erreur contrôlée"
    ui.refresh()
    ui.refresh()
    assert ui.icon.notifications == ["Erreur contrôlée"]
