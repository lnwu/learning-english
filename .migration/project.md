# project

2026-08-24，整库迁移：Radix UI → Base UI 版 shadcn（+ toast 换 sonner）。分支 `migrate/radix-to-base-ui`，逐组件提交。最终形态为官方 base-nova 注册表经 CLI 重建。

## 依赖变更（apps/web/package.json）

- 移除：`@radix-ui/react-dialog`、`@radix-ui/react-slot`、`@radix-ui/react-toast`
- 新增：`@base-ui/react@1.7.0`、`sonner@2.0.8`、`next-themes@0.4.6`、`lucide-react`
- 全代码库 `grep "radix"` 零残留；`components.json` 的 `style` 已切到 **`base-nova`**。

## 流程

1. 手动迁移 3 个 wrapper 到 `@base-ui/react` + toast 换 sonner（含 10 处 asChild→render sweep），卸载 radix。
2. 遗留项修复（用户确认修 ①+② 后提 PR）：
   - ① `components.json` style `new-york` → `base-nova`（`base-new-york` 不存在；base-nova 为官方默认，与现有观感最接近）。
   - ② dialog 动画改回官方 keyframe 写法（`data-open:animate-in data-closed:animate-out` 等）。
3. 按用户指示「全部用官方最新写法」：`shadcn add button dialog input alert sonner --overwrite` 从 base-nova 注册表整体重建标准组件；项目自有组件（confirm-dialog/frequency-bar/sync-indicator）保留；`useToast`/layout 改为官方 sonner API（richColors）。

## 应用代码 sweep 结果

- `asChild` → `render`：10 处（Button+Link），补 `nativeButton={false}`。
- 其余 consumer-props 断裂面（onOpenAutoFocus、position、delayDuration 等）本项目无使用点。
- 受控 `open/onOpenChange` 回调签名兼容，confirm-dialog 零改动。

## 验证结果（基线全绿）

- `bun x tsc --noEmit` ✅　`bun run test` 63/63 ✅　`bun run lint` ✅　`bun run build` ✅
- 产物 CSS 含 `[data-open]`/`[data-closed]` 选择器（keyframe 动画钩子编译正常）。
- 浏览器冒烟测试（临时路由，已删除）：Button 全 variant、toast 三变体（richColors+图标）、nova 弹窗（内置关闭按钮/Delete 确认/Escape）均通过。
- 本地无 Firebase 凭据，用 dummy `.env.local`（测后已删）。

## FLAG（已解决）

- ~~style 仍为 radix~~ → 已切 `base-nova`，`shadcn add` 今后下发 Base UI 组件。
- ~~dialog 动画曲线差异~~ → 已改官方 keyframe 写法，与注册表一致。
- sonner 交互细节（堆叠/滑动/`--radius` 主题）由 sonner 接管，与原 radix 自绘样式不同——属用户接受的官方视觉，非缺陷。

剩余 radix wrapper 数量：**0**。
