import React, {
  useMemo,
  useRef,
  useCallback,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react'
import type {
  BreadcrumbEntry,
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasSelection,
  CanvasTheme,
  EdgeStyle,
  ViewportState,
  ContextMenuEvent,
  NodeContextMenuConfig,
  ResolvedNode,
  NodeUpdate,
  EdgeUpdate,
  NodeMenuOption,
} from 'system-canvas'
import {
  resolveTheme,
  resolveCanvas,
  buildNodeMap,
  darkTheme,
  themes,
  getNodeMenuOptions,
  createNodeFromOption,
  filterContextMenuItems,
  screenToCanvas,
  snapToLane,
  alignNodes,
  distributeNodes,
} from 'system-canvas'
import type { AlignmentGuide } from 'system-canvas'
import { useNavigation } from '../hooks/useNavigation.js'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js'
import { useCanvasInteraction } from '../hooks/useCanvasInteraction.js'
import { useNodeDrag } from '../hooks/useNodeDrag.js'
import { useNodeResize } from '../hooks/useNodeResize.js'
import { useEdgeCreate } from '../hooks/useEdgeCreate.js'
import { useMultiSelect } from '../hooks/useMultiSelect.js'
import { useMultiSelectClipboard } from '../hooks/useMultiSelectClipboard.js'
import { useCommandHistory } from '../hooks/useCommandHistory.js'
import {
  useZoomNavigation,
  type ParentFrame,
  type ZoomNavigationConfig,
} from '../hooks/useZoomNavigation.js'
import { Viewport, type ViewportHandle } from './Viewport.js'
import { Breadcrumbs } from './Breadcrumbs.js'
import { AddNodeButton, type AddNodeButtonRenderProps } from './AddNodeButton.js'
import { LaneHeaders } from './LaneHeaders.js'
import { NodeToolbar, type NodeToolbarRenderProps, type AlignDirection } from './NodeToolbar.js'
import { useAlignmentGuides } from '../hooks/useAlignmentGuides.js'
import {
  NodeContextMenuOverlay,
  type NodeContextMenuOverlayState,
} from './NodeContextMenuOverlay.js'

export interface SystemCanvasProps {
  /** Canvas data to render */
  canvas: CanvasData

  /** Resolve a ref string to canvas data (for navigation) */
  onResolveCanvas?: (ref: string) => Promise<CanvasData>

  /**
   * Synchronous map from ref to CanvasData. Required for `editable` mode so
   * the library can observe consumer-side edits to sub-canvases.
   */
  canvases?: Record<string, CanvasData>

  /** Root label for breadcrumbs (default: "Home") */
  rootLabel?: string

  /** Called when navigation occurs */
  onNavigate?: (ref: string) => void

  /** Called when a breadcrumb is clicked */
  onBreadcrumbClick?: (index: number) => void

  /**
   * Called whenever the breadcrumb trail changes — drill-in, breadcrumb
   * click, programmatic `zoomIntoNode`, or `navigateBack` / `navigateToRoot`
   * via the imperative handle. Receives the full trail starting with the
   * root entry (no `ref`), so consumers can render their own breadcrumb UI
   * or thread the trail into other surfaces (e.g. a chat overlay that
   * tells an AI agent which canvas the user is on by name).
   *
   * Fires on the initial render with the root-only trail so subscribers
   * always see at least one event without waiting for navigation.
   */
  onBreadcrumbsChange?: (breadcrumbs: BreadcrumbEntry[]) => void

  // --- Interaction callbacks ---
  onNodeClick?: (node: CanvasNode) => void
  onNodeDoubleClick?: (node: CanvasNode) => void
  onEdgeClick?: (edge: CanvasEdge) => void
  onEdgeDoubleClick?: (edge: CanvasEdge) => void
  onContextMenu?: (event: ContextMenuEvent) => void

  /**
   * Fires whenever the library's internal selection state changes.
   *
   * The library tracks at most one selected entity at a time — a node
   * OR an edge OR nothing. Use this single callback in preference to
   * inferring deselection from `onNodeClick` / `onEdgeClick` / nav
   * events: those fire on activation only, while `onSelectionChange`
   * fires on every actual change including deactivation. The covered
   * paths today:
   *
   *   - User clicks a node               → `{ kind: 'node', node, canvasRef }`
   *   - User clicks an edge              → `{ kind: 'edge', edge, canvasRef }`
   *   - User clicks the canvas background → `null`
   *   - User presses Escape              → `null`
   *   - User presses Delete/Backspace    → `null` (after the delete callback)
   *   - User navigates to another canvas → `null`
   *   - User toggles `editable` off      → `null`
   *   - Selected entity disappears from the canvas data → `null`
   *
   * Atomic: when one click swaps the selection (e.g. node → edge),
   * the callback fires once with the final state, never with an
   * intermediate `null`. Selection is editable-only — non-editable
   * canvases never select anything, so this callback emits at most
   * a trailing `null` when `editable` flips off.
   */
  onSelectionChange?: (selection: CanvasSelection) => void

  /**
   * Declarative right-click menu for nodes. When provided, the library
   * renders a small floating menu at the right-click position with the
   * subset of items that match the right-clicked node (per each item's
   * `match` predicate). On selection, `config.onSelect` fires with the
   * item id, the node, and a context that includes the canvas ref and
   * the original screen position.
   *
   * Coexists with `onContextMenu` — both fire on the same right-click,
   * so consumers can mix declarative items (the common case) with
   * imperative behavior (the escape hatch).
   *
   * Without this prop, no library-rendered menu appears. Right-clicks
   * still suppress the browser default and forward through `onContextMenu`.
   */
  nodeContextMenu?: NodeContextMenuConfig

  // --- Editing ---
  /** When true, the canvas becomes editable (add / edit / move / delete). */
  editable?: boolean
  onNodeAdd?: (node: CanvasNode, canvasRef: string | undefined) => void
  onNodeUpdate?: (
    nodeId: string,
    patch: NodeUpdate,
    canvasRef: string | undefined
  ) => void
  /**
   * Batched node-update callback. When provided, wins over
   * `onNodeUpdate` for drag commits — fires **once per drag-end** with
   * every moved node, even for a group drag carrying many children.
   *
   * The motivating problem: consumers that mirror React state into a
   * ref (the common `someRef.current = state` via `useEffect` pattern,
   * needed when callbacks must read the latest state synchronously)
   * cannot observe per-call mutations between synchronous calls,
   * because the `useEffect` mirror has not yet run. The library used
   * to fire `onNodeUpdate` once per moved node in a synchronous loop;
   * such a consumer would read the same stale state for every call,
   * each `setState` would overwrite the previous one, and only the
   * last node in the iteration would actually move. Visible bug:
   * dragging a group of N nodes leaves N-1 nodes snapping back to
   * their pre-drag positions on release.
   *
   * Wire this callback if your `onNodeUpdate` consumer reads state
   * through a `useEffect`-mirrored ref. If you can read state
   * synchronously (e.g. via `useReducer` or a Zustand store) the
   * fallback per-node loop is fine and you don't need to opt in.
   *
   * Resize commits go through `onNodeUpdate` regardless — resize only
   * ever moves one node, so batching is moot.
   */
  onNodesUpdate?: (
    updates: { id: string; patch: NodeUpdate }[],
    canvasRef: string | undefined
  ) => void
  onNodeDelete?: (nodeId: string, canvasRef: string | undefined) => void
  /**
   * Bulk delete callback — fired when the user presses Delete/Backspace with
   * 2+ nodes selected. Receives all selected node IDs at once so consumers
   * can batch-remove them in a single transaction.
   */
  onNodesDelete?: (nodeIds: string[], canvasRef: string | undefined) => void
  onEdgeUpdate?: (
    edgeId: string,
    patch: EdgeUpdate,
    canvasRef: string | undefined
  ) => void
  onEdgeDelete?: (edgeId: string, canvasRef: string | undefined) => void
  onEdgeAdd?: (edge: CanvasEdge, canvasRef: string | undefined) => void

  /**
   * Predicate consulted while dragging a node. When the pointer hovers
   * over another node, the library calls this with `(sources, target)`.
   *
   *   - `true`  → target gets the "droppable" highlight; on release
   *               `onNodeDrop` fires and the source(s) snap back to
   *               their pre-drag positions (no `onNodeUpdate` for x/y).
   *   - `false` → no highlight; on release the drag falls through to
   *               normal repositioning (commits via `onNodeUpdate`).
   *
   * Self-drop (target id matches any source id) is filtered before this
   * is called — consumers don't need to special-case it.
   *
   * The signature uses an array (`sources: CanvasNode[]`) with a v1
   * length-1 invariant so future multi-select drags can extend without
   * breaking callers. Today the array always has exactly one entry.
   *
   * Called frequently during drag — keep it cheap (no fetches, no
   * setState). Pure derivation from `source.category` /
   * `target.category` / ids is the expected shape.
   *
   * When omitted, drop-on-node interaction is fully off and drags
   * commit to position via `onNodeUpdate` as they always have.
   */
  canDropNodeOn?: (
    sources: CanvasNode[],
    target: CanvasNode
  ) => boolean

  /**
   * Fires once on pointer release when a drag ended over a node that
   * `canDropNodeOn` accepted. The library has already snapped the
   * source(s) back to their pre-drag positions by the time this fires;
   * the consumer's job is purely to mutate data and trigger a refetch.
   *
   * `ctx.canvasRef` matches the rest of the library's callbacks: the
   * canvas the drop happened on, with `undefined` for the root canvas.
   *
   * Not called when:
   *   - The drop landed on empty space (handled as a normal drag).
   *   - The drop landed on a node where `canDropNodeOn` returned false.
   *   - `canDropNodeOn` is not provided.
   *   - The target was removed from the canvas data mid-drag.
   */
  onNodeDrop?: (
    sources: CanvasNode[],
    target: CanvasNode,
    ctx: { canvasRef: string | undefined }
  ) => void
  /** Fully replace the default add-node FAB. */
  renderAddNodeButton?: (props: AddNodeButtonRenderProps) => React.ReactNode

  /**
   * Controls the floating toolbar that appears above a selected node in
   * editable mode. Defaults to `true`. Pass `false` to suppress it entirely
   * (consumers can still build their own UI via `onContextMenu`).
   */
  showNodeToolbar?: boolean

  /**
   * Fully replace the default node toolbar contents. The library still
   * positions the toolbar container above the node; the render prop supplies
   * its inner React nodes. Receives `{ node, theme, patch, deleteNode }`.
   */
  renderNodeToolbar?: (props: NodeToolbarRenderProps) => React.ReactNode

  // --- Theming ---
  /**
   * Theme applied to the entire canvas. When omitted, the library falls
   * back to (in order): the current canvas's `theme.base` hint, then the
   * root canvas's `theme.base` hint, then `darkTheme`. Supplying this
   * prop forces the theme regardless of canvas-level hints.
   */
  theme?: CanvasTheme | Partial<CanvasTheme>

  /**
   * Optional map of additional themes, keyed by name. Merged with the
   * built-in themes (dark, midnight, light, blueprint, warm, roadmap) and
   * consulted when a canvas declares `theme.base`. This is how you wire
   * custom themes into the per-canvas theming mechanism — set
   * `canvas.theme.base = 'kanban'` and the library looks it up here.
   */
  themes?: Record<string, CanvasTheme>

  // --- Edge rendering ---
  edgeStyle?: EdgeStyle

  // --- Viewport ---
  defaultViewport?: ViewportState
  minZoom?: number
  maxZoom?: number
  onViewportChange?: (viewport: ViewportState) => void
  /**
   * Controls when the viewport auto-fits to the visible content.
   *
   * - `'canvas-change'` (default): fit on initial mount and when navigating
   *   to a different canvas. Edits (add / move / resize / delete) do NOT
   *   trigger a re-fit.
   * - `'always'`: fit on initial mount and whenever the node set changes,
   *   including after every edit. This is the legacy behavior.
   * - `'initial'`: fit once on initial mount only.
   * - `'never'`: do not auto-fit. Use `defaultViewport` and/or manual
   *   control via consumer-managed viewport state.
   */
  autoFit?: 'canvas-change' | 'always' | 'initial' | 'never'

  /**
   * Controls rendering of the lane header strips (column labels on top,
   * row labels on the left) when the current canvas has `columns` or `rows`.
   *
   * - `'pinned'` (default): headers stay glued to the viewport edges,
   *   so labels are always visible as the user pans/zooms.
   * - `'scroll'`: headers live at the top/left of the lane grid and
   *   move with the content.
   * - `'none'`: no headers are drawn. The lane bands still render.
   */
  laneHeaders?: 'pinned' | 'scroll' | 'none'

  /**
   * When true and the current canvas has `columns` or `rows`, dragged nodes
   * snap their x (for columns) and y (for rows) to the nearest lane start.
   * Defaults to `false` so existing behavior is preserved.
   */
  snapToLanes?: boolean

  /**
   * When enabled, zooming into a ref-bearing node past a threshold commits
   * the navigation and continues seamlessly inside the sub-canvas. Zooming
   * back out past a threshold pops to the parent. Accepts `true` for the
   * default config, or an object to tune thresholds.
   *
   * Defaults to `false`. When `true` and `maxZoom` is not explicitly set,
   * the effective max zoom is raised so small nodes can reach the enter
   * threshold.
   */
  zoomNavigation?: boolean | ZoomNavigationConfig

  // --- Snap & alignment ---
  /**
   * Enable snap-to-grid during drag and resize.
   * `true` = inherit `theme.grid.size`; `number` = explicit grid size in canvas px; falsy = off.
   */
  snapGrid?: boolean | number
  /** Alignment guide detection radius in canvas units. Default 4. */
  guideThreshold?: number
  /**
   * When true and 2+ nodes are selected, inject built-in align/distribute items into the
   * right-click context menu for the selected group.
   */
  alignDistributeMenu?: boolean

  // --- History ---
  /** Maximum undo/redo history depth. Defaults to 50. Only active when editable=true. */
  historyDepth?: number
  /** Called after an undo step. Receives the canvasRef that was affected. */
  onUndo?: (canvasRef: string | undefined) => void
  /** Called after a redo step. Receives the canvasRef that was affected. */
  onRedo?: (canvasRef: string | undefined) => void

  // --- Styling ---
  className?: string
  style?: React.CSSProperties
}

const CASCADE_WINDOW_MS = 1500
const CASCADE_OFFSET = 20

/**
 * Imperative handle exposed on the SystemCanvas component ref. Lets a
 * parent drive the camera — e.g. play a cinematic tour that zooms through
 * a chain of ref-bearing nodes.
 */
export interface SystemCanvasHandle {
  /**
   * Animate the camera into a node in the currently-viewed canvas, then
   * (if the node has a `ref`) navigate into its sub-canvas and fit that
   * sub-canvas to the viewport. Resolves when the new canvas has mounted
   * and finished fitting, so consumers can chain `await` calls to build a
   * multi-step tour.
   *
   * If the node has no `ref`, the zoom animation plays and the promise
   * resolves without navigating.
   */
  zoomIntoNode: (
    nodeId: string,
    options?: { durationMs?: number; targetZoom?: number }
  ) => Promise<void>
  /** Navigate back up one level in the breadcrumb stack. */
  navigateBack: () => void
  /** Reset to the root canvas. */
  navigateToRoot: () => void
}

export const SystemCanvas = forwardRef<SystemCanvasHandle, SystemCanvasProps>(
  function SystemCanvas(
    {
      canvas,
      onResolveCanvas,
      canvases,
      rootLabel = 'Home',
      onNavigate,
      onBreadcrumbClick,
      onBreadcrumbsChange,
      onNodeClick,
      onNodeDoubleClick,
      onEdgeClick,
      onEdgeDoubleClick,
      onContextMenu,
      onSelectionChange,
      nodeContextMenu,
      editable = false,
      onNodeAdd,
      onNodeUpdate,
      onNodesUpdate,
      onNodeDelete,
      onNodesDelete,
      onEdgeUpdate,
      onEdgeDelete,
      onEdgeAdd,
      canDropNodeOn,
      onNodeDrop,
      renderAddNodeButton,
      showNodeToolbar = true,
      renderNodeToolbar,
      theme: themeProp,
      themes: customThemes,
      edgeStyle = 'bezier',
      defaultViewport,
      minZoom: minZoomProp,
      maxZoom,
      onViewportChange,
      autoFit = 'canvas-change',
      laneHeaders = 'pinned',
      snapToLanes = false,
      zoomNavigation = false,
      snapGrid,
      guideThreshold,
      alignDistributeMenu,
      historyDepth,
      onUndo,
      onRedo,
      className,
      style,
    },
    forwardedRef
  ) {
  // Resolve zoom-nav config
  const zoomNavConfig = useMemo(() => {
    const defaults = {
      enterThreshold: 0.66,
      exitThreshold: 0.33,
      prefetchThreshold: 0.4,
      landingScale: 1.3,
      landingPadding: 0.08,
      fadeDuration: 216,
    }
    if (!zoomNavigation) return { enabled: false, ...defaults }
    if (zoomNavigation === true) return { enabled: true, ...defaults }
    return {
      enabled: true,
      enterThreshold: zoomNavigation.enterThreshold ?? defaults.enterThreshold,
      exitThreshold: zoomNavigation.exitThreshold ?? defaults.exitThreshold,
      prefetchThreshold:
        zoomNavigation.prefetchThreshold ?? defaults.prefetchThreshold,
      landingScale: zoomNavigation.landingScale ?? defaults.landingScale,
      landingPadding:
        zoomNavigation.landingPadding ?? defaults.landingPadding,
      fadeDuration:
        zoomNavigation.fadeDuration ?? defaults.fadeDuration,
    }
  }, [zoomNavigation])

  // When zoom-navigation is enabled and the zoom extents are not
  // explicitly set, widen them so (a) small nodes can be zoomed up to the
  // enter threshold, and (b) child-canvas handoff transforms that require
  // very small zoom to fit don't get clamped.
  const effectiveMaxZoom = maxZoom ?? (zoomNavConfig.enabled ? 16 : 4)
  const effectiveMinZoom =
    minZoomProp ?? (zoomNavConfig.enabled ? 0.01 : 0.1)
  // Dev warning for missing canvases prop in editable mode
  useEffect(() => {
    const env = (globalThis as any).process?.env?.NODE_ENV
    if (editable && !canvases && env !== 'production') {
      console.warn(
        '[system-canvas] `editable` is enabled but `canvases` prop is missing. ' +
          'Edits to sub-canvases will not be reflected without a synchronous ' +
          'ref → CanvasData map.'
      )
    }
  }, [editable, canvases])

  // Zoom-navigation state: stack of parent frames, one per breadcrumb
  // entry beyond root. parentFrames[i] describes how we entered the
  // canvas at breadcrumb index i+1. Frames are populated when entering
  // via zoom-navigation; for discrete (click) navigation they're null so
  // zoom-exit is disabled from that canvas.
  const [parentFrames, setParentFrames] = useState<(ParentFrame | null)[]>([])
  const [pendingHandoff, setPendingHandoff] = useState<ViewportState | null>(
    null
  )

  // Guard to suppress the "clear handoff" side-effect inside
  // handleBreadcrumbClick when the breadcrumb click is a programmatic
  // side-effect of zoom-exit (which needs the handoff preserved).
  const suppressNextHandoffClearRef = useRef(false)

  const handleBreadcrumbClick = useCallback(
    (index: number) => {
      // Truncate the parent-frames stack to match the new breadcrumb depth.
      // Breadcrumb index 0 is root (no parent frame); depth of frames is
      // `breadcrumbs.length - 1`. After clicking breadcrumb index, depth
      // becomes `index`.
      setParentFrames((prev) => prev.slice(0, index))
      if (suppressNextHandoffClearRef.current) {
        suppressNextHandoffClearRef.current = false
      } else {
        setPendingHandoff(null)
      }
      onBreadcrumbClick?.(index)
    },
    [onBreadcrumbClick]
  )

  // Navigation state
  const {
    canvas: currentCanvas,
    currentCanvasRef,
    breadcrumbs,
    isLoading,
    navigateToRef,
    navigateToBreadcrumb,
    seedCanvas,
  } = useNavigation({
    rootCanvas: canvas,
    rootLabel,
    canvases,
    onResolveCanvas,
    onNavigate,
    onBreadcrumbClick: handleBreadcrumbClick,
  })

  // Notify the consumer whenever the breadcrumb trail changes. Uses
  // the array reference from `useNavigation` directly — `setBreadcrumbs`
  // there always produces a new array on mutation, so reference
  // equality is a faithful change signal. Fires once on mount with the
  // root-only trail so subscribers can initialize without polling.
  useEffect(() => {
    onBreadcrumbsChange?.(breadcrumbs)
  }, [breadcrumbs, onBreadcrumbsChange])

  // Resolve theme with per-canvas awareness.
  //
  //   1. An explicit `theme` prop always wins — consumer is in full control.
  //   2. Else if the *currently-viewed* canvas declares `theme.base`, use
  //      that. This is what enables "zoom into a node, land in a themed
  //      sub-canvas" UX — navigate between canvases and the theme swaps
  //      automatically. Names are resolved against the built-in `themes`
  //      registry plus any `customThemes` the consumer provided.
  //   3. Else if the *root* canvas declares `theme.base`, use that (so the
  //      root's preference carries to sub-canvases that don't specify one).
  //   4. Else fall back to `darkTheme`.
  const theme = useMemo(() => {
    const registry: Record<string, CanvasTheme> = { ...themes, ...customThemes }

    const resolveByName = (name: string | undefined): CanvasTheme | null =>
      name && registry[name] ? registry[name] : null

    if (themeProp) {
      if ('name' in themeProp && 'background' in themeProp && 'grid' in themeProp) {
        return themeProp as CanvasTheme
      }
      return resolveTheme(themeProp as Partial<CanvasTheme>)
    }
    return (
      resolveByName(currentCanvas.theme?.base) ??
      resolveByName(canvas.theme?.base) ??
      darkTheme
    )
  }, [themeProp, customThemes, currentCanvas.theme?.base, canvas.theme?.base])

  // Snap-to-grid size (canvas units). 0 = off.
  const snapGridSize =
    snapGrid === true
      ? theme.grid.size
      : typeof snapGrid === 'number'
        ? snapGrid
        : 0

  // Resolve canvas data (apply theme, categories, defaults)
  const { nodes, edges, nodeMap } = useMemo(() => {
    const resolved = resolveCanvas(currentCanvas, theme)
    const map = buildNodeMap(resolved.nodes)
    return { nodes: resolved.nodes, edges: resolved.edges, nodeMap: map }
  }, [currentCanvas, theme])

  // Keep a ref to the latest nodes so useNodeDrag can look up group children
  // without forcing re-creations of its callbacks.
  const nodesRef = useRef<ResolvedNode[]>(nodes)
  nodesRef.current = nodes

  // Viewport refs
  const viewportStateRef = useRef<ViewportState>(
    defaultViewport ?? { x: 0, y: 0, zoom: 1 }
  )
  const viewportHandleRef = useRef<ViewportHandle>(null)

  // Stable refs used by the imperative handle. We keep them updated on
  // every render so the handle methods (created once via
  // useImperativeHandle) always see fresh state without forcing
  // consumers to re-capture the handle on every canvas swap.
  const navigateToRefRef = useRef<typeof navigateToRef>(navigateToRef)
  navigateToRefRef.current = navigateToRef
  const navigateToBreadcrumbRef = useRef<typeof navigateToBreadcrumb>(
    navigateToBreadcrumb
  )
  navigateToBreadcrumbRef.current = navigateToBreadcrumb
  const breadcrumbsRef = useRef(breadcrumbs)
  breadcrumbsRef.current = breadcrumbs

  // Expose an imperative API for programmatic camera control (tours, etc.)
  useImperativeHandle(
    forwardedRef,
    () => ({
      zoomIntoNode: (nodeId, options) => {
        return new Promise<void>((resolve) => {
          const node = nodesRef.current.find((n) => n.id === nodeId)
          const handle = viewportHandleRef.current
          if (!node || !handle) {
            resolve()
            return
          }
          // Phase 1: animate the camera into the node.
          handle.zoomToNode(
            node,
            () => {
              // Phase 2: if the node has a ref, navigate into the
              // sub-canvas. `navigateToRef` is async (may fetch data).
              if (!node.ref) {
                resolve()
                return
              }
              void navigateToRefRef.current(node).then(() => {
                // Give React two frames to render the new canvas so that
                // the next `zoomIntoNode` call — which reads
                // `nodesRef.current` — sees the freshly-mounted sub-canvas
                // nodes. The first rAF lets React commit, the second lets
                // the post-commit effects (including auto-fit) run.
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => resolve())
                })
              })
            },
            options
          )
        })
      },
      navigateBack: () => {
        const crumbs = breadcrumbsRef.current
        if (crumbs.length > 1) {
          navigateToBreadcrumbRef.current(crumbs.length - 2)
        }
      },
      navigateToRoot: () => {
        navigateToBreadcrumbRef.current(0)
      },
    }),
    [forwardedRef]
  )

  // Selection + editing state (editable mode)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)

  // Proxy ref for the SVG element — declared early so both useMultiSelect,
  // useNodeDrag, and useEdgeCreate can all share it. The `.current` assignment
  // runs every render further below; hooks read it lazily at gesture time.
  const svgProxyRef = useRef<SVGSVGElement | null>(null)

  // Container div ref — needed by useMultiSelect for keyboard event listeners
  // and by lane-header/size tracking below.
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Multi-select hook — owns selectedIds, marquee drawing, Cmd+A
  const {
    selectedIds,
    selectNode,
    toggleNode,
    selectAll,
    clearSelection,
    selectMultiple,
    marqueeRect,
    marqueeActiveRef,
  } = useMultiSelect({
    svgRef: svgProxyRef,
    viewport: viewportStateRef,
    nodesRef,
    containerRef,
    enabled: editable,
  })

  // Mirror selectedIds into a ref so clipboard and drag hooks read latest
  const selectedIdsRef = useRef<Set<string>>(selectedIds)
  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  // Mirror edges into a ref for the clipboard hook
  const edgesRef = useRef<typeof edges>(edges)
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  // Command history — undo/redo stack for all mutations
  const {
    wrappedOnNodeAdd,
    wrappedOnNodeUpdate,
    wrappedOnNodesUpdate,
    wrappedOnNodeDelete,
    wrappedOnNodesDelete,
    wrappedOnEdgeAdd,
    wrappedOnEdgeUpdate,
    wrappedOnEdgeDelete,
    beginBatch,
    endBatch,
    undo,
    redo,
  } = useCommandHistory({
    nodesRef: nodesRef as React.RefObject<CanvasNode[]>,
    edgesRef,
    onNodeAdd,
    onNodeUpdate,
    onNodesUpdate,
    onNodeDelete,
    onNodesDelete,
    onEdgeAdd,
    onEdgeUpdate,
    onEdgeDelete,
    maxDepth: historyDepth ?? 50,
    enabled: editable,
    onUndo,
    onRedo,
  })

  // Clipboard: Cmd+C / Cmd+V
  useMultiSelectClipboard({
    selectedIdsRef,
    nodesRef: nodesRef as React.RefObject<CanvasNode[]>,
    edgesRef,
    viewport: viewportStateRef,
    canvasContainerRef: containerRef,
    onNodeAdd: (node) => wrappedOnNodeAdd(node, currentCanvasRef),
    onEdgeAdd: (edge) => wrappedOnEdgeAdd(edge, currentCanvasRef),
    canvasRef: currentCanvasRef,
    getCursorScreenPos: () => viewportHandleRef.current?.getCursorScreenPos() ?? null,
    onBeginBatch: beginBatch,
    onEndBatch: endBatch,
  })

  // Clear selection/editing when navigating between canvases
  useEffect(() => {
    clearSelection()
    setEditingId(null)
    setSelectedEdgeId(null)
    setEditingEdgeId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCanvasRef])

  // Unified selection-change emission. Watches both id slots and emits
  // a single `CanvasSelection | null` to the consumer whenever the
  // *identity* of the resolved selection changes. Wiring it as an
  // effect (rather than at every individual `setSelected*` call site)
  // catches every mutation path automatically — node click, edge
  // click, canvas-background click, Escape, Delete, navigation
  // effect, NodeToolbar delete, any future setter — and gives us
  // atomicity for free: when a click swaps node→edge selection, both
  // `setSelected` calls land in one commit and the effect runs once
  // with the final state, never with an intermediate `null`. We
  // resolve the id to its CanvasNode / CanvasEdge here, so a stale
  // selection (consumer mutated `canvas` to remove the selected
  // entity) collapses to `null` rather than leaking a dangling id.
  //
  // Suppression: we depend on `nodeMap` and `edges`, which change on
  // every canvas mutation. To avoid spurious re-emits when the user's
  // selection is unchanged but some unrelated node moved, we track
  // the last-emitted (kind, id, canvasRef) tuple and skip the
  // callback when it matches. The resolved CanvasNode / CanvasEdge
  // *object identity* may change across renders (resolveCanvas
  // produces fresh objects), so identity-equality on the payload
  // wouldn't work — we compare on the durable (kind, id) instead.
  //
  // The callback is intentionally NOT in the dep list — re-firing on
  // every render just because the consumer didn't memoize their
  // handler would be a footgun. We capture it via a ref instead.
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange
  }, [onSelectionChange])

  const lastEmittedSelectionRef = useRef<{
    kind: 'node' | 'edge' | 'multi' | null
    id: string | null
    // For 'multi': sorted comma-joined id list for dedup
    multiIds: string | null
    canvasRef: string | undefined
  }>({ kind: null, id: null, multiIds: null, canvasRef: undefined })

  useEffect(() => {
    const cb = onSelectionChangeRef.current
    let next: CanvasSelection = null

    if (selectedIds.size > 1) {
      const resolvedNodes: ResolvedNode[] = []
      for (const id of selectedIds) {
        const n = nodeMap.get(id)
        if (n) resolvedNodes.push(n)
      }
      if (resolvedNodes.length > 0) {
        next = { kind: 'multi', nodes: resolvedNodes, canvasRef: currentCanvasRef }
      }
    } else if (selectedIds.size === 1) {
      const id = Array.from(selectedIds)[0]
      const node = nodeMap.get(id)
      if (node) next = { kind: 'node', node, canvasRef: currentCanvasRef }
    }

    if (!next && selectedEdgeId) {
      const edge = edges.find((e) => e.id === selectedEdgeId)
      if (edge) next = { kind: 'edge', edge, canvasRef: currentCanvasRef }
    }

    const last = lastEmittedSelectionRef.current
    const nextKind = next?.kind ?? null
    const nextRef = next?.canvasRef

    if (nextKind === 'multi' && next?.kind === 'multi') {
      const sortedIds = next.nodes.map((n) => n.id).sort().join(',')
      if (last.kind === 'multi' && last.multiIds === sortedIds && last.canvasRef === nextRef) {
        return
      }
      lastEmittedSelectionRef.current = { kind: 'multi', id: null, multiIds: sortedIds, canvasRef: nextRef }
    } else {
      const nextId = next
        ? next.kind === 'node'
          ? next.node.id
          : next.kind === 'edge'
            ? next.edge.id
            : null
        : null
      if (last.kind === nextKind && last.id === nextId && last.canvasRef === nextRef) {
        return
      }
      lastEmittedSelectionRef.current = { kind: nextKind, id: nextId, multiIds: null, canvasRef: nextRef }
    }

    cb?.(next)
  }, [selectedIds, selectedEdgeId, currentCanvasRef, nodeMap, edges])

  // Container size — tracked so the lane-header overlay can size itself.
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>(
    { width: 0, height: 0 }
  )
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setContainerSize({ width: r.width, height: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasLanes =
    (currentCanvas.columns && currentCanvas.columns.length > 0) ||
    (currentCanvas.rows && currentCanvas.rows.length > 0)
  const showLaneHeaders = hasLanes && laneHeaders !== 'none'

  const getViewportState = useCallback(
    () => viewportStateRef.current ?? { x: 0, y: 0, zoom: 1 },
    []
  )

  // Per-node commit. Used by resize (which only ever moves a single
  // node) and as the fallback path in `commitDragBatch` when the
  // consumer hasn't provided `onNodesUpdate`.
  //
  // If snapToLanes is on and the canvas has lanes, snap the committed
  // x and/or y so the node is centered within its column/row. The
  // node's resolved width/height (from `nodesRef`) is fed to
  // `snapToLane` so the snap accounts for node size — otherwise the
  // node's top-left would align to the lane's start edge, visually
  // jumping to the lane's corner.
  const applyLaneSnap = useCallback(
    (id: string, patch: NodeUpdate): NodeUpdate => {
      if (!snapToLanes) return patch
      const cols = currentCanvas.columns
      const rows = currentCanvas.rows
      const node = nodesRef.current.find((n) => n.id === id)
      let final = patch
      const nx = patch.x
      const ny = patch.y
      if (cols && cols.length > 0 && nx != null) {
        const snapped = snapToLane(nx, cols, {
          edge: 'center',
          size: node?.width ?? 0,
        })
        final = { ...final, x: Math.round(snapped) }
      }
      if (rows && rows.length > 0 && ny != null) {
        const snapped = snapToLane(ny, rows, {
          edge: 'center',
          size: node?.height ?? 0,
        })
        final = { ...final, y: Math.round(snapped) }
      }
      return final
    },
    [snapToLanes, currentCanvas.columns, currentCanvas.rows]
  )

  const commitResize = useCallback(
    (id: string, patch: NodeUpdate) => {
      wrappedOnNodeUpdate(id, applyLaneSnap(id, patch), currentCanvasRef)
    },
    [wrappedOnNodeUpdate, currentCanvasRef, applyLaneSnap]
  )

  // Batched drag commit. Fires once per drag-end with every moved
  // node — for a normal node drag that's a single-entry array, for a
  // group drag it's the group plus every spatially-contained child.
  //
  // Why batch: consumers commonly mirror React state into refs via
  // `useEffect` so callbacks can read "current" state synchronously.
  // The mirror runs *after* React commits, so a synchronous loop of
  // per-node `onNodeUpdate` calls all read the same stale state; only
  // the last call's mutation survives because each iteration overwrites
  // the previous one's `setState`. The visible bug: drag a group, every
  // node snaps back except the last one in the iteration order. Batching
  // lets the consumer apply every move against one starting state in a
  // single transaction.
  //
  // When `onNodesUpdate` is provided, it wins. Otherwise we fall back
  // to N `onNodeUpdate` calls so old consumers keep working — they just
  // need to ensure their state reads are synchronous for groups to
  // commit atomically.
  const commitDragBatch = useCallback(
    (updates: { id: string; patch: NodeUpdate }[]) => {
      const final = updates.map((u) => ({
        id: u.id,
        patch: applyLaneSnap(u.id, u.patch),
      }))
      if (onNodesUpdate) {
        wrappedOnNodesUpdate(final, currentCanvasRef)
        return
      }
      if (!onNodeUpdate) return
      for (const { id, patch } of final) {
        wrappedOnNodeUpdate(id, patch, currentCanvasRef)
      }
    },
    [wrappedOnNodeUpdate, wrappedOnNodesUpdate, onNodeUpdate, onNodesUpdate, currentCanvasRef, applyLaneSnap]
  )

  const handleNodeDrop = useCallback(
    (sources: CanvasNode[], target: CanvasNode) => {
      onNodeDrop?.(sources, target, { canvasRef: currentCanvasRef })
    },
    [onNodeDrop, currentCanvasRef]
  )

  const {
    dragOverrides,
    dropTargetId,
    onPointerDown: onNodePointerDown,
    cancelDrag,
    isDragging,
  } = useNodeDrag({
    viewport: viewportStateRef,
    nodesRef,
    onCommit: commitDragBatch,
    svgRef: svgProxyRef,
    canDropNodeOn,
    onNodeDrop: handleNodeDrop,
    selectedIdsRef,
    snapGridSize,
  })

  const { resizeOverrides, onHandlePointerDown: onResizeHandlePointerDown } =
    useNodeResize({
      viewport: viewportStateRef,
      onCommit: commitResize,
      snapGridSize,
    })

  // Alignment guides — live during drag, empty at rest.
  const alignmentGuides: AlignmentGuide[] = useAlignmentGuides({
    dragOverrides,
    nodesRef,
    isDragging,
    threshold: guideThreshold ?? 4,
  })

  // Selected node with live drag/resize overrides applied — used to position
  // the floating single-node toolbar and resize handles.
  // Only resolved when exactly one node is selected.
  const singleSelectedId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null
  const selectedResolvedNode = useMemo<ResolvedNode | null>(() => {
    if (!singleSelectedId) return null
    const base = nodeMap.get(singleSelectedId)
    if (!base) return null
    const resize = resizeOverrides.get(singleSelectedId)
    if (resize) {
      return { ...base, x: resize.x, y: resize.y, width: resize.width, height: resize.height }
    }
    const drag = dragOverrides.get(singleSelectedId)
    if (drag) {
      return { ...base, x: drag.x, y: drag.y }
    }
    return base
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleSelectedId, nodeMap, dragOverrides, resizeOverrides])

  // Keep the proxy SVG ref pointed at the viewport's current SVG element.
  // Runs every render so useEdgeCreate / useNodeDrag both see the latest.
  svgProxyRef.current = viewportHandleRef.current?.getSvgElement() ?? null

  const handleEdgeCreated = useCallback(
    (edge: CanvasEdge) => {
      wrappedOnEdgeAdd(edge, currentCanvasRef)
    },
    [wrappedOnEdgeAdd, currentCanvasRef]
  )

  const { pending: pendingEdge, onHandlePointerDown: onConnectionHandlePointerDown } =
    useEdgeCreate({
      svgRef: svgProxyRef,
      viewport: viewportStateRef,
      nodesRef,
      onCreate: handleEdgeCreated,
    })

  // Zoom-then-navigate: animate toward the node, then swap canvas.
  // Also stash a parent frame so zoom-exit works on the way back out
  // (even though the entry was a click rather than a zoom).
  //
  // When the zoom animation finishes we capture the final viewport
  // transform and feed it into `pendingHandoff` so that Viewport's
  // canvas-change effect (a) applies the transform instantly on the new
  // canvas instead of auto-fitting, and (b) runs the opacity fade. This
  // makes the sub-canvas fade in on top of the zoomed-in parent node —
  // visually continuous with the zoom motion, like a real zoom into the
  // child document.
  const handleNavigableNodeClick = useCallback(
    (node: ResolvedNode) => {
      const frame: ParentFrame = {
        parentCanvasRef: currentCanvasRef,
        parentNodeRect: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
        },
      }
      setParentFrames((prev) => [...prev, frame])
      // Plain click-to-drill: navigate immediately and let the Viewport's
      // auto-fit effect center the sub-canvas content. The cinematic
      // zoom-into-parent animation + handoff is an opt-in via
      // `zoomNavigation`; without it, the handoff transform is computed
      // for the parent node's on-screen rect and has no relationship to
      // where the sub-canvas content actually lives.
      if (!zoomNavConfig.enabled) {
        navigateToRef(node)
        return
      }
      const handle = viewportHandleRef.current
      if (handle) {
        handle.zoomToNode(node, () => {
          // Freeze the just-finished transform as the handoff so the
          // sub-canvas renders in-place and then fades in, instead of
          // the default snap-fit.
          const finalVp = viewportStateRef.current
          if (finalVp) setPendingHandoff({ ...finalVp })
          navigateToRef(node)
        })
      } else {
        navigateToRef(node)
      }
    },
    [navigateToRef, currentCanvasRef, zoomNavConfig.enabled]
  )

  // --- Zoom-navigation enter/exit handlers ---
  const handleZoomEnter = useCallback(
    (node: ResolvedNode, targetTransform: ViewportState) => {
      const frame: ParentFrame = {
        parentCanvasRef: currentCanvasRef,
        parentNodeRect: {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height,
        },
      }
      setParentFrames((prev) => [...prev, frame])
      setPendingHandoff(targetTransform)
      // Fire the existing navigation flow. Because the data is already
      // resolved synchronously (the hook only fires when data is
      // available), this completes in a single tick.
      navigateToRef(node)
    },
    [currentCanvasRef, navigateToRef]
  )

  const handleZoomExit = useCallback(
    (targetTransform: ViewportState) => {
      setPendingHandoff(targetTransform)
      // Mark the next breadcrumb click as programmatic so its handler
      // doesn't wipe our freshly-set pending handoff.
      suppressNextHandoffClearRef.current = true
      // navigateToBreadcrumb triggers handleBreadcrumbClick which is
      // responsible for truncating parentFrames to match.
      navigateToBreadcrumb(breadcrumbs.length - 2)
    },
    [navigateToBreadcrumb, breadcrumbs.length]
  )

  // Current parent frame (top of the stack) — enables zoom-exit from this
  // canvas only if we entered via zoom-navigation.
  const currentParentFrame = parentFrames[parentFrames.length - 1] ?? null

  const {
    handleViewportChange: handleZoomNavViewportChange,
    clearCommitting: clearZoomNavCommitting,
  } = useZoomNavigation({
    enabled: zoomNavConfig.enabled,
    config: zoomNavConfig,
    nodes,
    currentCanvas,
    parentFrame: currentParentFrame,
    canvases,
    onResolveCanvas,
    onSeedCanvas: seedCanvas,
    theme,
    getViewportSize: () => {
      const svg = viewportHandleRef.current?.getSvgElement()
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    },
    getCursorScreenPos: () =>
      viewportHandleRef.current?.getCursorScreenPos() ?? null,
    onEnter: handleZoomEnter,
    onExit: handleZoomExit,
  })

  const handleViewportChange = useCallback(
    (vp: ViewportState) => {
      viewportStateRef.current = vp
      handleZoomNavViewportChange(vp)
      onViewportChange?.(vp)
    },
    [handleZoomNavViewportChange, onViewportChange]
  )

  const handleHandoffApplied = useCallback(() => {
    setPendingHandoff(null)
    clearZoomNavCommitting()
  }, [clearZoomNavCommitting])

  const handleBeginEdit = useCallback((node: ResolvedNode) => {
    setEditingId(node.id)
  }, [])

  const handleBeginEditEdge = useCallback((edge: CanvasEdge) => {
    setEditingEdgeId(edge.id)
  }, [])

  // Align / distribute callbacks — used by the multi-select toolbar and
  // (optionally) injected into the right-click context menu.
  const handleAlign = useCallback(
    (direction: AlignDirection) => {
      const selectedNodes = Array.from(selectedIds)
        .map((id) => nodesRef.current.find((n) => n.id === id))
        .filter((n): n is ResolvedNode => n != null)
      const updates = alignNodes(selectedNodes, direction)
      if (updates.length > 0) wrappedOnNodesUpdate(updates, currentCanvasRef)
    },
    [selectedIds, nodesRef, wrappedOnNodesUpdate, currentCanvasRef]
  )

  const handleDistribute = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const selectedNodes = Array.from(selectedIds)
        .map((id) => nodesRef.current.find((n) => n.id === id))
        .filter((n): n is ResolvedNode => n != null)
      const updates = distributeNodes(selectedNodes, axis)
      if (updates.length > 0) wrappedOnNodesUpdate(updates, currentCanvasRef)
    },
    [selectedIds, nodesRef, wrappedOnNodesUpdate, currentCanvasRef]
  )

  // Declarative node context menu state. `null` = closed; non-null is the
  // open menu's data (filtered items, target node, screen position, the
  // canvas ref the node lives on). Lives here rather than inside
  // `NodeContextMenuOverlay` so the right-click handler — which knows the
  // current canvas ref — can populate it directly.
  const [contextMenuState, setContextMenuState] =
    useState<NodeContextMenuOverlayState | null>(null)

  // Reset the open menu whenever the user navigates between canvases. The
  // node it was anchored to may not exist on the new scope; even if it
  // does, the menu's screen position would be stale.
  useEffect(() => {
    setContextMenuState(null)
  }, [currentCanvasRef])

  /**
   * Bridge handler: forwards every right-click to the consumer's
   * `onContextMenu` callback (unchanged contract), AND if a declarative
   * `nodeContextMenu` is configured and this is a node hit, opens the
   * library-rendered floating menu with the matching items.
   *
   * Both behaviors run on the same event so mixing declarative items with
   * an imperative escape hatch (e.g. a custom edge menu) just works.
   */
  const handleContextMenu = useCallback(
    (event: ContextMenuEvent) => {
      onContextMenu?.(event)
      if (!nodeContextMenu && !alignDistributeMenu) return
      if (event.type !== 'node') return
      const node = event.target as CanvasNode | undefined
      if (!node) return

      const matchCtx = { canvasRef: currentCanvasRef ?? null }
      const matched = nodeContextMenu
        ? filterContextMenuItems(nodeContextMenu.items, node, matchCtx)
        : []

      // Inject built-in align/distribute items when the right-clicked node
      // is part of the current multi-selection (2+ nodes).
      if (alignDistributeMenu && selectedIds.size >= 2 && selectedIds.has(node.id)) {
        const canDistribute = selectedIds.size >= 3
        const builtins = [
          { id: '__sys_align_left__',    label: 'Align Left' },
          { id: '__sys_align_right__',   label: 'Align Right' },
          { id: '__sys_align_top__',     label: 'Align Top' },
          { id: '__sys_align_bottom__',  label: 'Align Bottom' },
          { id: '__sys_align_centerH__', label: 'Align Center Horizontal' },
          { id: '__sys_align_centerV__', label: 'Align Center Vertical' },
          {
            id: '__sys_distribute_h__',
            label: 'Distribute Horizontally',
            disabled: canDistribute ? undefined : () => !canDistribute,
          },
          {
            id: '__sys_distribute_v__',
            label: 'Distribute Vertically',
            disabled: canDistribute ? undefined : () => !canDistribute,
          },
        ]
        matched.push(...builtins)
      }

      if (matched.length === 0) {
        // No items applied to this node — close any stale menu and let
        // the right-click be a no-op (the browser default is already
        // suppressed by the underlying interaction hook).
        setContextMenuState(null)
        return
      }
      setContextMenuState({
        items: matched,
        node,
        screenPosition: event.screenPosition,
        canvasRef: currentCanvasRef ?? null,
      })
    },
    [onContextMenu, nodeContextMenu, currentCanvasRef, alignDistributeMenu, selectedIds]
  )

  // Effective context menu config — wraps the consumer's config (if any) and
  // intercepts built-in align/distribute IDs before delegating to the consumer.
  const effectiveNodeContextMenu = useMemo(() => {
    if (!nodeContextMenu && !alignDistributeMenu) return null
    const baseItems = nodeContextMenu?.items ?? []
    const wrappedOnSelect: NodeContextMenuConfig['onSelect'] = (itemId, node, ctx) => {
      // Intercept built-in IDs.
      if (itemId === '__sys_align_left__')    { handleAlign('left');    return }
      if (itemId === '__sys_align_right__')   { handleAlign('right');   return }
      if (itemId === '__sys_align_top__')     { handleAlign('top');     return }
      if (itemId === '__sys_align_bottom__')  { handleAlign('bottom');  return }
      if (itemId === '__sys_align_centerH__') { handleAlign('centerH'); return }
      if (itemId === '__sys_align_centerV__') { handleAlign('centerV'); return }
      if (itemId === '__sys_distribute_h__')  { handleDistribute('horizontal'); return }
      if (itemId === '__sys_distribute_v__')  { handleDistribute('vertical');   return }
      nodeContextMenu?.onSelect(itemId, node, ctx)
    }
    return { items: baseItems, onSelect: wrappedOnSelect }
  }, [nodeContextMenu, alignDistributeMenu, handleAlign, handleDistribute])

  // Interaction handlers
  const {
    handleNodeClick,
    handleNodeDoubleClick,
    handleNodeNavigate,
    handleEdgeClick,
    handleEdgeDoubleClick,
    handleCanvasClick,
    handleCanvasContextMenu,
    handleNodeContextMenu,
    handleEdgeContextMenu,
  } = useCanvasInteraction({
    onNodeClick,
    onNodeDoubleClick,
    onEdgeClick,
    onEdgeDoubleClick,
    onContextMenu: handleContextMenu,
    onNavigableNodeClick: handleNavigableNodeClick,
    viewport: viewportStateRef,
    editable,
    onSelect: (id: string | null) => { if (id) selectNode(id); else clearSelection() },
    onToggleSelect: toggleNode,
    onBeginEdit: handleBeginEdit,
    onSelectEdge: setSelectedEdgeId,
    onBeginEditEdge: handleBeginEditEdge,
  })

  // Editor commit/cancel
  const handleEditorCommit = useCallback(
    (patch: NodeUpdate) => {
      if (editingId) {
        wrappedOnNodeUpdate(editingId, patch, currentCanvasRef)
      }
      setEditingId(null)
    },
    [editingId, wrappedOnNodeUpdate, currentCanvasRef]
  )
  const handleEditorCancel = useCallback(() => {
    setEditingId(null)
  }, [])

  // Edge editor commit/cancel
  const handleEdgeEditorCommit = useCallback(
    (patch: EdgeUpdate) => {
      if (editingEdgeId) {
        wrappedOnEdgeUpdate(editingEdgeId, patch, currentCanvasRef)
      }
      setEditingEdgeId(null)
    },
    [editingEdgeId, wrappedOnEdgeUpdate, currentCanvasRef]
  )
  const handleEdgeEditorCancel = useCallback(() => {
    setEditingEdgeId(null)
  }, [])

  // Cascade offset for rapid successive adds
  const lastAddRef = useRef<{ t: number; offset: number } | null>(null)

  // Add-node menu plumbing
  const menuOptions = useMemo<NodeMenuOption[]>(
    () => getNodeMenuOptions(currentCanvas, theme),
    [currentCanvas, theme]
  )

  const addNode = useCallback(
    (option: NodeMenuOption, position?: { x: number; y: number }) => {
      // Compute default position: viewport center in canvas-space, with
      // a cascade offset for rapid successive adds.
      let x: number, y: number
      if (position) {
        x = position.x
        y = position.y
      } else {
        const handle = viewportHandleRef.current
        const svg = handle?.getSvgElement()
        if (svg) {
          const rect = svg.getBoundingClientRect()
          const centerScreen = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          }
          const vp = handle!.getViewport()
          const canvasPos = screenToCanvas(centerScreen.x, centerScreen.y, vp)
          x = canvasPos.x
          y = canvasPos.y
        } else {
          x = 0
          y = 0
        }

        const now = Date.now()
        const last = lastAddRef.current
        const nextOffset =
          last && now - last.t < CASCADE_WINDOW_MS
            ? last.offset + CASCADE_OFFSET
            : 0
        x += nextOffset
        y += nextOffset
        lastAddRef.current = { t: now, offset: nextOffset }
      }

      const node = createNodeFromOption(
        option,
        Math.round(x),
        Math.round(y),
        undefined,
        theme
      )
      wrappedOnNodeAdd(node, currentCanvasRef)
    },
    [wrappedOnNodeAdd, currentCanvasRef, theme]
  )

  // Keyboard shortcuts — delegated to the dedicated hook for maintainability.
  const handleKeyDown = useKeyboardShortcuts({
    editable,
    editingId,
    editingEdgeId,
    selectedIds,
    selectedEdgeId,
    nodesRef,
    edgesRef,
    theme,
    currentCanvasRef,
    contextMenuState,
    setContextMenuState,
    wrappedOnNodeAdd,
    wrappedOnEdgeAdd,
    wrappedOnNodeUpdate,
    wrappedOnNodesUpdate,
    wrappedOnNodeDelete,
    wrappedOnNodesDelete,
    wrappedOnEdgeDelete,
    onNodesUpdate,
    onNodeUpdate,
    beginBatch,
    endBatch,
    undo,
    redo,
    selectNode,
    selectMultiple,
    selectAll,
    clearSelection,
    setEditingId,
    setEditingEdgeId,
    setSelectedEdgeId,
    cancelDrag,
  })

  const renderProps: AddNodeButtonRenderProps = { options: menuOptions, addNode, theme }

  return (
    <div
      ref={containerRef}
      className={`system-canvas ${className ?? ''}`}
      tabIndex={editable ? 0 : -1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        outline: 'none',
        ...style,
      }}
    >
      {/* Breadcrumbs overlay */}
      <Breadcrumbs
        breadcrumbs={breadcrumbs}
        theme={theme.breadcrumbs}
        onNavigate={navigateToBreadcrumb}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div
          className="system-canvas-loading"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 10,
            padding: '6px 12px',
            background: theme.breadcrumbs.background,
            borderRadius: 8,
            color: theme.breadcrumbs.textColor,
            fontFamily: theme.node.fontFamily,
            fontSize: 12,
            backdropFilter: 'blur(8px)',
          }}
        >
          Loading...
        </div>
      )}

      {/* SVG viewport */}
      <Viewport
        ref={viewportHandleRef}
        nodes={nodes}
        edges={edges}
        nodeMap={nodeMap}
        theme={theme}
        edgeStyle={edgeStyle}
        columns={currentCanvas.columns}
        rows={currentCanvas.rows}
        canvases={canvases}
        minZoom={effectiveMinZoom}
        maxZoom={effectiveMaxZoom}
        defaultViewport={defaultViewport}
        autoFit={autoFit}
        canvasRef={currentCanvasRef}
        handoffTransform={pendingHandoff}
        onHandoffApplied={handleHandoffApplied}
        handoffFadeMs={zoomNavConfig.fadeDuration}
        onViewportChange={handleViewportChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeNavigate={handleNodeNavigate}
        onEdgeClick={handleEdgeClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onCanvasClick={editable ? handleCanvasClick : undefined}
        onCanvasContextMenu={handleCanvasContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onNodePointerDown={editable ? onNodePointerDown : undefined}
        selectedIds={editable ? selectedIds : undefined}
        marqueeRect={editable ? marqueeRect : null}
        marqueeActiveRef={editable ? marqueeActiveRef : undefined}
        editingId={editable ? editingId : null}
        selectedEdgeId={editable ? selectedEdgeId : null}
        editingEdgeId={editable ? editingEdgeId : null}
        dragOverrides={dragOverrides}
        dropTargetId={dropTargetId}
        resizeOverrides={resizeOverrides}
        onResizeHandlePointerDown={editable ? onResizeHandlePointerDown : undefined}
        onEditorCommit={handleEditorCommit}
        onEditorCancel={handleEditorCancel}
        onEdgeEditorCommit={handleEdgeEditorCommit}
        onEdgeEditorCancel={handleEdgeEditorCancel}
        pendingEdge={editable ? pendingEdge : null}
        onConnectionHandlePointerDown={
          editable ? onConnectionHandlePointerDown : undefined
        }
        edgeCreateEnabled={editable}
        alignmentGuides={editable ? alignmentGuides : undefined}
      />

      {/* Sticky lane headers overlay (above the viewport SVG) */}
      {showLaneHeaders && (
        <LaneHeaders
          columns={currentCanvas.columns}
          rows={currentCanvas.rows}
          theme={theme}
          getViewport={getViewportState}
          width={containerSize.width}
          height={containerSize.height}
          pinned={laneHeaders === 'pinned'}
        />
      )}

      {/* Floating node toolbar — single-node selection */}
      {editable && showNodeToolbar && selectedIds.size === 1 && selectedResolvedNode && !editingId && (
        <NodeToolbar
          node={selectedResolvedNode}
          theme={theme}
          onPatch={(update) => {
            wrappedOnNodeUpdate(selectedResolvedNode.id, update, currentCanvasRef)
          }}
          onDelete={() => {
            wrappedOnNodeDelete(selectedResolvedNode.id, currentCanvasRef)
            clearSelection()
          }}
          getViewport={getViewportState}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          render={renderNodeToolbar}
        />
      )}

      {/* Floating multi-select toolbar — 2+ nodes selected */}
      {editable && showNodeToolbar && selectedIds.size > 1 && !editingId && (() => {
        const selectedResolvedNodes = Array.from(selectedIds)
          .map((id) => nodeMap.get(id))
          .filter((n): n is ResolvedNode => n != null)
        if (selectedResolvedNodes.length === 0) return null
        const anchorNode = selectedResolvedNodes[0]
        return (
          <NodeToolbar
            node={anchorNode}
            selectedNodes={selectedResolvedNodes}
            theme={theme}
            onPatch={() => {}}
            onMultiPatch={(patch) => {
              for (const id of selectedIds) {
                wrappedOnNodeUpdate(id, patch, currentCanvasRef)
              }
            }}
            onDelete={() => {
              wrappedOnNodesDelete(Array.from(selectedIds), currentCanvasRef)
              clearSelection()
            }}
            getViewport={getViewportState}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            onAlign={handleAlign}
            onDistribute={handleDistribute}
          />
        )
      })()}

      {/* Add-node FAB (editable only) */}
      {editable &&
        (renderAddNodeButton
          ? renderAddNodeButton(renderProps)
          : <AddNodeButton {...renderProps} />)}

      {/*
       * Declarative node context menu. Renders only when the consumer
       * passed `nodeContextMenu`; the overlay itself early-returns when
       * `state` is null, so the cost of mounting is essentially nil for
       * canvases that don't use this feature. Rendered last so it sits
       * above every other library-managed overlay (toolbar, breadcrumbs,
       * lane headers).
       */}
      {effectiveNodeContextMenu && (
        <NodeContextMenuOverlay
          state={contextMenuState}
          config={effectiveNodeContextMenu}
          theme={theme}
          onClose={() => setContextMenuState(null)}
        />
      )}
    </div>
  )
  }
)
