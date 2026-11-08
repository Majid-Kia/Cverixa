"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { failure, type ActionState } from "@/lib/action-result";
import { logger } from "@/lib/logger";
import { prisma } from "@/server/database/client";
import { verifyPassword } from "@/server/security/password";
import { loginRateLimiter } from "@/server/security/rate-limit";
import { createSession, destroySession } from "@/server/security/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

async function clientKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "local";
}

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Invalid input.");
  }
  const key = `${await clientKey()}:${parsed.data.email}`;
  const limit = loginRateLimiter.check(key);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterMs / 60_000));
    return failure(`Too many login attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    logger.warn("auth.login.failed", { reason: user ? "bad_password" : "unknown_user" });
    return failure("Incorrect email or password.");
  }
  loginRateLimiter.reset(key);
  await createSession(user.id);
  logger.info("auth.login.succeeded", { userId: user.id });
  const next =
    parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//")
      ? parsed.data.next
      : "/dashboard";
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
