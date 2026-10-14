from concurrent.futures import ThreadPoolExecutor
import logging
import os
import threading

from PIL import Image, ImageDraw
import pystray

from . import autostart, diagnostics
from .engine import State
from .health import check

LABELS = {State.STOPPED: "arrêté", State.STARTING: "démarrage…", State.RUNNING: "prêt",
          State.STOPPING: "arrêt…", State.ERROR: "erreur", State.PORT_CONFLICT: "port occupé"}


def status_image(state):
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    color = "#22a06b" if state == State.RUNNING else "#d94a4a" if state in (State.ERROR, State.PORT_CONFLICT) else "#80858f"
    draw.rounded_rectangle((3, 3, 61, 61), radius=16, fill=color)
    draw.line([(17, 33), (28, 44), (48, 21)], fill="white", width=6)
    return image


class Tray:
    def __init__(self, engine, directory):
        self.engine, self.directory = engine, directory
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="correctly-actions")
        self.closing = threading.Event()
        self.busy = threading.Event()
        self._last_state = None
        self._last_menu = None
        self._refresh_lock = threading.Lock()
        self._monitor_stop = threading.Event()
        self._monitor = None
        item = pystray.MenuItem
        self.icon = pystray.Icon("CorrectlyV3", status_image(State.STOPPED), "Correctly Server",
            menu=pystray.Menu(
                item(lambda _: "État : " + LABELS[self.engine.state], None, enabled=False),
                item(lambda _: self.engine.error or "Correcteur local FR / EN", None, enabled=False,
                     visible=lambda _: bool(self.engine.error)),
                pystray.Menu.SEPARATOR,
                item("Démarrer le serveur", lambda *_: self.submit(self.engine.start),
                     enabled=lambda _: not self.busy.is_set() and self.engine.process is None),
                item("Arrêter le serveur", lambda *_: self.stop(),
                     enabled=lambda _: self.engine.state in (State.STARTING, State.RUNNING) or self.engine.process is not None),
                item("Redémarrer le serveur", lambda *_: self.submit(self.engine.restart),
                     enabled=lambda _: not self.busy.is_set()),
                pystray.Menu.SEPARATOR,
                item("Démarrer avec Windows", lambda *_: self.submit(self.toggle_autostart),
                     checked=lambda _: autostart.is_enabled(),
                     enabled=lambda _: not self.busy.is_set() and (autostart.eligible() or autostart.is_enabled())),
                item("Tester le correcteur", lambda *_: self.submit(self.test),
                     enabled=lambda _: not self.busy.is_set() and self.engine.state == State.RUNNING),
                item("Ouvrir les diagnostics", lambda *_: self.submit(self.open_diagnostics)),
                item("À propos / versions", lambda *_: self.about()),
                pystray.Menu.SEPARATOR,
                item("Quitter (arrête le serveur)", lambda *_: self.quit()),
            ))

    def refresh(self):
        with self._refresh_lock:
            state = self.engine.state
            if state != self._last_state:
                self.icon.icon = status_image(state)
                self.icon.title = "Correctly — " + LABELS[state]
                if state in (State.ERROR, State.PORT_CONFLICT):
                    self.icon.notify(self.engine.error, "Correctly Server")
                self._last_state = state
            snapshot = (state, self.engine.error, self.busy.is_set(), autostart.is_enabled())
            if snapshot != self._last_menu:
                self.icon.update_menu()
                self._last_menu = snapshot

    def submit(self, action):
        if self.closing.is_set() or self.busy.is_set():
            return
        self.busy.set()
        def run():
            try:
                if not self.closing.is_set():
                    action()
            except Exception:
                logging.getLogger("correctly").warning("tray_action_failed")
                self.icon.notify("L'action a échoué. Consultez les diagnostics puis réessayez.", "Correctly")
            finally:
                self.busy.clear()
                self.refresh()
        self.executor.submit(run)

    def stop(self):
        self.engine.cancel_start()
        # A STARTING action observes cancellation and releases the worker shortly.
        if not self.busy.is_set():
            self.submit(self.engine.stop)
        else:
            self.executor.submit(self.engine.stop)

    def toggle_autostart(self):
        autostart.set_enabled(not autostart.is_enabled())

    def test(self):
        for language, text in (("fr", "je sui content"), ("en-US", "I has a car")):
            result = check(self.engine.settings.port, text, language, timeout=15)
            if not result["matches"]:
                raise ValueError("Synthetic correction failed")
        self.icon.notify("Tests français et anglais réussis.", "Correctly")

    def open_diagnostics(self):
        diagnostics.export(self.engine, self.directory)
        os.startfile(str(self.directory))

    def about(self):
        self.icon.notify("\n".join(f"{key} : {value}" for key, value in diagnostics.versions(self.engine.paths).items()), "Correctly Server")

    def quit(self):
        if self.closing.is_set():
            return
        self.closing.set()
        self.engine.cancel_start()
        def finish():
            if self.engine.stop():
                self.icon.stop()
            else:
                self.closing.clear()
                self.refresh()
                self.icon.notify(self.engine.error, "Correctly")
        self.executor.submit(finish)

    def run(self):
        def setup(icon):
            icon.visible = True
            self.submit(self.engine.start)
            def monitor():
                ticks = 0
                while not self._monitor_stop.wait(0.5):
                    if self.closing.is_set():
                        continue
                    ticks += 0.5
                    if ticks >= self.engine.settings.monitor_interval:
                        self.engine.monitor()
                        ticks = 0
                    self.refresh()
            self._monitor = threading.Thread(target=monitor, daemon=True, name="correctly-health")
            self._monitor.start()
        try:
            self.icon.run(setup=setup)
        finally:
            self.closing.set()
            self._monitor_stop.set()
            self.engine.cancel_start()
            self.executor.shutdown(wait=True, cancel_futures=True)
            self.engine.stop()
            if self._monitor:
                self._monitor.join(timeout=self.engine.settings.probe_timeout + 2)
