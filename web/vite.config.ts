import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, '..');
  const env = loadEnv(mode, repoRoot, 'PORT');
  const serverUrl = `http://localhost:${env.PORT ?? 5174}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../src'),
      },
    },
    optimizeDeps: {
      include: ['lucide-react', 'react', 'react-dom', 'react-router-dom'],
    },
    server: {
      port: 5173,
      fs: {
        allow: [repoRoot],
      },
      proxy: {
        '/api': serverUrl,
        '/renders': serverUrl,
      },
    },
  };
});
