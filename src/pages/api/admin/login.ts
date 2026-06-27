import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, checkPassword, createSession } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  let password = '';
  const ct = request.headers.get('content-type') ?? '';
  try {
    if (ct.includes('application/json')) {
      const b = await request.json();
      password = String(b.password ?? '');
    } else {
      const fd = await request.formData();
      password = String(fd.get('password') ?? '');
    }
  } catch { /* ignore */ }

  if (!checkPassword(password)) {
    return redirect(url, '/admin/login?e=1');
  }
  const session = createSession();
  if (!session) return redirect(url, '/admin/login?e=1');

  cookies.set(ADMIN_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return redirect(url, '/admin');
};

function redirect(url: URL, to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}
