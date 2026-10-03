"""Local runner for the Garmin adapter: python scripts/garmin-dev.py (port 3200). Needs: pip install -r requirements.txt"""

import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "api" / "py"))
from garmin import handler  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3200"))
    print(f"garmin adapter on http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
