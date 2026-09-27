import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "yapped_session";
const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

/**
 * Opaque token in an httpOnly cookie, backed by a Session row. A magic-link
 * flow later only has to write one of these rows.
 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    jar.delete(SESSION_COOKIE);
  }
}

/**
 * Memoized per request: the layout, header, footer and page each ask who is
 * looking, and that should be one query, not four.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  return {
    id: session.user.id,
    displayName: session.user.displayName,
    handle: session.user.handle,
    avatarUrl: session.user.avatarUrl,
    isAdmin: session.user.role === "ADMIN",
  };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("AUTH_REQUIRED");
  return user;
}
