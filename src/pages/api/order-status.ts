import type { APIRoute } from 'astro';
import { partnerFetch } from '../../lib/partner';
import { patchOrder } from '../../lib/store';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const order = (url.searchParams.get('order') ?? '').trim().slice(0, 40);
  if (!order || !/^[A-Za-z0-9]+$/.test(order)) {
    return json({ ok: false, error: 'order parametri kerak.' }, 400);
  }
  const res = await partnerFetch<any>(`/orders/${order}`);
  if (!res.ok) {
    return json({ ok: false, error: res.message }, res.status === 404 ? 404 : 502);
  }
  const o = res.data;
  // keep the local admin store in sync (covers the no-webhook case)
  try {
    patchOrder(o.order_number, {
      status: o.status,
      payment_status: o.payment_status,
      paid_at: o.paid_at ?? null,
      tickets: Array.isArray(o.tickets)
        ? o.tickets.map((t: any) => ({ ticket_number: t.ticket_number, holder: typeof t.holder === 'string' ? t.holder : `${t.holder?.first_name ?? ''} ${t.holder?.last_name ?? ''}`.trim() }))
        : undefined,
    });
  } catch { /* non-fatal */ }
  return json({
    ok: true,
    status: o.status,
    payment_status: o.payment_status,
    order_number: o.order_number,
    paid_at: o.paid_at ?? null,
    tickets: Array.isArray(o.tickets)
      ? o.tickets.map((t: any) => ({
          ticket_number: t.ticket_number,
          holder: typeof t.holder === 'string' ? t.holder : `${t.holder?.first_name ?? ''} ${t.holder?.last_name ?? ''}`.trim(),
          tariff: t.tariff?.name?.uz ?? t.tariff?.name?.en ?? '',
        }))
      : [],
  }, 200);
};

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
