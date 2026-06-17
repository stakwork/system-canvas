# AGENTS.md

## Project overview

This is **system-canvas** — a library for rendering interactive, zoomable SVG diagrams from JSON Canvas spec documents. It is the high-level UI for an LLM code generation platform, providing a spatial canvas where users can visualize an entire organization, zoom into areas, and kick off code generation or research agents.

The library is **domain-agnostic**. It knows about canvases, nodes, edges, colors, themes, and categories. It does not know about teams, repositories, agents, or any application-specific concept. The consuming application maps its domain onto generic canvas primitives.

## Architecture

This is an npm workspaces monorepo with three publishable packages and a demo app:

```
packages/core/        → system-canvas             (pure TypeScript, zero dependencies)
packages/react/       → system-canvas-react       (React components, depends on system-canvas + d3-zoom)
packages/standalone/  → system-canvas-standalone  (Self-contained IIFE bundle for <script> tag / CDN use)
demo/                 → system-canvas-demo        (Vite + React demo app, not published)
```

### system-canvas (core)

Pure TypeScript. No React, no DOM, no dependencies. Any framework adapter imports from here.

- `src/types.ts` — All TypeScript interfaces. This is the source of truth for the data model.
- `src/canvas.ts` — Canvas data helpers: resolve nodes, build lookup maps, validate, get labels, find group children, and editing helpers (`addNode`, `updateNode`, `removeNode`, `addEdge`, `updateEdge`, `removeEdge`, `generateNodeId`, `generateEdgeId`, `getNodeMenuOptions`, `createNodeFromOption`). `createNodeFromOption` accepts an optional `theme` argument so it can deep-clone `category.defaultCustomData` onto the new node via `structuredClone`.
- `src/actions.ts` — Pure helpers for the node-toolbar action system: `getNodeActions(theme)` (theme-level), `getNodeActionsForNode(node, theme)` (per-node — `category.toolbar` wins when present, else falls through to `getNodeActions`), `buildDefaultToolbar(theme)` (returns the default groups so categories can spread them into their own toolbars), `buildDefaultColorActions(theme)`, `filterActionsForNode(group, node)`, `resolveActionPatch(action, node)`.
- `src/slots.ts` — Pure helpers for **category slots** (§Category slots below): `computeCategorySlotRegions(node, theme)` (canvas-space `Rect` per `SlotPosition`), `resolveAccessor` / `resolveAccessorOr` (evaluate `NodeAccessor<T>` against a `SlotContext`), `getCategorySlots(node, theme)`, `pickRefIndicatorCorner(defaultCorner, slots)` (collision resolver that moves the ref indicator to a free corner when the default is occupied), `slotEntries` (deterministic iteration order), `computeReflowReservations(node, theme, slots)` (px to reserve on each side for header/footer/edge-strip slots).
- `src/rollup.ts` — `rollupNodes(canvas, predicate)` and `rollupNodesDeep(canvas, predicate, getSubCanvas)`. Both return `{ total, matched, fraction }`. Used inside slot accessors — `SlotContext.rollup(pred)` is a zero-arg convenience wrapper that rolls up the node's own sub-canvas.
- `src/paths.ts` — `getAtPath` / `setAtPath` utilities for dot-paths like `customData.status`. Used by the form editor to read/write nested fields without a dependency on lodash.
- `src/text.ts` — `measureTextWidth(text, fontSize)` and `wrapText` / `wrapTextWithBreaks(text, maxWidth, fontSize, maxLines?)` pure helpers for word-wrapping SVG text without a DOM. Used internally by `kind: 'text'` slots and re-exported so consumers writing `kind: 'custom'` body renderers can wrap consistently.
- `src/themes/` — Six pre-made themes (dark, midnight, light, blueprint, warm, roadmap) plus the resolver that merges partial themes and resolves colors/categories.
- `src/rendering/` — Pure math: anchor point computation, edge path routing (bezier/straight/orthogonal), viewport transforms, bounding box calculation.
- `src/lanes.ts` — Pure helpers for the lane primitive (columns/rows): `findLaneAt`, `snapToLane`, `evenLanes`, `lanesExtent`. Zero opinion about what lanes represent (dates, ordinal buckets, teams, phases — it's all the same to the library).

### system-canvas-react

React bindings. Depends on `system-canvas` for all types and math.

- `src/components/SystemCanvas.tsx` — Main orchestrator component. This is what consumers import.
- `src/components/Viewport.tsx` — SVG container with d3-zoom pan/zoom and grid background. Forwards the `canvases` map down to `NodeRenderer` so category-slot accessors can look up sub-canvases for rollups.
- `src/components/NodeRenderer.tsx` — Dispatches to type-specific node components. For each node it looks up the category slots, computes `ReflowReservations` (`reservedTop/Bottom/Left/Right`) so text doesn't collide with header/footer/edge slots, and picks the ref-indicator corner via `pickRefIndicatorCorner`. Accepts `only?: 'groups' | 'non-groups'` so the caller can interleave edges between group and non-group layers.
- `src/components/TextNode.tsx`, `FileNode.tsx`, `LinkNode.tsx`, `GroupNode.tsx` — One component per JSON Canvas node type. Each accepts optional `slots`, `canvases`, `reservedTop/Bottom/Left/Right`, and `refCorner` — the renderer plumbs these through so every node type honors category slots and reflow uniformly. Each renders `CategorySlotsLayer` on top of the body so slot primitives paint above the fill/stroke but below the ref indicator and resize handles. **Default label text wraps by default** on `text` / `file` / `link` nodes (no `body` slot required) — the node-type components render their label through `NodeText` with `wrap={true}` and `verticalAlign='center'` (or `'top'` when a header slot is present), so a long title in a plain `text` node reflows to fit the node's width instead of overflowing as a single line. This replaces the legacy `\n`-splits-into-title/sublabel rendering in `TextNode`; multi-line input is preserved as paragraph breaks within the wrap path. The `body`-slot-owned path is unchanged.
- `src/components/CategorySlotsLayer.tsx` — Renders the category slots for a single node. Computes regions, builds a `SlotContext` (with `rollup`, `getSubCanvas`, etc.), and dispatches to the appropriate primitive per `kind` (`color`/`progress`/`count`/`pill`/`text`/`dot`/`icon`) or calls the consumer's `render` function for `kind: 'custom'`. All slot primitives set `pointerEvents="none"` so they never intercept node-body clicks.
- `src/primitives/` (secondary entry `system-canvas-react/primitives`) — Low-level building blocks used internally by `CategorySlotsLayer` and re-exported for `kind: 'custom'` slot implementations: `NodeColorFill`, `NodeProgressBar`, `NodeCountBadge`, `NodeStatusPill`, `NodeDot`, `NodeText`, `NodeIcon`.
- `src/components/EdgeRenderer.tsx` — Renders all edges with arrowhead markers, labels, and click targets.
- `src/components/ConnectionHandles.tsx` — Four small circular handles (one per side) shown on the hovered node in editable mode; pressing one begins an edge-creation drag.
- `src/components/PendingEdgeRenderer.tsx` — Ghost edge drawn during an edge-creation drag. Uses `computeEdgePath` with a synthetic zero-sized target at the cursor when no drop target is hovered.
- `src/components/RefIndicator.tsx` — Clickable "enter sub-canvas" corner drawn on navigable nodes.
- `src/components/NodeEditor.tsx` — Inline editor rendered via `<foreignObject>`. When the node's category declares `editableFields`, renders a multi-field form (`text` / `textarea` / `number` / `select` / `boolean`) and commits a single merged patch on blur / `Cmd+Enter`. Otherwise renders the historical single-field variant (`<textarea>` for text, `<input>` for file/link/group). Uses core's `getAtPath` / `setAtPath` to read and write dot-paths like `customData.status`.
- `src/components/EdgeLabelEditor.tsx` — Inline edge label editor rendered via `<foreignObject>` centered on the edge midpoint.
- `src/components/AddNodeButton.tsx` — Default floating "+" FAB and add-node popover menu.
- `src/components/NodeContextMenuOverlay.tsx` — Floating right-click menu rendered when the consumer passes `nodeContextMenu` to `<SystemCanvas>`. HTML overlay (`position: fixed`) anchored to the right-click's `screenPosition`. Owns its own dismissal lifecycle (outside `mousedown` / Escape / scroll / blur). Uses `theme.contextMenu` for styling; renders nothing if that theme block is missing (graceful fallback for hand-rolled themes that haven't opted in).
- `src/components/NodeToolbar.tsx` — Floating toolbar rendered as an HTML overlay above the selected node in editable mode. Tracks the viewport via `requestAnimationFrame` for fixed-pixel sizing at any zoom; flips below the node when near the viewport top. Horizontal alignment relative to the node is driven by `theme.toolbarAlign` (`'center'` default, `'left'`, or `'right'`) and clamped to the viewport in all modes. Reads `theme.nodeActions` (or a generated color-swatch default) and renders three group kinds: `swatches` (colored dots), `buttons` (icon buttons), `menu` (dropdown/popover). Optionally appends a trailing delete button (off by default; opt in with `theme.showToolbarDelete`). Fully replaceable via the `renderNodeToolbar` render prop, which receives `{ node, theme, patch, deleteNode }` — in that case the library still positions the container and the consumer draws its contents.
- `src/components/Breadcrumbs.tsx` — Navigation breadcrumb trail overlay.
- `src/components/LanesBackground.tsx` — Renders column/row bands in canvas-space. Sits inside the transformable `<g>` behind all nodes/edges. Draws alternating fills, optional per-lane color overrides, and dividers between adjacent lanes.
- `src/components/LaneHeaders.tsx` — Screen-space overlay that renders pinned column labels (top strip) and row labels (left strip). Polls the viewport via `requestAnimationFrame` to keep in sync with d3-zoom transforms. Supports `pinned` (sticky to viewport edges) and non-pinned (scrolls with content) modes.
- `src/hooks/useViewport.ts` — d3-zoom integration, fit-to-content. Rejects pan gestures originating inside `.system-canvas-node`, `.system-canvas-resize-handles`, or `.system-canvas-connection-handles` so node/resize/edge-create drags don't also pan. Supports two `panMode`s: `'drag'` (classic d3-zoom) and `'trackpad'` (scroll-to-pan, Cmd+scroll-to-zoom). In trackpad mode, plain wheel events are intercepted by a native `wheel` listener and converted to pan transforms; only modifier-key wheel events pass through to d3-zoom's zoom handler. The filter also reads a shared `marqueeActiveRef` and suppresses non-wheel pan gestures while the marquee is armed (see §Multi-select activation), so wheel-pan keeps working during a marquee but drag-pan yields to it.
- `src/hooks/useNavigation.ts` — Ref-stack breadcrumb state; prefers the synchronous `canvases` map when present, falls back to `onResolveCanvas` with an internal async cache.
- `src/hooks/useCanvasInteraction.ts` — Click, double-click, navigate, and context menu handler wiring for both nodes and edges; owns the "clicking one clears selection of the other" rule in editable mode. The context-menu handlers compute both `position` (canvas-space, via `screenToCanvas`) and `screenPosition` (raw `clientX`/`clientY`) on every right-click — consumers picking floating-menu coordinates should use `screenPosition`.
- `src/hooks/useNodeDrag.ts` — Pointer-event drag with group-children-follow; drag overrides are cleared on pointerup. When `canDropNodeOn` is supplied, the hook also runs a per-frame canvas-space hit-test (skipping the source node and any group children carried with it), exposes the topmost accepted target id as `dropTargetId`, and on release fires `onNodeDrop(sources, target)` and snaps source(s) back instead of committing the position. Topmost-rejected hits short-circuit (no see-through), and the target is re-validated against `nodesRef.current` on release so a target deleted mid-drag falls back to a normal drag-end.
- `src/hooks/useNodeResize.ts` — Pointer-event resize from the four corner handles of a selected node; resize overrides are cleared on pointerup.
- `src/hooks/useEdgeCreate.ts` — Manages the pending-edge drag: source node/side, cursor in canvas-space, live drop-target hit-test (groups excluded); builds a new `CanvasEdge` and fires `onCreate` on release over a valid target.

