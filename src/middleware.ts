import { defineMiddleware } from 'astro:middleware';
import { ADMIN_COOKIE, verifySession } from './lib/auth';
import { startReconciler } from './lib/reconciler';

// start the background payment reconciler once per server process
startReconciler();

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/');

  // public exceptions
  const isLoginPage = pathname === '/admin/login';
  const isLoginApi = pathname === '/api/admin/login';

  if ((isAdminPage && !isLoginPage) || (isAdminApi && !isLoginApi)) {
    const cookie = context.cookies.get(ADMIN_COOKIE)?.value;
    if (!verifySession(cookie)) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return context.redirect('/admin/login', 302);
    }
  }

  return next();
});
