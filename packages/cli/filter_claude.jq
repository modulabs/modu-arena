.[]
  | .[]
  | select(.title | contains("1M") or contains("million") or contains("context") or contains("Opus"))
  | .[]
  | {number, title, html_url, state, comments}
