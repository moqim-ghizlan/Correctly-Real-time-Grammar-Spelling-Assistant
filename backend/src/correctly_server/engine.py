from enum import Enum
import logging
import os
import subprocess
import threading
import time

from .health import healthy, port_available
from .listener import owns_loopback
from .settings import Settings

log = logging.getLogger("correctly")


class State(str, Enum):
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    ERROR = "ERROR"
    PORT_CONFLICT = "PORT_CONFLICT"


def java_environment():
    # Prevent inherited JVM options/classpaths from altering the private engine.
    excluded = {"JAVA_HOME", "CLASSPATH", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS"}
    return {key: value for key, value in os.environ.items() if key.upper() not in excluded}


def command(paths, port):
    return [str(paths.javaw), "-Djava.net.preferIPv4Stack=true", "-cp", str(paths.jar),
            "org.languagetool.server.HTTPServer", "--config", str(paths.config),
            "--port", str(port)]


class Engine:
    """Serialized lifecycle. Only the retained Popen handle may be terminated."""

    def __init__(self, paths, settings=None, *, popen=subprocess.Popen,
                 probe=healthy, available=port_available, owns_listener=owns_loopback):
        self.paths = paths
        self.settings = settings or Settings()
        self.state = State.STOPPED
        self.error = ""
        self.process = None
        self._popen, self._probe, self._available = popen, probe, available
        self._owns_listener = owns_listener
        self._operation = threading.Lock()
        self._cancel = threading.Event()
        self._failures = 0

    def _state(self, state, error=""):
        self.error = error
        self.state = state
        # Log fixed states only, never exception strings/commands/HTTP bodies.
        log.info("engine_state=%s", state.value)

    def start(self):
        with self._operation:
            if self.process is not None:
                return
            self._cancel.clear()
            self._state(State.STARTING)
            try:
                self.paths.validate()
            except ValueError as exc:
                self._state(State.ERROR, str(exc))
                return
            try:
                if not self._available(self.settings.port):
                    self._state(State.PORT_CONFLICT,
                                f"Port {self.settings.port} occupé. Fermez l'ancien serveur ou le programme concerné, puis réessayez.")
                    return
                self.process = self._popen(
                    command(self.paths, self.settings.port), cwd=str(self.paths.engine),
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    shell=False, env=java_environment(),
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                deadline = time.monotonic() + self.settings.startup_timeout
                while not self._cancel.is_set() and time.monotonic() < deadline:
                    if self.process.poll() is not None:
                        raise RuntimeError("engine exited")
                    if self._probe(self.settings.port, self.settings.probe_timeout):
                        if self.process.poll() is not None:
                            raise RuntimeError("engine exited")
                        if not self._owns_listener(self.process.pid, self.settings.port):
                            raise RuntimeError("Listener is not the owned loopback child")
                        if self._cancel.is_set():
                            self._stop()
                            return
                        self._failures = 0
                        self._state(State.RUNNING)
                        return
                    self._cancel.wait(self.settings.poll_interval)
                if self._cancel.is_set():
                    self._stop()
                    return
                raise TimeoutError("startup timeout")
            except Exception:
                self._stop()
                self._state(State.ERROR,
                            "Le moteur n'a pas démarré. Vérifiez l'intégrité du paquet et la compatibilité du runtime, puis réessayez.")

    def cancel_start(self):
        self._cancel.set()

    def _stop(self):
        self._state(State.STOPPING)
        process = self.process
        if process is not None:
            try:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=self.settings.stop_timeout)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=self.settings.stop_timeout)
                else:
                    process.wait(timeout=self.settings.stop_timeout)
            except OSError:
                if process.poll() is None:
                    self._state(State.ERROR, "Impossible d'arrêter le moteur possédé. Réessayez.")
                    return False
            except subprocess.TimeoutExpired:
                self._state(State.ERROR, "Le moteur possédé ne s'arrête pas. Réessayez.")
                return False
        self.process = None
        self._state(State.STOPPED)
        return True

    def stop(self):
        self.cancel_start()
        with self._operation:
            return self._stop()

    def restart(self):
        if self.stop():
            self.start()

    def monitor(self):
        if not self._operation.acquire(blocking=False):
            return
        try:
            if self.state != State.RUNNING or self.process is None:
                return
            if self.process.poll() is not None:
                self.process.wait()
                self.process = None
                self._state(State.ERROR, "Le moteur s'est arrêté. Utilisez Redémarrer.")
                return
            try:
                ready = (self._probe(self.settings.port, self.settings.probe_timeout)
                         and self._owns_listener(self.process.pid, self.settings.port))
            except OSError:
                ready = False
            self._failures = 0 if ready else self._failures + 1
            if self._failures >= 3:
                self._stop()
                self._state(State.ERROR, "Le moteur ne répond plus. Utilisez Redémarrer.")
        finally:
            self._operation.release()
