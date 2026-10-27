/**
 * lib/sessionToken.ts
 *
 * Edge-compatible JWT session token using the `jose` library.
 * Algorithm: HS256 (HMAC-SHA256)
 *
 * Payload: { sub: userId, role: Role } — roles live in lib/access.ts
 */

import { SignJWT, jwtVerify } from "jose";
import { toRole, type Role } from "@/lib/access";

const SESSION_DAYS = 7;

function getSecretKey(): Uint8Array {
  const secret = process.env.USER_SESSION_SECRET;
  if (!secret) throw new Error("Missing USER_SESSION_SECRET env variable");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  role: Role;
}

/** Create a signed JWT with userId and role. */
export async function signSessionToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecretKey());
}

/**
 * Verify a JWT session token.
 * Returns { userId, role } if valid, otherwise null.
 */
export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const userId = payload.sub as string;
    if (!userId) return null;
    return { userId, role: toRole(payload.role) };
  } catch {
    return null;
  }
}
