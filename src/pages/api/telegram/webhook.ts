import type { APIRoute } from 'astro';
import { partnerFetch } from '../../../lib/partner';
import { findOrderByNumber, getOrdersByPhone, patchOrder, addSubscriber, type OrderRecord } from '../../../lib/store';
import { rateLimit } from '../../../lib/ratelimit';

export const prerender = false;

// Interactive Telegram bot (@sellerforum2026_bot) for buyers to check / download
// their ticket. Telegram delivers updates here (webhook). The same bot token is
// also used elsewhere for outgoing admin notifications — that is unaffected.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;
const WH_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? import.meta.env.TELEGRAM_WEBHOOK_SECRET;
const ORIGIN = process.env.PUBLIC_ORIGIN ?? import.meta.env.PUBLIC_ORIGIN ?? 'https://ecomfest.uz';

// in-memory dedup of update_id (resets on restart — fine for a single process).
// FIFO eviction so recently-seen ids (the ones Telegram actively retries) are never dropped.
const seen = new Set<number>();
const seenQ: number[] = [];
function remember(id: number) {
  if (seen.has(id)) return;
  seen.add(id);
  seenQ.push(id);
  if (seenQ.length > 5000) { const old = seenQ.shift(); if (old !== undefined) seen.delete(old); }
}

async function tg(method: string, body: Record<string, unknown>) {
  if (!TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch { /* non-fatal */ }
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('998')) d = d.slice(3);
  if (d.length === 9) return '+998' + d;
  if (digits.length === 12 && digits.startsWith('998')) return '+' + digits;
  return null;
}

function isPaid(o: OrderRecord): boolean {
  return (o.status === 'paid' || o.payment_status === 'completed') && (o.tickets?.length ?? 0) > 0;
}

// refresh a not-yet-paid order from the Partner API (buyer may have just paid)
async function refresh(o: OrderRecord): Promise<OrderRecord> {
  if (isPaid(o)) return o;
  try {
    const res = await partnerFetch<any>(`/orders/${o.order_number}`);
    if (res.ok) {
      const d = res.data;
      const nowPaid = d.status === 'paid' || d.payment_status === 'completed';
      const tickets = Array.isArray(d.tickets)
        ? d.tickets.map((t: any) => ({ ticket_number: t.ticket_number, holder: typeof t.holder === 'string' ? t.holder : o.buyer_name }))
        : o.tickets;
      const patched = patchOrder(o.order_number, {
        status: nowPaid ? 'paid' : (d.status ?? o.status),
        payment_status: d.payment_status ?? o.payment_status,
        paid_at: d.paid_at ?? o.paid_at ?? (nowPaid ? new Date().toISOString() : null),
        tickets,
      });
      return patched ?? { ...o, tickets };
    }
  } catch { /* ignore */ }
  return o;
}

// Reply for one order: paid → QR-PDF download links + buttons; pending → status.
async function replyOrder(chatId: number, o: OrderRecord) {
  if (isPaid(o)) {
    const links = o.tickets
      .map((t, i) => `📄 <a href="${ORIGIN}/api/ticket-pdf?n=${encodeURIComponent(t.ticket_number)}">Chipta ${i + 1} — QR PDF yuklab olish</a>`)
      .join('\n');
    await tg('sendMessage', {
      chat_id: chatId,
      text: `✅ Buyurtma <b>${esc(o.order_number)}</b> — TO'LANGAN\nTarif: <b>${esc(o.tariff_name)}</b>\nChipta: ${o.tickets.length} ta\n\n${links}\n\nHavolani bosib QR-chiptangizni yuklab oling.`,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: o.tickets.map((t, i) => [{
          text: `📄 Chipta ${i + 1} — QR PDF`,
          url: `${ORIGIN}/api/ticket-pdf?n=${encodeURIComponent(t.ticket_number)}`,
        }]),
      },
    });
  } else {
    await tg('sendMessage', {
      chat_id: chatId,
      text: `⏳ Buyurtma <b>${esc(o.order_number)}</b> — to'lov hali tasdiqlanmadi.\nTo'lovni yakunlasangiz, bir oz kutib qaytadan tekshiring.`,
      parse_mode: 'HTML',
      ...(o.payment_url ? { reply_markup: { inline_keyboard: [[{ text: "💳 To'lovni yakunlash", url: o.payment_url }]] } } : {}),
    });
  }
}

