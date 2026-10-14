"""Check frozen pystray imports and window lifecycle without touching the V2 server."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    # Existing V2 occupies 8081: the final EXE must show its own conflict tray,
    # keep the unknown server intact, and exit through pystray's stop message.
    exe = ROOT / "artifacts/Correctly-V3-Windows-x64/CorrectlyServer.exe"
    directory = ROOT / "artifacts/frozen-tray-data"
    directory.mkdir(exist_ok=True)
    environment = dict(os.environ, LOCALAPPDATA=str(directory))
    process = subprocess.Popen([str(exe)], cwd=str(ROOT / "docs"), env=environment,
                               creationflags=subprocess.CREATE_NO_WINDOW,
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    windows = []
    @callback_type
    def collect(hwnd, _):
        owner = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
        if owner.value == process.pid:
            name = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, name, len(name))
            if name.value.startswith("CorrectlyV3") and name.value.endswith("SystemTrayIcon"):
                windows.append(hwnd)
        return True
    try:
        deadline = time.monotonic() + 20
        log = directory / "Correctly/server.log"
        while time.monotonic() < deadline:
            windows.clear()
            user32.EnumWindows(collect, 0)
            if windows and log.is_file() and "engine_state=PORT_CONFLICT" in log.read_text(encoding="utf-8"):
                break
            assert process.poll() is None, "Frozen tray exited unexpectedly"
            time.sleep(.1)
        assert windows and "engine_state=PORT_CONFLICT" in log.read_text(encoding="utf-8")
    finally:
        windows.clear()
        user32.EnumWindows(collect, 0)
        for hwnd in windows:
            user32.PostMessageW(hwnd, 0x400 + 10, 0, 0)  # pystray WM_STOP, on our own PID only
    assert process.wait(timeout=20) == 0
    text = log.read_text(encoding="utf-8")
    assert "engine_state=STOPPED" in text
    report = {"ok": True, "passed": ["final EXE initializes real Windows pystray",
               "occupied production port shows conflict without adoption", "window stop runs app cleanup"]}
    (ROOT / "docs/validation/frozen-tray-validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
