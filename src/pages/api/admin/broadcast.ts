import type { APIRoute } from 'astro';
import { listSubscribers, deactivateSubscriber } from '../../../lib/store';

export const prerender = false;

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;

async function send(chat_id: number, text: string): Promise<{ ok: boolean; blocked: boolean }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true, blocked: false };
    const j: any = await r.json().catch(() => ({}));
    // 403 = user blocked the bot / deactivated → mark inactive so we stop trying
    const blocked = j?.error_code === 403;
    return { ok: false, blocked };
  } catch {
    return { ok: false, blocked: false };
  }
}

export const POST: APIRoute = async ({ request }) => {
  const fd = await request.formData();
  const text = String(fd.get('text') ?? '').trim().slice(0, 4000);
  if (!text) return back('e=empty');

  const targets = listSubscribers().filter((s) => s.active);
  let sent = 0, failed = 0;
  for (const s of targets) {
    const r = await send(s.chat_id, text);
    if (r.ok) sent++;
    else { failed++; if (r.blocked) deactivateSubscriber(s.chat_id); }
    await new Promise((res) => setTimeout(res, 45)); // ~22 msg/sec — within Telegram limits
  }
  return back(`sent=${sent}&failed=${failed}&total=${targets.length}`);
};

function back(q: string) {
  return new Response(null, { status: 302, headers: { Location: '/admin/broadcast?' + q } });
}
