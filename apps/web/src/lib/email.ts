/**
 * Email utility using Gmail REST API with OAuth2
 * Uses gmail.modify scope (compatible with existing MCP credentials)
 */

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to refresh access token: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

function buildMimeMessage(
  from: string,
  to: string,
  subject: string,
  html: string
): string {
  const boundary = "boundary_" + Date.now().toString(36);
  const lines = [
    `From: "Modu Arena" <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    `Your Modu Arena verification code. Please check the HTML version of this email.`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html).toString("base64"),
    "",
    `--${boundary}--`,
  ];
  return lines.join("\r\n");
}

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">Modu Arena</h1>
      <p style="color:#94a3b8;margin:8px 0 0;font-size:14px;">AI Coding Agent Leaderboard</p>
    </div>
    <div style="padding:32px;text-align:center;">
      <p style="color:#374151;font-size:16px;margin:0 0 24px;">Your verification code is:</p>
      <div style="background:#f0f9ff;border:2px dashed #3b82f6;border-radius:12px;padding:24px;margin:0 0 24px;">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1e40af;">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:14px;margin:0 0 8px;">This code expires in <strong>5 minutes</strong>.</p>
      <p style="color:#9ca3af;font-size:12px;margin:0;">If you didn't request this code, please ignore this email.</p>
    </div>
    <div style="background:#f9fafb;padding:16px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">MODULABS &mdash; Modu Arena</p>
    </div>
  </div>
</body>
</html>`;

  const accessToken = await getAccessToken();
  const from = process.env.GMAIL_USER!;
  const subject = `[Modu Arena] Verification Code: ${code}`;

  const mimeMessage = buildMimeMessage(from, to, subject, html);
  const encodedMessage = Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API send failed: ${err}`);
  }
}
