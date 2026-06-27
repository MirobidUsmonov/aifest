import { useState, useEffect } from 'react';

const TARGET = new Date('2026-06-23T10:00:00+05:00').getTime();

export default function Countdown() {
  const [t, setT] = useState({ d: 0, h: 0, m: 0, s: 0 });
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, TARGET - Date.now());
      setT({
        d: Math.floor(diff / 86400000),
        h: Math.floor((diff % 86400000) / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    <div className="border-t border-b border-rule py-6 flex items-baseline flex-wrap gap-x-8 gap-y-3 font-display font-black tracking-tightest text-gold tabular-nums">
      <span className="text-[10px] md:text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-ink-2 mr-2">T-minus</span>
      <span className="text-3xl md:text-5xl">{pad(t.d, 3)}<span className="text-ink-3 mx-2 text-xl md:text-3xl">:</span></span>
      <span className="text-3xl md:text-5xl">{pad(t.h)}<span className="text-ink-3 mx-2 text-xl md:text-3xl">:</span></span>
      <span className="text-3xl md:text-5xl">{pad(t.m)}<span className="text-ink-3 mx-2 text-xl md:text-3xl">:</span></span>
      <span className="text-3xl md:text-5xl">{pad(t.s)}</span>
      <span className="text-[10px] md:text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-ink-3 ml-auto">KUN · SOAT · DAQ · SON</span>
    </div>
  );
}
