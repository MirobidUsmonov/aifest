import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { upsertSpeaker, getSpeaker, deleteSpeaker, reorderSpeaker, listSpeakers, UPLOADS_DIR, type Speaker } from '../../../lib/store';

export const prerender = false;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

function rid() {
  return 'spk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const POST: APIRoute = async ({ request }) => {
  const fd = await request.formData();
  const action = String(fd.get('action') ?? 'save');
  const id = String(fd.get('id') ?? '').trim();

  if (action === 'delete') {
    if (id) deleteSpeaker(id);
    return back();
  }

  if (action === 'up' || action === 'down') {
    if (id) reorderSpeaker(id, action);
    return back();
  }

  const name = String(fd.get('name') ?? '').trim().slice(0, 80);
  const role = String(fd.get('role') ?? '').trim().slice(0, 100);
  const bio = String(fd.get('bio') ?? '').trim().slice(0, 600);
  if (!name) return back('e=name');

  const sid = id || rid();
  const existing = id ? getSpeaker(id) : undefined;
  let photo = existing?.photo;

  const file = fd.get('photo');
  if (file && typeof file === 'object' && 'arrayBuffer' in file && (file as File).size > 0) {
    const f = file as File;
    const ext = EXT[f.type];
    if (!ext) return back('e=type');
    if (f.size > MAX_BYTES) return back('e=size');
    try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch { /* ignore */ }
    // unique filename per upload → public URL changes, busting browser cache
    const fname = `${sid}_${Date.now().toString(36)}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, fname), Buffer.from(await f.arrayBuffer()));
    if (existing?.photo && existing.photo !== fname) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, existing.photo)); } catch { /* ignore */ }
    }
    photo = fname;
  }

  const rec: Speaker = {
    id: sid,
    name,
    role: role || undefined,
    bio,
    photo,
    order: existing?.order ?? listSpeakers().length + 1,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  upsertSpeaker(rec);
  return back('ok=1');
};

function back(q?: string) {
  return new Response(null, { status: 302, headers: { Location: '/admin/speakers' + (q ? '?' + q : '') } });
}
