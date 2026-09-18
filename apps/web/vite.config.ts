import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_TARGET = `http://127.0.0.1:${process.env.API_PORT || 8082}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 5173),
    proxy: {
      // 127.0.0.1 显式 IPv4：localhost 在 Node 17+ 可能解析 ::1 导致 proxy 连接被拒
      '/api': API_TARGET,
      '/ws': { target: API_TARGET, ws: true },
    },
  },
});
