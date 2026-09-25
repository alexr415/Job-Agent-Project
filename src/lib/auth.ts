import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Minimal single-password gate for the dashboard's controls (schedule and
// manual runs), since they spend API credits. Viewing the dashboard stays public.

export const SESSION_COOKIE = "dashboard_session";

// The cookie holds an HMAC of a fixed string keyed by the password: it proves
// the holder knew the password without storing it, and changing
// DASHBOARD_PASSWORD signs everyone out.
function sessionToken(password: string): string {
  return createHmac("sha256", password).update("dashboard-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function passwordConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

export function checkPassword(attempt: string): string | null {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password || !safeEqual(sessionToken(attempt), sessionToken(password))) return null;
  return sessionToken(password);
}

export async function isAdmin(): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return Boolean(cookie) && safeEqual(cookie!, sessionToken(password));
}
