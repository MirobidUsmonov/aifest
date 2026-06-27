import type { APIRoute } from 'astro';
import { upsertPromo, deletePromo, getPromo, type PromoCode } from '../../../lib/store';
import { TARIFF_IDS } from '../../../lib/partner';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const fd = await request.formData();
  const action = String(fd.get('action') ?? 'save');
  const code = String(fd.get('code') ?? '').trim().replace(/\s+/g, '').slice(0, 40);

  if (!code) return back();

  if (action === 'delete') {
    deletePromo(code);
    return back();
  }
  if (action === 'toggle') {
    const p = getPromo(code);
    if (p) upsertPromo({ ...p, active: !p.active });
    return back();
  }

  // save / create
  const percent = Math.max(1, Math.min(100, parseInt(String(fd.get('percent') ?? '0'), 10) || 0));
  if (!percent) return back();
  // applicable tariffs (checkboxes); none selected = all
  const tariffs = fd.getAll('tariffs').map((x) => String(x)).filter((k) => TARIFF_IDS[k]);
  const max_uses = Math.max(0, parseInt(String(fd.get('max_uses') ?? '0'), 10) || 0);
  const label = String(fd.get('label') ?? '').trim().slice(0, 60);
  const existing = getPromo(code);
  const rec: PromoCode = {
    code,
    percent,
    tariffs,
    label: label || undefined,
    max_uses,
    used: existing?.used ?? 0,
    active: true,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  upsertPromo(rec);
  return back();
};

function back() {
  return new Response(null, { status: 302, headers: { Location: '/admin/promo' } });
}
