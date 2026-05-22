#!/usr/bin/env python3
"""
share.py — ComfyStudio local file server
Run this alongside your ComfyUI Studio HTML/JS files so the browser can:
  POST /save  → write a generated image to a folder on disk
  POST /list  → list files in a folder (for numbering detection)

Usage:
  python share.py
  python share.py --port 3001   (default port is 3001)

Keep this running in the background while using ComfyUI Studio.
If it's not running, the Save button falls back to a normal browser download.
"""

import http.server
import json
import os
import base64
import re
import argparse

PORT = 3001


class ShareHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default access log noise; only print errors
        pass

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
        except Exception as e:
            self._error(400, f"Bad request: {e}")
            return

        if self.path == "/save":
            self._handle_save(data)
        elif self.path == "/list":
            self._handle_list(data)
        else:
            self._error(404, "Unknown endpoint")

    def _handle_save(self, data):
        folder = data.get("path", "").strip()
        filename = data.get("filename", "").strip()
        data_url = data.get("dataUrl", "")

        if not folder or not filename:
            self._error(400, "Missing path or filename")
            return

        # Security: filename must not contain path separators
        filename = os.path.basename(filename)
        if not filename:
            self._error(400, "Invalid filename")
            return

        # Create folder if it doesn't exist
        try:
            os.makedirs(folder, exist_ok=True)
        except Exception as e:
            self._error(500, f"Could not create folder: {e}")
            return

        # Decode data URL  →  raw bytes
        try:
            if "," in data_url:
                header, b64 = data_url.split(",", 1)
            else:
                b64 = data_url
            img_bytes = base64.b64decode(b64)
        except Exception as e:
            self._error(400, f"Could not decode image data: {e}")
            return

        dest = os.path.join(folder, filename)
        try:
            with open(dest, "wb") as f:
                f.write(img_bytes)
        except Exception as e:
            self._error(500, f"Could not write file: {e}")
            return

        self._json(200, {"ok": True, "path": dest})
        print(f"[share.py] Saved: {dest}")

    def _handle_list(self, data):
        folder = data.get("path", "").strip()
        if not folder:
            self._error(400, "Missing path")
            return

        if not os.path.isdir(folder):
            # Folder doesn't exist yet — return empty list, not an error
            self._json(200, {"files": []})
            return

        try:
            files = [
                f for f in os.listdir(folder)
                if os.path.isfile(os.path.join(folder, f))
            ]
        except Exception as e:
            self._error(500, f"Could not list folder: {e}")
            return

        self._json(200, {"files": files})

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, msg):
        self._json(code, {"ok": False, "error": msg})
        print(f"[share.py] Error {code}: {msg}")


def main():
    parser = argparse.ArgumentParser(description="ComfyStudio share.py file server")
    parser.add_argument("--port", type=int, default=PORT, help=f"Port to listen on (default {PORT})")
    args = parser.parse_args()

    server = http.server.HTTPServer(("127.0.0.1", args.port), ShareHandler)
    print(f"[share.py] Running on http://127.0.0.1:{args.port}")
    print(f"[share.py] Keep this running alongside ComfyUI Studio.")
    print(f"[share.py] Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[share.py] Stopped.")


if __name__ == "__main__":
    main()
