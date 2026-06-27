// Local persistence for orders + promo codes.
// The Partner API has no "list orders" endpoint, so we record every order we
// create. JSON-file store with an in-memory cache (single pm2 process → safe).

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR =
  process.env.DATA_DIR ?? import.meta.env.DATA_DIR ?? path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PROMO_FILE = path.join(DATA_DIR, 'promo.json');
const DRAWS_FILE = path.join(DATA_DIR, 'draws.json');
const TARIFFS_FILE = path.join(DATA_DIR, 'tariffs.json');
const DISCOUNTS_FILE = path.join(DATA_DIR, 'discount-tariffs.json');
const SPEAKERS_FILE = path.join(DATA_DIR, 'speakers.json');
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

export type OrderRecord = {
  id: number;
  order_number: string;
  tariff_key: string;
  tariff_id: number;
  tariff_name: string;
  quantity: number;
  amount: number; // total in so'm
  buyer_name: string;
  buyer_phone: string;
  contact?: string;
  note?: string;
  promo_code?: string;
  status: string; // pending | paid | cancelled | refunded
  payment_status: string; // pending | completed | failed
  payment_url?: string | null;
  is_free: boolean;
  tickets: { ticket_number: string; holder?: string }[];
  created_at: string;
  paid_at?: string | null;
  source?: string; // site | admin
};

