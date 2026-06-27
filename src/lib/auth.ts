import crypto from 'node:crypto';

export const ADMIN_COOKIE = 'ecf_admin';
const WEEK = 7 * 24 * 60 * 60 * 1000;

export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD ?? import.meta.env.ADMIN_PASSWORD;
}

function key(): string | undefined {
  // sign sessions with the admin password so a password change invalidates them
  const pw = getAdminPassword();
  return pw ? 'ecf::' + pw : undefined;
}

function hmac(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function createSession(): string | null {
  const k = key();
  if (!k) return null;
  const exp = String(Date.now() + WEEK);
  return `${exp}.${hmac(exp, k)}`;
}

export function verifySession(value: string | undefined | null): boolean {
  if (!value) return false;
  const k = key();
  if (!k) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmac(exp, k);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const n = parseInt(exp, 10);
  return Number.isFinite(n) && n > Date.now();
}

export function checkPassword(input: string): boolean {
  const pw = getAdminPassword();
  if (!pw) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(pw);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
