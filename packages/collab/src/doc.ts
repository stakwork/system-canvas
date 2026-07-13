/**
 * Framework-agnostic Y.Doc <-> CanvasData binding.
 *
 * The authored canvas is represented as two top-level Y.Maps:
 *   - `nodes`: nodeId -> Y.Map of that node's fields
 *   - `edges`: edgeId -> Y.Map of that edge's fields
 *
 * Storing each node/edge as its own Y.Map is what makes editing
 * conflict-free at field granularity: two users changing DIFFERENT
 * fields of the same node (or different nodes) both survive; only a
 * true same-field collision falls back to last-writer-wins. Every field
 * of the source object is round-tripped verbatim, so consumer-specific
 * extras (`customData`, an edge's informal `connectionId`, etc.) survive
 * untouched — the binding has no opinion on the domain.
 *
 * `text` / `label` are stored as plain string values (whole-label LWW);
 * character-level merge (Y.Text) is a deliberate later enhancement.
 *
 * Pure Yjs, no React — unit-testable headlessly.
 */
import * as Y from "yjs";
import type { CanvasData, CanvasEdge, CanvasNode } from "system-canvas";

export const NODES_KEY = "nodes";
export const EDGES_KEY = "edges";

/**
 * Origin tag stamped on this-client mutations. A `Y.UndoManager`
 * configured with `trackedOrigins: new Set([LOCAL_ORIGIN])` will then
 * undo only local edits, never a remote collaborator's — per-user undo.
 */
export const LOCAL_ORIGIN = Symbol.for("system-canvas-collab/local");

export function nodesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(NODES_KEY);
}

export function edgesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap(EDGES_KEY);
}

function recordToYMap(record: Record<string, unknown>): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined) m.set(k, v);
  }
  return m;
}

function yMapToRecord<T>(m: Y.Map<unknown>): T {
  const out: Record<string, unknown> = {};
  m.forEach((v, k) => {
    out[k] = v;
  });
  return out as T;
}

/** Apply a partial patch to a node/edge's field map. `undefined` clears a field; `id` is never reassigned. */
function applyPatch(m: Y.Map<unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    if (v === undefined) m.delete(k);
    else m.set(k, v);
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Snapshot the Y.Doc as a plain `CanvasData`. Nodes/edges are sorted by
 * id so the output is deterministic across clients (Y.Map iteration
 * order is not guaranteed to match) — matters for stable rendering and
 * for equality assertions.
 */
export function yDocToCanvasData(doc: Y.Doc): CanvasData {
  const nodes: CanvasNode[] = [];
  nodesMap(doc).forEach((m) => nodes.push(yMapToRecord<CanvasNode>(m)));
  const edges: CanvasEdge[] = [];
  edgesMap(doc).forEach((m) => edges.push(yMapToRecord<CanvasEdge>(m)));
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Seed / migrate
// ---------------------------------------------------------------------------

/**
 * Populate a (typically fresh) Y.Doc from a plain `CanvasData`. Used for
 * the one-time migration of an existing JSON blob into a Y.Doc, and for
 * bootstrapping a doc in tests. Idempotent per id (re-seeding overwrites).
 */
export function seedYDoc(
  doc: Y.Doc,
  data: CanvasData,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    const nodes = nodesMap(doc);
    const edges = edgesMap(doc);
    for (const n of data.nodes ?? []) {
      nodes.set(n.id, recordToYMap(n as unknown as Record<string, unknown>));
    }
    for (const e of data.edges ?? []) {
      edges.set(e.id, recordToYMap(e as unknown as Record<string, unknown>));
    }
  }, origin);
}

// ---------------------------------------------------------------------------
// Mutations — each wrapped in one transaction with an origin tag.
// ---------------------------------------------------------------------------

export function addNode(
  doc: Y.Doc,
  node: CanvasNode,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    nodesMap(doc).set(node.id, recordToYMap(node as unknown as Record<string, unknown>));
  }, origin);
}

export function updateNode(
  doc: Y.Doc,
  id: string,
  patch: Partial<CanvasNode>,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    const m = nodesMap(doc).get(id);
    if (m) applyPatch(m, patch as Record<string, unknown>);
  }, origin);
}

export function updateNodes(
  doc: Y.Doc,
  updates: { id: string; patch: Partial<CanvasNode> }[],
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    const nodes = nodesMap(doc);
    for (const u of updates) {
      const m = nodes.get(u.id);
      if (m) applyPatch(m, u.patch as Record<string, unknown>);
    }
  }, origin);
}

export function removeNode(
  doc: Y.Doc,
  id: string,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => nodesMap(doc).delete(id), origin);
}

export function removeNodes(
  doc: Y.Doc,
  ids: string[],
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    const nodes = nodesMap(doc);
    for (const id of ids) nodes.delete(id);
  }, origin);
}

export function addEdge(
  doc: Y.Doc,
  edge: CanvasEdge,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    edgesMap(doc).set(edge.id, recordToYMap(edge as unknown as Record<string, unknown>));
  }, origin);
}

export function updateEdge(
  doc: Y.Doc,
  id: string,
  patch: Partial<CanvasEdge>,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => {
    const m = edgesMap(doc).get(id);
    if (m) applyPatch(m, patch as Record<string, unknown>);
  }, origin);
}

export function removeEdge(
  doc: Y.Doc,
  id: string,
  origin: unknown = LOCAL_ORIGIN,
): void {
  doc.transact(() => edgesMap(doc).delete(id), origin);
}
