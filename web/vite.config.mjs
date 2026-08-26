import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webDir = dirname(fileURLToPath(import.meta.url));

// Frontend lives in ./web; backend (Express) lives in ./src and ./server.js.
export default defineConfig({
  root: webDir,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // In dev, Vite serves the frontend and forwards API/auth calls to Express.
      '/api': 'http://localhost:8080',
      '/auth': 'http://localhost:8080',
      '/logout': 'http://localhost:8080',
    },
  },
  build: {
    outDir: resolve(webDir, 'dist'),
    emptyOutDir: true,
  },
});
