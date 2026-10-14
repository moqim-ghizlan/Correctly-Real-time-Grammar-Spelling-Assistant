import json
import socket
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(port=8081, text="I has a car", language="en-US", timeout=3, **parameters):
    """No proxy, redirects, credentials, external host, or request logging."""
    body = urlencode({"text": text, "language": language,
                      "enabledOnly": "false", **parameters}).encode("utf-8")
    request = Request(f"http://127.0.0.1:{port}/v2/check", data=body,
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    with build_opener(ProxyHandler({}), NoRedirect()).open(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("HTTP status")
        data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise ValueError("Response too large")
        result = json.loads(data)
    if not isinstance(result, dict) or not isinstance(result.get("matches"), list):
        raise ValueError("Invalid LanguageTool response")
    return result


def healthy(port=8081, timeout=3):
    try:
        check(port=port, timeout=timeout)
        return True
    except (OSError, URLError, ValueError):
        return False


def port_available(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True
