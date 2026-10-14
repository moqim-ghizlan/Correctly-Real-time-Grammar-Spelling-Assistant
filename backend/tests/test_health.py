from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
import threading
from urllib.parse import parse_qs

import pytest

from correctly_server.health import check, healthy, port_available


@pytest.fixture
def server():
    class Handler(BaseHTTPRequestHandler):
        response = {"matches": []}
        status = 200
        last_body = None
        def do_POST(self):
            Handler.last_body = parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8"))
            self.send_response(Handler.status)
            self.send_header("Content-Type", "application/json")
            if Handler.status == 302:
                self.send_header("Location", "https://example.com/")
            self.end_headers()
            self.wfile.write(json.dumps(Handler.response).encode("utf-8"))
        def log_message(self, *_):
            pass
    http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    yield http.server_port, Handler
    http.shutdown()
    http.server_close()
    thread.join(2)


def test_form_and_unicode_without_proxy(server, monkeypatch):
    port, handler = server
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    assert check(port, "Bonjour 👋 café", "fr")["matches"] == []
    assert handler.last_body == {"text": ["Bonjour 👋 café"], "language": ["fr"], "enabledOnly": ["false"]}


@pytest.mark.parametrize("payload", [{}, {"matches": "bad"}, [], None])
def test_invalid_json_shape_is_unhealthy(server, payload):
    port, handler = server
    handler.response = payload
    assert not healthy(port)


@pytest.mark.parametrize("status", [302, 403, 500])
def test_http_error_or_redirect_is_unhealthy(server, status):
    port, handler = server
    handler.status = status
    assert not healthy(port)


def test_conflict_detected_without_requesting_existing_service(server):
    port, handler = server
    assert not port_available(port)
    assert handler.last_body is None


def test_free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    assert port_available(port)
    assert not healthy(port, timeout=0.1)
