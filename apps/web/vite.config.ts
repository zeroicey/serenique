import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // 产物文件名加部署代际后缀：部署传播窗口期 custom domain 边缘可能缓存
      // 旧 fallback 响应（4h），换后缀即换全新 URL，绕开污染缓存。
      // 代码改动时 hash 本身会变；此后缀保证即使产物内容不变也能强制换 URL。
      output: {
        entryFileNames: 'assets/[name]-[hash]-v2.js',
        chunkFileNames: 'assets/[name]-[hash]-v2.js',
        assetFileNames: 'assets/[name]-[hash]-v2[extname]',
      },
    },
  },
  server: {
    // dev 下把 /api 代理到 API 服务，避免 CORS；ws: true 支持 /api/ai/ws WebSocket。
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
