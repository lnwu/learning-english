# dialog

2026-08-24，策略：最终状态为官方 base-nova 注册表经 CLI 生成（`shadcn add dialog --overwrite`）。结论：`@base-ui/react/dialog`，动画为官方 keyframe 写法，消费方零改动。

## Changed

- `apps/web/src/components/ui/dialog.tsx`：由 CLI 以 base-nova 风格整体重建。
  - Overlay→`Backdrop`、Content→`Popup`（居中模态，无 Positioner）。
  - 动画为官方 keyframe 写法：`data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95`（Base UI 经 `getAnimations()` 等待动画结束再卸载）。
  - DialogContent 内置关闭 X 按钮（`showCloseButton` 开关），DialogFooter 新样式（`-mx-4 -mb-4 border-t bg-muted/50`）。
  - 使用 `lucide-react` 的 `XIcon`（已装依赖）。
- 消费方 `confirm-dialog.tsx`：受控 `open/onOpenChange` 签名与 Base UI 兼容，零改动；自动获得内置关闭按钮。

## Left alone

- 其余使用 ConfirmDialog 的页面：API 未变。

## Behavior changes

- 视觉：nova 风格（rounded-xl、ring-1、p-4、sm:max-w-sm、footer 灰底分隔条）。用户明确接受官方写法。
- DialogContent 默认多一个右上角 X 关闭按钮（原实现无）。

## Verify by hand

- 冒烟测试确认：打开（含动画）、Delete 确认关闭并触发 toast、内置 Close 按钮、Escape 关闭均正常。
