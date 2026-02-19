import { NextRequest, NextResponse } from "next/server";
import { db, users, emailVerifications } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import { createSessionToken, generateApiKey } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, displayName, action } = body as {
      email?: string;
      code?: string;
      displayName?: string;
      action?: "signup" | "signin";
    };

    if (!email || !code || !action) {
      return NextResponse.json(
        { error: "Email, code, and action are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    const verifications = await db
      .select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.email, normalizedEmail),
          eq(emailVerifications.code, code),
          eq(emailVerifications.used, false),
          gt(emailVerifications.expiresAt, new Date())
        )
      )
      .limit(1);

    if (verifications.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    await db
      .update(emailVerifications)
      .set({ used: true })
      .where(eq(emailVerifications.id, verifications[0].id));

    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const existingUser = existingUsers[0];

    if (action === "signup") {
      if (existingUser) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in." },
          { status: 409 }
        );
      }

      const username = normalizedEmail.split("@")[0] ?? normalizedEmail;
      let uniqueUsername = username;
      const existingUsername = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (existingUsername.length > 0) {
        uniqueUsername = `${username}_${Date.now().toString(36)}`;
      }

      const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = generateApiKey(uniqueUsername);

      const [newUser] = await db
        .insert(users)
        .values({
          username: uniqueUsername,
          email: normalizedEmail,
          displayName: displayName || username,
          apiKeyHash,
          apiKeyPrefix,
        })
        .returning({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          email: users.email,
          apiKeyPrefix: users.apiKeyPrefix,
          createdAt: users.createdAt,
        });

      const { token, expiresAt } = await createSessionToken(newUser.id);
      const cookieStore = await cookies();
      cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return NextResponse.json({ user: newUser, apiKey }, { status: 201 });
    }

    if (action === "signin") {
      if (!existingUser) {
        return NextResponse.json(
          { error: "No account found with this email. Please sign up first." },
          { status: 404 }
        );
      }

      const { token, expiresAt } = await createSessionToken(existingUser.id);
      const cookieStore = await cookies();
      cookieStore.set("session", token, {
        httpOnly: true,
        secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false,
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return NextResponse.json({
        user: {
          id: existingUser.id,
          username: existingUser.username,
          displayName: existingUser.displayName,
          email: existingUser.email,
          apiKeyPrefix: existingUser.apiKeyPrefix,
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
