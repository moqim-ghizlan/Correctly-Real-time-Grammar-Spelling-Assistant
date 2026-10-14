import os
import socket
import uuid

from correctly_server.listener import owns_loopback
from correctly_server.singleton import Singleton


def test_named_mutex_excludes_second_instance_and_releases_handle():
    name = "Local\\Correctly.Test." + uuid.uuid4().hex
    first, second = Singleton(name), Singleton(name)
    try:
        assert first.acquire()
        assert not second.acquire()
        first.close()
        assert second.acquire()
    finally:
        first.close()
        second.close()


def test_listener_requires_owned_pid_and_loopback():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen()
        port = sock.getsockname()[1]
        assert owns_loopback(os.getpid(), port)
        assert not owns_loopback(os.getpid() + 100_000, port)
    assert not owns_loopback(os.getpid(), port)


def test_public_listener_not_accepted():
    with socket.socket() as sock:
        sock.bind(("0.0.0.0", 0))
        sock.listen()
        assert not owns_loopback(os.getpid(), sock.getsockname()[1])
