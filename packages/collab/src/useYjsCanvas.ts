import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type {
  CanvasData,
  CanvasEdge,
  CanvasNode,
  EdgeUpdate,
  NodeUpdate,
} from "system-canvas";
import {
  addEdge,
  addNode,
  edgesMap,
  LOCAL_ORIGIN,
  nodesMap,
  removeEdge,
  removeNode,
  removeNodes,
  updateEdge,
  updateNode,
  updateNodes,
  yDocToCanvasData,
} from "./doc.js";

/**
 * The controlled `canvas` + edit callbacks a `<SystemCanvas>` needs,
 * backed by a Y.Doc. The returned object is designed to be spread onto
 * the renderer:
 *
 *   const { canvas, ...handlers } = useYjsCanvas(doc)
 *   <SystemCanvas canvas={canvas} editable {...handlers} />
 *
 * Every edit callback mutates the Y.Doc (conflict-free); `canvas`
 * re-derives on any doc change (local OR remote), so remote collaborators'
 * edits render live without touching the consumer's own state, viewport,
 * or in-flight drag. One hook == one canvas (== one Y.Doc); a consumer
 * with sub-canvases holds one doc per ref.
 */
export interface UseYjsCanvasResult {
  canvas: CanvasData;
  onNodeAdd: (node: CanvasNode, canvasRef?: string) => void;
  onNodeUpdate: (id: string, patch: NodeUpdate, canvasRef?: string) => void;
  onNodesUpdate: (
    updates: { id: string; patch: NodeUpdate }[],
    canvasRef?: string,
  ) => void;
  onNodeDelete: (id: string, canvasRef?: string) => void;
  onNodesDelete: (ids: string[], canvasRef?: string) => void;
  onEdgeAdd: (edge: CanvasEdge, canvasRef?: string) => void;
  onEdgeUpdate: (id: string, patch: EdgeUpdate, canvasRef?: string) => void;
  onEdgeDelete: (id: string, canvasRef?: string) => void;
  /** Undo/redo scoped to THIS client's edits (never a collaborator's). */
  undo: () => void;
  redo: () => void;
  undoManager: Y.UndoManager;
}

export function useYjsCanvas(doc: Y.Doc): UseYjsCanvasResult {
  const [canvas, setCanvas] = useState<CanvasData>(() => yDocToCanvasData(doc));

  // Re-derive the render document on every doc change — local edits and
  // remote merges alike. Yjs `update` fires after each transaction.
  useEffect(() => {
    const onUpdate = () => setCanvas(yDocToCanvasData(doc));
    onUpdate(); // resync immediately if `doc` changed identity
    doc.on("update", onUpdate);
    return () => {
      doc.off("update", onUpdate);
    };
  }, [doc]);

  // Per-user undo: only transactions stamped with LOCAL_ORIGIN are tracked,
  // so undo never reverts a remote collaborator's edit.
  const undoManager = useMemo(
    () =>
      new Y.UndoManager([nodesMap(doc), edgesMap(doc)], {
        trackedOrigins: new Set([LOCAL_ORIGIN]),
      }),
    [doc],
  );
  useEffect(() => () => undoManager.destroy(), [undoManager]);

  const onNodeAdd = useCallback(
    (node: CanvasNode) => addNode(doc, node),
    [doc],
  );
  const onNodeUpdate = useCallback(
    (id: string, patch: NodeUpdate) =>
      updateNode(doc, id, patch as Partial<CanvasNode>),
    [doc],
  );
  const onNodesUpdate = useCallback(
    (updates: { id: string; patch: NodeUpdate }[]) =>
      updateNodes(
        doc,
        updates.map((u) => ({ id: u.id, patch: u.patch as Partial<CanvasNode> })),
      ),
    [doc],
  );
  const onNodeDelete = useCallback(
    (id: string) => removeNode(doc, id),
    [doc],
  );
  const onNodesDelete = useCallback(
    (ids: string[]) => removeNodes(doc, ids),
    [doc],
  );
  const onEdgeAdd = useCallback(
    (edge: CanvasEdge) => addEdge(doc, edge),
    [doc],
  );
  const onEdgeUpdate = useCallback(
    (id: string, patch: EdgeUpdate) =>
      updateEdge(doc, id, patch as Partial<CanvasEdge>),
    [doc],
  );
  const onEdgeDelete = useCallback(
    (id: string) => removeEdge(doc, id),
    [doc],
  );

  const undo = useCallback(() => undoManager.undo(), [undoManager]);
  const redo = useCallback(() => undoManager.redo(), [undoManager]);

  return {
    canvas,
    onNodeAdd,
    onNodeUpdate,
    onNodesUpdate,
    onNodeDelete,
    onNodesDelete,
    onEdgeAdd,
    onEdgeUpdate,
    onEdgeDelete,
    undo,
    redo,
    undoManager,
  };
}
