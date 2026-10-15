"""Real Windows pystray lifecycle, automatically controlled using its menu callbacks."""
from datetime import datetime, timezone
import argparse
import json
from pathlib import Path
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from correctly_server.engine import Engine, State
from correctly_server.paths import Paths
from correctly_server.settings import Settings
from correctly_server.tray import Tray


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path, default=ROOT / 'docs/validation/tray-validation.json')
    args = parser.parse_args()
    engine = Engine(Paths(ROOT / "backend/vendor"), Settings(port=18083))
    ui = Tray(engine, ROOT / "artifacts/tray-diagnostics")
    result = {"executed_at": datetime.now(timezone.utc).isoformat(), "passed": []}
    failure = []

    def wait(predicate):
        deadline = time.monotonic() + 120
        while not predicate():
            if time.monotonic() > deadline:
                raise AssertionError("Tray state timed out")
            time.sleep(.05)

    def drive():
        try:
            wait(lambda: engine.state == State.RUNNING and not ui.busy.is_set())
            assert ui.icon.visible
            ui.refresh()
            assert "prêt" in ui.icon.title
            result["passed"].append("real Windows tray icon/title reaches ready")
            test_completed = threading.Event()
            def probe():
                ui.test()
                test_completed.set()
            ui.submit(probe)
            wait(lambda: not ui.busy.is_set())
            assert test_completed.is_set(), 'FR/EN tray action failed; see tray diagnostics'
            ui.submit(lambda: None)
            wait(lambda: not ui.busy.is_set())
            result["passed"].append("FR/EN tray action completes without blocking")
            ui.stop()
            wait(lambda: engine.state == State.STOPPED and not ui.busy.is_set())
            result["passed"].append("tray stop removes owned JVM")
            ui.submit(engine.start)
            wait(lambda: engine.state == State.RUNNING and not ui.busy.is_set())
            ui.submit(engine.restart)
            wait(lambda: engine.state == State.RUNNING and not ui.busy.is_set())
            result["passed"].append("tray start/restart reaches ready")
        except Exception as exc:
            failure.append(type(exc).__name__)
        finally:
            ui.quit()

    driver = threading.Thread(target=drive, daemon=True)
    driver.start()
    ui.run()
    driver.join(timeout=5)
    assert not failure, failure
    assert engine.state == State.STOPPED and engine.process is None
    result["passed"].append("tray quit shuts down icon and owned JVM")
    result["ok"] = True
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
