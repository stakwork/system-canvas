/**
 * system-canvas-collab — Yjs-backed multi-user collaboration for
 * system-canvas.
 *
 * A consumer gets conflict-free multiplayer by:
 *   1. holding a `Y.Doc` per canvas (one per sub-canvas ref),
 *   2. binding it with `useYjsCanvas(doc)` and spreading the result onto
 *      `<SystemCanvas>`,
 *   3. syncing the doc over ANY transport (this package is transport-
 *      agnostic — plug in y-websocket, a hosted provider, or a custom
 *      HTTP+pubsub bridge),
 *   4. optionally wiring presence with `useCollaborators(awareness)`.
 *
 * The Y.Doc is the source of truth + merge; the renderer stays a pure
 * controlled component (no library-core changes required).
 */
export {
  NODES_KEY,
  EDGES_KEY,
  LOCAL_ORIGIN,
  nodesMap,
  edgesMap,
  seedYDoc,
  yDocToCanvasData,
  addNode,
  updateNode,
  updateNodes,
  removeNode,
  removeNodes,
  addEdge,
  updateEdge,
  removeEdge,
} from "./doc.js";

export { useYjsCanvas } from "./useYjsCanvas.js";
export type { UseYjsCanvasResult } from "./useYjsCanvas.js";

export { useCollaborators } from "./useCollaborators.js";
export type { AwarenessLike, CollabUser } from "./useCollaborators.js";
