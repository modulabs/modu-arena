#!/usr/bin/env python3
"""Modu Rank Session Hook

This hook submits Claude Code session token usage to the Modu Rank service.
It is triggered automatically when a session ends.

The hook reads session data from stdin and submits it to the rank service
if the user has registered with Modu Rank.

Requirements:
- User must be registered: Run `modu-adk rank register` to connect GitHub account
- API key stored securely in ~/.modu/rank/credentials.json

Privacy:
- Only token counts are submitted (input, output, cache tokens)
- Project paths are anonymized using one-way hashing
- No code or conversation content is transmitted

Opt-out: Configure ~/.modu/rank/config.yaml to exclude specific projects:
    rank:
      enabled: true
      exclude_projects:
        - "/path/to/private-project"
        - "*/confidential/*"
"""

import json
import sys

# Ensure UTF-8 stdout/stderr on Windows (cp949 default breaks non-ASCII output)
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def main():
    """Main hook entry point."""
    try:
        # Read session data from stdin
        input_data = sys.stdin.read()
        if not input_data:
            return

        session_data = json.loads(input_data)

        # Lazy import to avoid startup delay
        try:
            from modu_adk.rank.hook import is_project_excluded, submit_session_hook
        except ImportError:
            # modu-adk not installed or rank module not available
            return

        # Check if this project is excluded
        project_path = session_data.get("projectPath") or session_data.get("cwd")
        if is_project_excluded(project_path):
            return  # Silently skip excluded projects

        result = submit_session_hook(session_data)

        if result["success"]:
            print("Session submitted to Modu Rank", file=sys.stderr)
        elif result["message"] and result["message"] != "Not registered with Modu Rank":
            print(f"Modu Rank: {result['message']}", file=sys.stderr)

    except json.JSONDecodeError:
        # Invalid JSON input, silently skip
        pass
    except Exception as e:
        # Log errors but don't fail the hook
        print(f"Modu Rank hook error: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
