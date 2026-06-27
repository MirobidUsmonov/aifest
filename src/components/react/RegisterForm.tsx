import { useState, useEffect, type FormEvent } from 'react';
import pricing from '../../content/pricing.json';

type Ticket = { ticket_number: string; holder?: string };
type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'free'; tickets: Ticket[]; order: string }
  | { kind: 'redirecting' }
  | { kind: 'telegram'; order: string; botUrl: string; paymentUrl: string }
  | { kind: 'error'; msg: string };

type TariffOpt = { id: string; name: string; price: number };

export default function RegisterForm({ tariffs }: { tariffs?: TariffOpt[] }) {
  const list: TariffOpt[] = tariffs && tariffs.length ? tariffs : (pricing as any);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // default to STANDARD; honour a tariff picked from the pricing cards
  const hasStandard = list.some((p) => p.id === 'standard');
  const [tariff, setTariff] = useState<string>(hasStandard ? 'standard' : (list[0]?.id ?? ''));

  useEffect(() => {
    const valid = (k: string | null) => !!k && list.some((p) => p.id === k);
    try {
      const stored = sessionStorage.getItem('ecf_tariff');
      if (valid(stored)) setTariff(stored as string);
    } catch { /* ignore */ }
    const onPick = (e: Event) => {
      const k = (e as CustomEvent).detail as string;
      if (valid(k)) setTariff(k);
    };
    window.addEventListener('ecf:set-tariff', onPick as EventListener);
    return () => window.removeEventListener('ecf:set-tariff', onPick as EventListener);
  }, []);

  // promo / summa
  const [promoCode, setPromoCode] = useState('');
  const [promo, setPromo] = useState<{ percent: number; original: number; final: number } | null>(null);
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);

  // discount is tied to the selected tariff — reset it when the tariff changes
  useEffect(() => { setPromo(null); setPromoMsg(null); }, [tariff]);

  const selPrice = list.find((p) => p.id === tariff)?.price ?? 0;
  const effPrice = promo ? promo.final : selPrice;
  const money = (n: number) => (n === 0 ? 'BEPUL' : new Intl.NumberFormat('uz-UZ').format(n) + " so'm");

  async function applyPromo() {
    const domVal = (typeof document !== 'undefined' ? (document.getElementById('rf-promo') as HTMLInputElement | null)?.value : '') ?? '';
    const code = (promoCode || domVal).trim();
    if (code && code !== promoCode) setPromoCode(code);
    if (!code) { setPromo(null); setPromoMsg(null); return; }
    setPromoChecking(true);
    try {
      const r = await fetch('/api/promo-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, tariff }),
      });
      const d = await r.json();
      if (d.ok) { setPromo({ percent: d.percent, original: d.original, final: d.final }); setPromoMsg({ ok: true, text: `−${d.percent}% qo'llandi` }); }
      else { setPromo(null); setPromoMsg({ ok: false, text: d.error || 'Yaroqsiz kod' }); }
    } catch {
      setPromo(null); setPromoMsg({ ok: false, text: 'Tarmoq xatosi' });
    }
    setPromoChecking(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === 'sending' || status.kind === 'redirecting') return;

    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      tariff: String(fd.get('tariff') ?? ''),
      quantity: 1,
      contact: String(fd.get('contact') ?? ''),
      note: String(fd.get('note') ?? ''),
      promo: String(fd.get('promo') ?? promoCode).trim(),
    };

    // pre-open a tab on the user's click so the popup blocker allows it;
    // we navigate it to Payme once the order is created (paid flow only).
    let payWin: Window | null = null;
    try { payWin = window.open('', '_blank'); } catch { payWin = null; }

    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({ ok: false, error: 'Javob xato.' }));
      if (res.ok && data.ok) {
        // remember the order number for /bilet auto-prefill (both free & paid)
        try { if (data.order_number) localStorage.setItem('ecf_last_order', String(data.order_number)); } catch { /* ignore */ }
        if (data.free) {
          try { payWin?.close(); } catch { /* ignore */ }
          setStatus({ kind: 'free', tickets: data.tickets ?? [], order: data.order_number });
          form.reset();
        } else if (data.payment_url) {
          if (payWin) {
            try {
              // Payme opens in the new tab; this page stays and points to Telegram
              payWin.location.href = data.payment_url;
              setStatus({ kind: 'telegram', order: data.order_number, botUrl: data.bot_url ?? '', paymentUrl: data.payment_url });
            } catch {
              // navigation failed → close the stray tab and fall back to same-tab redirect
              try { payWin.close(); } catch { /* ignore */ }
              setStatus({ kind: 'redirecting' });
              window.location.href = data.payment_url;
            }
          } else {
            // popup blocked → fall back to same-tab redirect so payment still works
            setStatus({ kind: 'redirecting' });
            window.location.href = data.payment_url;
          }
        } else {
          try { payWin?.close(); } catch { /* ignore */ }
          setStatus({ kind: 'error', msg: 'To\'lov havolasi olinmadi.' });
        }
      } else {
        try { payWin?.close(); } catch { /* ignore */ }
        setStatus({ kind: 'error', msg: data.error ?? 'Xatolik yuz berdi.' });
      }
    } catch {
      try { payWin?.close(); } catch { /* ignore */ }
      setStatus({ kind: 'error', msg: 'Tarmoq xatosi. Qaytadan urinib ko\'ring.' });
    }
  }

  if (status.kind === 'free') {
    return (
      <div className="glass-panel rounded-xl p-10 md:p-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 mb-6">STATUS / BEPUL CHIPTA ✓</div>
        <h3 className="font-display font-black text-3xl md:text-5xl tracking-tightest leading-[0.95] mb-6 text-ink uppercase">Chiptangiz tayyor!</h3>
        <p className="text-ink-2 max-w-md leading-relaxed mb-8">Buyurtma <span className="text-ink font-semibold">{status.order}</span>. Quyidan PDF chiptani yuklab oling — kirishda QR skanerlanadi.</p>
        <ul className="space-y-3">
          {status.tickets.map((t, i) => (
            <li key={t.ticket_number} className="flex items-center justify-between gap-4 border border-rule px-5 py-4">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">CHIPTA {String(i + 1).padStart(2, '0')}{t.holder ? ` · ${t.holder}` : ''}</span>
              <a href={`/api/ticket-pdf?n=${encodeURIComponent(t.ticket_number)}`} target="_blank" rel="noopener"
                 className="bg-gold text-bg px-5 py-2 rounded font-mono font-semibold text-[10px] uppercase tracking-[0.18em] hover:bg-gold-bright transition">PDF ⬇</a>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setStatus({ kind: 'idle' })}
          className="mt-10 font-mono text-[11px] uppercase tracking-[0.18em] border-b border-ink pb-1 text-ink hover:text-ink-2 transition-colors">
          Yana bir chipta →
        </button>
      </div>
    );
  }

  if (status.kind === 'redirecting') {
    return (
      <div className="glass-panel rounded-xl p-10 md:p-16 text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 mb-6">STATUS / PAYME</div>
        <p className="text-ink text-lg">To'lov sahifasiga yo'naltirilmoqda…</p>
        <p className="text-ink-3 text-sm mt-3">Agar avtomatik o'tmasa, biroz kuting.</p>
      </div>
    );
  }

  if (status.kind === 'telegram') {
    return (
      <div className="glass-panel rounded-xl p-10 md:p-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 mb-6">STATUS / TO'LOV OCHILDI ↗</div>
        <h3 className="font-display font-black text-3xl md:text-5xl tracking-tightest leading-[0.95] mb-6 text-ink uppercase">To'lovni yakunlang</h3>
        <p className="text-ink-2 max-w-md leading-relaxed mb-3">Payme <span className="text-ink font-semibold">yangi oynada</span> ochildi — to'lovni amalga oshiring. Buyurtma: <span className="text-ink font-semibold">{status.order}</span>.</p>
        <p className="text-ink-2 max-w-md leading-relaxed mb-8">To'lovdan so'ng chiptangizni <span className="text-ink font-semibold">Telegram bot</span>imizdan oling — QR-PDF darhol keladi.</p>
        {status.botUrl && (
          <a href={status.botUrl} target="_blank" rel="noopener"
             className="inline-flex items-center gap-2 bg-gold text-bg px-8 py-4 rounded font-mono font-semibold text-[11px] uppercase tracking-[0.18em] hover:bg-gold-bright transition">
            Telegram botdan chiptani olish →
          </a>
        )}
        <div className="mt-8 flex flex-col gap-2.5">
          <a href={status.paymentUrl} target="_blank" rel="noopener" className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink transition">Payme oynasi ochilmadimi? Qayta ochish →</a>
          <button type="button" onClick={() => setStatus({ kind: 'idle' })}
            className="self-start font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 hover:text-ink transition">← Yangi buyurtma</button>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full bg-transparent border-b border-rule px-0 py-3 text-base text-ink placeholder:text-ink-3 focus:outline-none focus:border-gold transition-colors';
  const labelCls = 'font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 mb-2 block';

  return (
    <form onSubmit={onSubmit} className="grid md:grid-cols-12 gap-x-8 gap-y-8 glass-panel rounded-xl p-6 md:p-10">
      <div className="md:col-span-6">
        <label className={labelCls} htmlFor="rf-name">Ism familiya *</label>
        <input id="rf-name" name="name" required maxLength={100} autoComplete="name"
               className={inputCls} placeholder="Aziz Karimov" />
      </div>
      <div className="md:col-span-6">
        <label className={labelCls} htmlFor="rf-phone">Telefon raqam *</label>
        <input id="rf-phone" name="phone" required maxLength={30} type="tel" autoComplete="tel"
               className={inputCls} placeholder="+998 90 123 45 67" />
      </div>
      <div className="md:col-span-12">
        <label className={labelCls} htmlFor="rf-tariff">Tarif *</label>
        <select id="rf-tariff" name="tariff" required value={tariff} onChange={(e) => setTariff(e.target.value)}
                className={inputCls + ' appearance-none cursor-pointer'}>
          {list.map((p) => (
            <option key={p.id} value={p.id} className="bg-bg text-ink">
              {p.name} · {p.price === 0 ? "Ko'rgazma" : new Intl.NumberFormat('uz-UZ').format(p.price) + ' so\'m'}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-6">
        <label className={labelCls} htmlFor="rf-contact">Telegram <span className="text-ink-3 normal-case tracking-normal">(ixtiyoriy)</span></label>
        <input id="rf-contact" name="contact" maxLength={80}
               className={inputCls} placeholder="@username" />
      </div>
      <div className="md:col-span-6">
        <label className={labelCls} htmlFor="rf-promo">Promo-kod <span className="text-ink-3 normal-case tracking-normal">(ixtiyoriy)</span></label>
        <div className="flex items-end gap-3">
          <input id="rf-promo" name="promo" maxLength={40} value={promoCode}
                 onChange={(e) => setPromoCode(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                 className={inputCls + ' uppercase'} placeholder="FABRIKA30" />
          <button type="button" onClick={applyPromo} disabled={promoChecking}
                  className="shrink-0 border border-gold text-gold px-5 py-3 font-mono font-semibold text-[11px] uppercase tracking-[0.18em] hover:bg-gold hover:text-bg transition disabled:opacity-50">
            {promoChecking ? '…' : 'Qo\'llash'}
          </button>
        </div>
        {promoMsg && (
          <p className={`mt-2 font-mono text-[10px] uppercase tracking-[0.18em] ${promoMsg.ok ? 'text-ink' : 'text-ink-3'}`}>{promoMsg.text}</p>
        )}
      </div>

      {selPrice === 0 && (
        <div className="md:col-span-12 border border-ink/40 bg-ink/[0.04] px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 mb-1.5">Diqqat</div>
          <p className="text-ink-2 text-sm leading-relaxed">
            BEPUL tarif — faqat <span className="text-ink">ko'rgazmaga kirish</span>. Agar <span className="text-ink font-semibold">forumda ishtirok etmoqchi</span> bo'lsangiz, <span className="text-ink font-semibold">STANDARD</span> yoki <span className="text-ink font-semibold">VIP</span> tarifini tanlang.
          </p>
        </div>
      )}

      <div className="md:col-span-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6 pt-6 border-t border-rule">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2 mb-1">To'lov summasi</div>
          <div className="flex items-baseline gap-3">
            <span className="font-display font-black text-2xl md:text-3xl tracking-tightest text-ink tabular">{money(effPrice)}</span>
            {promo && promo.final !== promo.original && (
              <span className="font-mono text-sm text-ink-3 line-through tabular">{new Intl.NumberFormat('uz-UZ').format(promo.original)}</span>
            )}
            {promo && <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bg bg-ink px-2 py-0.5">−{promo.percent}%</span>}
          </div>
        </div>
        <button
          type="submit"
          disabled={status.kind === 'sending'}
          className="bg-gold text-bg px-10 py-4 rounded font-mono font-semibold text-[11px] uppercase tracking-[0.18em] hover:bg-gold-bright transition disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
        >
          {status.kind === 'sending' ? 'Yuborilmoqda…' : (effPrice === 0 ? 'Chiptani olish →' : 'To\'lov va chiptaga →')}
        </button>
      </div>
      <p className="md:col-span-12 text-ink-3 text-xs leading-relaxed -mt-2">
        Davom etish bilan <a href="/maxfiylik" className="underline hover:text-ink">maxfiylik siyosatiga</a> roziman. To'lov Payme orqali, chipta — QR'li PDF.
      </p>
      {status.kind === 'error' && (
        <p className="md:col-span-12 font-mono text-[11px] uppercase tracking-[0.18em] text-ink border-l-2 border-ink pl-4 py-2">
          STATUS / ERROR — {status.msg}
        </p>
      )}
    </form>
  );
}
