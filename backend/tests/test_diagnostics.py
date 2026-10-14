import json
import logging

from correctly_server.diagnostics import export
from correctly_server.engine import Engine
from correctly_server.logging_config import configure
from test_paths import make_paths


def test_diagnostics_exclude_paths_text_and_error(tmp_path):
    engine = Engine(make_paths(tmp_path / "personal user"))
    engine.error = "private text or path"
    output = export(engine, tmp_path / "reports")
    report = output.read_text(encoding="utf-8")
    assert "personal user" not in report and "private text" not in report
    assert str(tmp_path) not in report
    assert json.loads(report)["versions"]["correctly"] == "3.1.0"


def test_logs_are_bounded_and_contain_only_fixed_events(tmp_path):
    handler = configure(tmp_path)
    try:
        assert handler.maxBytes == 128 * 1024 and handler.backupCount == 2
        engine = Engine(make_paths(tmp_path / "vendor"))
        engine.paths.javaw.unlink()
        engine.start()
        handler.flush()
        content = (tmp_path / "server.log").read_text(encoding="utf-8")
        assert "engine_state=ERROR" in content
        assert "runtime/bin/javaw.exe" not in content and str(tmp_path) not in content
    finally:
        logging.getLogger("correctly").removeHandler(handler)
        handler.close()
