// Main component
export { SystemCanvas } from './components/SystemCanvas.js'
export type {
  SystemCanvasProps,
  SystemCanvasHandle,
} from './components/SystemCanvas.js'

// Individual components (for custom composition)
export { Viewport, type ViewportHandle } from './components/Viewport.js'
export { NodeRenderer } from './components/NodeRenderer.js'
export { EdgeRenderer } from './components/EdgeRenderer.js'
export { Breadcrumbs } from './components/Breadcrumbs.js'
export { TextNode } from './components/TextNode.js'
export { FileNode } from './components/FileNode.js'
export { LinkNode } from './components/LinkNode.js'
export { GroupNode } from './components/GroupNode.js'
export { NodeIcon } from './components/NodeIcon.js'
export { RefIndicator } from './components/RefIndicator.js'
export { NodeEditor } from './components/NodeEditor.js'
export { EdgeLabelEditor } from './components/EdgeLabelEditor.js'
export { ConnectionHandles } from './components/ConnectionHandles.js'
export { PendingEdgeRenderer } from './components/PendingEdgeRenderer.js'
export { AddNodeButton } from './components/AddNodeButton.js'
export type { AddNodeButtonRenderProps } from './components/AddNodeButton.js'
export { NodeToolbar } from './components/NodeToolbar.js'
export type { NodeToolbarRenderProps } from './components/NodeToolbar.js'
export { LanesBackground } from './components/LanesBackground.js'
export { LaneHeaders } from './components/LaneHeaders.js'
export { ResizeHandles } from './components/ResizeHandles.js'
export { RevealsLayer } from './components/RevealsLayer.js'

// Primitives — low-level building blocks used internally by the slot
// renderer and re-exported for `kind: 'custom'` slot implementations.
// Also available via the `system-canvas-react/primitives` secondary entry.
export * from './primitives/index.js'

// Hooks
export { useViewport } from './hooks/useViewport.js'
export { useNavigation } from './hooks/useNavigation.js'
export { useCanvasInteraction } from './hooks/useCanvasInteraction.js'
export { useNodeDrag } from './hooks/useNodeDrag.js'
export { useNodeResize } from './hooks/useNodeResize.js'
export type { ResizeCorner, ResizeOverride } from './hooks/useNodeResize.js'
export { useEdgeCreate } from './hooks/useEdgeCreate.js'
export type { PendingEdgeState } from './hooks/useEdgeCreate.js'
export { useMultiSelect } from './hooks/useMultiSelect.js'
export type { MarqueeRect } from './hooks/useMultiSelect.js'
export { useMultiSelectClipboard } from './hooks/useMultiSelectClipboard.js'
export { useCommandHistory } from './hooks/useCommandHistory.js'
export type { CanvasCommand } from './hooks/useCommandHistory.js'
export { useAlignmentGuides } from './hooks/useAlignmentGuides.js'
export { AlignmentGuidesLayer } from './components/AlignmentGuidesLayer.js'
export type { AlignDirection } from './components/NodeToolbar.js'

// Re-export everything from core for convenience
export * from 'system-canvas'
