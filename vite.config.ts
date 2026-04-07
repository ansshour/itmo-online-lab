import { defineConfig } from 'vite';

export default defineConfig({
  base: 'itmo-online-lab',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});