import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SystemCanvas, type SystemCanvasHandle } from 'system-canvas-react'
import {
  darkTheme,
  midnightTheme,
  lightTheme,
  blueprintTheme,
  warmTheme,
  roadmapTheme,
  addNode as addNodeHelper,
  updateNode as updateNodeHelper,
  removeNode as removeNodeHelper,
  addEdge as addEdgeHelper,
  updateEdge as updateEdgeHelper,
  removeEdge as removeEdgeHelper,
} from 'system-canvas'
import type {
  CanvasData,
  CanvasTheme,
  CanvasNode,
  CanvasEdge,
  NodeContextMenuConfig,
  EdgeContextMenuConfig,
  NodeUpdate,
  EdgeUpdate,
} from 'system-canvas'
import { rootCanvas as initialRoot, canvasMap as initialCanvasMap } from './data.js'
import { roadmapRoot, roadmapCanvasMap } from './roadmap.js'
import { kanbanRoot, kanbanCanvasMap, kanbanTheme } from './kanban.js'
import { swimlaneRoot, swimlaneCanvasMap, swimlaneTheme } from './swimlane.js'
import { nestedRoot, nestedCanvasMap } from './nested.js'
import { showcaseRoot, showcaseCanvasMap, showcaseTheme } from './showcase.js'
import { gatewayRoot, gatewayCanvasMap, gatewayTheme } from './gateway.js'

const allThemes: Record<string, CanvasTheme> = {
  dark: darkTheme,
  midnight: midnightTheme,
  light: lightTheme,
  blueprint: blueprintTheme,
  warm: warmTheme,
  roadmap: roadmapTheme,
  kanban: kanbanTheme,
  swimlane: swimlaneTheme,
  showcase: showcaseTheme,
  gateway: gatewayTheme,
}

const ROOT_KEY = '__root__'

type Mode = 'system' | 'roadmap' | 'kanban' | 'swimlane' | 'nested' | 'showcase' | 'gateway'

// Which theme feels most natural for each mode. Consumers can still pick
// anything from the theme dropdown, but switching modes flips to the
// matching theme automatically for a nicer out-of-the-box demo.
const DEFAULT_THEME_FOR_MODE: Record<Mode, string> = {
  system: 'dark',
  roadmap: 'roadmap',
  kanban: 'kanban',
  swimlane: 'swimlane',
  nested: 'dark',
  showcase: 'showcase',
  gateway: 'gateway',
}

// Whether each mode supports snap-to-lanes. Driven by whether the underlying
// canvas actually has columns or rows.
const MODE_HAS_LANES: Record<Mode, boolean> = {
  system: false,
  roadmap: true,
  kanban: true,
  swimlane: true,
  nested: true, // sub-canvases have lanes even though the root doesn't
  showcase: false,
  gateway: false,
}

// Root-label for breadcrumbs per mode.
const MODE_ROOT_LABEL: Record<Mode, string> = {
  system: 'Organization',
  roadmap: 'Roadmap',
  kanban: 'Sprint board',
  swimlane: 'Release process',
  nested: 'Acme Co.',
  showcase: 'Showcase',
  gateway: 'Agent Gateway',
}

// In "nested" mode we let per-canvas theme hints drive the theme instead
// of forcing one at the top level. This lets the theme swap as the user
// navigates between the freeform root and the lane-structured sub-canvases.
const MODE_USES_PER_CANVAS_THEME: Record<Mode, boolean> = {
  system: false,
  roadmap: false,
  kanban: false,
  swimlane: false,
  nested: true,
  showcase: false,
  gateway: false,
}

const MODES: Mode[] = ['system', 'roadmap', 'kanban', 'swimlane', 'nested', 'showcase', 'gateway']

function readModeFromUrl(): Mode {
  if (typeof window === 'undefined') return 'system'
  const param = new URLSearchParams(window.location.search).get('mode')
  return (MODES as string[]).includes(param ?? '') ? (param as Mode) : 'system'
}

