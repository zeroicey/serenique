# Web 端移除顶部导航栏（Navbar 下沉）决策记录

日期: 2026-08-20
适用范围: `apps/web`
前置记录: `.ai/architecture/2026-08-05-web-frontend-architecture.md`

## D-2026-08-20-001 移除全局顶部导航栏，功能操作下沉到页面内

- **背景**：原 Web 布局是「左侧边栏（模块切换）+ 顶部导航栏（每页动态 handle.nav / handle.headerRight）」。
  顶部导航栏承载两种东西：模块标题（闪记/日历/标签…）与功能性操作（新建/置已读/任务组切换/日期栏）。
  问题：(a) 模块需求差异大——日历/习惯依赖导航切换（日期、总览），闪记等模块标题多余显空；
  (b) 功能锁死在顶栏，跨顶栏/页面共享状态不得不用 zustand store（habit-ui / event-ui / task-store），
  逻辑变复杂；(c) 标题占空间、不聚焦内容。
- **决策**：移除 `AppNavbar`（顶部导航栏）与全部路由 handle.nav / handle.headerRight 注册；
  **保留**侧边栏作为全局模块入口（用户明确要求）。各页面功能性操作与子导航一律下沉到页面内部，
  由页面 useState 持有状态，去掉跨组件 store。
- **Why**：
  - 对比「保留顶栏」：顶栏限制了状态调整与页面自治，否决。
  - 对比「随时间删侧边栏」：用户明确保留侧边栏（唯一模块切换入口），只删顶栏。
  - 功能性操作（新建/置已读/任务组切换）不可随导航一并丢弃（会丢功能），故下沉到页面（用户确认推荐项）。
  - 跨组件 zustand（habit-ui/event-ui/task-store）因导航移除而共享面收敛到单一页面，降级为 useState + props。
- **How to apply**：
  - 各功能下沉落点：闪记新建→列表搜索行；闪记新建页返回→页顶 ghost 按钮；日历新建→页顶「新建」按钮；
    习惯日期栏/新建/总览/返回→今天页与总览页各自顶部操作行；任务组切换→任务页顶部；日志置已读→筛选行右侧；
    宁序在线状态点→ChatArea 右上角小圆点。
  - 删除文件：app-navbar、module-title-nav、各 *_nav.tsx、stores/habit-ui.ts、stores/event-ui.ts、task-store.ts。
  - store 保留准绳：`moment-draft`（localStorage 草稿，非跨组件）与 `ai-store`（WS 连接生命周期）继续用 zustand；
    页面内 UI 态一律 useState + props（多一层 props drilling 可接受）。
  - 模块标题全面移除，页面主打内容；welcome 首页模块入口卡片保留。
