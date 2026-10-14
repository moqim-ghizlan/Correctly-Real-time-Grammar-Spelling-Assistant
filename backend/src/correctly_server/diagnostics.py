import json
import platform
from datetime import datetime, timezone

from . import __version__


def versions(paths):
    try:
        manifest = json.loads((paths.root / "vendor-manifest.json").read_text(encoding="utf-8"))
        # Do not expose source paths, env, command lines, or arbitrary exception text.
        return {"correctly": __version__, "engine": manifest["engine_version"],
                "runtime": manifest["runtime_version"], "architecture": "x64"}
    except (OSError, ValueError, KeyError):
        return {"correctly": __version__, "engine": "inconnu", "runtime": "inconnu", "architecture": "x64"}


def export(engine, directory):
    directory.mkdir(parents=True, exist_ok=True)
    report = {"created_at": datetime.now(timezone.utc).isoformat(),
              "versions": versions(engine.paths), "windows": platform.release(),
              "state": engine.state.value, "port": engine.settings.port,
              "owns_child": engine.process is not None,
              "java_present": engine.paths.javaw.is_file(),
              "jar_present": engine.paths.jar.is_file(),
              "config_present": engine.paths.config.is_file()}
    destination = directory / "diagnostics.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return destination
