import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Auth domain — pure rules: session cookie signing/verification, constant-time
// credential compare, and login-throttle state transitions. No DB / IO imports.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "serenique_session";
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 3600; // 30 天
export const LOGIN_THROTTLE_WINDOW_MS = 10 * 60_000; // 10 分钟
export const LOGIN_THROTTLE_MAX_ATTEMPTS = 5;

const SESSION_PREFIX = "serenique-session.";

/** Constant-time string compare (mirrors blob.domain signaturesEqual). */
export function secretsEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sign a session cookie: "<exp>.<base64url(HMAC-SHA256(secret, prefix+exp))>". */
export function signSessionCookie(secret: string, expires: number): string {
  const sig = createHmac("sha256", secret)
    .update(`${SESSION_PREFIX}${expires}`)
    .digest("base64url");
  return `${expires}.${sig}`;
}

export type SessionVerifyResult =
  | { valid: true }
  | { valid: false; reason: "malformed" | "tampered" | "expired" };

/** Verify a session cookie value at a given unix-second clock. */
export function verifySessionCookie(
  secret: string,
  value: string,
  nowSec: number,
): SessionVerifyResult {
  const dot = value.indexOf(".");
  if (dot <= 0) return { valid: false, reason: "malformed" };
  const expires = Number(value.slice(0, dot));
  if (!Number.isInteger(expires) || expires <= 0) {
    return { valid: false, reason: "malformed" };
  }
  const signature = value.slice(dot + 1);
  const expected = signSessionCookie(secret, expires);
  const expectedSignature = expected.slice(expected.indexOf(".") + 1);
  if (!secretsEqual(signature, expectedSignature)) {
    return { valid: false, reason: "tampered" };
  }
  if (expires < nowSec) return { valid: false, reason: "expired" };
  return { valid: true };
}

/**
 * Build a Set-Cookie header. crossSite=true 用于生产（pages.dev → api.zeroicey.me）
 * 需 SameSite=None；dev 走 Vite 代理（同源）用 SameSite=Lax 即可在 http 下生效。
 * secure=false 用于 dev（http），生产必须 true（https）。
 */
export function buildSessionCookie(
  value: string,
  maxAgeSeconds: number,
  crossSite: boolean,
  secure: boolean,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    crossSite ? "SameSite=None" : "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(crossSite: boolean, secure: boolean): string {
  return buildSessionCookie("", 0, crossSite, secure);
}

// ---- Login throttle (pure state transitions; state held in-memory at service) ----

export type ThrottleState = { count: number; resetAtMs: number };

export function throttleIsBlocked(
  state: ThrottleState | undefined,
  nowMs: number,
): boolean {
  if (!state) return false;
  return nowMs < state.resetAtMs;
}

/** Record one failed attempt; returns the new state (window restarts on expiry). */
export function throttleRecordFailure(
  state: ThrottleState | undefined,
  nowMs: number,
  windowMs = LOGIN_THROTTLE_WINDOW_MS,
): ThrottleState {
  if (!state || nowMs >= state.resetAtMs) {
    return { count: 1, resetAtMs: nowMs + windowMs };
  }
  return { count: state.count + 1, resetAtMs: state.resetAtMs };
}

/** True when the attempt counter has hit the cap within the window. */
export function throttleShouldBlock(
  state: ThrottleState | undefined,
  nowMs: number,
  max = LOGIN_THROTTLE_MAX_ATTEMPTS,
): boolean {
  return throttleIsBlocked(state, nowMs) && (state?.count ?? 0) >= max;
}
