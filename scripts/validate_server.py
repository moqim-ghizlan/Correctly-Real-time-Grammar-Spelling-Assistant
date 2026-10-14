"""Real private-JVM regression and lifecycle checks. Leaves V2 on 8081 alone."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import socket
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from correctly_server.engine import Engine, State
from correctly_server.health import check, port_available
from correctly_server.listener import listeners
from correctly_server.paths import Paths
from correctly_server.settings import Settings
from engine_baseline import capture, compare


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=ROOT / "backend/vendor")
    parser.add_argument("--port", type=int, default=18081)
    parser.add_argument("--cycles", type=int, default=20)
    args = parser.parse_args()
    paths = Paths(args.root.resolve())
    engine = Engine(paths, Settings(port=args.port))
    report = {"executed_at": datetime.now(timezone.utc).isoformat(), "cycles": [], "passed": []}
    output = ROOT / "docs/validation"
    output.mkdir(exist_ok=True)
    try:
        for cycle in range(args.cycles):
            started = time.monotonic()
            engine.start()
            if engine.state != State.RUNNING:
                raise AssertionError(engine.error)
            elapsed = round(time.monotonic() - started, 3)
            child = engine.process
            engine.start()
            assert engine.process is child
            assert ("127.0.0.1", args.port, child.pid) in listeners()
            if cycle == 0:
                result = capture(args.port)
                compare(json.loads((ROOT / "docs/baseline/v2-responses.json").read_text(encoding="utf-8")), result)
                (output / "v3-responses.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                report["passed"].append("strict corpus equivalence: 11 FR/EN/Auto/Unicode cases")
                times = []
                for _ in range(100):
                    began = time.perf_counter()
                    assert check(args.port, "I has a car", "en-US", timeout=30)["matches"]
                    times.append(round((time.perf_counter() - began) * 1000, 3))
                report["load_100_requests_ms"] = times
                report["passed"].append("100 consecutive real checks")
                engine.monitor()
                assert engine.state == State.RUNNING
                conflict = Engine(paths, Settings(port=args.port))
                conflict.start()
                assert conflict.state == State.PORT_CONFLICT and conflict.process is None
                conflict.stop()
                assert child.poll() is None
                report["passed"].append("port conflict does not affect existing process")
            if cycle == args.cycles - 1:
                child.kill()  # Deliberately crash only the child retained by this test.
                child.wait(timeout=10)
                engine.monitor()
                assert engine.state == State.ERROR
                report["passed"].append("real JVM crash detected")
            assert engine.stop()
            assert child.poll() is not None and port_available(args.port)
            report["cycles"].append({"cycle": cycle + 1, "startup_seconds": elapsed, "stopped": True})
            print(f"PASS lifecycle {cycle + 1}/{args.cycles}: {elapsed:.3f}s", flush=True)
        starts = [entry["startup_seconds"] for entry in report["cycles"]]
        report["startup"] = {"mean_s": statistics.mean(starts), "median_s": statistics.median(starts),
                             "p95_s": sorted(starts)[max(0, int(len(starts) * .95 + .999) - 1)],
                             "worst_s": max(starts)}
        report["ok"] = True
    finally:
        engine.stop()
        (output / "server-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
