"""Garmin adapter: a thin, stateless bridge to Garmin Connect (unofficial `garminconnect` library).

Knows nothing about users, the database or encryption. Next.js sends a command plus
tokens and gets data (and refreshed tokens) back. Never logs request bodies.
"""

from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler
from typing import Any

import requests
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

try:
    from curl_cffi import requests as cffi_requests
except ImportError:  # pragma: no cover
    cffi_requests = None

MAX_BODY = 512 * 1024


class AdapterError(Exception):
    def __init__(self, kind: str):
        super().__init__(kind)
        self.kind = kind


# ---------------------------------------------------------------- MFA state


class _Resp:
    """Stand-in for the widget flow's last response (only .text/.url are read)."""

    def __init__(self, text: str, url: str):
        self.text = text
        self.url = url


def dump_mfa(c: Any) -> dict[str, Any]:
    sess = c._mfa_session
    is_cffi = cffi_requests is not None and isinstance(sess, cffi_requests.Session)
    cookies = [
        {"name": k.name, "value": k.value, "domain": k.domain, "path": k.path}
        for k in (sess.cookies.jar if is_cffi else sess.cookies)
    ]
    last = getattr(c, "_widget_last_resp", None)
    return {
        "flow": getattr(c, "_mfa_flow", "portal"),
        "method": getattr(c, "_mfa_method", "email"),
        "params": getattr(c, "_mfa_login_params", {}),
        "headers": dict(getattr(c, "_mfa_post_headers", {}) or {}),
        "serviceUrl": getattr(c, "_mfa_service_url", None),
        "session": "cffi" if is_cffi else "requests",
        "impersonate": getattr(sess, "impersonate", None) or "chrome",
        "cookies": cookies,
        "widget": {"text": last.text, "url": str(last.url)} if last is not None else None,
    }


def restore_mfa(c: Any, s: dict[str, Any]) -> None:
    if s["session"] == "cffi":
        if cffi_requests is None:
            raise AdapterError("unavailable")
        sess = cffi_requests.Session(impersonate=s["impersonate"], timeout=30)
    else:
        sess = requests.Session()
    for k in s["cookies"]:
        sess.cookies.set(k["name"], k["value"], domain=k["domain"], path=k["path"])
    c._mfa_session = sess
    c._mfa_flow = s["flow"]
    c._mfa_method = s["method"]
    c._mfa_login_params = s["params"]
    c._mfa_post_headers = s["headers"]
    if s.get("serviceUrl"):
        c._mfa_service_url = s["serviceUrl"]
    if s.get("widget"):
        c._widget_last_resp = _Resp(s["widget"]["text"], s["widget"]["url"])


def tokens_of(g: Garmin) -> str:
    if not g.client.di_token:
        # Cookie-only (JWT_WEB) sessions cannot be stored and reused.
        raise AdapterError("unsupported_session")
    return g.client.dumps()


def session_from(tokens: str) -> Garmin:
    g = Garmin()
    try:
        g.client.loads(tokens)
        if g.client.di_refresh_token and g.client._token_expires_soon():
            g.client._refresh_session()
    except Exception as e:  # noqa: BLE001
        raise AdapterError("auth") from e
    return g


def changed_tokens(g: Garmin, before: str) -> str | None:
    after = g.client.dumps()
    return after if after != before else None


# ---------------------------------------------------------------- commands


def op_login(b: dict[str, Any]) -> dict[str, Any]:
    g = Garmin(b["email"], b["password"], return_on_mfa=True)
    status, _ = g.login()
    if status == "needs_mfa":
        return {"mfa": True, "mfaState": dump_mfa(g.client)}
    return {"ok": True, "tokens": tokens_of(g)}


def op_login_mfa(b: dict[str, Any]) -> dict[str, Any]:
    g = Garmin()
    restore_mfa(g.client, b["mfaState"])
    try:
        g.client._complete_mfa(str(b["code"]).strip())
    except GarminConnectAuthenticationError as e:
        raise AdapterError("mfa_invalid") from e
    return {"ok": True, "tokens": tokens_of(g)}


def _profile(g: Garmin) -> None:
    prof = g.client.connectapi("/userprofile-service/socialProfile")
    g.display_name = prof.get("displayName") if isinstance(prof, dict) else None


