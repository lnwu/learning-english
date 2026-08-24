# dialog

2026-08-24，策略：转换引擎（legacy new-york 风格，改写原语 + 重述动画）。结论：已迁移到 `@base-ui/react/dialog`（Overlay→Backdrop、Content→Popup），消费方零改动。

## Changed

- `apps/web/src/components/ui/dialog.tsx`：
  - 导入改为 `import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"`。
  - `DialogPrimitive.Overlay` → `Backdrop`；`Content` → `Popup`（居中模态，按 Base UI 规范不加 Positioner）。
  - 动画按 class-mapping 规则从 keyframe 重述为 transition：overlay 用 `transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0`；popup 用 `transition-[opacity,transform]` + starting/ending 的 `scale-95 / translate-y-[-48%] / opacity-0`（对应原 zoom-out-95 与 slide-from-top-[48%]）。
  - 类型 `React.ComponentPropsWithoutRef<typeof X>` → `X.Props`；导出名全部保留。残留扫描干净。
  - 卸载时机安全已验证：Base UI `useAnimationsFinished.mjs:40` 通过 `getAnimations()` 等待动画/过渡结束。
- 消费方 `confirm-dialog.tsx`：受控 `open/onOpenChange` 签名与 Base UI 兼容（多出的 `eventDetails` 参数被忽略且类型安全），零改动。

## Left alone

- `src/app/profile/page.tsx` 等 ConfirmDialog 使用方：API 未变，未触碰。

## Behavior changes

- 动画机制从 keyframe（animate-in/out）变为 CSS transition，观感应一致但插值曲线略有差异（均为 200ms）。
- Base UI `onOpenChange(open, eventDetails)` 回调多一个详情参数（现有单参处理器不受影响）。
- modal 默认 true（焦点圈闭 + 滚动锁定），与 radix 默认一致。

## Verify by hand

- profile 页「重置学习记录」确认弹窗：打开动画、背景模糊、Escape 关闭、Cancel/Delete 均正常（已在本地冒烟测试中用临时路由验证过等价场景：开/关/Esc/确认回调均通过）。
