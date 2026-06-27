import type { APIRoute } from 'astro';

export const prerender = false;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID ?? import.meta.env.TELEGRAM_ADMIN_ID;

const TARIFF_LABELS: Record<string, string> = {
  free: 'BEPUL · Tashrif',
  standard: 'STANDARD · 99 000 so\'m',
  vip: 'VIP · 499 000 so\'m',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export const POST: APIRoute = async ({ request }) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_ID) {
    return new Response(JSON.stringify({ ok: false, error: 'Server konfiguratsiyasi to\'liq emas.' }), { status: 500 });
  }

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Noto\'g\'ri format.' }), { status: 400 });
  }

  const name = String(data.name ?? '').trim().slice(0, 80);
  const phone = String(data.phone ?? '').trim().slice(0, 30);
  const tariff = String(data.tariff ?? '').trim().slice(0, 40);
  const contact = String(data.contact ?? '').trim().slice(0, 80);
  const note = String(data.note ?? '').trim().slice(0, 300);

  if (!name || !phone || !tariff) {
    return new Response(JSON.stringify({ ok: false, error: 'Ism, telefon va tarif majburiy.' }), { status: 400 });
  }

  const tariffLabel = TARIFF_LABELS[tariff] ?? tariff;

  const text = [
    '<b>🎟 ECOM FEST 2026 — Yangi ro\'yxat</b>',
    '',
    `<b>Ism:</b> ${escapeHtml(name)}`,
    `<b>Telefon:</b> ${escapeHtml(phone)}`,
    `<b>Tarif:</b> ${escapeHtml(tariffLabel)}`,
    contact ? `<b>Qo\'shimcha aloqa:</b> ${escapeHtml(contact)}` : '',
    note ? `<b>Izoh:</b> ${escapeHtml(note)}` : '',
    '',
    `<i>${new Date().toISOString()}</i>`,
  ].filter(Boolean).join('\n');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_ADMIN_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!tgRes.ok) {
      const err = await tgRes.text();
      console.error('Telegram API error:', err);
      return new Response(JSON.stringify({ ok: false, error: 'Telegram bilan aloqa muvaffaqiyatsiz.' }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Register endpoint error:', e);
    return new Response(JSON.stringify({ ok: false, error: 'Server xatoligi.' }), { status: 500 });
  }
};
