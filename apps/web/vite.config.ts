import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// PWA 配置。注意 manifestFilename 用 manifest.json 而非默认的 manifest.webmanifest：
// Pages functions/[[path]].ts 的扩展名正则只匹配 .{1,8} 字符后缀，.webmanifest 有 11 个
// 字符会掉进 SPA fallback 返回 index.html，导致无法安装；.json 可被正则匹配直出。
const pwaThemeColor = '#0a0a0a' // dark 主题 --background（oklch 0.145 ≈ #0a0a0a）；manifest 单值，index.html 另有双 media meta

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // 表单类应用用 prompt 而非 autoUpdate：后者部署后会强制刷新所有打开的标签页，
      // 正在输入 moment/task/event 的用户会被打断丢数据。prompt 让用户点「刷新」。
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifestFilename: 'manifest.json',
      manifest: {
        name: 'Serenique',
        short_name: 'Serenique',
        description: '个人日记与笔记',
        lang: 'zh-CN',
        theme_color: pwaThemeColor,
        background_color: pwaThemeColor,
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // API 跨域（api.hcyj.xyz），ky 带 credentials 发请求。SW 一律不缓存 API：
        // 日记/任务是私密数据，也不该进 SW 缓存。跨域 + 无 CORS 响应头本就无法缓存，
        // 显式 NetworkOnly 兜底，避免 generateSW 对同源 /api 代理产生意外缓存。
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
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