### system-canvas-standalone

Self-contained IIFE bundle for drop-in `<script>` tag use from a CDN. Bundles React, ReactDOM, d3-zoom, system-canvas, and system-canvas-react into a single file that exposes a `window.SystemCanvas` global. Built with [tsup](https://tsup.egoist.dev/) (esbuild).

- `src/index.tsx` — Thin wrapper. Exports `render(element, options)` which `createRoot`s the element and renders `<SystemCanvas>` with auto-managed internal state. All six mutation callbacks (`onNodeAdd`, `onNodeUpdate`, etc.) are wired internally to the core helpers (`addNode`, `updateNode`, etc.) so consumers don't have to manage `CanvasData` themselves. Consumer callbacks (if provided) are still invoked for observation.
- `tsup.config.ts` — Emits three bundles: `system-canvas.js` (unminified IIFE), `system-canvas.min.js` (minified IIFE, ~90 KB gzipped), and `system-canvas.esm.js` (with `.d.ts`) for bundler consumers.
- `examples/cdn.html` — Reference page showing `<script>` tag usage with theme switching and canvas editing.

The returned `StandaloneInstance` exposes `getCanvas()`, `getCanvases()`, `setCanvas(c)`, `setCanvasesMap(m)`, `update(partial)` (swap any options like theme/editable without remount), `on('change', cb)`, and `destroy()`. `update()` is the preferred way to mutate props post-mount; avoid `destroy` + re-`render` on the same element because React may race its async unmount against the new root.

Themes can be passed as an object, a `Partial<CanvasTheme>` override, or a string name (`'dark' | 'midnight' | 'light' | 'blueprint' | 'warm'`). The wrapper also re-exports `themes` on the global so users can do `SystemCanvas.themes.midnight` for advanced composition.

### Lanes (columns & rows)

The library supports an optional generic **lanes** primitive — named horizontal or vertical bands rendered behind nodes and edges. Lanes are a pure rendering/snapping primitive: the library has no opinion about what they represent. Consumers use them for ordinal roadmap columns (Now/Next/Later), date-derived columns (Jan/Feb/Mar), phase names (Discovery/Build/Ship), swim-lane teams, kanban groupings, or anything else.

- `CanvasData.columns?: CanvasLane[]` — vertical bands positioned along x.
- `CanvasData.rows?: CanvasLane[]` — horizontal bands positioned along y.
- Each `CanvasLane` is `{ id, label, start, size, color? }`. The consumer computes `start`/`size` however they like (even widths via `evenLanes(labels)`, date math, custom bucketing — whatever).
- Bands render inside the transformable `<g>` so they pan and zoom with content; dividers are drawn with `vectorEffect="non-scaling-stroke"` so they stay crisp at any zoom.
- Headers (pinned column labels on top, row labels on left) render as a screen-space SVG overlay above the viewport. Controlled by the `laneHeaders` prop: `'pinned'` (default), `'scroll'`, or `'none'`.
- Setting the `snapToLanes` prop on `SystemCanvas` causes drags to snap a node so it's centered within its column and/or row on commit (the node's resolved width/height is passed to `snapToLane` with `edge: 'center'`). Gated per-axis on whether `columns`/`rows` are defined.
- Core ships pure helpers in `packages/core/src/lanes.ts`: `findLaneAt(pos, lanes)`, `snapToLane(pos, lanes, { edge: 'start' | 'center' | 'nearest', size? })`, `evenLanes(labels, size?, start?)`, `lanesExtent(lanes)`.
- The built-in `roadmap` theme (in `packages/core/src/themes/roadmap.ts`) pairs well with lanes — it ships categories for `initiative`, `milestone`, `outcome`, `blocker`, `parked`, plus a `lane` group category, and includes bespoke 16x16 icons (initiative, milestone, outcome, blocker, parked) shipped via the theme's `icons` map.

