/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  theme: {
    extend: {
      colors: {
        // AIFEST — gold on midnight, glassmorphism
        bg: '#020617', // midnight (bg-midnight)
        'bg-soft': '#0a1224',
        ink: '#f6f1e7', // warm near-white — body + headings
        paper: '#f4f1ea',
        'ink-2': 'rgba(246,241,231,0.64)',
        'ink-3': 'rgba(246,241,231,0.40)',
        rule: 'rgba(255,255,255,0.10)', // glass hairline
        'rule-gold': 'rgba(255,204,0,0.34)',
        'rule-ink': 'rgba(0,0,0,0.14)',
        // gold accents
        gold: '#FFCC00', // accent-gold-bright
        'gold-bright': '#FFD700',
        'gold-deep': '#b8862b',
        glass: 'rgba(255,255,255,0.05)',
        stamp: '#0a0a0a',
      },
      fontFamily: {
        display: ['Hanken Grotesk', 'Arial', 'sans-serif'],
        headline: ['Hanken Grotesk', 'Arial', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.05em',
      },
      boxShadow: {
        glow: '0 0 30px rgba(255,204,0,0.30)',
        'glow-lg': '0 0 50px rgba(255,204,0,0.45)',
      },
    },
  },
};
