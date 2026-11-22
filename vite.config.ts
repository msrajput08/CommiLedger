import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { allowedHosts: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.{ts,tsx}'], environment: 'node' },
});
