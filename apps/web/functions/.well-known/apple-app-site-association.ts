// Pages Functions：为 Apple App Site Association（passkey webcredentials 关联）
// 提供 .well-known 路径。必须用 Function 而非静态文件——_redirects 的 SPA
// 兜底（/* /index.html 200）会拦截静态资产，而 Functions 优先于 _redirects。
export const onRequestGet = () =>
  new Response(
    JSON.stringify({
      webcredentials: {
        apps: ["ZWYHWSH3RJ.com.zeroicey.serenique"],
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
