"""Ask only this installed EXE's tray to exit; never terminate a process by name."""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import sys
import time

WM_STOP = 0x400 + 10  # pystray._win32's normal stop message


class WindowsProcesses:
    def __init__(self):
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.user = ctypes.WinDLL("user32", use_last_error=True)
        self.psapi = ctypes.WinDLL("psapi", use_last_error=True)
        self.kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        self.kernel.OpenProcess.restype = wintypes.HANDLE
        self.kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                                         wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
        self.kernel.QueryFullProcessImageNameW.restype = wintypes.BOOL
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        self.kernel.WaitForSingleObject.restype = wintypes.DWORD
        self.psapi.EnumProcesses.argtypes = [ctypes.POINTER(wintypes.DWORD), wintypes.DWORD,
                                            ctypes.POINTER(wintypes.DWORD)]
        self.psapi.EnumProcesses.restype = wintypes.BOOL
        self.callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        self.user.EnumWindows.argtypes = [self.callback, wintypes.LPARAM]
        self.user.EnumWindows.restype = wintypes.BOOL
        self.user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        self.user.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
        self.user.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
        self.user.PostMessageW.restype = wintypes.BOOL

    def matching(self, executable):
        capacity = 1024
        while True:
            pids = (wintypes.DWORD * capacity)()
            used = wintypes.DWORD()
            if not self.psapi.EnumProcesses(pids, ctypes.sizeof(pids), ctypes.byref(used)):
                raise ctypes.WinError(ctypes.get_last_error())
            if used.value < ctypes.sizeof(pids):
                break
            capacity *= 2
        handles = []
        try:
            for pid in pids[:used.value // ctypes.sizeof(wintypes.DWORD)]:
                if pid == os.getpid():
                    continue
                handle = self.kernel.OpenProcess(0x1000 | 0x100000, False, pid)
                if not handle:
                    continue  # Other users/protected processes are never touched.
                image = ctypes.create_unicode_buffer(32768)
                size = wintypes.DWORD(len(image))
                if (self.kernel.QueryFullProcessImageNameW(handle, 0, image, ctypes.byref(size))
                        and os.path.normcase(str(Path(image.value).resolve())) == executable):
                    handles.append((pid, handle))
                else:
                    self.kernel.CloseHandle(handle)
            return handles
        except Exception:
            self.close(handles)
            raise

    def request(self, handles):
        owners = {pid for pid, _ in handles}
        found = set()
        failed = False

        @self.callback
        def collect(hwnd, _):
            nonlocal failed
            owner = wintypes.DWORD()
            self.user.GetWindowThreadProcessId(hwnd, ctypes.byref(owner))
            if owner.value in owners:
                name = ctypes.create_unicode_buffer(256)
                self.user.GetClassNameW(hwnd, name, len(name))
                if name.value.startswith("CorrectlyV3") and name.value.endswith("SystemTrayIcon"):
                    if self.user.PostMessageW(hwnd, WM_STOP, 0, 0):
                        found.add(owner.value)
                    else:
                        failed = True
            return True

        if not self.user.EnumWindows(collect, 0):
            raise ctypes.WinError(ctypes.get_last_error())
        return bool(found) and not failed

    def exited(self, handles):
        return all(self.kernel.WaitForSingleObject(handle, 0) == 0 for _, handle in handles)

    def close(self, handles):
        for _, handle in handles:
            self.kernel.CloseHandle(handle)


def shutdown(executable=None, *, backend=None, timeout=30):
    """Return False on timeout/inability to close. No terminate/kill fallback."""
    executable = os.path.normcase(str(Path(executable or sys.executable).resolve()))
    backend = backend or WindowsProcesses()
    handles = []
    try:
        handles = backend.matching(executable)
        if not handles:
            return True
        deadline = time.monotonic() + timeout
        while not backend.exited(handles):
            backend.request(handles)
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.1)
        return True
    except OSError:
        return False
    finally:
        backend.close(handles)