def op_fetch(b: dict[str, Any]) -> dict[str, Any]:
    tokens = b["tokens"]
    g = session_from(tokens)
    _profile(g)
    days = g.get_daily_steps(b["from"], b["to"]) or []
    activities = g.get_activities_by_date(b["from"], b["to"], sortorder="asc") or []
    # Laps and HR zones for runs we have not stored details for yet (newest first, capped).
    known = {str(x) for x in (b.get("knownIds") or [])}
    runs = [
        str(a.get("activityId"))
        for a in activities
        if "run" in str((a.get("activityType") or {}).get("typeKey", "")) and str(a.get("activityId")) not in known
    ]
    details: dict[str, Any] = {}
    # Capped so one call stays well inside the function time limit; older runs keep summary data only.
    for aid in list(reversed(runs))[:15]:
        try:
            details[str(aid)] = {
                "splits": g.get_activity_splits(str(aid)),
                "hrZones": g.get_activity_hr_in_timezones(str(aid)),
            }
        except (GarminConnectConnectionError, requests.exceptions.RequestException):
            details[str(aid)] = None
    try:
        predictions = g.get_race_predictions()
    except Exception:  # noqa: BLE001 - optional extra; never fail a sync on it
        predictions = None
    return {
        "days": days,
        "activities": activities,
        "details": details,
        "racePredictions": predictions if isinstance(predictions, dict) else None,
        "tokens": changed_tokens(g, tokens),
    }


MAX_RECOVERY_DATES = 24


def _without_series(payload: Any) -> Any:
    """Top-level fields only: the per-minute lists (~100 KB a night) are unused and would bloat the response."""
    if not isinstance(payload, dict):
        return payload
    return {k: v for k, v in payload.items() if not isinstance(v, list)}


def op_fetch_recovery(b: dict[str, Any]) -> dict[str, Any]:
    """Sleep (with score, resting HR, overnight HRV, Body Battery) and the HRV summary (baseline) per date."""
    tokens = b["tokens"]
    g = session_from(tokens)
    _profile(g)  # sleep URLs need the display name
    nights = []
    for d in list(b["dates"])[:MAX_RECOVERY_DATES]:
        night: dict[str, Any] = {"date": d, "sleep": None, "hrv": None}
        try:
            night["sleep"] = _without_series(g.get_sleep_data(d))
        except (GarminConnectConnectionError, requests.exceptions.RequestException):
            pass
        try:
            night["hrv"] = _without_series(g.get_hrv_data(d))
        except (GarminConnectConnectionError, requests.exceptions.RequestException):
            pass
        nights.append(night)
    return {"nights": nights, "tokens": changed_tokens(g, tokens)}


def _schedule_id(res: Any) -> Any:
    if not isinstance(res, dict):
        return None
    return res.get("workoutScheduleId") or res.get("scheduledWorkoutId") or res.get("id")


def op_push_workout(b: dict[str, Any]) -> dict[str, Any]:
    tokens = b["tokens"]
    g = session_from(tokens)
    created = g.upload_workout(b["workout"])
    workout_id = created.get("workoutId") if isinstance(created, dict) else None
    if not workout_id:
        raise AdapterError("unavailable")
    scheduled = g.schedule_workout(workout_id, b["date"])
    return {"workoutId": workout_id, "scheduleId": _schedule_id(scheduled), "tokens": changed_tokens(g, tokens)}


def op_delete_workout(b: dict[str, Any]) -> dict[str, Any]:
    tokens = b["tokens"]
    g = session_from(tokens)
    if b.get("scheduleId"):
        try:
            g.unschedule_workout(b["scheduleId"])
        except Exception:  # noqa: BLE001 - already gone is fine
            pass
    try:
        g.delete_workout(b["workoutId"])
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "tokens": changed_tokens(g, tokens)}


OPS = {
    "login": op_login,
    "login_mfa": op_login_mfa,
    "fetch": op_fetch,
    "fetch_recovery": op_fetch_recovery,
    "push_workout": op_push_workout,
    "delete_workout": op_delete_workout,
}


def run(body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    op = OPS.get(body.get("op", ""))
    if op is None:
        return 400, {"error": "bad_request"}
    try:
        return 200, op(body)
    except AdapterError as e:
        return 200, {"error": e.kind}
    except KeyError:
        return 400, {"error": "bad_request"}
    except GarminConnectAuthenticationError:
        return 200, {"error": "auth"}
    except GarminConnectTooManyRequestsError:
        return 200, {"error": "rate_limited"}
    except (GarminConnectConnectionError, requests.exceptions.RequestException):
        return 200, {"error": "unavailable"}
    except Exception as e:  # noqa: BLE001
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status == 401:
            return 200, {"error": "auth"}
        if status == 429:
            return 200, {"error": "rate_limited"}
        print(f"garmin adapter: {body.get('op')} failed: {type(e).__name__}")
        return 200, {"error": "unavailable"}


class handler(BaseHTTPRequestHandler):  # noqa: N801 - Vercel expects this name
    def _send(self, status: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:  # noqa: N802
        secret = os.environ.get("GARMIN_ADAPTER_SECRET", "")
        given = self.headers.get("x-adapter-secret", "")
        if not secret or not hmac.compare_digest(secret.encode(), given.encode()):
            self._send(401, {"error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(400, {"error": "bad_request"})
            return
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            self._send(400, {"error": "bad_request"})
            return
        status, payload = run(body if isinstance(body, dict) else {})
        self._send(status, payload)

    def do_GET(self) -> None:  # noqa: N802
        self._send(405, {"error": "method_not_allowed"})

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - silence access logs
        return
