# Build Python as onedir. JVM/engine are copied unchanged beside the EXE by build_windows.py.
from pathlib import Path

root = Path(SPECPATH)
a = Analysis([str(root / "src/correctly_server/__main__.py")],
             pathex=[str(root / "src")], binaries=[], datas=[],
             hiddenimports=["pystray._win32"], hookspath=[], hooksconfig={},
             runtime_hooks=[], excludes=[], noarchive=False, optimize=0)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True,
          name="CorrectlyServer", debug=False, bootloader_ignore_signals=False,
          strip=False, upx=False, console=False,
          icon=str(root / "assets/correctly.ico"))
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False,
               name="Correctly-V3-Windows-x64")
