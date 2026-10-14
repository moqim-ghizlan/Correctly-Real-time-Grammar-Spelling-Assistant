"""Exercise the actual onedir EXE and a copied Unicode path; no installed Java/Python lookup."""
import json
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend/src"))
from correctly_server.singleton import Singleton
from correctly_server.listener import listeners
from engine_baseline import normalized
from vendor_bundle import LOCK, verify


def main():
    bundle = ROOT / "artifacts/Correctly-V3-Windows-x64"
    output = ROOT / "docs/validation"
    output.mkdir(exist_ok=True)
    report = {"passed": []}
    environment = dict(os.environ)
    environment["PATH"] = str(Path(os.environ["SystemRoot"]) / "System32")
    environment["JAVA_HOME"] = "C:/missing-java"
    environment["JAVA_TOOL_OPTIONS"] = "invalid inherited JVM option"
    for key in ("PYTHONPATH", "PYTHONHOME"):
        environment.pop(key, None)
    original_listener = [row for row in listeners() if row[1] == 8081]

    def launch(root, name, port=18082):
        destination = output / (name + ".json")
        destination.unlink(missing_ok=True)
        process = subprocess.Popen([str(root / "CorrectlyServer.exe"), "--smoke-test", str(destination),
                                    "--port", str(port)], cwd=str(ROOT / "docs"), env=environment,
                                   creationflags=subprocess.CREATE_NO_WINDOW,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return process, destination

    def complete(process, destination):
        code = process.wait(timeout=150)
        data = json.loads(destination.read_text(encoding="utf-8"))
        return code, data

    executable = (bundle / "CorrectlyServer.exe").read_bytes()
    pe_offset = struct.unpack_from("<I", executable, 0x3c)[0]
    assert struct.unpack_from("<H", executable, pe_offset + 24 + 68)[0] == 2
    report["passed"].append("EXE uses Windows GUI subsystem (no console)")
    first, first_report = launch(bundle, "package-smoke")
    test_mutex = Singleton()
    try:
        deadline = time.monotonic() + 15
        while test_mutex.acquire():
            test_mutex.close()
            if time.monotonic() > deadline:
                raise AssertionError("Packaged controller did not acquire mutex")
            time.sleep(.05)
        duplicate, duplicate_report = launch(bundle, "package-duplicate")
        code, result = complete(duplicate, duplicate_report)
        assert code == 2 and result["error"] == "already_running"
        code, result = complete(first, first_report)
        assert code == 0 and result["ok"] and result["stopped"]
        before = json.loads((ROOT / "docs/baseline/v2-responses.json").read_text(encoding="utf-8"))
        for language in ("fr", "en-US"):
            sample = next(sample for sample in before["samples"] if sample["language"] == language)
            assert normalized(sample) == result["responses"][language]
        report["startup_seconds"] = result["startup_seconds"]
        report["passed"].extend(["packaged FR/EN matches V2 baseline", "duplicate EXE exits without second JVM",
                                  "runs with no Java/Python on PATH and hostile JVM environment removed",
                                  "packaged child stops on exit"])
    finally:
        test_mutex.close()
        # Do not terminate the controller and orphan its child on a timeout.
        if first.poll() is None:
            first.wait(timeout=150)

    relocated = ROOT / "artifacts/Validation déplacée avec espaces/Correctly"
    if relocated.exists():
        raise AssertionError("Relocation test output already exists; inspect before retrying")
    shutil.copytree(bundle, relocated)
    code, result = complete(*launch(relocated, "package-relocated"))
    assert code == 0 and result["ok"]
    report["passed"].append("copied bundle runs from Unicode/spaces path and unrelated cwd")

    for file, name in ((relocated / "runtime/bin/javaw.exe", "package-missing-runtime"),
                       (relocated / "engine/languagetool-server.jar", "package-missing-jar")):
        backup = file.with_suffix(file.suffix + ".test-backup")
        assert not backup.exists()
        file.rename(backup)
        try:
            code, result = complete(*launch(relocated, name))
            assert code == 1 and not result["ok"] and result["state"] == "ERROR" and result["stopped"]
        finally:
            backup.rename(file)
        report["passed"].append(name)
    jar = relocated / "engine/languagetool-server.jar"
    original = jar.read_bytes()
    try:
        jar.write_bytes(b"corrupted test jar")
        code, result = complete(*launch(relocated, "package-corrupt-jar"))
        assert code == 1 and not result["ok"] and result["state"] == "ERROR" and result["stopped"]
    finally:
        jar.write_bytes(original)
    report["passed"].append("corrupted packaged JAR cannot report ready")
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 18082))
        sock.listen()
        code, result = complete(*launch(relocated, "package-port-conflict"))
        assert code == 1 and result["state"] == "PORT_CONFLICT" and "pid" not in result
        assert sock.fileno() != -1
    report["passed"].append("unrelated occupied port is preserved")
    manifest = json.loads(LOCK.read_text(encoding="utf-8"))
    verify(bundle, manifest)
    verify(relocated, manifest)
    report["passed"].append("all original and relocated runtime/engine checksums preserved")
    assert original_listener == [row for row in listeners() if row[1] == 8081]
    report["passed"].append("existing V2 listener on 8081 preserved")
    report["ok"] = True
    (output / "package-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
