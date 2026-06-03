import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Extra hostnames Vite's dev server should accept.
// Set VITE_ALLOWED_HOSTS to a comma-separated list in .env (or via docker-compose).
// Example:  VITE_ALLOWED_HOSTS=familyroots.aipioneerlab.com,staging.example.com
// When the variable is absent, Vite falls back to its default (localhost only).
const allowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
  : undefined;

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
  },
});
