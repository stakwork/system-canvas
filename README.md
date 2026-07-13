# system-canvas

Interactive, infinitely zoomable, editable SVG diagrams from JSON Canvas documents.

![system-canvas demo](demo/zoom.gif)

## Packages

| Package                    | Description                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `system-canvas`            | Pure TypeScript core. Types, themes, edge routing, viewport math. Zero dependencies. |
| `system-canvas-react`      | React components. Pan/zoom viewport, node renderers, breadcrumb navigation.          |
| `system-canvas-standalone` | Self-contained IIFE bundle for `<script>` tag / CDN use. No build step required.     |
| `system-canvas-collab`     | Yjs-backed multi-user collaboration. Binds a Y.Doc to the renderer's props + awareness → conflict-free multiplayer; you supply the transport. |

## Install

```bash
npm install system-canvas system-canvas-react
```

## Quick start

```tsx
import { SystemCanvas } from "system-canvas-react";

const canvas = {
  theme: {
    base: "dark",
    categories: {
      service: {
        defaultWidth: 140,
        defaultHeight: 60,
        fill: "rgba(6, 78, 59, 0.4)",
        stroke: "#34d399",
      },
    },
  },
  nodes: [
    {
      id: "api",
      type: "text",
      text: "API Server\nExpress",
      x: 0,
      y: 0,
      category: "service",
    },
    {
      id: "db",
      type: "text",
      text: "PostgreSQL",
      x: 250,
      y: 0,
      width: 140,
      height: 60,
      color: "6",
    },
  ],
  edges: [{ id: "e1", fromNode: "api", toNode: "db", label: "queries" }],
};

function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <SystemCanvas canvas={canvas} />
    </div>
  );
}
```

## Standalone (no build step)

```html
<div id="app" style="width: 100vw; height: 100vh"></div>
<script src="https://unpkg.com/system-canvas-standalone/dist/system-canvas.min.js"></script>
<script>
  SystemCanvas.render(document.getElementById("app"), {
    canvas: {
      nodes: [
        { id: "a", type: "text", text: "API", x: 0, y: 0, width: 120, height: 60, color: "4" },
        { id: "b", type: "text", text: "DB", x: 220, y: 0, width: 120, height: 60, color: "6" },
      ],
      edges: [{ id: "e1", fromNode: "a", toNode: "b" }],
    },
    theme: "midnight",
    editable: true,
  });
</script>
```

## Features

