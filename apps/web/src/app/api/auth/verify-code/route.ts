import { NextRequest, NextResponse } from "next/server";
import { db, users, emailVerifications } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import { hashPassword, createSessionToken, generateApiKey } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, code, username, password, action } = body as {
      email?: string;
      code?: string;
      username?: string;
      password?: string;
      action?: "verify" | "signup";
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

    if (action === "verify") {
      return NextResponse.json({ verified: true });
    }

    if (action === "signup") {
      if (!username || !password) {
        return NextResponse.json(
          { error: "Username and password are required" },
          { status: 400 }
        );
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }

      const existingEmail = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingEmail.length > 0) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in." },
          { status: 409 }
        );
      }

      const existingUsername = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUsername.length > 0) {
        return NextResponse.json(
          { error: "This username is already taken" },
          { status: 409 }
        );
      }

      await db
        .update(emailVerifications)
        .set({ used: true })
        .where(eq(emailVerifications.id, verifications[0].id));

      const passwordHash = hashPassword(password);
      const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix, encrypted: apiKeyEncrypted } = generateApiKey(username);

      const [newUser] = await db
        .insert(users)
        .values({
          username,
          email: normalizedEmail,
          passwordHash,
          displayName: username,
          apiKeyHash,
          apiKeyPrefix,
          apiKeyEncrypted,
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

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Verify code error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
