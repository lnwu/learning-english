# toast

2026-08-24，策略：最终状态为官方 base-nova 注册表经 CLI 生成（`shadcn add sonner`）+ 官方 sonner API 封装。结论：sonner 渲染层为官方组件，调用方 API 完全兼容。

## Changed

- `apps/web/src/components/ui/toast.tsx`：删除（radix-toast 实现）。
- `apps/web/src/components/ui/toaster.tsx`：删除（自绘 unstyled 版本）。
- `apps/web/src/components/ui/sonner.tsx`：新增，官方 CLI 生成。用 `next-themes` 的 `useTheme` 做明暗主题、lucide 图标映射 success/error/info/warning、CSS 变量映射到 `--popover/--border/--radius` token。
- `src/components/ui/index.ts`：`./toaster` → `./sonner` 导出。
- `src/app/layout.tsx`：`<Toaster position="bottom-right" duration={5000} richColors />`（richColors 提供 success/error 着色）。
- `src/hooks/useToast.tsx`：重写为官方 sonner API 薄封装——`toast({ title, description, variant })` 签名不变，内部映射 `variant` 到 `sonnerToast.success / .error / 默认`；`action` 参数（全库无调用）与返回值移除。
- 依赖：新增 `sonner`、`next-themes`、`lucide-react`。
- 消费方零改动：`useFirestoreWords.tsx:363` 及 words/add-word/profile 页面的 `toast({ title, variant })` 全部按原样工作。

## Left alone

- 无。radix-toast 相关文件已全部清除。

## Behavior changes

- toast 视觉为 sonner 官方默认 + richColors：success 绿色带对勾、error 红色带 X 图标、图标来自 lucide（随主题）。与原 radix 自绘样式不同，用户接受官方写法。
- `toast()` 不再返回 `{id, dismiss, update}`（无人使用）；`useToast()` hook 移除（原仅旧 toaster 使用）。

## Verify by hand

- 冒烟测试确认：default/success/destructive 三变体右下角渲染、颜色/图标正确、5s 自动消失。
