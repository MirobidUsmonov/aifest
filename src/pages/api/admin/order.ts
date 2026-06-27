import type { APIRoute } from 'astro';
import { patchOrder, getOrderByNumber } from '../../../lib/store';

export const prerender = false;

// Manual status override for the admin Payments page. The Partner API remains the
// source of truth for real payments; this lets the admin correct/force a status
// (e.g. a payment confirmed off-platform) without touching the Partner system.
const VALID = new Set(['paid', 'pending', 'cancelled', 'refunded']);

export const POST: APIRoute = async ({ request }) => {
  const fd = await request.formData();
  const order_number = String(fd.get('order_number') ?? '').trim();
  const status = String(fd.get('status') ?? '').trim();

  if (order_number && VALID.has(status) && getOrderByNumber(order_number)) {
    const payment_status =
      status === 'paid' ? 'completed' :
      status === 'refunded' ? 'refunded' :
      status === 'cancelled' ? 'cancelled' : 'pending';
    const patch: Record<string, unknown> = { status, payment_status };
    if (status === 'paid') patch.paid_at = new Date().toISOString();
    patchOrder(order_number, patch);
  }
  return new Response(null, { status: 302, headers: { Location: '/admin/payments?ok=1' } });
};
