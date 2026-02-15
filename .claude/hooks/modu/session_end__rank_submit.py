#!/usr/bin/env python3
"""Modu-Arena Session Submission Hook

Submits Claude Code session token usage to the Modu-Arena API.
Triggered automatically when a session ends.

Reads API key from ~/.modu-arena.json (created by `npx @suncreation/modu-arena install`).
All requests are authenticated with HMAC-SHA256 signatures.

Privacy:
- Only token counts are submitted (input, output, cache tokens)
- No code or conversation content is transmitted
"""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.error
import urllib.request

# Ensure UTF-8 stdout/stderr on Windows (cp949 default breaks non-ASCII output)
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── Config ──────────────────────────────────────────────────────────────────

CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".modu-arena.json")
DEFAULT_SERVER_URL = "http://backend.vibemakers.kr:23010"


def _load_config():
    """Load config from ~/.modu-arena.json."""
    if not os.path.isfile(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


# ── HMAC ────────────────────────────────────────────────────────────────────


def _compute_hmac(api_key, timestamp, body):
    """HMAC-SHA256 signature: message = '{timestamp}:{body}'."""
    message = f"{timestamp}:{body}"
    return hmac.new(api_key.encode(), message.encode(), hashlib.sha256).hexdigest()


# ── Submit ──────────────────────────────────────────────────────────────────


def _submit_session(session_data, api_key, server_url):
    """Submit session data to Modu-Arena API.

    Maps Claude Code hook stdin data to the API payload format and POSTs it.
    """
    from datetime import datetime, timezone

    payload = {
        "toolType": "claude-code",
        "sessionId": session_data.get("session_id", session_data.get("sessionId", "")),
        "startedAt": session_data.get("started_at", session_data.get("startedAt", "")),
        "endedAt": session_data.get("ended_at", session_data.get("endedAt", ""))
        or datetime.now(timezone.utc).isoformat(),
        "inputTokens": int(
            session_data.get("input_tokens", session_data.get("inputTokens", 0))
        ),
        "outputTokens": int(
            session_data.get("output_tokens", session_data.get("outputTokens", 0))
        ),
        "cacheCreationTokens": int(
            session_data.get(
                "cache_creation_tokens", session_data.get("cacheCreationTokens", 0)
            )
        ),
        "cacheReadTokens": int(
            session_data.get(
                "cache_read_tokens", session_data.get("cacheReadTokens", 0)
            )
        ),
        "modelName": session_data.get(
            "model_name", session_data.get("modelName", "unknown")
        ),
    }

    body = json.dumps(payload, separators=(",", ":"))
    timestamp = str(int(time.time()))
    signature = _compute_hmac(api_key, timestamp, body)

    url = f"{server_url.rstrip('/')}/api/v1/sessions"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": api_key,
        "X-Timestamp": timestamp,
        "X-Signature": signature,
    }

    req = urllib.request.Request(
        url, data=body.encode(), headers=headers, method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
            return {"success": True, "message": "Session submitted", "data": result}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        return {"success": False, "message": f"HTTP {e.code}: {error_body}"}
    except urllib.error.URLError as e:
        return {"success": False, "message": f"Connection error: {e.reason}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ── Main ────────────────────────────────────────────────────────────────────


def main():
    """Main hook entry point."""
    try:
        # Read session data from stdin
        input_data = sys.stdin.read()
        if not input_data:
            return

        session_data = json.loads(input_data)

        # Load config
        config = _load_config()
        if not config or not config.get("apiKey"):
            # Not configured — silently skip
            return

        api_key = config["apiKey"]
        server_url = config.get("serverUrl", DEFAULT_SERVER_URL)

        # Submit session
        result = _submit_session(session_data, api_key, server_url)

        if result["success"]:
            print("Session submitted to Modu-Arena", file=sys.stderr)
        elif result["message"]:
            print(f"Modu-Arena: {result['message']}", file=sys.stderr)

    except json.JSONDecodeError:
        # Invalid JSON input, silently skip
        pass
    except Exception as e:
        # Log errors but don't fail the hook
        print(f"Modu-Arena hook error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