- **Pan and zoom** with mouse/trackpad (d3-zoom)
- **Nested canvases** -- nodes with a `ref` property are clickable; clicking navigates to a sub-canvas with breadcrumb trail back
- **Editable mode** -- add, drag, resize, inline-edit, and delete nodes; create edges by dragging between node border handles; inline-edit edge labels; Delete/Backspace removes selected nodes or edges
- **5 built-in themes** -- dark, midnight, light, blueprint, warm
- **3 edge routing modes** -- bezier, straight, orthogonal
- **Categories** -- define reusable node styles (dimensions, colors, icons) in the theme
- **JSON Canvas compatible** -- extends the [JSON Canvas spec](https://jsoncanvas.org) with `ref`, `category`, and inline `theme`

## Themes

```tsx
import { SystemCanvas } from 'system-canvas-react'
import { themes } from 'system-canvas'

<SystemCanvas canvas={data} theme={themes.midnight} />
<SystemCanvas canvas={data} theme={themes.blueprint} />
```

Or set the base theme in the canvas data itself:

```json
{ "theme": { "base": "warm" }, "nodes": [...] }
```

## Navigation

Nodes with a `ref` property become navigable. Provide an `onResolveCanvas` callback to load sub-canvases:

```tsx
<SystemCanvas
  canvas={rootCanvas}
  onResolveCanvas={async (ref) => {
    const response = await fetch(`/api/canvas/${ref}`);
    return response.json();
  }}
/>
```

## Editing

Pass `editable` and wire the granular mutation callbacks. The library is stateless -- you own `CanvasData` and pass it back on every render. Core helpers do the immutable merge for you:

```tsx
import { useState } from "react";
import { SystemCanvas } from "system-canvas-react";
import {
  addNode,
  updateNode,
  removeNode,
  addEdge,
  updateEdge,
  removeEdge,
} from "system-canvas";
import type { CanvasData } from "system-canvas";

function App() {
  const [canvas, setCanvas] = useState<CanvasData>(initial);

  return (
    <SystemCanvas
      canvas={canvas}
      editable
      onNodeAdd={(node) => setCanvas((c) => addNode(c, node))}
      onNodeUpdate={(id, patch) => setCanvas((c) => updateNode(c, id, patch))}
      onNodeDelete={(id) => setCanvas((c) => removeNode(c, id))}
      onEdgeAdd={(edge) => setCanvas((c) => addEdge(c, edge))}
      onEdgeUpdate={(id, patch) => setCanvas((c) => updateEdge(c, id, patch))}
      onEdgeDelete={(id) => setCanvas((c) => removeEdge(c, id))}
    />
  );
}
```

Every editing callback receives a third `canvasRef: string | undefined` argument identifying which canvas the change belongs to (`undefined` at the root). When `editable` is enabled with sub-canvases, pass a synchronous `canvases: Record<string, CanvasData>` map so edits to sub-canvases are observable by the library.

Interactions in editable mode:

- **Drag** nodes to move them; dragging a group moves its spatially-contained children.
- **Resize** the selected node via the four corner handles.
- **Double-click** a node to inline-edit its text/file/link/label; **double-click** an edge to inline-edit its label.
- **Hover** a node to reveal four connection handles (one per side); **drag** from a handle to another node to create an edge. Groups don't participate in edge creation.
- **Click** to select, **Delete** or **Backspace** to remove the selected node or edge. **Escape** clears selection.

## Multiplayer (`system-canvas-collab`)

Conflict-free multi-user editing, backed by [Yjs](https://yjs.dev). The
library owns the merge; you supply a transport (y-websocket, a hosted
provider, or your own HTTP+pub/sub bridge).

```bash
npm install system-canvas-collab yjs
```

```tsx
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { SystemCanvas } from "system-canvas-react";
import { useYjsCanvas, useCollaborators } from "system-canvas-collab";

const doc = new Y.Doc();
const provider = new WebsocketProvider("wss://…", "room-id", doc);

function Board() {
  const { canvas, ...handlers } = useYjsCanvas(doc); // Y.Doc ⇄ CanvasData
  const { collaborators, setLocalCursor } = useCollaborators(provider.awareness);
  return (
    <SystemCanvas canvas={canvas} editable collaborators={collaborators} {...handlers} />
  );
}
```

`useYjsCanvas` returns the controlled `canvas` plus every edit callback
`<SystemCanvas>` needs, routing edits into the Y.Doc (field-level merge;
per-user undo via `Y.UndoManager`). `useCollaborators` maps a Yjs
`Awareness` to the `collaborators` prop for live cursors/selection. The
renderer core is unchanged — collaboration is entirely opt-in.

## Props

| Prop                | Type                                     | Description                                                        |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `canvas`            | `CanvasData`                             | Canvas document to render                                          |
| `theme`             | `CanvasTheme`                            | Theme override (optional, defaults to dark)                        |
| `edgeStyle`         | `'bezier' \| 'straight' \| 'orthogonal'` | Edge routing mode (default: bezier)                                |
| `onResolveCanvas`   | `(ref: string) => Promise<CanvasData>`   | Resolve a ref to sub-canvas data                                   |
| `onNodeClick`       | `(node: CanvasNode) => void`             | Node click handler                                                 |
| `onNodeDoubleClick` | `(node: CanvasNode) => void`             | Node double-click handler                                          |
| `onEdgeClick`       | `(edge: CanvasEdge) => void`             | Edge click handler                                                 |
| `onEdgeDoubleClick` | `(edge: CanvasEdge) => void`             | Edge double-click handler                                          |
| `onContextMenu`     | `(event: ContextMenuEvent) => void`      | Right-click handler                                                |
| `editable`          | `boolean`                                | Enable add / edit / move / delete for nodes and edges              |
| `onNodeAdd`         | `(node, canvasRef) => void`              | Fired after user picks an option from the add-node menu            |
| `onNodeUpdate`      | `(nodeId, patch, canvasRef) => void`     | Fired after drags and node editor commits                          |
| `onNodeDelete`      | `(nodeId, canvasRef) => void`            | Fired on Delete/Backspace with a selected node                     |
| `onEdgeAdd`         | `(edge, canvasRef) => void`              | Fired when the user drags from a connection handle to another node |
| `onEdgeUpdate`      | `(edgeId, patch, canvasRef) => void`     | Fired after edge label editor commits                              |
| `onEdgeDelete`      | `(edgeId, canvasRef) => void`            | Fired on Delete/Backspace with a selected edge                     |
| `onNavigate`        | `(ref: string) => void`                  | Called when navigating to a sub-canvas                             |
| `onBreadcrumbClick` | `(index: number) => void`                | Called when a breadcrumb is clicked                                |
| `rootLabel`         | `string`                                 | Root breadcrumb label (default: "Home")                            |
| `minZoom`           | `number`                                 | Minimum zoom level (default: 0.1)                                  |
| `maxZoom`           | `number`                                 | Maximum zoom level (default: 4)                                    |
| `defaultViewport`   | `ViewportState`                          | Initial viewport position and zoom                                 |
| `onViewportChange`  | `(viewport: ViewportState) => void`      | Called on pan/zoom                                                 |

## JSON Canvas extensions

This library extends the [JSON Canvas 1.0 spec](https://jsoncanvas.org) with three additive fields:

| Field      | On        | Purpose                                                         |
| ---------- | --------- | --------------------------------------------------------------- |
| `ref`      | any node  | URI pointing to a sub-canvas for drill-down navigation          |
| `category` | any node  | Maps to a category definition in the theme for reusable styling |
| `theme`    | top-level | Inline base theme name and category definitions                 |

Standard JSON Canvas documents render correctly. The extensions are ignored by other viewers.

## Development

```bash
npm install
npm run build    # build core + react
npm run dev      # start demo at localhost:5173
```

## License

MIT
