import { env } from "@/env";
import {
  DEFAULT_SESSION_TTL_SECONDS,
  secretsEqual,
  signSessionCookie,
  throttleRecordFailure,
  throttleShouldBlock,
  verifySessionCookie,
  type ThrottleState,
} from "./auth.domain";
import type { LoginOutcome } from "./auth.types";

// ---------------------------------------------------------------------------
// Auth service — singleton over env. No DB: the "identity" is the shared
// AUTH_TOKEN secret and the session cookie is stateless (HMAC-signed).
// ---------------------------------------------------------------------------

export const authService = {
  /** True when a credential is configured; dev without one skips auth. */
  isAuthEnabled(): boolean {
    return env.AUTH_TOKEN !== undefined && env.AUTH_TOKEN !== "";
  },

  /** Constant-time check of the shared secret. */
  authenticate(token: string): boolean {
    if (!this.isAuthEnabled()) return true; // dev 无密钥模式：接受
    return secretsEqual(token, env.AUTH_TOKEN!);
  },

  sessionTtlSeconds(): number {
    return env.SESSION_TTL ?? DEFAULT_SESSION_TTL_SECONDS;
  },

  /** Mint a fresh stateless session cookie value. */
  createSessionCookie(): string {
    const expires = Math.floor(Date.now() / 1000) + this.sessionTtlSeconds();
    return signSessionCookie(env.AUTH_TOKEN!, expires);
  },

  verifySessionCookie(value: string): boolean {
    if (!this.isAuthEnabled()) return true;
    return verifySessionCookie(
      env.AUTH_TOKEN!,
      value,
      Math.floor(Date.now() / 1000),
    ).valid;
  },

  // ---- Login throttle (in-memory, single-process) ----
  _throttle: new Map<string, ThrottleState>(),

  /** 清理已过窗口的节流记录，防止 Map 无限增长。 */
  _sweep(nowMs: number): void {
    for (const [key, state] of this._throttle) {
      if (nowMs >= state.resetAtMs) this._throttle.delete(key);
    }
  },

  /**
   * Attempt login. Returns "throttled" when ip is blocked, "ok" on success
   * (clears throttle), else "rejected" after recording a failure and sleeping
   * delayMs (slow path). delayMs/nowMs injectable so unit tests avoid real sleeps.
   */
  login(
    ip: string,
    token: string,
    delayMs = 500,
    nowMs = Date.now(),
  ): Promise<LoginOutcome> {
    this._sweep(nowMs);
    const state = this._throttle.get(ip);
    if (throttleShouldBlock(state, nowMs)) {
      return Promise.resolve("throttled");
    }
    if (!this.authenticate(token)) {
      this._throttle.set(ip, throttleRecordFailure(state, nowMs));
      return new Promise((resolve) => setTimeout(() => resolve("rejected"), delayMs));
    }
    this._throttle.delete(ip);
    return Promise.resolve("ok");
  },
};
