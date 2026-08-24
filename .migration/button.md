# button

2026-08-24，策略：转换引擎（legacy new-york 风格无 base 对应变体，在自有文件上改写原语、保留类名）。结论：已迁移到 `@base-ui/react/button` 真原语，外观与 API（variant/size）不变。

## Changed

- `apps/web/src/components/ui/button.tsx`：`Slot`/`asChild` 手写多态改为 `@base-ui/react/button` 的 `ButtonPrimitive`；props 类型改为 `React.ComponentProps<typeof ButtonPrimitive>`（`asChild` → `render`）；cva variants 与全部类名逐字保留。残留扫描 `grep -n "radix-ui\|@radix-ui"` 干净。
- 消费方 sweep（`<Button asChild><Link/></Button>` → `<Button render={<Link/>} nativeButton={false}>`，共 10 处）：
  - `src/app/words/page.tsx:316,352,355`
  - `src/app/add-word/page.tsx:99,114,117`
  - `src/app/profile/page.tsx:303,306`
  - `src/app/sentence/page.tsx:68,140`
  - 附带删除了 render 为 `<Link>` 时无意义的 `type="button"`（radix Slot 会把它透传到 `<a>` 上，Base UI 路径下直接不再传递）。
- `apps/web/package.json`：移除 `@radix-ui/react-slot`。

## Left alone

- `alert.tsx`、`input.tsx`、`frequency-bar.tsx`、`sync-indicator.tsx`、`confirm-dialog.tsx`：不依赖 radix，未触碰。

## Behavior changes

- `nativeButton={false}`：render 到 `<Link>`（非原生 button）时 Base UI 不再注入 button 专属语义（如默认 `type="button"`），与 radix Slot 行为一致或更正确。
- 无其他行为差异；disabled 处理由原语接管。

## Verify by hand

- words/add-word/sentence/profile 四个页面的顶部导航 Link 按钮：hover 变色、点击跳转正确。
- 表单内的提交按钮在输入为空时可点击但禁用态样式正常。