async function lookupAndReply(chatId: number, q: string) {
  if (!rateLimit(`tgbot:${chatId}`, 20, 60_000)) {
    await tg('sendMessage', { chat_id: chatId, text: "Juda ko'p so'rov yubordingiz. Bir daqiqadan keyin urinib ko'ring." });
    return;
  }
  const query = q.trim().slice(0, 40);

  // by order number (single)
  const byNum = findOrderByNumber(query);
  if (byNum) { await replyOrder(chatId, await refresh(byNum)); return; }

  // by phone — full ticket(s) for every order on that phone (per organizer's choice)
  const phone = normalizePhone(query);
  if (phone) {
    const list = getOrdersByPhone(phone).slice(0, 5);
    if (!list.length) {
      await tg('sendMessage', { chat_id: chatId, text: "❌ Bu telefon raqami bo'yicha buyurtma topilmadi." });
      return;
    }
    for (const m of list) { await replyOrder(chatId, await refresh(m)); }
    return;
  }

  await tg('sendMessage', {
    chat_id: chatId,
    text: "❌ Topilmadi. Buyurtma raqamingiz (masalan TF2026...) yoki ro'yxatdan o'tgan telefon raqamingizni yuboring.",
  });
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

export const POST: APIRoute = async ({ request }) => {
  // fail CLOSED — if the secret is missing or mismatched, never process the request
  if (!WH_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== WH_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    let update: any;
    try { update = await request.json(); } catch { return ok(); }

    if (typeof update?.update_id === 'number') {
      if (seen.has(update.update_id)) return ok();
      remember(update.update_id);
    }

    // inline button taps
    const cb = update?.callback_query;
    if (cb) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
      const cbChat = cb.message?.chat?.id; // may be absent for old/inaccessible messages
      if (cbChat) addSubscriber({ chat_id: cbChat, name: `${cb.from?.first_name ?? ''} ${cb.from?.last_name ?? ''}`.trim() || undefined, username: cb.from?.username });
      if (cb.data === 'check' && cbChat && rateLimit(`tgbot:${cbChat}`, 20, 60_000)) {
        await tg('sendMessage', { chat_id: cbChat, text: "Buyurtma raqamingiz yoki telefon raqamingizni yuboring 👇" });
      }
      return ok();
    }

    const msg = update?.message;
    if (!msg || typeof msg.text !== 'string') return ok();
    const chatId = msg.chat?.id;
    if (!chatId) return ok();
    addSubscriber({ chat_id: chatId, name: `${msg.from?.first_name ?? ''} ${msg.from?.last_name ?? ''}`.trim() || undefined, username: msg.from?.username });
    const text = msg.text.trim();

    if (text.startsWith('/start')) {
      const payload = text.slice(6).trim();
      if (payload.startsWith('order_')) {
        await lookupAndReply(chatId, payload.slice(6));
        return ok();
      }
      if (rateLimit(`tgbot:${chatId}`, 20, 60_000)) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: "Assalomu alaykum! 👋\n\n<b>ECOM FEST 2026</b> — chiptangizni shu yerda tekshirasiz va QR-PDF holida yuklab olasiz.\n\nBuyurtma raqamingiz yoki telefon raqamingizni yuboring 👇",
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '🎟 Chiptani tekshirish', callback_data: 'check' }]] },
        });
      }
      return ok();
    }

    await lookupAndReply(chatId, text);
    return ok();
  } catch {
    return ok(); // never surface a non-2xx → Telegram won't retry-storm
  }
};

function ok() {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
