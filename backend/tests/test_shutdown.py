import os
from unittest.mock import Mock

from correctly_server.shutdown import shutdown


def test_shutdown_matches_only_resolved_executable_and_closes_handles(tmp_path):
    backend = Mock()
    backend.matching.return_value = [(123, 456)]
    backend.exited.side_effect = [False, True]
    assert shutdown(tmp_path / "CorrectlyServer.exe", backend=backend)
    backend.matching.assert_called_once_with(os.path.normcase(str((tmp_path / "CorrectlyServer.exe").resolve())))
    backend.request.assert_called_once_with([(123, 456)])
    backend.close.assert_called_once_with([(123, 456)])


def test_no_owned_instance_is_success_and_sends_no_message(tmp_path):
    backend = Mock()
    backend.matching.return_value = []
    assert shutdown(tmp_path / "CorrectlyServer.exe", backend=backend)
    backend.request.assert_not_called()


def test_unresponsive_owned_instance_times_out_without_killing(tmp_path):
    backend = Mock()
    backend.matching.return_value = [(123, 456)]
    backend.exited.return_value = False
    assert not shutdown(tmp_path / "CorrectlyServer.exe", backend=backend, timeout=0)
    backend.close.assert_called_once_with([(123, 456)])
    backend.kill.assert_not_called()


def test_windows_failure_is_reported_and_handles_are_closed(tmp_path):
    backend = Mock()
    backend.matching.return_value = [(123, 456)]
    backend.exited.side_effect = OSError("access denied")
    assert not shutdown(tmp_path / "CorrectlyServer.exe", backend=backend)
    backend.close.assert_called_once_with([(123, 456)])
