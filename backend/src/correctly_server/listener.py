"""Inspect the IPv4 listener owner without shell commands or process discovery."""
import ctypes
from ctypes import wintypes
import socket
import struct


def listeners():
    api = ctypes.WinDLL("iphlpapi", use_last_error=True).GetExtendedTcpTable
    api.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOL,
                    wintypes.ULONG, ctypes.c_int, wintypes.ULONG]
    api.restype = wintypes.DWORD
    size = wintypes.DWORD()
    code = api(None, ctypes.byref(size), False, socket.AF_INET, 3, 0)
    if code not in (0, 122):
        raise OSError("Cannot inspect TCP listeners")
    for _ in range(3):
        buffer = ctypes.create_string_buffer(size.value)
        code = api(buffer, ctypes.byref(size), False, socket.AF_INET, 3, 0)
        if code == 122:
            continue
        if code:
            raise OSError("Cannot inspect TCP listeners")
        raw = buffer.raw
        count = struct.unpack_from("<I", raw)[0]
        result = []
        for index in range(count):
            state, address, port, _, _, pid = struct.unpack_from("<6I", raw, 4 + index * 24)
            result.append((socket.inet_ntoa(struct.pack("<I", address)),
                           socket.ntohs(port & 0xffff), pid))
        return result
    raise OSError("TCP listener table changed repeatedly")


def owns_loopback(pid, port):
    rows = [row for row in listeners() if row[1] == port]
    return bool(rows) and all(address == "127.0.0.1" and owner == pid
                             for address, _, owner in rows)
