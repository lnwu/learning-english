# button

2026-08-24，策略：最终状态为官方 base-nova 注册表经 CLI 生成（`shadcn add button --overwrite`）。结论：`@base-ui/react/button` 真原语 + cva variants，消费方仅 asChild→render 改写。

## Changed

- `apps/web/src/components/ui/button.tsx`：由 CLI 以 base-nova 风格整体重建。`ButtonPrimitive.Props & VariantProps`，`render` prop 由原语原生支持，`nativeButton` 透传。variant/size 名（default/outline/secondary/ghost/destructive/link）与项目使用一致。
- 消费方 sweep（`<Button asChild><Link/></Button>` → `<Button render={<Link/>} nativeButton={false}>`，共 10 处）：
  - `src/app/words/page.tsx:316,352,355`
  - `src/app/add-word/page.tsx:99,114,117`
  - `src/app/profile/page.tsx:303,306`
  - `src/app/sentence/page.tsx:68,140`
  - 附带删除 render 为 `<Link>` 时无意义的 `type="button"`。
- `apps/web/package.json`：移除 `@radix-ui/react-slot`。

## Left alone

- `alert.tsx`、`input.tsx`、`frequency-bar.tsx`、`sync-indicator.tsx`、`confirm-dialog.tsx`：不依赖 radix；alert/input 已一并由 CLI 重建为官方版本，其余为项目自有组件。

## Behavior changes

- 视觉：nova 风格（rounded-lg、h-8、destructive 为浅色 tinted 样式 `bg-destructive/10`，非实心红）。用户明确接受「按官方最新写法，不考虑原有外观」。
- `nativeButton={false}`：render 到非 button 元素时不再注入 button 语义。

## Verify by hand

- words/add-word/sentence/profile 顶部导航 Link 按钮 hover 变色、跳转正确（渲染与点击已在冒烟测试确认）。
