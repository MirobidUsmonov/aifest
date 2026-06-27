// Sellers Association — Partner API v1 client (server-side only).
// Token must never reach the browser. Read from process.env (runtime) with
// import.meta.env fallback (build-time inlined from .env).

export const PARTNER_API_BASE =
  process.env.SELLERS_API_BASE ??
  import.meta.env.SELLERS_API_BASE ??
  'https://backend.sellersassociation.uz/api/partner/v1';

// Tariff key (site) → Partner API tariff id (event ecom-business-fest-2026 / id 37)
export const TARIFF_IDS: Record<string, number> = {
  free: 111,
  standard: 112,
  vip: 113,
};

export const TARIFF_META: Record<string, { id: number; price: number; label: string }> = {
  free: { id: 111, price: 0, label: 'BEPUL' },
  standard: { id: 112, price: 99000, label: 'STANDARD' },
  vip: { id: 113, price: 499000, label: 'VIP' },
};

export function getPartnerToken(): string | undefined {
  return process.env.SELLERS_API_TOKEN ?? import.meta.env.SELLERS_API_TOKEN;
}

export function getWebhookSecret(): string | undefined {
  return process.env.SELLERS_WEBHOOK_SECRET ?? import.meta.env.SELLERS_WEBHOOK_SECRET;
}

type PartnerResult<T = any> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; message: string };

export async function partnerFetch<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<PartnerResult<T>> {
  const token = getPartnerToken();
  if (!token) {
    return { ok: false, status: 500, error: 'no_token', message: 'Server konfiguratsiyasi to\'liq emas.' };
  }
  try {
    const res = await fetch(PARTNER_API_BASE + path, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // bound the request so a slow/hung upstream never stalls our handlers
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (res.ok && json?.success !== false) {
      return { ok: true, status: res.status, data: json.data ?? json };
    }
    return {
      ok: false,
      status: res.status,
      error: json?.error ?? 'request_failed',
      message: json?.message ?? 'So\'rov bajarilmadi.',
    };
  } catch (e) {
    return { ok: false, status: 502, error: 'network', message: 'Tarmoq xatosi. Qaytadan urinib ko\'ring.' };
  }
}
