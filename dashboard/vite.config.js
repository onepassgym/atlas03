import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/dashboard/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // VITE_API_URL can be set in .env.local for Docker-in-Docker scenarios.
        // Defaults to localhost:8747 for local development.
        target: process.env.VITE_API_URL || 'http://localhost:8747',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
