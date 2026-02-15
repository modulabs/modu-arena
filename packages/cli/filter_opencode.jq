.[]
  | .[]
  | select(.title | contains("1M") or contains("million") or contains("context") or contains("ANTHROPIC") or contains("Opus") or contains("Claude"))
  | .[]
  | {number, title, html_url, state}
