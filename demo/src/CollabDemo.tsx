import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type { Awareness } from "y-protocols/awareness";
import { SystemCanvas } from "system-canvas-react";
import { darkTheme, screenToCanvas } from "system-canvas";
import type { CanvasData, CanvasSelection, ViewportState } from "system-canvas";
import {
  seedYDoc,
  useCollaborators,
  useYjsCanvas,
} from "system-canvas-collab";
import { BroadcastChannelProvider } from "./broadcastProvider";

const ROOM = "system-canvas-collab-demo";

// Transport is chosen by URL:
//   ?mode=collab          → BroadcastChannel (same-browser tabs, zero setup)
//   ?mode=collab&ws=1     → y-websocket (ANY browser/window/machine; needs the
//                            local relay: `npx y-websocket` on port 1234)
const USE_WS =
  new URLSearchParams(window.location.search).get("ws") === "1";
const WS_URL = "ws://localhost:1234";

/** The subset both providers expose that this demo needs. */
interface Transport {
  awareness: Awareness;
  destroy(): void;
}

const SEED: CanvasData = {
  theme: { base: "dark" },
  nodes: [
    { id: "n1", type: "text", x: -260, y: -80, width: 200, height: 90, text: "Drag me\n\nOpen a 2nd tab — I move there too" },
    { id: "n2", type: "text", x: 40, y: -80, width: 200, height: 90, text: "Rename me while\nthe other tab moves me" },
    { id: "n3", type: "text", x: -110, y: 120, width: 200, height: 90, text: "Add / delete nodes —\nboth tabs converge" },
  ],
  edges: [
    { id: "e1", fromNode: "n1", toNode: "n2" },
    { id: "e2", fromNode: "n1", toNode: "n3" },
  ],
};

/**
 * Deterministic seed update: seed a throwaway doc with a FIXED clientID
 * and encode it once. Every tab applies these exact same bytes, so all
 * tabs share one identical base state (idempotent) — instead of each tab
 * seeding independently and creating divergent Y.Map instances for the
 * same ids (which makes cross-tab edits silently not merge).
 */
const SEED_UPDATE: Uint8Array = (() => {
  const d = new Y.Doc();
  d.clientID = 0;
  seedYDoc(d, SEED);
  return Y.encodeStateAsUpdate(d);
})();

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", "#ec4899"];

function makeUser() {
  const n = Math.floor(Math.random() * 10000);
  return { id: `u${n}`, name: `User ${n}`, color: COLORS[n % COLORS.length] };
}

/**
 * A fully self-contained multiplayer canvas: one Y.Doc, synced across
 * same-origin tabs via BroadcastChannel, bound to the renderer with
 * `useYjsCanvas`. Open this URL in two tabs to see live conflict-free
 * merge + selection presence. No server, no backend.
 */
export function CollabDemo() {
  // useState lazy-init guarantees ONE stable doc + provider for the
  // component's lifetime (useMemo is not a stability guarantee and can
  // orphan side-effectful instances on a re-render).
  const [doc] = useState(() => new Y.Doc());
  const [provider] = useState<Transport>(() =>
    USE_WS
      ? new WebsocketProvider(WS_URL, ROOM, doc)
      : new BroadcastChannelProvider(ROOM, doc),
  );
  useEffect(() => () => provider.destroy(), [provider]);

  const { canvas, ...handlers } = useYjsCanvas(doc);
  const { collaborators, setLocalUser, setLocalSelection, setLocalCursor } =
    useCollaborators(provider.awareness);

  // Live cursor sharing, computed demo-side (the library has no local-
  // cursor-out prop yet — that's the clean follow-up). We track the
  // viewport via onViewportChange and convert screen→canvas coords.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const lastCursorSentRef = useRef(0);

  const handlePointerMove = (e: React.PointerEvent) => {
    const now = e.timeStamp;
    if (now - lastCursorSentRef.current < 40) return; // ~25/s throttle
    lastCursorSentRef.current = now;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = screenToCanvas(
      e.clientX - rect.left,
      e.clientY - rect.top,
      viewportRef.current,
    );
    setLocalCursor({ x: pos.x, y: pos.y });
  };

  const user = useMemo(makeUser, []);
  useEffect(() => {
    setLocalUser(user);
  }, [setLocalUser, user]);

  // Apply the shared deterministic seed on mount. Idempotent, so every
  // tab converges to the same base whether it opened first or synced in.
  useEffect(() => {
    Y.applyUpdate(doc, SEED_UPDATE);
  }, [doc]);

  const onSelectionChange = (sel: CanvasSelection) => {
    setLocalSelection(sel && sel.kind === "node" ? sel.node.id : null);
  };

  return (
    <div
      ref={wrapperRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setLocalCursor(null)}
      style={{ position: "fixed", inset: 0, background: "#0b0e14" }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 10,
          padding: "6px 10px",
          borderRadius: 6,
          background: "rgba(0,0,0,0.6)",
          color: user.color,
          font: "12px system-ui, sans-serif",
          pointerEvents: "none",
        }}
      >
        You are <b>{user.name}</b> · {collaborators.length} other
        {collaborators.length === 1 ? "" : "s"} here ·{" "}
        {USE_WS
          ? "WebSocket — open in ANY browser/window"
          : "BroadcastChannel — open a 2nd tab in THIS browser"}
      </div>
      <SystemCanvas
        canvas={canvas}
        theme={darkTheme}
        editable
        zoomNavigation
        collaborators={collaborators}
        onViewportChange={(vp) => {
          viewportRef.current = vp;
        }}
        onSelectionChange={onSelectionChange}
        onNodeAdd={handlers.onNodeAdd}
        onNodeUpdate={handlers.onNodeUpdate}
        onNodesUpdate={handlers.onNodesUpdate}
        onNodeDelete={handlers.onNodeDelete}
        onNodesDelete={handlers.onNodesDelete}
        onEdgeAdd={handlers.onEdgeAdd}
        onEdgeUpdate={handlers.onEdgeUpdate}
        onEdgeDelete={handlers.onEdgeDelete}
      />
    </div>
  );
}
