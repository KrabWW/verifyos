#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""VerifyOS->zentao writeback shim: POST /comment {objectType, objectID, comment, actor}
Inserts a real zt_action(action='Commented') row, visible in bug history.
Whitelist objectTypes; objectID must be int; comment capped at 4000 chars."""
import json, subprocess, sys
from http.server import BaseHTTPRequestHandler, HTTPServer

BS = chr(92)  # backslash, built at runtime to survive any transfer/escaping
CONTAINER = "verifyos-zentao"
MYSQL = ["docker", "exec", "-i", CONTAINER, "mysql", "-uroot", "-p123456",
         "zentao", "--default-character-set=utf8mb4"]
ALLOWED = {"bug", "story", "task", "case", "todo"}

def esc(s):
    # SQL literal escaping only: backslash, single/double quote. Real newlines are
    # safe inside a quoted SQL literal (SQL goes to mysql via stdin, not a shell).
    return (s.replace(BS, BS + BS)
             .replace("'", BS + "'")
             .replace('"', BS + '"')
             .replace(chr(13), ""))

class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass
    def do_POST(self):
        if self.path.rstrip("/") != "/comment":
            return self._json(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            return self._json(400, {"error": "bad json: %s" % e})
        ot = str(body.get("objectType", "bug")).lower()
        oid = body.get("objectID")
        actor = str(body.get("actor", "Crab"))[:28]
        cmt = str(body.get("comment", "")).strip()[:4000]
        if ot not in ALLOWED or not isinstance(oid, int) or not cmt:
            return self._json(400, {"error": "need whitelisted objectType, int objectID, non-empty comment"})
        sql = ("INSERT INTO zt_action(objectType, objectID, product, project, execution, actor, action, date, comment, files, extra, " + chr(96) + "read" + chr(96) + ") "
               "SELECT '" + ot + "', id, product, project, execution, '" + esc(actor) + "', 'Commented', NOW(), '" + esc(cmt) + "', '', '', 0 "
               "FROM zt_" + ot + " WHERE id = " + str(int(oid)))
        p = subprocess.run(MYSQL, input=sql.encode("utf-8"), capture_output=True)
        if p.returncode != 0:
            return self._json(500, {"error": p.stderr.decode("utf-8", "replace")[:300]})
        chk = subprocess.run(["docker", "exec", CONTAINER, "mysql", "-uroot", "-p123456", "zentao",
                              "-N", "-e", "SELECT COUNT(*) FROM zt_action WHERE objectType='" + ot + "' AND objectID=" + str(int(oid))],
                             capture_output=True)
        return self._json(200, {"ok": True, "objectType": ot, "objectID": oid, "actions": chk.stdout.decode().strip()})
    def do_GET(self):
        if self.path.startswith("/health"):
            p = subprocess.run(["docker", "exec", CONTAINER, "mysql", "-uroot", "-p123456", "zentao",
                                "-N", "-e", "SELECT 1"], capture_output=True)
            return self._json(200, {"ok": p.returncode == 0})
        return self._json(404, {"error": "not found"})
    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18089
    HTTPServer(("0.0.0.0", port), H).serve_forever()
