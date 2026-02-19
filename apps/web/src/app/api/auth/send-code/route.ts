import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db, emailVerifications } from "@/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { sendVerificationEmail } from "@/lib/email";

const RATE_LIMIT_SECONDS = 60;
const CODE_EXPIRY_MINUTES = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    const recentCode = await db
      .select({ createdAt: emailVerifications.createdAt })
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.email, email.toLowerCase()),
          gt(
            emailVerifications.createdAt,
            new Date(Date.now() - RATE_LIMIT_SECONDS * 1000)
          )
        )
      )
      .orderBy(desc(emailVerifications.createdAt))
      .limit(1);

    if (recentCode.length > 0) {
      return NextResponse.json(
        { error: "Please wait before requesting another code" },
        { status: 429 }
      );
    }

    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    await db.insert(emailVerifications).values({
      email: email.toLowerCase(),
      code,
      expiresAt,
    });

    await sendVerificationEmail(email, code);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send code error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
