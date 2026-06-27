import type { APIRoute } from 'astro';
import { partnerFetch } from '../../../lib/partner';
import { getTariff, updateTariff } from '../../../lib/store';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const fd = await request.formData();
  const key = String(fd.get('key') ?? '').trim();
  const t = getTariff(key);
  if (!t) return back('e=1');

  const priceRaw = String(fd.get('price') ?? '').replace(/\s/g, '');
  const price = parseInt(priceRaw, 10);
  const perks = String(fd.get('perks') ?? '')
    .split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const label = String(fd.get('label') ?? '').trim();

  const patch: { price?: number; perks?: string[]; label?: string } = {};
  if (Number.isFinite(price) && price >= 0) patch.price = price;
  if (perks.length) patch.perks = perks;
  if (label) patch.label = label;

  // 1) update local store (site display + order amount)
  const updated = updateTariff(key, patch);

  // 2) push to Partner API (what Payme charges + ticket tariff)
  const apiBody: Record<string, unknown> = {};
  if (patch.price !== undefined) apiBody.price = patch.price;
  if (patch.perks) apiBody.included_features = patch.perks;
  if (patch.label) apiBody.name = patch.label;
  if (Object.keys(apiBody).length && updated) {
    await partnerFetch(`/tariffs/${updated.id}`, { method: 'PATCH', body: apiBody });
  }

  return back('ok=1');
};

function back(q: string) {
  return new Response(null, { status: 302, headers: { Location: '/admin/settings?' + q } });
}
