import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app talks to the API. In dev we proxy /api to the Fastify server so
// the frontend and backend share an origin (no CORS friction locally).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
