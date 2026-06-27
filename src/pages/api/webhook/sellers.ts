import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { getWebhookSecret } from '../../../lib/partner';
import { patchOrder } from '../../../lib/store';

export const prerender = false;

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_ID ?? import.meta.env.TELEGRAM_ADMIN_ID;

// In-memory idempotency (resets on restart — fine for a single-process app).
const seen = new Set<string>();

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

async function notify(text: string) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch { /* ignore */ }
}

export const POST: APIRoute = async ({ request }) => {
  const secret = getWebhookSecret();
  const raw = await request.text();

  // If a secret is configured, verify the HMAC signature. If not, reject
  // (we never process unverified webhooks once this endpoint is live).
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: 'webhook_not_configured' }), { status: 503 });
  }
  const received = request.headers.get('x-partner-signature') ?? '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return new Response(JSON.stringify({ error: 'invalid_signature' }), { status: 401 });
  }

  // anti-replay (5 min) + idempotency by delivery id
  const ts = parseInt(request.headers.get('x-partner-timestamp') ?? '0', 10);
  if (ts && Math.abs(Date.now() / 1000 - ts) > 300) {
    return new Response(JSON.stringify({ error: 'stale' }), { status: 401 });
  }
  const deliveryId = request.headers.get('x-partner-delivery-id') ?? '';
  if (deliveryId && seen.has(deliveryId)) {
    return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
  }
  if (deliveryId) {
    seen.add(deliveryId);
    if (seen.size > 5000) seen.clear();
  }

  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { /* ignore */ }
  const order = payload?.data?.order;
  if (order) {
    const buyer = order.buyer ?? {};
    const tickets = Array.isArray(order.tickets) ? order.tickets : [];
    // sync local admin store
    try {
      patchOrder(order.order_number, {
        status: order.status ?? 'paid',
        payment_status: order.payment_status ?? 'completed',
        paid_at: order.paid_at ?? new Date().toISOString(),
        tickets: tickets.map((t: any) => ({ ticket_number: t.ticket_number, holder: typeof t.holder === 'string' ? t.holder : `${buyer.first_name ?? ''} ${buyer.last_name ?? ''}`.trim() })),
      });
    } catch { /* non-fatal */ }
    const msg = [
      `<b>✅ ECOM FEST — TO'LANDI${order.is_free ? ' (bepul)' : ''}</b>`,
      '',
      `<b>Buyurtma:</b> ${esc(String(order.order_number ?? order.id))}`,
      `<b>Xaridor:</b> ${esc(`${buyer.first_name ?? ''} ${buyer.last_name ?? ''}`.trim())} · ${esc(buyer.phone ?? '')}`,
      `<b>Summa:</b> ${esc(String(order.total_amount ?? 0))} ${esc(order.currency ?? 'UZS')}`,
      `<b>Chiptalar:</b> ${tickets.length}`,
      ...tickets.map((t: any) => `• ${esc(t.ticket_number)}`),
    ].join('\n');
    notify(msg);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
