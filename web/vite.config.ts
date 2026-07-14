import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Signet web — Vite + React. The bridge (Phase 1) runs on :8787;
// we proxy /api and /ws to it so the browser talks to the real mesh + chain.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
    },
  },
});