export type PromoCode = {
  code: string;
  percent: number; // discount percent 1-100
  tariffs: string[]; // tariff keys it applies to; empty = all
  label?: string;
  max_uses: number; // 0 = unlimited
  used: number;
  active: boolean;
  created_at: string;
};

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
}
function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}
function writeAtomic(file: string, data: unknown) {
  ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export type DrawRecord = {
  ticket_number: string;
  holder: string;
  tariff_key: string;
  phone?: string;
  prize?: string;
  at: string;
};

// ---- in-memory caches ----
let _orders: OrderRecord[] | null = null;
let _promos: PromoCode[] | null = null;
let _draws: DrawRecord[] | null = null;

function orders(): OrderRecord[] {
  if (_orders === null) _orders = readJson<OrderRecord[]>(ORDERS_FILE, []);
  return _orders;
}
function promos(): PromoCode[] {
  if (_promos === null) _promos = readJson<PromoCode[]>(PROMO_FILE, []);
  return _promos;
}
function draws(): DrawRecord[] {
  if (_draws === null) _draws = readJson<DrawRecord[]>(DRAWS_FILE, []);
  return _draws;
}
function persistOrders() { writeAtomic(ORDERS_FILE, _orders ?? []); }
function persistPromos() { writeAtomic(PROMO_FILE, _promos ?? []); }
function persistDraws() { writeAtomic(DRAWS_FILE, _draws ?? []); }

// ---------- DRAWS (randomayzer) ----------
export function listDraws(): DrawRecord[] {
  return [...draws()].sort((a, b) => (a.at < b.at ? 1 : -1));
}
export function addDraw(d: DrawRecord) {
  draws().unshift(d);
  persistDraws();
}
export function clearDraws() {
  _draws = [];
  persistDraws();
}
// every paid ticket eligible for the draw, with tariff + holder
export function eligibleTickets(): { ticket_number: string; holder: string; tariff_key: string; phone: string }[] {
  const out: { ticket_number: string; holder: string; tariff_key: string; phone: string }[] = [];
  for (const o of orders()) {
    if (o.status !== 'paid') continue;
    for (const t of o.tickets ?? []) {
      out.push({ ticket_number: t.ticket_number, holder: t.holder || o.buyer_name, tariff_key: o.tariff_key, phone: o.buyer_phone });
    }
  }
  return out;
}

// ---------- ORDERS ----------
export function listOrders(): OrderRecord[] {
  return [...orders()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
export function getOrderByNumber(orderNumber: string): OrderRecord | undefined {
  return orders().find((o) => o.order_number === orderNumber);
}
// case-insensitive lookup for the public "find my ticket" page
export function findOrderByNumber(orderNumber: string): OrderRecord | undefined {
  const q = orderNumber.trim().toLowerCase();
  if (!q) return undefined;
  return orders().find((o) => o.order_number.toLowerCase() === q);
}
// all orders for a normalized phone (+998XXXXXXXXX), newest first
export function getOrdersByPhone(phone: string): OrderRecord[] {
  return orders()
    .filter((o) => o.buyer_phone === phone)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
export function upsertOrder(rec: OrderRecord) {
  const arr = orders();
  const i = arr.findIndex((o) => o.order_number === rec.order_number);
  if (i >= 0) arr[i] = { ...arr[i], ...rec };
  else arr.unshift(rec);
  persistOrders();
}
export function patchOrder(orderNumber: string, patch: Partial<OrderRecord>) {
  const arr = orders();
  const i = arr.findIndex((o) => o.order_number === orderNumber);
  if (i >= 0) { arr[i] = { ...arr[i], ...patch }; persistOrders(); return arr[i]; }
  return undefined;
}

// ---------- PROMO ----------
export function listPromos(): PromoCode[] {
  return [...promos()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
export function getPromo(code: string): PromoCode | undefined {
  return promos().find((p) => p.code.toLowerCase() === code.toLowerCase());
}
export function upsertPromo(p: PromoCode) {
  const arr = promos();
  const i = arr.findIndex((x) => x.code.toLowerCase() === p.code.toLowerCase());
  if (i >= 0) arr[i] = { ...arr[i], ...p };
  else arr.unshift(p);
  persistPromos();
}
export function deletePromo(code: string) {
  _promos = promos().filter((p) => p.code.toLowerCase() !== code.toLowerCase());
  persistPromos();
}
export function incPromoUse(code: string) {
  const p = getPromo(code);
  if (p) { p.used += 1; persistPromos(); }
}

// ---------- DISCOUNT TARIFF CACHE (Partner API tariff ids for discounted prices) ----------
let _disc: Record<string, number> | null = null;
function discMap(): Record<string, number> {
  if (_disc === null) _disc = readJson<Record<string, number>>(DISCOUNTS_FILE, {});
  return _disc;
}
export function getDiscountTariffId(cacheKey: string): number | undefined {
  return discMap()[cacheKey];
}
export function setDiscountTariffId(cacheKey: string, id: number) {
  discMap()[cacheKey] = id;
  writeAtomic(DISCOUNTS_FILE, _disc);
}

// ---------- TARIFFS (editable price + perks; site source of truth) ----------
export type TariffCfg = {
  key: string; id: number; label: string; subtitle: string; popular: boolean; price: number; perks: string[];
};
const DEFAULT_TARIFFS: TariffCfg[] = [
  { key: 'free', id: 111, label: "KO'RGAZMA", subtitle: 'Tashrif', popular: false, price: 0,
    perks: ['Ko\'rgazmaga tashrif buyurish', 'Network qilish imkoniyati'] },
  { key: 'standard', id: 112, label: 'KONFERENSIYA', subtitle: 'Eng mashhur', popular: true, price: 200000,
    perks: ['Maxsus 500 kishilik konferensiya zaliga kirish', "Barcha ma'ruzalar", "2ta Xitoyga yo'llanma va 20ta noutbuk sovg'a tanlovida ishtirok etish", 'Foto hisobot'] },
  { key: 'vip', id: 113, label: 'VIP', subtitle: 'Premium tajriba', popular: false, price: 800000,
    perks: ['2, 3, 4-qatorlardan joy', "Maxsus VIP sovg'a", "2ta Xitoyga yo'llanma va 20ta noutbuk sovg'a tanlovida ishtirok", 'Spikerlar bilan uchrashuv', 'Foto va video hisobot', 'Networking imkoniyati'] },
];
let _tariffs: TariffCfg[] | null = null;
function tariffsCfg(): TariffCfg[] {
  if (_tariffs === null) {
    const saved = readJson<TariffCfg[] | null>(TARIFFS_FILE, null);
    _tariffs = (saved && Array.isArray(saved) && saved.length) ? saved : DEFAULT_TARIFFS.map((t) => ({ ...t, perks: [...t.perks] }));
  }
  return _tariffs;
}
export function getTariffs(): TariffCfg[] {
  return tariffsCfg().map((t) => ({ ...t, perks: [...t.perks] }));
}
export function getTariff(key: string): TariffCfg | undefined {
  const t = tariffsCfg().find((x) => x.key === key);
  return t ? { ...t, perks: [...t.perks] } : undefined;
}
export function updateTariff(key: string, patch: { price?: number; perks?: string[]; label?: string; subtitle?: string }): TariffCfg | undefined {
  const t = tariffsCfg().find((x) => x.key === key);
  if (!t) return undefined;
  if (typeof patch.price === 'number' && patch.price >= 0) t.price = Math.round(patch.price);
  if (Array.isArray(patch.perks)) t.perks = patch.perks.map((s) => String(s).trim()).filter(Boolean);
  if (patch.label) t.label = patch.label.slice(0, 40);
  if (patch.subtitle) t.subtitle = patch.subtitle.slice(0, 60);
  writeAtomic(TARIFFS_FILE, _tariffs);
  return { ...t, perks: [...t.perks] };
}

// ---------- SPEAKERS (admin-managed; photos in UPLOADS_DIR) ----------
export type Speaker = {
  id: string;
  name: string;       // ism familiya
  role?: string;      // lavozim / kompaniya (ixtiyoriy)
  bio: string;        // qisqacha ma'lumot
  photo?: string;     // filename inside UPLOADS_DIR
  order: number;
  created_at: string;
};
// Seed speakers so the section + nav render out of the box; once an admin adds
// the first real speaker, SPEAKERS_FILE takes over and these defaults disappear.
const DEFAULT_SPEAKERS: Speaker[] = [
  { id: 'sp-1', name: 'Eldor Ibrohimov', role: 'AI Research Lead', bio: '', order: 1, created_at: '2026-01-01T00:00:00.000Z' },
  { id: 'sp-2', name: 'Aziza Alimova', role: 'Data Science Director', bio: '', order: 2, created_at: '2026-01-01T00:00:01.000Z' },
  { id: 'sp-3', name: 'Diyorbek Isroilov', role: 'Uzum Market — BTP rivojlantirish menejeri', bio: '', order: 3, created_at: '2026-01-01T00:00:02.000Z' },
  { id: 'sp-4', name: 'Nazokat Rashidova', role: 'Freedom Pay Uzbekistan — bosh direktor', bio: '', order: 4, created_at: '2026-01-01T00:00:03.000Z' },
  { id: 'sp-5', name: 'Otabek Saparboev', role: 'МойСклад — mijozlar bilan ishlash menejeri', bio: '', order: 5, created_at: '2026-01-01T00:00:04.000Z' },
  { id: 'sp-6', name: 'Diyor Ozodov', role: "Uzum Market — hamkorlarni jalb qilish bo'limi boshlig'i", bio: '', order: 6, created_at: '2026-01-01T00:00:05.000Z' },
  { id: 'sp-7', name: 'Elena Tabunshikova', role: 'Wildberries — hamkorlarni jalb qilish menejeri', bio: '', order: 7, created_at: '2026-01-01T00:00:06.000Z' },
  { id: 'sp-8', name: 'Iroda Usmanova', role: 'Wildberries — DBS modelini rivojlantirish menejeri', bio: '', order: 8, created_at: '2026-01-01T00:00:07.000Z' },
  { id: 'sp-9', name: 'Muslimiddin Makhsutaliev', role: 'Market Plus — asoschisi', bio: '', order: 9, created_at: '2026-01-01T00:00:08.000Z' },
  { id: 'sp-10', name: 'Azizbek Vafoyev', role: 'Biznes Fabrika — asoschisi', bio: '', order: 10, created_at: '2026-01-01T00:00:09.000Z' },
  { id: 'sp-11', name: 'Sherzod Mirxodjayev', role: 'ProeCom Ecosystems — asoschisi', bio: '', order: 11, created_at: '2026-01-01T00:00:10.000Z' },
  { id: 'sp-12', name: 'Xosiyat Akramovna', role: 'XABS Biznes Akademiyasi — asoschisi', bio: '', order: 12, created_at: '2026-01-01T00:00:11.000Z' },
  { id: 'sp-13', name: 'Dono Alixanova', role: 'FAYA brendi — asoschisi', bio: '', order: 13, created_at: '2026-01-01T00:00:12.000Z' },
  { id: 'sp-14', name: 'Dilbar Ikram', role: "Uzum'da Top seller", bio: '', order: 14, created_at: '2026-01-01T00:00:13.000Z' },
  { id: 'sp-15', name: 'Aleksandr Suxov', role: 'ScaleUp agentligi — asoschisi', bio: '', order: 15, created_at: '2026-01-01T00:00:14.000Z' },
  { id: 'sp-16', name: 'Rigina Gafurova', role: 'Uzum Market eksperti', bio: '', order: 16, created_at: '2026-01-01T00:00:15.000Z' },
];
let _speakers: Speaker[] | null = null;
function speakers(): Speaker[] {
  if (_speakers === null) {
    const saved = readJson<Speaker[] | null>(SPEAKERS_FILE, null);
    _speakers = (saved && Array.isArray(saved) && saved.length)
      ? saved
      : DEFAULT_SPEAKERS.map((s) => ({ ...s }));
  }
  return _speakers;
}
function persistSpeakers() { writeAtomic(SPEAKERS_FILE, _speakers ?? []); }
export function listSpeakers(): Speaker[] {
  return [...speakers()].sort((a, b) => (a.order - b.order) || (a.created_at < b.created_at ? -1 : 1));
}
export function getSpeaker(id: string): Speaker | undefined {
  return speakers().find((s) => s.id === id);
}
export function upsertSpeaker(s: Speaker) {
  const arr = speakers();
  const i = arr.findIndex((x) => x.id === s.id);
  if (i >= 0) arr[i] = { ...arr[i], ...s };
  else arr.push(s);
  persistSpeakers();
}
export function deleteSpeaker(id: string) {
  const s = getSpeaker(id);
  if (s?.photo) { try { fs.unlinkSync(path.join(UPLOADS_DIR, s.photo)); } catch { /* ignore */ } }
  _speakers = speakers().filter((x) => x.id !== id);
  persistSpeakers();
}
// move a speaker up/down in the display order (swap with its neighbour, then renumber)
export function reorderSpeaker(id: string, dir: 'up' | 'down') {
  const sorted = [...speakers()].sort((a, b) => (a.order - b.order) || (a.created_at < b.created_at ? -1 : 1));
  const i = sorted.findIndex((s) => s.id === id);
  if (i < 0) return;
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= sorted.length) return;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  sorted.forEach((s, idx) => { s.order = idx + 1; });
  persistSpeakers();
}

// ---------- BOT SUBSCRIBERS (chat_ids captured from bot interactions) ----------
export type Subscriber = {
  chat_id: number;
  name?: string;
  username?: string;
  joined_at: string;
  active: boolean;
};
let _subs: Subscriber[] | null = null;
function subs(): Subscriber[] {
  if (_subs === null) _subs = readJson<Subscriber[]>(SUBSCRIBERS_FILE, []);
  return _subs;
}
function persistSubs() { writeAtomic(SUBSCRIBERS_FILE, _subs ?? []); }
export function addSubscriber(s: { chat_id: number; name?: string; username?: string }) {
  if (!s.chat_id) return;
  const arr = subs();
  const i = arr.findIndex((x) => x.chat_id === s.chat_id);
  if (i >= 0) {
    if (s.name) arr[i].name = s.name;
    if (s.username) arr[i].username = s.username;
    arr[i].active = true;
  } else {
    arr.push({ chat_id: s.chat_id, name: s.name, username: s.username, joined_at: new Date().toISOString(), active: true });
  }
  persistSubs();
}
export function listSubscribers(): Subscriber[] { return [...subs()]; }
export function countSubscribers(): number { return subs().filter((x) => x.active).length; }
export function deactivateSubscriber(chat_id: number) {
  const s = subs().find((x) => x.chat_id === chat_id);
  if (s && s.active) { s.active = false; persistSubs(); }
}

// ---------- STATS ----------
export function stats() {
  const all = orders();
  const paid = all.filter((o) => o.status === 'paid');
  const revenue = paid.reduce((s, o) => s + (o.amount || 0), 0);
  const ticketsSold = paid.reduce((s, o) => s + (o.tickets?.length || o.quantity || 0), 0);
  const byTariff: Record<string, { orders: number; paid: number; revenue: number; tickets: number }> = {};
  for (const o of all) {
    const k = o.tariff_key || 'other';
    byTariff[k] ??= { orders: 0, paid: 0, revenue: 0, tickets: 0 };
    byTariff[k].orders += 1;
    if (o.status === 'paid') {
      byTariff[k].paid += 1;
      byTariff[k].revenue += o.amount || 0;
      byTariff[k].tickets += o.tickets?.length || o.quantity || 0;
    }
  }
  return {
    total_orders: all.length,
    paid_orders: paid.length,
    pending_orders: all.filter((o) => o.status === 'pending').length,
    revenue,
    tickets_sold: ticketsSold,
    by_tariff: byTariff,
  };
}
