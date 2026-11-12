# A local web server for developing the app. It's the same as `python3 -m http.server`,
# except it tells the browser never to reuse old copies of files, so every
# refresh shows your latest changes.
#
# Run:  python3 serve.py      then open http://localhost:8000

import http.server


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print("Serving the chess app at http://localhost:8000  (Ctrl+C to stop)")
    http.server.ThreadingHTTPServer(("", 8000), NoCacheHandler).serve_forever()
