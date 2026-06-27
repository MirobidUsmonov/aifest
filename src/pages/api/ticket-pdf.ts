import type { APIRoute } from 'astro';
import { PARTNER_API_BASE, getPartnerToken } from '../../lib/partner';
import { rateLimit, clientIp } from '../../lib/ratelimit';

export const prerender = false;

// Proxy the ticket PDF from the Partner API using the server token,
// so the token is never exposed to the browser.
export const GET: APIRoute = async ({ url, request, clientAddress }) => {
  if (!rateLimit(`pdf:${clientIp(request, clientAddress)}`, 30, 60_000)) {
    return new Response("Juda ko'p so'rov. Bir daqiqadan keyin urinib ko'ring.", { status: 429 });
  }
  const n = (url.searchParams.get('n') ?? '').trim();
  if (!n || !/^[A-Za-z0-9]+$/.test(n)) {
    return new Response('Bad ticket number', { status: 400 });
  }
  const token = getPartnerToken();
  if (!token) return new Response('Server not configured', { status: 500 });

  const upstream = await fetch(`${PARTNER_API_BASE}/tickets/${n}/pdf`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf' },
  });

  if (!upstream.ok) {
    // 503 = PDF still generating; surface as-is so the client can retry
    return new Response(upstream.status === 503 ? 'PDF tayyorlanmoqda, biroz kuting.' : 'PDF topilmadi.', {
      status: upstream.status === 503 ? 503 : upstream.status,
    });
  }

  const buf = await upstream.arrayBuffer();
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ecomfest-${n}.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
};
