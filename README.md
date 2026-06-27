# AI FEST 2026

O'zbekistondagi eng yirik sun'iy intellekt forumi uchun premium landing + chiptalar tizimi.
**23-iyun 2026 · Toshkent · Azimut Grand Hotel (Bodomzor metro).**

Glassmorphism dizayn — tilla (`#FFCC00`) + tungi ko'k (`#020617`), Hanken Grotesk / Plus Jakarta Sans / JetBrains Mono.

## Stack

- **Astro 5** (SSR, `@astrojs/node` standalone adapter) + **React 19** island'lar
- **Tailwind CSS 3** — palitra `tailwind.config.mjs`, glass yordamchilar `src/styles/global.css`
- **Payme** to'lov + **Telegram bot** orqali QR-PDF chipta yetkazish
- Ma'lumotlar: JSON-fayl store (`src/lib/store.ts`) → `DATA_DIR` (tariflar, spikerlar, buyurtmalar, promo)

## Sahifalar

| Yo'l | Tavsif |
| :--- | :--- |
| `/` | Asosiy landing (hero · manzil · spikerlar · sovg'alar · tariflar · hamkorlar · FAQ · ro'yxat) |
| `/bilet` | Chiptani topish (buyurtma raqami yoki telefon) |
| `/admin` | Boshqaruv paneli (tariflar, spikerlar, buyurtmalar, promo, randomayzer, broadcast) |
| `/rahmat`, `/shartlar`, `/maxfiylik` | Yordamchi sahifalar |

## Kontentni tahrirlash

- **Tariflar / spikerlar** — `/admin` orqali jonli (yoki seed: `src/lib/store.ts` → `DEFAULT_TARIFFS`, `DEFAULT_SPEAKERS`)
- **FAQ** — `src/content/faq.json`
- **Sovg'alar / hamkorlar / hero statistikasi** — `src/pages/index.astro` (yuqoridagi const'lar)

## Buyruqlar

| Buyruq | Vazifa |
| :--- | :--- |
| `npm install` | Bog'liqliklarni o'rnatish |
| `npm run dev` | Dev server — `localhost:4321` |
| `npm run build` | Prod build → `./dist/` |
| `npm run preview` | Build'ni lokal ko'rish |

## Muhit (.env)

`.env.example` ga qarang — `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_ID`, Payme va admin sirlari. `DATA_DIR` — saqlash katalogi (default `./data`).
