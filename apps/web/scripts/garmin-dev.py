"""Local runner for the Garmin adapter (port 3200).

From the repo root: .venv/Scripts/python apps/web/scripts/garmin-dev.py  (after: python -m venv .venv && .venv/Scripts/pip install -r apps/web/requirements.txt)
"""

import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "api" / "py"))
from garmin import handler  # noqa: E402


def load_env_local() -> None:
    """Read GARMIN_ADAPTER_SECRET etc. from apps/web/.env.local unless already set."""
    env = Path(__file__).parent.parent / ".env.local"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


if __name__ == "__main__":
    load_env_local()
    port = int(os.environ.get("PORT", "3200"))
    print(f"garmin adapter on http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
