/**
 * lib/userAuth.ts
 *
 * Node.js-only utilities for password hashing and verification.
 * Uses the built-in `crypto` module with scrypt — no extra packages needed.
 *
 * Hash format stored in DB: "<16-byte-salt-hex>:<64-byte-derived-hex>"
 */

import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_LEN = 64;

/** Hash a plain-text password. Returns a string safe to store in the DB. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

/**
 * Compare a plain-text password against a stored hash.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const [salt, hashHex] = storedHash.split(":");
    if (!salt || !hashHex) return false;
    const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
    const stored = Buffer.from(hashHex, "hex");
    if (derived.length !== stored.length) return false;
    return timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}
