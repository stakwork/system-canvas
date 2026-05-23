// Types
export type {
  CanvasColor,
  NodeType,
  Side,
  EndShape,
  EdgeStyle,
  BackgroundStyle,
  CanvasNode,
  CanvasEdge,
  CanvasData,
  CanvasThemeHint,
  CategoryDefinition,
  PresetColor,
  GridConfig,
  RefIndicatorConfig,
  NodeTheme,
  EdgeTheme,
  GroupTheme,
  BreadcrumbTheme,
  LanesTheme,
  CanvasLane,
  CanvasTheme,
  ContextMenuTheme,
  ResolvedNode,
  AnchorPoint,
  ViewportState,
  BreadcrumbEntry,
  BoundingBox,
  ContextMenuEvent,
  CanvasSelection,
  NodeContextMenuItem,
  NodeContextMenuConfig,
  NodeContextMenuMatchContext,
  NodeContextMenuSelectContext,
  NodeUpdate,
  EdgeUpdate,
  NodeMenuOption,
  NodeAction,
  NodeActionGroup,
  // Category slots
  SlotPosition,
  CategorySlots,
  SlotSpec,
  ColorSlot,
  ProgressSlot,
  CountSlot,
  TextSlot,
  LinearGradientFill,
  DotSlot,
  PillSlot,
  IconSlot,
  IconPathSpec,
  IconPathData,
  CustomSlot,
  NodeAccessor,
  SlotContext,
  SlotRect,
  RollupResult,
  EditableField,
  EditableFieldKind,
} from './types.js'

// Themes
export {
  darkTheme,
  midnightTheme,
  lightTheme,
  blueprintTheme,
  warmTheme,
  roadmapTheme,
  resolveTheme,
  resolveColor,
  resolveNode,
} from './themes/index.js'

// Rendering utilities
export {
  computeAnchorPoint,
  inferSide,
  computeEdgePath,
  computeEdgeMidpoint,
  computeBoundingBox,
  fitToBounds,
  fitBoundsIntoRect,
  canvasRectToScreenRect,
  screenToCanvas,
  canvasToScreen,
} from './rendering/index.js'
export type { Rect } from './rendering/index.js'

// Lane helpers
export { findLaneAt, snapToLane, evenLanes, lanesExtent } from './lanes.js'

// Action helpers
export {
  resolveActionPatch,
  buildDefaultColorActions,
  getNodeActions,
  getNodeActionsForNode,
  buildDefaultToolbar,
  filterActionsForNode,
} from './actions.js'

// Context-menu filtering helpers
export {
  matchesContextMenuItem,
  filterContextMenuItems,
} from './contextMenu.js'

// Rollup helpers
export { rollupNodes, rollupNodesDeep } from './rollup.js'

// Category-slot helpers
export {
  computeCategorySlotRegions,
  resolveAccessor,
  resolveAccessorOr,
  getCategorySlots,
  pickRefIndicatorCorner,
  slotEntries,
  computeReflowReservations,
} from './slots.js'
export type { ReflowReservations } from './slots.js'

// Path utilities (for form editor field paths like 'customData.status')
export { getAtPath, setAtPath } from './paths.js'

// Text measurement & wrapping (used by `kind: 'text'` slots; exported for
// consumers writing `kind: 'custom'` body renderers that need the same
// wrap behavior).
export {
  measureTextWidth,
  truncateToWidth,
  wrapText,
  wrapTextWithBreaks,
} from './text.js'

// Canvas helpers
export {
  resolveCanvas,
  buildNodeMap,
  getNodeLabel,
  getGroupChildren,
  validateCanvas,
  generateNodeId,
  getNodeMenuOptions,
  createNodeFromOption,
  addNode,
  updateNode,
  removeNode,
  generateEdgeId,
  addEdge,
  updateEdge,
  removeEdge,
} from './canvas.js'

export { snapToGrid } from './grid.js'
export { matchesSearch, computeNodeFilter } from './search.js'
export type { AlignmentGuide } from './alignment.js'
export { computeAlignmentGuides, alignNodes, distributeNodes } from './alignment.js'

// Convenience theme collection
import { darkTheme as _dark } from './themes/dark.js'
import { midnightTheme as _midnight } from './themes/midnight.js'
import { lightTheme as _light } from './themes/light.js'
import { blueprintTheme as _blueprint } from './themes/blueprint.js'
import { warmTheme as _warm } from './themes/warm.js'
import { roadmapTheme as _roadmap } from './themes/roadmap.js'

export const themes = {
  dark: _dark,
  midnight: _midnight,
  light: _light,
  blueprint: _blueprint,
  warm: _warm,
  roadmap: _roadmap,
} as const
