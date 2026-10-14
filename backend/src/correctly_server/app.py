import argparse
import ctypes
import json
import os
import time
from pathlib import Path

from .engine import Engine, State
from .health import check
from .logging_config import configure
from .paths import Paths, bundle_root, data_root
from .settings import Settings
from .singleton import Singleton


def smoke(engine, output):
    """Headless packaged lifecycle check; always stops its own child."""
    result = {"ok": False}
    try:
        started = time.monotonic()
        engine.start()
        result["startup_seconds"] = round(time.monotonic() - started, 3)
        result["state"] = engine.state.value
        if engine.state != State.RUNNING:
            return 1
        result["pid"] = engine.process.pid
        result["languages"] = {}
        result["responses"] = {}
        for language, text in (("fr", "je sui content"), ("en-US", "I has a car")):
            payload = check(engine.settings.port, text, language, timeout=30)
            if not payload["matches"]:
                raise ValueError("No corrections")
            result["languages"][language] = len(payload["matches"])
            result["responses"][language] = {key: payload[key] for key in ("matches", "language")}
        result["ok"] = True
    except Exception:
        result["error"] = "smoke_failed"
        return 1
    finally:
        result["stopped"] = engine.stop()
        result["ok"] = result["ok"] and result["stopped"]
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return 0 if result["ok"] else 1


def main():
    parser = argparse.ArgumentParser(description="Correctly local server")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--smoke-test", type=Path, metavar="REPORT")
    mode.add_argument("--shutdown", action="store_true", help="Close only the tray running from this EXE path")
    parser.add_argument("--port", type=int, default=8081, help="Test-only override; extension uses 8081")
    args = parser.parse_args()
    if args.port != 8081 and args.smoke_test is None:
        parser.error("Alternate ports are only supported for smoke tests")
    if os.name != "nt":
        raise SystemExit("CorrectlyServer requires Windows x64")
    if args.shutdown:
        from .shutdown import shutdown
        return 0 if shutdown() else 3
    # Isolated headless checks must not disrupt a user's active tray. Two checks
    # targeting the same test port still exclude each other.
    mutex = Singleton(r"Local\CorrectlyServer.V3.Smoke." + str(args.port)) if args.smoke_test and args.port != 8081 else Singleton()
    if not mutex.acquire():
        if args.smoke_test:
            args.smoke_test.parent.mkdir(parents=True, exist_ok=True)
            args.smoke_test.write_text('{"ok":false,"error":"already_running"}\n', encoding="utf-8")
        return 2
    handler = None
    engine = Engine(Paths(bundle_root()), Settings(port=args.port))
    try:
        if args.smoke_test:
            return smoke(engine, args.smoke_test)
        directory = data_root()
        handler = configure(directory)
        from .tray import Tray
        Tray(engine, directory).run()
        return 0
    except Exception:
        if not args.smoke_test:
            ctypes.windll.user32.MessageBoxW(None, "Correctly n'a pas pu démarrer. Vérifiez le paquet et les droits du dossier local.", "Correctly Server", 0x10)
        return 1
    finally:
        engine.stop()
        if handler:
            handler.close()
        mutex.close()
