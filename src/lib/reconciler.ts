// Background reconciler: polls the Partner API for pending paid orders so the
// admin reliably learns when a payment is confirmed — even without a webhook.
// On a genuine pending→paid transition we sync the local store and ping Telegram.
// Started once per process from the middleware.

import { partnerFetch } from './partner';
import { listOrders, getOrderByNumber, patchOrder } from './store';

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_ID ?? import.meta.env.TELEGRAM_ADMIN_ID;

const INTERVAL_MS = 120_000; // every 2 minutes
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // ignore orders older than 48h

let running = false; // in-flight guard: never overlap a slow tick with the next interval

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

async function notify(text: string) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch { /* non-fatal */ }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const pending = listOrders().filter(
      (o) =>
        o.status === 'pending' &&
        !o.is_free &&
        !!o.order_number &&
        now - new Date(o.created_at).getTime() < MAX_AGE_MS,
    );
    for (const o of pending) {
      let res;
      try {
        res = await partnerFetch<any>(`/orders/${o.order_number}`);
      } catch { continue; }
      if (!res.ok) continue;
      const d = res.data;
      const nowPaid = d.status === 'paid' || d.payment_status === 'completed';
      const tickets = Array.isArray(d.tickets)
        ? d.tickets.map((t: any) => ({
            ticket_number: t.ticket_number,
            holder: typeof t.holder === 'string'
              ? t.holder
              : `${t.holder?.first_name ?? ''} ${t.holder?.last_name ?? ''}`.trim() || o.buyer_name,
          }))
        : o.tickets;

      // re-read current state (a webhook or a prior tick may have already flipped it)
      const cur = getOrderByNumber(o.order_number) ?? o;
      const wasPaid = cur.status === 'paid';

      try {
        patchOrder(o.order_number, {
          status: nowPaid ? 'paid' : (d.status ?? cur.status),
          payment_status: d.payment_status ?? cur.payment_status,
          paid_at: d.paid_at ?? cur.paid_at ?? (nowPaid ? new Date().toISOString() : null),
          tickets,
        });
      } catch { /* non-fatal */ }

      // notify only on a real pending→paid transition (idempotent: paid orders
      // drop out of the pending filter next tick, and the webhook path is deduped here)
      if (nowPaid && !wasPaid) {
        const msg = [
          `<b>✅ ECOM FEST — TO'LANDI</b>`,
          '',
          `<b>Buyurtma:</b> ${esc(o.order_number)}`,
          `<b>Xaridor:</b> ${esc(o.buyer_name)} · ${esc(o.buyer_phone)}`,
          `<b>Tarif:</b> ${esc(o.tariff_name)}`,
          `<b>Summa:</b> ${new Intl.NumberFormat('uz-UZ').format(o.amount || 0)} so'm`,
          o.promo_code ? `<b>Promo:</b> ${esc(o.promo_code)}` : '',
          `<b>Chiptalar:</b> ${(tickets ?? []).length}`,
        ].filter(Boolean).join('\n');
        notify(msg);
      }
    }
  } finally {
    running = false;
  }
}

export function startReconciler() {
  const g = globalThis as unknown as { __ecfReconciler?: boolean };
  if (g.__ecfReconciler) return;
  g.__ecfReconciler = true;
  const timer = setInterval(() => { tick().catch(() => {}); }, INTERVAL_MS);
  // don't keep the event loop alive solely for the poller
  (timer as unknown as { unref?: () => void }).unref?.();
}
