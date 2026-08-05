// 环境变量读取。所有 VITE_* 配置集中在这里。
//
// apiBaseUrl 为空时请求走相对路径 /api/*（dev 由 Vite proxy 转发，prod 由反向代理转发）。
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  // 预留：API 加鉴权后在此注入 token。
} as const