function App() {
  const [mode, setMode] = useState<Mode>(() => readModeFromUrl())
  // Initial theme follows the mode read from the URL, so refreshing on
  // ?mode=showcase lands with the showcase theme (same as clicking it).
  const [themeName, setThemeName] = useState<string>(() => DEFAULT_THEME_FOR_MODE[readModeFromUrl()])
  const [edgeStyle, setEdgeStyle] = useState<'bezier' | 'straight' | 'orthogonal'>('bezier')
  const [editable, setEditable] = useState<boolean>(true)
  const [zoomNavigation, setZoomNavigation] = useState<boolean>(true)
  const [snapToLanes, setSnapToLanes] = useState<boolean>(true)

  // Imperative handle for programmatic camera control (cinematic tour)
  const canvasHandleRef = useRef<SystemCanvasHandle>(null)
  const tourRunningRef = useRef(false)

  // Plays a scripted zoom-in sequence through the 'system' mode hierarchy:
  //   Organization  ->  Kubernetes  ->  worker-pod  ->  Sandbox
  // Each hop takes 2400ms; a short pause between hops lets the viewer
  // register where they landed before the next hop begins.
  const playTour = useCallback(async () => {
    const handle = canvasHandleRef.current
    if (!handle || tourRunningRef.current) return
    tourRunningRef.current = true
    try {
      handle.navigateToRoot()
      // Small delay so the root fit animation completes before we start.
      await new Promise((r) => setTimeout(r, 600))
      await handle.zoomIntoNode('k8s', { durationMs: 2400 })
      await new Promise((r) => setTimeout(r, 500))
      await handle.zoomIntoNode('pod-worker', { durationMs: 2400 })
      await new Promise((r) => setTimeout(r, 500))
      await handle.zoomIntoNode('sandbox', { durationMs: 2400 })
    } finally {
      tourRunningRef.current = false
    }
  }, [])

  // Independent canvas stores — one per mode — so mutations don't leak
  // across modes when the user switches.
  const [systemCanvases, setSystemCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: initialRoot,
    ...initialCanvasMap,
  }))
  const [roadmapCanvases, setRoadmapCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: roadmapRoot,
    ...roadmapCanvasMap,
  }))
  const [kanbanCanvases, setKanbanCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: kanbanRoot,
    ...kanbanCanvasMap,
  }))
  const [swimlaneCanvases, setSwimlaneCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: swimlaneRoot,
    ...swimlaneCanvasMap,
  }))
  const [nestedCanvases, setNestedCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: nestedRoot,
    ...nestedCanvasMap,
  }))
  const [showcaseCanvases, setShowcaseCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: showcaseRoot,
    ...showcaseCanvasMap,
  }))
  const [gatewayCanvases, setGatewayCanvases] = useState<Record<string, CanvasData>>(() => ({
    [ROOT_KEY]: gatewayRoot,
    ...gatewayCanvasMap,
  }))

  const canvasesByMode: Record<Mode, Record<string, CanvasData>> = {
    system: systemCanvases,
    roadmap: roadmapCanvases,
    kanban: kanbanCanvases,
    swimlane: swimlaneCanvases,
    nested: nestedCanvases,
    showcase: showcaseCanvases,
    gateway: gatewayCanvases,
  }
  const allCanvases = canvasesByMode[mode]

  // IMPORTANT: the setter must be chosen on every call, not captured at
  // closure creation — otherwise switching modes would silently keep
  // mutating whichever canvas was active on the first render.
  const modeRef = useRef(mode)
  modeRef.current = mode
  const setActiveCanvases = useCallback(
    (updater: (prev: Record<string, CanvasData>) => Record<string, CanvasData>) => {
      switch (modeRef.current) {
        case 'system':
          setSystemCanvases(updater)
          break
        case 'roadmap':
          setRoadmapCanvases(updater)
          break
        case 'kanban':
          setKanbanCanvases(updater)
          break
        case 'swimlane':
          setSwimlaneCanvases(updater)
          break
        case 'nested':
          setNestedCanvases(updater)
          break
        case 'showcase':
          setShowcaseCanvases(updater)
          break
        case 'gateway':
          setGatewayCanvases(updater)
          break
      }
    },
    []
  )

  // Keep ?mode= in sync with state, so refreshes land on the same mode.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('mode') === mode) return
    url.searchParams.set('mode', mode)
    window.history.replaceState(null, '', url.toString())
  }, [mode])

  // Respond to browser back/forward so the URL remains authoritative.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPop = () => setMode(readModeFromUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // When switching modes, flip to the default theme for that mode — but
  // preserve the user's choice if they're already on a non-default theme.
  const handleModeChange = (next: Mode) => {
    setMode(next)
    const currentDefaults = Object.values(DEFAULT_THEME_FOR_MODE)
    // If the user hadn't deviated from a default theme, switch to the new
    // mode's default. Otherwise keep their custom choice.
    if (currentDefaults.includes(themeName)) {
      setThemeName(DEFAULT_THEME_FOR_MODE[next])
    }
  }

  const theme = allThemes[themeName]
  const rootCanvas = allCanvases[ROOT_KEY]

  // Pass the sub-canvas map (without ROOT_KEY) to SystemCanvas
  const canvases = allCanvases

  const keyFor = (canvasRef: string | undefined) => canvasRef ?? ROOT_KEY

  const handleNodeAdd = useCallback((node: CanvasNode, canvasRef: string | undefined) => {
    const key = keyFor(canvasRef)
    setActiveCanvases((prev) => ({
      ...prev,
      [key]: addNodeHelper(prev[key] ?? { nodes: [], edges: [] }, node),
    }))
  }, [setActiveCanvases])

  const handleNodeUpdate = useCallback(
    (nodeId: string, patch: NodeUpdate, canvasRef: string | undefined) => {
      const key = keyFor(canvasRef)
      setActiveCanvases((prev) => ({
        ...prev,
        [key]: updateNodeHelper(prev[key] ?? { nodes: [], edges: [] }, nodeId, patch),
      }))
    },
    [setActiveCanvases]
  )

  const handleNodeDelete = useCallback(
    (nodeId: string, canvasRef: string | undefined) => {
      const key = keyFor(canvasRef)
      setActiveCanvases((prev) => ({
        ...prev,
        [key]: removeNodeHelper(prev[key] ?? { nodes: [], edges: [] }, nodeId),
      }))
    },
    [setActiveCanvases]
  )

  const handleNodesDelete = useCallback(
    (nodeIds: string[], canvasRef: string | undefined) => {
      const key = keyFor(canvasRef)
      setActiveCanvases((prev) => {
        let canvas = prev[key] ?? { nodes: [], edges: [] }
        for (const id of nodeIds) {
          canvas = removeNodeHelper(canvas, id)
        }
        return { ...prev, [key]: canvas }
      })
    },
    [setActiveCanvases]
  )

  const handleEdgeUpdate = useCallback(
    (edgeId: string, patch: EdgeUpdate, canvasRef: string | undefined) => {
      const key = keyFor(canvasRef)
      setActiveCanvases((prev) => ({
        ...prev,
        [key]: updateEdgeHelper(prev[key] ?? { nodes: [], edges: [] }, edgeId, patch),
      }))
    },
    [setActiveCanvases]
  )

  const handleEdgeDelete = useCallback(
    (edgeId: string, canvasRef: string | undefined) => {
      const key = keyFor(canvasRef)
      setActiveCanvases((prev) => ({
        ...prev,
        [key]: removeEdgeHelper(prev[key] ?? { nodes: [], edges: [] }, edgeId),
      }))
    },
    [setActiveCanvases]
  )

  const handleEdgeAdd = useCallback(
    (edge: CanvasEdge, canvasRef: string | undefined) => {
      const key = keyFor(canvasRef)
      setActiveCanvases((prev) => ({
        ...prev,
        [key]: addEdgeHelper(prev[key] ?? { nodes: [], edges: [] }, edge),
      }))
    },
    [setActiveCanvases]
  )

  // ---------------------------------------------------------------------
  // Showcase-mode context menu
  //
  // Right-clicking a node in showcase mode opens a small floating menu
  // with category-aware actions. Demonstrates every surface of the
  // declarative `nodeContextMenu` API:
  //   - `match.categories` — items scoped to specific categories
  //   - `match.when` — predicates that read the node body
  //   - `disabled` — items that show but can't be picked (e.g. "Mark OK"
  //     on a card that's already OK)
  //   - `destructive` — red-tinted items
  //   - icons — looked up in the theme's `icons` map (or built-ins)
  //
  // Other demo modes don't pass `nodeContextMenu`, so right-clicks fall
  // back to the browser's default behavior there. This keeps the
  // showcase a focused reference rather than overloading every mode.
  // ---------------------------------------------------------------------
  const showcaseContextMenu = useMemo<NodeContextMenuConfig>(
    () => ({
      items: [
        // Status changers — only on status-* cards, with `disabled` for
        // the currently-active status so the menu doubles as a status
        // indicator. Status is encoded in the category itself, so we
        // patch `category` to swap.
        {
          id: 'mark-ok',
          label: 'Mark OK',
          match: { categories: ['status-ok', 'status-attn', 'status-risk'] },
          disabled: (node) => node.category === 'status-ok',
        },
        {
          id: 'mark-attn',
          label: 'Mark Attention',
          match: { categories: ['status-ok', 'status-attn', 'status-risk'] },
          disabled: (node) => node.category === 'status-attn',
        },
        {
          id: 'mark-risk',
          label: 'Mark Risk',
          match: { categories: ['status-ok', 'status-attn', 'status-risk'] },
          disabled: (node) => node.category === 'status-risk',
        },
        // Note/decision conversion — flips between the two amber/violet
        // free-floating callout flavors.
        {
          id: 'flip-callout',
          label: 'Flip note ↔ decision',
          match: {
            when: (node) =>
              node.category === 'note' || node.category === 'decision',
          },
        },
        // Universal: copy the node id to the clipboard. Always shown
        // (no `match` predicate) — useful for any debugging session.
        {
          id: 'copy-id',
          label: 'Copy node id',
        },
        // Destructive: delete the node. Wired to the same removeNode
        // path the Delete key uses.
        {
          id: 'delete',
          label: 'Delete node',
          destructive: true,
        },
      ],
      onSelect: (itemId, node, ctx) => {
        switch (itemId) {
          case 'mark-ok':
            handleNodeUpdate(node.id, { category: 'status-ok' }, ctx.canvasRef ?? undefined)
            break
          case 'mark-attn':
            handleNodeUpdate(node.id, { category: 'status-attn' }, ctx.canvasRef ?? undefined)
            break
          case 'mark-risk':
            handleNodeUpdate(node.id, { category: 'status-risk' }, ctx.canvasRef ?? undefined)
            break
          case 'flip-callout': {
            const next = node.category === 'note' ? 'decision' : 'note'
            handleNodeUpdate(node.id, { category: next }, ctx.canvasRef ?? undefined)
            break
          }
          case 'copy-id':
            // Best-effort — the demo runs in modern browsers where the
            // clipboard API is available; fall back to a console log
            // when it isn't (e.g. insecure context).
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
              void navigator.clipboard.writeText(node.id)
            } else {
              console.log('node id:', node.id)
            }
            break
          case 'delete':
            handleNodeDelete(node.id, ctx.canvasRef ?? undefined)
            break
        }
      },
    }),
    [handleNodeUpdate, handleNodeDelete]
  )

  // ---------------------------------------------------------------------
  // Edge context menu — system & gateway modes
  //
  // Right-clicking an edge in system or gateway mode opens a small menu
  // with "Toggle Animation" (flips marching-ants on/off) and "Delete Edge".
  // Demonstrates the symmetric `edgeContextMenu` API.
  // ---------------------------------------------------------------------
  const demoEdgeContextMenu = useMemo<EdgeContextMenuConfig>(
    () => ({
      items: [
        {
          id: 'toggle-animation',
          label: 'Toggle Animation',
        },
        {
          id: 'delete-edge',
          label: 'Delete Edge',
          destructive: true,
        },
      ],
      onSelect(itemId, edge, ctx) {
        switch (itemId) {
          case 'toggle-animation':
            handleEdgeUpdate(edge.id, { animated: !edge.animated }, ctx.canvasRef ?? undefined)
            break
          case 'delete-edge':
            handleEdgeDelete(edge.id, ctx.canvasRef ?? undefined)
            break
        }
      },
    }),
    [handleEdgeUpdate, handleEdgeDelete]
  )

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Theme / controls bar */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 20,
          display: 'flex',
          gap: 8,
          padding: '8px 12px',
          background: theme.breadcrumbs.background,
          borderRadius: 8,
          fontFamily: theme.node.fontFamily,
          fontSize: 11,
          color: theme.breadcrumbs.textColor,
          backdropFilter: 'blur(8px)',
        }}
      >
        {mode === 'system' && (
          // Invisible tour trigger. Lives to the left of the Mode selector
          // so anyone in the know can click it; everyone else sees empty
          // space. Reserves a small hit-target (24x20) so it's clickable.
          <button
            type="button"
            onClick={playTour}
            aria-label="Play tour"
            title="Play tour"
            style={{
              width: 24,
              height: 20,
              padding: 0,
              margin: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              opacity: 0,
            }}
          />
        )}
        <label>
          Mode:{' '}
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as Mode)}
            style={{
              background: 'transparent',
              color: theme.breadcrumbs.activeColor,
              border: `1px solid ${theme.breadcrumbs.separatorColor}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            <option value="system">system</option>
            <option value="roadmap">roadmap</option>
            <option value="kanban">kanban</option>
            <option value="swimlane">swimlane</option>
            <option value="nested">nested</option>
            <option value="showcase">showcase</option>
            <option value="gateway">gateway</option>
          </select>
        </label>
        <label>
          Theme:{' '}
          <select
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            style={{
              background: 'transparent',
              color: theme.breadcrumbs.activeColor,
              border: `1px solid ${theme.breadcrumbs.separatorColor}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            {Object.keys(allThemes).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Edges:{' '}
          <select
            value={edgeStyle}
            onChange={(e) =>
              setEdgeStyle(e.target.value as 'bezier' | 'straight' | 'orthogonal')
            }
            style={{
              background: 'transparent',
              color: theme.breadcrumbs.activeColor,
              border: `1px solid ${theme.breadcrumbs.separatorColor}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            <option value="bezier">bezier</option>
            <option value="straight">straight</option>
            <option value="orthogonal">orthogonal</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={editable}
            onChange={(e) => setEditable(e.target.checked)}
          />
          Editable
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={zoomNavigation}
            onChange={(e) => setZoomNavigation(e.target.checked)}
          />
          Zoom-nav
        </label>
        {MODE_HAS_LANES[mode] && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={snapToLanes}
              onChange={(e) => setSnapToLanes(e.target.checked)}
            />
            Snap to lanes
          </label>
        )}
      </div>

      <SystemCanvas
        key={mode}
        ref={canvasHandleRef}
        canvas={rootCanvas}
        canvases={canvases}
        // In "nested" mode we deliberately omit the `theme` prop so the
        // library can read per-canvas `theme.base` hints and swap themes
        // as the user navigates. The `themes` map below exposes our
        // custom kanban/swimlane themes by name for that lookup.
        theme={MODE_USES_PER_CANVAS_THEME[mode] ? undefined : theme}
        themes={allThemes}
        edgeStyle={edgeStyle}
        editable={editable}
        zoomNavigation={zoomNavigation}
        snapToLanes={MODE_HAS_LANES[mode] ? snapToLanes : false}
        rootLabel={MODE_ROOT_LABEL[mode]}
        onNodeAdd={handleNodeAdd}
        onNodeUpdate={handleNodeUpdate}
        onNodeDelete={handleNodeDelete}
        onNodesDelete={handleNodesDelete}
        onEdgeAdd={handleEdgeAdd}
        onEdgeUpdate={handleEdgeUpdate}
        onEdgeDelete={handleEdgeDelete}
        // Right-click menu — only in showcase mode, where it has a
        // category-aware item set wired up. Other modes get the
        // browser's default right-click behavior so we don't have to
        // invent menus for every demo.
        nodeContextMenu={mode === 'showcase' ? showcaseContextMenu : undefined}
        edgeContextMenu={['system', 'gateway'].includes(mode) ? demoEdgeContextMenu : undefined}
        onNodeClick={(node: CanvasNode) => {
          console.log('Node clicked:', node.id)
        }}
        onEdgeClick={(edge: CanvasEdge) => {
          console.log('Edge clicked:', edge.id)
        }}
        onNavigate={(ref: string) => {
          console.log('Navigating to:', ref)
        }}
      />
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
