# toast

2026-08-24，策略：sonner 替换（用户选定方案；Base UI 无 Toast 原语，`@radix-ui/react-toast` 已停维护）。结论：渲染层换 sonner（unstyled 模式复刻原视觉），调用方 API 完全兼容。

## Changed

- `apps/web/src/components/ui/toast.tsx`：删除（radix-toast 实现）。
- `apps/web/src/components/ui/toaster.tsx`：改为 sonner `<Toaster position="bottom-right" visibleToasts={3} duration={5000}>` + `unstyled: true` 全局基础样式（对应原 ToastViewport 布局与 TOAST_LIMIT=3、TOAST_REMOVE_DELAY=5000）。
- `apps/web/src/hooks/useToast.ts` → `useToast.tsx`：
  - 重写为 sonner 薄封装；`toast({ title, description, variant, action })` 签名不变，default/success/destructive 三种 variant 的配色逐字保留。
  - 关闭按钮从 radix `ToastClose` 改为内容内联 X 按钮（hover 显现，同原样式），调用 `sonnerToast.dismiss(id)`。
  - 返回值由 `{ id, dismiss, update }` 缩减为 `{ id, dismiss }`——`update()` 在全代码库无调用点（已 grep 验证）。
  - 移除 `useToast()` hook 与内置 reducer 状态机（唯一使用方是旧 toaster.tsx，已随迁移删除）。
- `src/hooks/index.ts`、`src/components/ui/index.ts`：移除 `useToast`/`toast.tsx` 导出。
- 消费方零改动：`useFirestoreWords.tsx:363` 及 words/add-word/profile 页面的全部 `toast({ title, variant })` 调用按原样工作。

## Left alone

- 无。radix-toast 相关文件已全部清除。

## Behavior changes

- 堆叠/滑动手势由 sonner 接管：swipe 方向、退出动画曲线与 radix 版略有差异；位置移动端为顶部居中→桌面右下角（sonner 自适应，接近原 viewport 的 sm 断点行为）。
- `toast().update()` 不再存在（原本就无人调用）。
- `useToast()` hook 已删除（原本只被旧 toaster 使用）；如外部代码依赖会编译期报错。

## Verify by hand

- 触发任一同步失败/添加重复单词路径，确认 toast 出现在右下角、5s 自动消失、hover 出现关闭按钮、success/destructive 配色正确（已在本地冒烟测试中用临时路由验证三变体渲染与手动关闭均通过）。
