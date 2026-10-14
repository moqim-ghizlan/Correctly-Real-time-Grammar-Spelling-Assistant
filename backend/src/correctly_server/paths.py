import os
from pathlib import Path
import sys
from dataclasses import dataclass


def bundle_root() -> Path:
    # The JVM and engine are siblings of the EXE, outside _internal.
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2] / "vendor"


def data_root() -> Path:
    local = os.environ.get("LOCALAPPDATA")
    if not local:
        raise RuntimeError("LOCALAPPDATA is unavailable")
    return Path(local) / "Correctly"


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def javaw(self):
        return self.root / "runtime" / "bin" / "javaw.exe"

    @property
    def java(self):
        return self.root / "runtime" / "bin" / "java.exe"

    @property
    def engine(self):
        return self.root / "engine"

    @property
    def jar(self):
        return self.engine / "languagetool-server.jar"

    @property
    def config(self):
        return self.engine / "server.properties"

    def validate(self):
        # Messages intentionally contain only bundle-relative paths.
        for path in (self.javaw, self.java, self.jar, self.config,
                     self.engine / "libs" / "languagetool-core.jar"):
            if not path.is_file():
                raise ValueError("Fichier manquant : " + path.relative_to(self.root).as_posix())
        if not (self.engine / "org").is_dir():
            raise ValueError("Ressources manquantes : engine/org")
