import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app talks to the MotionForge server through /api (and downloads
// rendered MP4s from /renders). In dev both are proxied to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5174',
      '/renders': 'http://localhost:5174',
    },
  },
});
