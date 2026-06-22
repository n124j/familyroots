import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Minimal Node.js process typing — avoids requiring @types/node.
declare const process: { env: Record<string, string | undefined> };

// Which hostnames the Vite dev server accepts.
//   VITE_ALLOWED_HOSTS=all                           → allow every host (good behind a tunnel)
//   VITE_ALLOWED_HOSTS=familyroots.aipioneerlab.com  → allow that specific host
//   VITE_ALLOWED_HOSTS=a.com,b.com                   → allow multiple hosts
//   unset / empty                                    → Vite default (localhost only)
const _hosts = process.env.VITE_ALLOWED_HOSTS?.trim();
const allowedHosts: true | string[] | undefined =
  _hosts === 'all' ? true
  : _hosts         ? _hosts.split(',').map((h: string) => h.trim()).filter(Boolean)
  :                  undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@pages':    resolve(__dirname, 'src/pages'),
      '@shared':   resolve(__dirname, 'src/shared'),
      '@store':    resolve(__dirname, 'src/store'),
      '@api':      resolve(__dirname, 'src/api'),
      '@features': resolve(__dirname, 'src/features'),
      '@queries':  resolve(__dirname, 'src/queries'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    ...(allowedHosts && { allowedHosts }),
    proxy: {
      '/api/v1': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:7004',
        changeOrigin: true,
      },
    },
  },
});
