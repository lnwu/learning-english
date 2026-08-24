# project

2026-08-24，整库迁移：Radix UI → Base UI 版 shadcn（+ toast 换 sonner）。分支 `migrate/radix-to-base-ui`，逐组件提交。

## 依赖变更（apps/web/package.json）

- 移除：`@radix-ui/react-dialog`、`@radix-ui/react-slot`、`@radix-ui/react-toast`
- 新增：`@base-ui/react@1.7.0`、`sonner@2.0.8`
- 全代码库 `grep "radix"` 零残留；`components.json` 的 `style: "new-york"` 保持不变（见 FLAG）。

## 迁移顺序与提交

1. `1454eb6` button → `@base-ui/react/button` + 10 处消费方 asChild→render
2. `70abc2c` dialog → `@base-ui/react/dialog`（Backdrop/Popup + transition 动画）
3. toast → sonner（unstyled 复刻原视觉，调用 API 兼容）
4. radix 依赖卸载 + 报告

## 应用代码 sweep 结果

- `asChild` → `render`：10 处，全部在 Button+Link 场景，已改并补 `nativeButton={false}`。
- 其余 consumer-props 表中的断裂面（onOpenAutoFocus、position、delayDuration 等）在本项目无使用点。
- 受控 `open/onOpenChange` 回调签名兼容，无需改动。

## 验证结果（对比基线，基线全绿）

- `bun x tsc --noEmit` ✅　`bun run test` 63/63 ✅　`bun run lint` ✅　`bun run build` ✅
- 产物 CSS 含 `[data-starting-style]`/`[data-ending-style]` 选择器（裸 data 变体在 Tailwind v4.1.16 下编译正常）。
- 浏览器冒烟测试（临时路由，已删除）：Button 四种 variant 渲染与点击、toast 三变体配色/关闭按钮、ConfirmDialog 打开/Esc 关闭/Cancel/确认回调+toast 联动，全部通过。
- 本地无 Firebase 凭据，冒烟测试用 dummy `.env.local`（测后已删）。

## FLAG（不自动处理）

- `components.json` style 仍为 legacy `"new-york"`：不存在 base-new-york 变体，未来 `shadcn add` 会继续下发 radix 底层组件。后续新组件要么手动按 Base UI 写，要么届时统一切换 style。
- dialog 动画从 keyframe 重述为 transition，插值曲线有细微差异（时长不变 200ms）。
- sonner 的堆叠/滑动交互细节与 radix-toast 有差异。
- 基线外新增依赖版本：`@base-ui/react` 与 sonner 当前均为最新稳定版。

剩余 radix wrapper 数量：**0**。
