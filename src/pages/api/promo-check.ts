import type { APIRoute } from 'astro';
import { getPromo, getTariff } from '../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch { /* ignore */ }
  const code = String(body.code ?? '').trim();
  const tariffKey = String(body.tariff ?? '').trim();

  if (!code) return json({ ok: false, error: 'Promo-kod kiriting.' }, 200);
  const tariff = getTariff(tariffKey);
  if (!tariff) return json({ ok: false, error: 'Avval tarif tanlang.' }, 200);

  const promo = getPromo(code);
  if (!promo || !promo.active) return json({ ok: false, error: 'Promo-kod yaroqsiz.' }, 200);
  if (promo.max_uses > 0 && promo.used >= promo.max_uses) return json({ ok: false, error: 'Promo-kod limiti tugagan.' }, 200);
  if (promo.tariffs.length && !promo.tariffs.includes(tariffKey)) {
    return json({ ok: false, error: 'Bu kod tanlangan tarifga amal qilmaydi.' }, 200);
  }

  const percent = Math.max(0, Math.min(100, promo.percent));
  const original = tariff.price;
  const final = Math.max(0, Math.round(original * (1 - percent / 100)));
  return json({ ok: true, code: promo.code, percent, original, final, saved: original - final }, 200);
};

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
