import type { APIRoute } from 'astro';
import { eligibleTickets, listDraws, addDraw } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const tariffs: string[] = Array.isArray(body.tariffs) && body.tariffs.length
    ? body.tariffs.map((x: unknown) => String(x))
    : ['free', 'standard', 'vip'];
  const prize = String(body.prize ?? '').trim().slice(0, 80) || undefined;
  const allowRepeat = body.allowRepeat === true;

  let pool = eligibleTickets().filter((t) => tariffs.includes(t.tariff_key));
  if (!allowRepeat) {
    const won = new Set(listDraws().map((d) => d.ticket_number));
    pool = pool.filter((t) => !won.has(t.ticket_number));
  }
  if (pool.length === 0) {
    return json({ ok: false, error: 'Tanlangan filtrda yangi nomzod yo‘q.' }, 400);
  }
  const winner = pool[Math.floor(Math.random() * pool.length)];
  const rec = {
    ticket_number: winner.ticket_number,
    holder: winner.holder,
    tariff_key: winner.tariff_key,
    phone: winner.phone,
    prize,
    at: new Date().toISOString(),
  };
  addDraw(rec);
  return json({ ok: true, winner: rec, pool_size: pool.length }, 200);
};

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
