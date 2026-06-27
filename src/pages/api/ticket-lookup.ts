import type { APIRoute } from 'astro';
import { partnerFetch } from '../../lib/partner';
import { findOrderByNumber, getOrdersByPhone, patchOrder, type OrderRecord } from '../../lib/store';
import { rateLimit, clientIp } from '../../lib/ratelimit';

export const prerender = false;

// Public ticket retrieval — designed so a low-secrecy identifier never yields a
// usable admission credential:
//   • ORDER NUMBER (an 18-digit high-entropy token the buyer holds) → full ticket + QR PDF.
//   • PHONE (low secrecy) → status confirmation only, no ticket / no PDF. The buyer
//     downloads the ticket with their order number (shown on /rahmat & saved locally).

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('998')) d = d.slice(3);
  if (d.length === 9) return '+998' + d;
  if (digits.length === 12 && digits.startsWith('998')) return '+' + digits;
  return null;
}

function maskPhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  if (d.length < 2) return '••••';
  return '+998 •• ••• •• ' + d.slice(-2);
}

function maskOrder(n: string): string {
  if (!n || n.length < 6) return '••••';
  return n.slice(0, 2) + '••••••' + n.slice(-4);
}

function firstName(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || full || '';
}

function isPaid(o: OrderRecord): boolean {
  return (o.status === 'paid' || o.payment_status === 'completed') && (o.tickets?.length ?? 0) > 0;
}

function mapTickets(arr: any, fallback: string) {
  if (!Array.isArray(arr)) return undefined;
  return arr.map((t: any) => ({
    ticket_number: t.ticket_number,
    holder: typeof t.holder === 'string'
      ? t.holder
      : `${t.holder?.first_name ?? ''} ${t.holder?.last_name ?? ''}`.trim() || fallback,
  }));
}

// Refresh a single order from the Partner API when it isn't paid yet (covers the
// no-webhook case where the buyer paid but our store still says pending).
async function refresh(o: OrderRecord): Promise<OrderRecord> {
  if (isPaid(o)) return o;
  try {
    const res = await partnerFetch<any>(`/orders/${o.order_number}`);
    if (res.ok) {
      const d = res.data;
      const nowPaid = d.status === 'paid' || d.payment_status === 'completed';
      const tickets = mapTickets(d.tickets, o.buyer_name) ?? o.tickets;
      const patched = patchOrder(o.order_number, {
        status: nowPaid ? 'paid' : (d.status ?? o.status),
        payment_status: d.payment_status ?? o.payment_status,
        paid_at: d.paid_at ?? o.paid_at ?? (nowPaid ? new Date().toISOString() : null),
        tickets,
      });
      return patched ?? { ...o, tickets };
    }
  } catch { /* ignore — return what we have */ }
  return o;
}

// reveal = matched by order number → the buyer proved possession of the token.
function publicView(o: OrderRecord, reveal: boolean) {
  const paid = isPaid(o);
  return {
    order_number: reveal ? o.order_number : maskOrder(o.order_number),
    status: o.status,
    paid,
    tariff_name: o.tariff_name,
    buyer_name: firstName(o.buyer_name),
    phone_masked: maskPhone(o.buyer_phone),
    created_at: o.created_at,
    paid_at: o.paid_at ?? null,
    can_download: reveal,
    payment_url: reveal && !paid ? (o.payment_url ?? null) : null,
    tickets: reveal && paid
      ? (o.tickets ?? []).map((t) => ({ ticket_number: t.ticket_number, holder: t.holder || firstName(o.buyer_name) }))
      : [],
  };
}

export const GET: APIRoute = async ({ url, request, clientAddress }) => {
  if (!rateLimit(`lookup:${clientIp(request, clientAddress)}`, 20, 60_000)) {
    return json({ ok: false, error: "Juda ko'p so'rov. Bir daqiqadan keyin urinib ko'ring." }, 429);
  }

  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 40);
  if (!q) return json({ ok: false, error: 'Buyurtma raqami yoki telefon kiriting.' }, 400);

  // 1) order number = the secret token → reveal the ticket (refresh just this one)
  const byNum = findOrderByNumber(q);
  if (byNum) {
    const fresh = await refresh(byNum);
    return json({ ok: true, via: 'order', orders: [publicView(fresh, true)] }, 200);
  }

  // 2) phone = low secrecy → status confirmation only, no ticket, no upstream fan-out
  const phone = normalizePhone(q);
  if (phone) {
    const list = getOrdersByPhone(phone).slice(0, 10);
    return json({ ok: true, via: 'phone', orders: list.map((o) => publicView(o, false)) }, 200);
  }

  return json({ ok: true, orders: [] }, 200);
};

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