## Key concepts

### JSON Canvas spec extensions

We extend the [JSON Canvas spec](https://jsoncanvas.org) with two optional fields on nodes:

- **`ref`** (string) — A URI pointing to a sub-canvas. Any node type can have a ref. Nodes with refs are "navigable" — the carved corner indicator on the node navigates via the `onResolveCanvas` callback or a synchronous `canvases` map.
- **`category`** (string) — Maps to a `CategoryDefinition` in the theme. Provides default width, height, fill, stroke, corner radius, icon, and an optional `type` (the JSON Canvas node type a category creates from the add-node menu; defaults to `text`). When `category` is set, `width` and `height` become optional.

### Navigation model

Navigation is discrete, not continuous zoom. Navigable nodes render a clickable **carved corner** (bottom-right for text/file/link, top-right for groups) that continues the node's own stroke to form a small square containing an arrow/chevron. Clicking that corner pushes a new canvas onto a breadcrumb stack. The carve's edge length is driven by `theme.node.refIndicator.size` (default 18); the inner glyph and stroke widths scale proportionally so larger indicators stay visually balanced.

Clicking the node body itself never navigates — it fires `onNodeClick` and (in editable mode) selects the node. Double-clicking a node always opens the inline editor in editable mode.

Two resolution paths for sub-canvas data (in priority order):
1. **`canvases` prop** — a synchronous `Record<string, CanvasData>`. Always preferred when a ref is present in the map. Required for `editable` mode so consumer-side edits to sub-canvases are observable by the library.
2. **`onResolveCanvas(ref)`** — async callback. Results are cached internally by ref. Used as a fallback when `canvases` lacks the ref.

Breadcrumbs allow navigating back up. The library exposes `currentCanvasRef` (the ref of the currently-viewed canvas, `undefined` at root) so editing callbacks can identify which entry in the consumer's canvases map to mutate.

### Viewport & auto-fit

The viewport is driven by d3-zoom. `defaultViewport` (optional) sets the initial pan/zoom and suppresses all auto-fit behavior. Without it, the `autoFit` prop controls when the viewport re-centers to the visible content:

- `'canvas-change'` (default) — fit on initial mount and when navigating to a different canvas. Edits (add / move / resize / delete) do **not** re-fit. This is the typical UX for editable canvases: the view stays stable while the user works.
- `'always'` — fit on every change to the nodes array, including after every edit. Legacy behavior; useful for read-only dashboards whose data streams in.
- `'initial'` — fit once on mount only. Navigation between sub-canvases keeps the current pan/zoom (usually not what you want).
- `'never'` — no auto-fit. Consumer is fully responsible for the viewport.

Navigation zoom-to-node animations set an internal flag that makes the very next fit instant (no animation), so the zoom-in-and-snap sequence looks continuous.

### Pan mode

The `panMode` prop on `<SystemCanvas>` controls how mouse/trackpad gestures map to pan and zoom:

- `'drag'` (default) — drag-to-pan, scroll/pinch-to-zoom. Classic d3-zoom behavior, optimal for mouse users.
- `'trackpad'` — two-finger scroll pans, Cmd+scroll (or Ctrl+scroll / pinch) zooms. Matches Excalidraw / Figma / Google Maps trackpad conventions.

In trackpad mode, d3-zoom's built-in wheel handler is filtered to only accept modifier-key scroll events (Cmd/Ctrl). A separate native `wheel` event listener on the SVG intercepts plain scroll events and translates `deltaX`/`deltaY` into pan transforms. The `panMode` value is read from a ref so it can change at runtime without reinstalling the d3-zoom behavior. Drag-to-pan on the background still works in both modes — **unless** `multiSelectKey` claims the plain background drag for the marquee (see next section).

### Multi-select activation (`multiSelectKey`)

The marquee (rubber-band) multi-select gesture is available in `editable` mode. The `multiSelectKey` prop on `<SystemCanvas>` controls how it's activated, and it composes with `panMode` around a single constraint: **a background drag is one gesture that can only be pan OR marquee.** `panMode` sets the gesture budget for the background; `multiSelectKey` picks how marquee fits into what's left.

- `'space'` (held) — background-drag draws a marquee while Space is held; plain drag still pans. Works in both pan modes.
- `'shift'` / `'alt'` / `'meta'` — same held-key model, bound to that modifier. (Ctrl is intentionally excluded — it collides with macOS right-click and Cmd/Ctrl+A select-all.)
- `'none'` — plain background-drag draws a marquee, no key. Only coherent with `panMode: 'trackpad'` (scroll pans, so the plain drag is free). With `panMode: 'drag'` it leaves no drag-to-pan affordance and scroll is bound to zoom — a documented foot-gun.
- `'auto'` (**default**) — resolves against `panMode`: `'drag'` → `'space'` (the historical default, fully backward-compatible), `'trackpad'` → `'none'` (Figma / Excalidraw convention: plain-drag marquees, scroll pans).

**Mechanism.** `useMultiSelect` owns a `marqueeActiveRef` boolean — "should the next background drag be a marquee?" For the held keys it's armed on keydown and disarmed on keyup; for `'none'` it's pinned `true` for the canvas's lifetime. `useViewport`'s d3-zoom `.filter()` reads the same ref (shared via `SystemCanvas`) and rejects non-wheel pan gestures whenever it's `true`, so pan and marquee never both fire on one drag. Wheel events are always allowed through the filter, so trackpad scroll-pan keeps working while the marquee is armed. `SystemCanvas` resolves `'auto'` against `panMode` before handing a concrete key to the hook, so the hook never sees `'auto'`. The marquee pointerdown mirrors the viewport filter's exclusions (`.system-canvas-node` / `.system-canvas-resize-handles` / `.system-canvas-connection-handles`) so an armed marquee never hijacks a node-drag, resize, or edge-create gesture — this matters most in `'none'` mode where the marquee is always armed.

### Editing model

The library is stateless with respect to canvas data. When `editable` is true, it emits granular mutation callbacks; the consumer owns `CanvasData` and passes the updated object back as the `canvas` prop (or via the `canvases` map for sub-canvases).

Callbacks (all receive `canvasRef: string | undefined` — the ref of the canvas the node/edge lives on, or `undefined` for the root):
- `onNodeAdd(node, canvasRef)` — fired when the user picks an option from the add-node menu.
- `onNodeUpdate(nodeId, patch, canvasRef)` — fired after drags and editor commits. `patch: NodeUpdate` is `Partial<Omit<CanvasNode, 'id' | 'type'>>`.
- `onNodesUpdate(updates, canvasRef)` — **batched** node-update callback. When provided, wins over `onNodeUpdate` for drag commits — fires once per drag-end with every moved node, even for a group drag carrying many children. Solves a classic stale-state footgun: consumers that mirror React state into a ref via `useEffect` (the common pattern when callbacks need synchronous "current state" reads) cannot observe per-call mutations between synchronous calls, because the `useEffect` mirror has not yet run. Without batching, dragging a group of N nodes leaves N-1 nodes snapping back to their pre-drag positions on release because every per-node `setState` reads the same stale starting state and overwrites the previous iteration's mutation. Resize commits go through `onNodeUpdate` regardless — resize only ever moves one node so batching is moot. Skip this prop if your `onNodeUpdate` consumer reads state synchronously (e.g. `useReducer` or a Zustand store); the fallback per-node loop is fine.
- `onNodeDelete(nodeId, canvasRef)` — fired when the user presses Delete/Backspace with a selected node.
- `onEdgeAdd(edge, canvasRef)` — fired when the user completes an edge-creation drag (connection handle → another node).
- `onEdgeUpdate(edgeId, patch, canvasRef)` — fired after edge label editor commits. `patch: EdgeUpdate` is `Partial<Omit<CanvasEdge, 'id'>>`.
- `onEdgeDelete(edgeId, canvasRef)` — fired when the user presses Delete/Backspace with a selected edge.

Consumers typically implement these by calling the core helpers `addNode / updateNode / removeNode / addEdge / updateEdge / removeEdge` on their own `Record<string, CanvasData>` map.

Editing UI:
- **Add**: a floating "+" button opens a popover listing categories (with color swatch + icon) above base JSON Canvas types. Fully replaceable via the `renderAddNodeButton` render prop.
- **Drag**: pointer-event drag on any node. Dragging a group moves its spatially-contained children (computed once at drag-start via `getGroupChildren`). Drag overrides are local to the library and cleared on pointerup; the committed position flows through `onNodeUpdate`.
- **Edit**: double-click any node opens an inline editor in a `<foreignObject>` — `<textarea>` for `text`, `<input>` for `file` / `link` / `group`. Enter commits, Escape cancels.
- **Edges**: single-click selects an edge (thicker, high-contrast stroke). Double-click opens an inline label editor (`<foreignObject>` centered on the edge midpoint). Selecting an edge clears any node selection and vice versa. `onEdgeClick` always fires — in editable mode, selection happens alongside.
- **Connect**: hovering a node in editable mode reveals four connection handles (one per side, fading in after ~300ms to avoid flashing on mouse fly-throughs). Dragging from a handle to another node creates a new edge, firing `onEdgeAdd(edge, canvasRef)`. The new edge's `fromSide` is set to the handle that was grabbed; `toSide` is left undefined so the renderer auto-routes. Releasing over empty space cancels silently. A ghost edge (`PendingEdgeRenderer`) tracks the cursor during the drag; the hovered drop target gets a highlight halo. **Groups are excluded** from both hover hit-testing and drop-target hit-testing — they never expose handles and cannot be edge endpoints through this UI.
- **Delete**: single-click selects (dashed outline for nodes, highlighted stroke for edges). The outer `<div>` has `tabIndex={0}` so Delete/Backspace fires `onNodeDelete` or `onEdgeDelete` depending on what's selected. Keys are scoped to the canvas — no window listener.
- **Pan vs. drag**: d3-zoom's `.filter()` rejects any gesture whose target is inside `.system-canvas-node`, so node drags never double as canvas pans. Background drags still pan normally.
- **Drop on node**: the optional `canDropNodeOn(sources, target) => boolean` predicate turns node-on-node drops into a first-class interaction. While dragging, the library hit-tests the pointer against renderable nodes and asks the predicate per hover; accepted targets paint a dashed "droppable" halo (`.system-canvas-node-drop-target`). On release over an accepted target, `onNodeDrop(sources, target, { canvasRef })` fires and the source(s) snap back to their pre-drag positions — the consumer's job is purely to mutate data and trigger a refetch (the most common follow-up moves the source onto a different sub-canvas, so leaving it at drop coords for one frame would be visually meaningless and risks an autosave race writing a position overlay for a node that no longer renders there). When the predicate rejects the hover, release falls through to a normal repositioning drag (`onNodeUpdate` for x/y) — same UX as today. Self-drop is filtered by the library before the predicate is called. `sources[0]` is always the grabbed node; when a multi-selection is dragged the array carries the full selection (all moving nodes). Skip the props entirely and the new code path is dormant — no predicate calls, no highlight, no `onNodeDrop`.

### Category slots

Categories own more than just a node's default dimensions and colors — they can also declare:

- **`slots: CategorySlots`** — declarative visual add-ons (`color`, `progress`, `count`, `pill`, `text`, `dot`, `icon`, `custom`) placed in library-owned positional regions: `topEdge` / `bottomEdge` / `leftEdge` / `rightEdge` / `bodyTop` / `topLeft` / `topRight` / `bottomLeft` / `bottomRight` / `topRightOuter` / `header` / `footer`. Kind and position are orthogonal — any kind fits any region. One slot per position (v1). Slot values are `NodeAccessor<T>` — either a static value or a function `(ctx: SlotContext) => T`. The context carries `{ node, theme, region, canvases, getSubCanvas, rollup }`. `ctx.rollup(pred)` is a zero-arg convenience that rolls up the node's own sub-canvas (`rollupNodes(getSubCanvas(node.ref), pred)`); the full `rollupNodes` / `rollupNodesDeep` helpers are exported from core for deeper cases. **Color inheritance:** every color-bearing slot (`color`, `progress`, `count`, `pill`, `dot`, `icon`) treats `color` as optional — when omitted it inherits `node.resolvedStroke`, so swatch-toolbar color changes propagate to every slot without per-slot accessor functions. **`kind: 'icon'` specifics.** Renders an SVG glyph centered in the region. `name: NodeAccessor<string>` looks up paths in `theme.icons[name]` first (consumer-provided, e.g. a brand-icon set), falling back to the library's built-in icon set (`database`, `server`, `cloud`, `cog`, `package`, `lock`, `globe`, `code`, `folder`, `network`, `shield`, `zap`, `users`, `terminal`, `person`). Unknown names render nothing — no warning, since accessor-driven names may legitimately have no icon yet. Default size auto-fits the region's shorter axis; override via `size`. Reflow treats a `topLeft` icon the same as a `topLeft` dot — reserves left padding so the body title clears the icon. **Two render styles**: `mode: 'stroke'` (default, the right shape for the lib's built-in line glyphs) paints `stroke={color}` + `fill="none"`; `mode: 'fill'` paints `fill={color}` + no stroke — the right shape for brand silhouettes (simple-icons, Lucide filled, FontAwesome solid). A stroked Vercel triangle is just an outline; a filled one is the Vercel logo. **Two coordinate spaces** via `viewBox`: `16` (default, matches the lib's built-ins) or `24` (matches simple-icons and most brand-icon CDNs). The renderer rescales path data to the target `size` regardless. Both `mode` and `viewBox` are `NodeAccessor`s, so a single `IconSlot` can render line glyphs for fallback `customData.kind` values and filled brand glyphs for known ones. Canonical use case: one `service` category whose icon switches per-node via `customData.kind` (Vercel / EC2 / Postgres / etc.) against a brand-icon registry on the theme — exactly what the showcase demo's `service` row demonstrates. `NodeRenderer` computes `computeReflowReservations` so node text and icons inset around header/footer/edge-strip slots (and any slot that triggers the dashboard layout applies baseline horizontal padding matching the header inset), and `pickRefIndicatorCorner` moves the carved navigation corner to the diagonally-opposite corner when its default position is occupied (or headers/footers block the whole top/bottom row). Edge-strip slots are rendered inside a clipPath matching the node's rounded rect so fills bleed naturally under the corners. All slot primitives render with `pointerEvents="none"` so they never intercept node clicks. The escape hatch `kind: 'custom'` receives the region `Rect` via `ctx.region` and returns arbitrary SVG — consumers typically reuse the exported primitives (`NodeColorFill`, `NodeProgressBar`, `NodeCountBadge`, `NodeStatusPill`, `NodeDot`, `NodeText`, `NodeIcon`) from the `system-canvas-react/primitives` entry.

- **`toolbar: NodeActionGroup[]`** — per-category override of the floating node toolbar. Resolved by `getNodeActionsForNode(node, theme)`: category's `toolbar` wins when present, else the theme's `nodeActions`, else a generated color-swatch group. No auto-merge — use `buildDefaultToolbar(theme)` (spread) to explicitly include the default groups alongside category-specific ones. Because toolbar actions can patch any node field including `category`, a category-switching toolbar transforms a node's visuals, toolbar, and editor in one click — no special machinery needed.

- **`editableFields: EditableField[]`** — per-category inline editor schema. When declared, double-clicking the node opens a multi-field form instead of the historical single-field variant. Each field has a dot-path (`'text'`, `'label'`, `'customData.status'`), a `kind` (`text` / `textarea` / `number` / `select` / `boolean`), and optional `label` / `options` / `min` / `max` / `step` / `placeholder`. Commit fires on panel blur or `Cmd+Enter`; cancel on `Escape`; `Enter` on a non-textarea field advances focus or commits on the last field. The built patch includes a merged `customData` object so consumers can shallow-merge it without losing sibling keys.

- **`defaultCustomData: Record<string, unknown>`** — seed `customData` for new nodes created from this category via the add-node FAB. Deep-cloned per instance (via `structuredClone`) so two new nodes never share nested references. Pairs naturally with `editableFields`.

**Text wrapping & gradient fill on `kind: 'text'` slots.** A `text` slot in the `body` position auto-wraps `value` to `region.width` and honors `\n` for paragraph breaks (default `wrap: true`). All other positions render single-line by default; opt in with `wrap: true`. `maxLines` truncates with an ellipsis. `lineHeight` overrides per-line vertical advance (default `~fontSize * 1.25`). `verticalAlign: 'top' | 'center' | 'bottom'` (default `'top'`) shifts the rendered block within the region — `'center'` is what the node-type components use to vertically-center wrapped default labels. A `fill: { from, to, angle? }` field paints text with a per-node `<linearGradient>` def — the consumer gets the "gradient title" headline pattern declaratively without a `kind: 'custom'` body. The wrap helpers (`wrapText`, `wrapTextWithBreaks`, `measureTextWidth`) are exported from core so `kind: 'custom'` renderers can wrap consistently. With these defaults, a category that wants a wrapped body title is just `body: { kind: 'text', value: ctx => ctx.node.text }` — no custom React.

**`hideWhenZero` on `kind: 'progress'`.** A progress bar with `hideWhenZero: true` returns null when `value` resolves to 0 — useful for cards that only show progress once a denominator exists (a milestone's empty track would otherwise read as "0% complete" rather than "no data yet").

All four fields are optional and additive — existing themes behave identically until they opt in. The `showcase` demo mode (`demo/src/showcase.ts`) is the visual reference sheet — a 4×3 grid of nodes, each exercising a different slot kind or position, including `kind: 'custom'` via a tiny sparkline, a fully-dressed node with four coexisting slots, and a group with a `topRight` badge (which forces the ref indicator to `bottomLeft` via the collision resolver).

### Node toolbar actions

`theme.nodeActions: NodeActionGroup[]` drives the floating toolbar. Each group has a `kind`: `'swatches'` (colored dots), `'buttons'` (icon buttons), or `'menu'` (dropdown whose trigger reflects the currently-active action). When a theme declares `nodeActions`, it fully replaces the default color-swatch group (no auto-merge). Each `NodeAction` has a `patch` (object or `(node) => NodeUpdate`) that can mutate **any** node field — not just `color`. Combined with `isActive(node)` and `appliesTo(node)` this is the extension point for status pickers, type switchers, toggles, and cycles. The canonical pattern for roadmap-style UIs is a `swatches` group where each dot sets `{ category }` (and optionally `color`), with `isActive` keyed on `category` — so what looks like a color picker is actually a status picker. The trailing delete button is **off by default** — set `theme.showToolbarDelete = true` to opt in. Consumers who want confirmation dialogs, soft-delete, or a custom delete action wired via `nodeActions` get the empty default; users can still delete a selected node with the Delete/Backspace keys regardless of this flag.

### Node context menu

Right-clicking a node can surface a small library-rendered menu of consumer-defined actions. There are two layers, and they coexist:

1. **`onContextMenu(event: ContextMenuEvent)`** (raw escape hatch) — fires on every node, edge, and canvas-background right-click. The library calls `event.preventDefault()` for you. `event.position` is in canvas-space (post-pan/zoom); `event.screenPosition` is the raw `clientX`/`clientY` (use this for `position: fixed` floating UI). `event.target` is the `CanvasNode` or `CanvasEdge` for `'node'` / `'edge'` events; absent for `'canvas'`.

2. **`nodeContextMenu: NodeContextMenuConfig`** (declarative) — drop in a list of `NodeContextMenuItem` objects and an `onSelect` callback; the library renders the menu, filters per-node via each item's `match` predicate, dismisses on outside-click / Escape / scroll / blur, and clamps to the viewport. Items support `label`, `icon`, `destructive` styling, `match: { categories?, types?, when? }` (ANDed), and `disabled(node, ctx)`. `onSelect` receives `(itemId, node, { canvasRef, screenPosition })`. Filter helpers `matchesContextMenuItem` and `filterContextMenuItems` are exported from core for consumers building their own menu UI on top of `onContextMenu`.

Both fire on the same right-click — the declarative menu is the common case, the raw callback is the escape hatch (consumer-rendered submenus, async-loaded items, edge / canvas-background menus). When `nodeContextMenu` is set but no items match the right-clicked node, no menu opens (the right-click becomes a silent no-op apart from suppressing the browser default). The menu surface is themed via `theme.contextMenu: ContextMenuTheme` — every built-in theme ships a tuned palette; custom themes inherit `darkTheme.contextMenu` via `resolveTheme`.

The `showcase` demo (`demo/src/main.tsx`'s `showcaseContextMenu`) is the live reference: status changers gated by `match.categories` with `disabled` reflecting the current state, a flip action gated by `match.when`, a universal "Copy id" item with no `match`, and a destructive "Delete node" item. Switch the demo to `?mode=showcase` and right-click any node to see the menu.

### Theme system

Themes are plain objects implementing `CanvasTheme`. They control every visual aspect: background, grid, node styles, edge styles, group styles, breadcrumb styles, preset color mappings ("1"-"6"), and category definitions.

Resolution order for node visuals:
1. Explicit node properties (`color`, `width`, `height`) — highest priority
2. Category defaults from theme — fallback when node properties are absent
3. Base theme defaults — final fallback

> **Trap when adding a new top-level `CanvasTheme` field:** `resolveTheme` in `packages/core/src/themes/resolve.ts` builds the merged theme by **enumerating known fields explicitly** — there is no `...partial` spread. Any top-level field you add to `CanvasTheme` must also be wired into `resolveTheme` (e.g. `myField: partial.myField ?? base.myField`), otherwise it will be silently dropped from every resolved theme and `theme.myField` will be `undefined` at render time. TypeScript will not catch this because every `CanvasTheme` field is optional. When in doubt, grep `resolveTheme` after touching `CanvasTheme`.

### Rendering technique

Nodes use the **double-rect technique**: an opaque backer rectangle (matching the background color) is drawn first, then a semi-transparent styled rectangle on top. This prevents edges from bleeding through transparent node fills.

SVG paint order (painter's model, later = on top): **groups → edges → non-group nodes → resize handles**. Groups sit behind so edges can pass over their translucent fills and remain clickable; regular nodes sit above edges so arrow tips tuck cleanly under node borders at endpoints.

## Commands

```bash
npm run build            # Build all packages (core → react → standalone)
npm run build:core       # Build system-canvas only
npm run build:react      # Build system-canvas-react only
npm run build:standalone # Build system-canvas-standalone (IIFE + ESM bundles)
npm run dev              # Start the Vite demo app at localhost:5173
npm run typecheck        # Type-check all workspaces
```

## Versioning & releases

This repo publishes all three packages (`system-canvas`, `system-canvas-react`, `system-canvas-standalone`) to npm **in lockstep** — they always share a single version number. Releases are fully automated: every push to `main` triggers `.github/workflows/release.yml`, which bumps the patch version, syncs it across all workspaces, builds, and publishes via npm OIDC trusted publishing.

**Rules for agents editing this repo:**

- **Never edit the `version` field in any `packages/*/package.json`.** Those values are owned by the release workflow and are overwritten on every publish by `scripts/sync-versions.mjs`. A PR that bumps a single package's version will be silently clobbered at best, or break the build at worst (internal `^x.y.z` dep ranges will fail to resolve against a desynced workspace version).
- **Never edit the internal cross-dep ranges** (e.g. `system-canvas-react`'s `"system-canvas": "^0.2.0"` entry). `sync-versions.mjs` rewrites these to `^<root-version>` on every release.
- **To request a non-patch release** (minor or major bump), run `npm run release:minor` or `npm run release:major` locally. These bump the root `version`, run `sync-versions`, commit, and push — the release workflow then detects the explicit version change and publishes that exact version instead of auto-patching. (You can also do this by hand: edit root `version`, run `npm run sync-versions`, commit, push.) Do this in a dedicated commit/PR titled `release: v0.3.0`; do not combine it with feature work.
- **The default for any PR is a patch bump.** Don't think about versioning at all for feature/fix/refactor PRs — the workflow handles it. Just merge and a new patch publishes within ~60 seconds.

**Files involved (don't move or rename these without updating the workflow):**

- `.github/workflows/release.yml` — the release pipeline. Registered as a trusted publisher on npmjs.com for all three packages.
- `scripts/sync-versions.mjs` — propagates root version into every workspace and rewrites internal dep ranges.
- Each `packages/*/package.json` has a `prepublishOnly: npm run build` safety net so unbuilt code can't ship even if the workflow's explicit build step is removed.

## Code conventions

- **No CSS files.** All styling is inline via SVG attributes and React `style` props, driven by the theme object.
- **No emojis in code or comments.**
- **`.js` extensions in imports** — Required for ESM compatibility. All internal imports use `.js` even though source is `.ts` (e.g., `from './types.js'`).
- **Core must have zero React imports.** The boundary between packages is strict: core does math and data, react does DOM and events.
- **Types live in core.** Even types used primarily by React components (like `ContextMenuEvent`) are defined in `system-canvas` so framework adapters can use them.
- **Nodes are resolved before rendering.** Raw `CanvasNode` goes through `resolveNode()` to produce `ResolvedNode` with all dimensions and colors computed. Renderers only work with `ResolvedNode`.

## Adding a new theme

1. Create `packages/core/src/themes/yourtheme.ts` implementing `CanvasTheme`
2. Export it from `packages/core/src/themes/index.ts`
3. Add it to the `themes` object in `packages/core/src/index.ts`

## Adding a new node type

The JSON Canvas spec has 4 types: text, file, link, group. If you add a new type:

1. Add the type string to `NodeType` in `types.ts`
2. Add any type-specific fields to `CanvasNode` in `types.ts`
3. Create a new component in `packages/react/src/components/`
4. Register it in `NodeRenderer.tsx`'s `getNodeComponent()` switch

## Adding a new edge routing style

1. Add the style string to `EdgeStyle` in `types.ts`
2. Implement the path computation function in `rendering/edge-routing.ts`
3. Add the case to the switch in `computeEdgePath()`
