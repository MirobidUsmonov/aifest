import type { APIRoute } from 'astro';
import { partnerFetch } from '../../lib/partner';
import { upsertOrder, getPromo, incPromoUse, getTariff, getDiscountTariffId, setDiscountTariffId, type OrderRecord } from '../../lib/store';

export const prerender = false;

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;
const TG_ADMIN = process.env.TELEGRAM_ADMIN_ID ?? import.meta.env.TELEGRAM_ADMIN_ID;
const TG_BOT_USER = process.env.TELEGRAM_BOT_USERNAME ?? import.meta.env.TELEGRAM_BOT_USERNAME ?? 'sellerforum2026_bot';

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('998')) d = d.slice(3);
  if (d.length === 9) return '+998' + d;
  if (digits.length === 12 && digits.startsWith('998')) return '+' + digits;
  return null;
}

async function notifyTelegram(text: string) {
  if (!TG_TOKEN || !TG_ADMIN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_ADMIN, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch { /* non-fatal */ }
}

export const POST: APIRoute = async ({ request }) => {
  let data: Record<string, unknown>;
  try { data = await request.json(); } catch { return json({ ok: false, error: 'Noto\'g\'ri format.' }, 400); }

  const name = String(data.name ?? '').trim().slice(0, 100);
  const phoneRaw = String(data.phone ?? '').trim().slice(0, 30);
  let tariffKey = String(data.tariff ?? '').trim();
  const contact = String(data.contact ?? '').trim().slice(0, 80);
  const note = String(data.note ?? '').trim().slice(0, 300);
  const promoInput = String(data.promo ?? '').trim().slice(0, 40);
  let quantity = parseInt(String(data.quantity ?? '1'), 10);
  if (!Number.isFinite(quantity) || quantity < 1) quantity = 1;
  if (quantity > 10) quantity = 10;

  if (!name || !phoneRaw || !tariffKey) {
    return json({ ok: false, error: 'Ism, telefon va tarif majburiy.' }, 400);
  }

  const meta = getTariff(tariffKey);
  if (!meta) return json({ ok: false, error: 'Noto\'g\'ri tarif tanlandi.' }, 400);

  const phone = normalizePhone(phoneRaw);
  if (!phone) return json({ ok: false, error: 'Telefon raqam noto\'g\'ri. Format: +998 90 123 45 67' }, 400);

  // promo code: percentage discount applied to the selected tariff.
  // We charge the discounted amount via a hidden Partner API tariff.
  let appliedPromo: string | undefined;
  let discountPercent = 0;
  let unitPrice = meta.price;
  let chargeTariffId = meta.id;

  if (promoInput) {
    const promo = getPromo(promoInput);
    if (!promo || !promo.active) return json({ ok: false, error: 'Promo-kod yaroqsiz.' }, 400);
    if (promo.max_uses > 0 && promo.used >= promo.max_uses) return json({ ok: false, error: 'Promo-kod limiti tugagan.' }, 400);
    if (promo.tariffs.length && !promo.tariffs.includes(tariffKey)) {
      return json({ ok: false, error: 'Bu kod tanlangan tarifga amal qilmaydi.' }, 400);
    }
    appliedPromo = promo.code;
    discountPercent = Math.max(0, Math.min(100, promo.percent));
    const discounted = Math.max(0, Math.round(meta.price * (1 - discountPercent / 100)));

    if (discounted !== meta.price) {
      if (discounted === 0) {
        // 100% off → use the free tariff (instant ticket)
        const freeT = getTariff('free');
        chargeTariffId = freeT?.id ?? meta.id;
        unitPrice = 0;
      } else {
        // find-or-create a hidden Partner API tariff at the discounted price
        const cacheKey = `${tariffKey}:${discounted}`;
        let id = getDiscountTariffId(cacheKey);
        if (!id) {
          const created = await partnerFetch<any>('/tariffs', {
            method: 'POST',
            body: { name: meta.label, price: discounted, is_active: true, included_features: meta.perks, sort_order: 900 },
          });
          if (created.ok && created.data?.id) { id = created.data.id; setDiscountTariffId(cacheKey, id); }
        }
        if (id) { chargeTariffId = id; unitPrice = discounted; }
      }
    }
  }

  const parts = name.split(/\s+/);
  const first_name = parts[0] || name;
  const last_name = parts.slice(1).join(' ') || '—';
  const origin = new URL(request.url).origin;

  const orderBody: Record<string, unknown> = {
    tariff_id: chargeTariffId,
    quantity,
    buyer: { first_name, last_name, phone },
    locale: 'uz',
    callback_url: `${origin}/rahmat`,
  };
  const extras: string[] = [];
  if (appliedPromo) extras.push(`promo:${appliedPromo}`);
  if (contact) extras.push(`aloqa:${contact}`);
  if (extras.length) orderBody.external_reference = extras.join('|').slice(0, 128);

  const res = await partnerFetch<any>('/orders', { method: 'POST', body: orderBody });
  if (!res.ok) {
    return json({ ok: false, error: res.message || 'Buyurtma yaratilmadi.' }, res.status >= 400 && res.status < 500 ? 400 : 502);
  }

  const order = res.data;
  const isFree = !order.payment_url;
  if (appliedPromo) incPromoUse(appliedPromo);

  // persist locally for the admin dashboard
  const rec: OrderRecord = {
    id: order.id,
    order_number: order.order_number,
    tariff_key: tariffKey,
    tariff_id: meta.id,
    tariff_name: meta.label,
    quantity,
    amount: unitPrice * quantity,
    buyer_name: name,
    buyer_phone: phone,
    contact: contact || undefined,
    note: note || undefined,
    promo_code: appliedPromo,
    status: order.status ?? (isFree ? 'paid' : 'pending'),
    payment_status: order.payment_status ?? (isFree ? 'completed' : 'pending'),
    payment_url: order.payment_url ?? null,
    is_free: isFree,
    tickets: Array.isArray(order.tickets)
      ? order.tickets.map((t: any) => ({ ticket_number: t.ticket_number, holder: typeof t.holder === 'string' ? t.holder : name }))
      : [],
    created_at: order.created_at ?? new Date().toISOString(),
    paid_at: order.paid_at ?? null,
    source: 'site',
  };
  try { upsertOrder(rec); } catch { /* non-fatal */ }

  const tg = [
    isFree ? '<b>🎟 ECOM FEST — BEPUL chipta olindi</b>' : '<b>🧾 ECOM FEST — Yangi buyurtma (to\'lov kutilmoqda)</b>',
    '',
    `<b>Ism:</b> ${esc(name)}`,
    `<b>Telefon:</b> ${esc(phone)}`,
    `<b>Tarif:</b> ${esc(meta.label)}`,
    `<b>Summa:</b> ${new Intl.NumberFormat('uz-UZ').format(unitPrice * quantity)} so'm`,
    appliedPromo ? `<b>Promo:</b> ${esc(appliedPromo)} (−${discountPercent}%)` : '',
    `<b>Buyurtma:</b> ${esc(order.order_number ?? String(order.id))}`,
    contact ? `<b>Aloqa:</b> ${esc(contact)}` : '',
  ].filter(Boolean).join('\n');
  notifyTelegram(tg);

  return json({
    ok: true,
    free: isFree,
    payment_url: order.payment_url ?? null,
    order_id: order.id,
    order_number: order.order_number,
    quantity,
    tickets: rec.tickets,
    bot_url: order.order_number ? `https://t.me/${TG_BOT_USER}?start=order_${encodeURIComponent(order.order_number)}` : null,
  }, 200);
};

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
