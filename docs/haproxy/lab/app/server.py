"""Tiny echo HTTP server used by the HAProxy lab backends.

Returns its instance name + request info so you can SEE load balancing happen.
Endpoints:
  GET /        -> JSON {app, path, client}
  GET /health  -> 200 {"status":"ok"} or 503 when toggled sick
  GET /toggle  -> flip the healthy flag (simulate a sick backend)
  GET /slow    -> sleep 2s then respond (for leastconn / timeout demos)
"""

import http.server
import json
import os
import socket
import time

NAME = os.environ.get("APP_NAME", socket.gethostname())
HEALTHY = True  # toggled via /toggle to simulate a sick backend


class H(http.server.BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        global HEALTHY
        if self.path == "/health":
            return self._send(
                200 if HEALTHY else 503,
                json.dumps({"status": "ok" if HEALTHY else "sick", "app": NAME}),
            )
        if self.path == "/toggle":
            HEALTHY = not HEALTHY
            return self._send(200, json.dumps({"healthy": HEALTHY}))
        if self.path == "/slow":
            time.sleep(2)
        return self._send(
            200,
            json.dumps({"app": NAME, "path": self.path, "client": self.client_address[0]}),
        )

    def log_message(self, *a):  # quieter logs
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    http.server.ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
