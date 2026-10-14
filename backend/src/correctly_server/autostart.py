import base64
import os
from pathlib import Path
import subprocess
import sys
import tempfile

MARKER = "Correctly V3 managed startup shortcut"


def startup_path():
    return Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup/Correctly.lnk"


def eligible(executable=None):
    path = Path(executable or sys.executable).resolve()
    temp = Path(tempfile.gettempdir()).resolve()
    return (bool(getattr(sys, "frozen", False)) and path.name == "CorrectlyServer.exe"
            and not path.is_relative_to(temp)
            and not any((parent / "createSetup.cmd").exists() or (parent / "plan_correctly_v3.md").exists()
                        for parent in path.parents))


def _ps_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def set_enabled(enabled, executable=None, shortcut=None, *, runner=subprocess.run):
    target = Path(executable or sys.executable).resolve()
    link = shortcut or startup_path()
    if enabled and not eligible(target):
        raise ValueError("Placez le paquet dans un dossier permanent avant d'activer le démarrage automatique.")
    # COM preserves Unicode paths and quoting. Never overwrite/delete an unknown link.
    script = "$ErrorActionPreference='Stop'\n"
    script += "$ws=New-Object -ComObject WScript.Shell\n"
    script += "$link=" + _ps_literal(link) + "\n"
    script += "$marker=" + _ps_literal(MARKER) + "\n"
    script += "if(Test-Path -LiteralPath $link){$old=$ws.CreateShortcut($link);if($old.Description -ne $marker){throw 'Unmanaged shortcut'}}\n"
    if enabled:
        script += "$s=$ws.CreateShortcut($link)\n$s.TargetPath=" + _ps_literal(target) + "\n"
        script += "$s.WorkingDirectory=" + _ps_literal(target.parent) + "\n"
        script += "$s.Description=$marker\n$s.WindowStyle=7\n$s.Save()\n"
    else:
        script += "if(Test-Path -LiteralPath $link){Remove-Item -LiteralPath $link}\n"
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    result = runner([str(powershell), "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), timeout=15)
    if result.returncode:
        raise RuntimeError("Impossible de modifier le raccourci Correctly V3.")


def is_enabled():
    return startup_path().is_file()
