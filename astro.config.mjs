// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://aifest.uz',
  integrations: [react(), tailwind({ applyBaseStyles: false }), sitemap()],
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  prefetch: true,
  // App sits behind Caddy (TLS terminated upstream); Astro sees http on :3010 so
  // its same-origin check would reject our admin form POSTs. Admin routes are
  // protected by a session cookie (see src/middleware.ts) instead.
  security: { checkOrigin: false },
  vite: {
    ssr: {
      noExternal: [
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/postprocessing',
        'detect-gpu',
        'postprocessing',
      ],
    },
    optimizeDeps: {
      include: ['detect-gpu'],
    },
  },
});
