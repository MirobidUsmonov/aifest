import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { getSpeaker, UPLOADS_DIR } from '../../lib/store';

export const prerender = false;

// Public: serve a speaker's photo from UPLOADS_DIR (files we wrote ourselves).
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
};

export const GET: APIRoute = async ({ url }) => {
  const id = (url.searchParams.get('id') ?? '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(id)) return new Response('Bad id', { status: 400 });
  const s = getSpeaker(id);
  if (!s?.photo || !/^[A-Za-z0-9_]+\.[a-z]+$/.test(s.photo)) return new Response('Not found', { status: 404 });

  let buf: Buffer;
  try { buf = fs.readFileSync(path.join(UPLOADS_DIR, s.photo)); }
  catch { return new Response('Not found', { status: 404 }); }

  const ext = s.photo.split('.').pop()!.toLowerCase();
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
