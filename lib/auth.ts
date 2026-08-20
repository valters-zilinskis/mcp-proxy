import crypto from 'node:crypto';

/**
 * Parse an Authorization header and return the Bearer token value.
 */
export function getBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const [scheme, ...rest] = headerValue.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const token = rest.join(' ').trim();
  return token || null;
}

/**
 * Constant-time token comparison to avoid timing side channels.
 */
export function secureTokenEquals(actual: string | null, expected: string): boolean {
  if (typeof expected !== 'string' || !expected) return false;
  if (actual == null) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

