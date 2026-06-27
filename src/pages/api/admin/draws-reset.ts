import type { APIRoute } from 'astro';
import { clearDraws } from '../../../lib/store';

export const prerender = false;

// Clear the winner history so everyone becomes eligible again.
export const POST: APIRoute = async () => {
  clearDraws();
  return new Response(null, { status: 302, headers: { Location: '/admin/randomayzer?reset=1' } });
};
