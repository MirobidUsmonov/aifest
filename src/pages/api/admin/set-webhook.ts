import type { APIRoute } from 'astro';
import { partnerFetch } from '../../../lib/partner';

export const prerender = false;

// Point the Partner API webhook to this site's /api/webhook/sellers endpoint.
export const POST: APIRoute = async ({ request, url }) => {
  const fd = await request.formData().catch(() => null);
  const clear = fd?.get('clear') === '1';
  const origin = new URL(request.url).origin;
  const webhook_url = clear ? null : `${origin}/api/webhook/sellers`;
  await partnerFetch('/me', { method: 'PATCH', body: { webhook_url } });
  return new Response(null, { status: 302, headers: { Location: '/admin/settings' } });
};
