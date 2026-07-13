import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { CanvasData, CanvasNode } from "system-canvas";
import {
  addEdge,
  addNode,
  removeNode,
  seedYDoc,
  updateNode,
  yDocToCanvasData,
} from "./doc.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(id: string, extra: Partial<CanvasNode> = {}): CanvasNode {
  return { id, type: "text", x: 0, y: 0, text: id, ...extra };
}

/** Full bidirectional merge — after this, a and b have converged. */
function sync(a: Y.Doc, b: Y.Doc): void {
  const ua = Y.encodeStateAsUpdate(a);
  const ub = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, ub);
  Y.applyUpdate(b, ua);
}

function getNode(data: CanvasData, id: string): CanvasNode | undefined {
  return data.nodes?.find((n) => n.id === id);
}

/** Two docs seeded from the same initial state (both start identical). */
function makePair(initial: CanvasData): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  seedYDoc(a, initial);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  return [a, b];
}

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe("round-trip", () => {
  it("preserves all fields including customData and edge extras", () => {
    const doc = new Y.Doc();
    seedYDoc(doc, {
      nodes: [
        node("a", { x: 5, y: 6, width: 100, category: "note", customData: { status: "todo", n: 3 } }),
      ],
      edges: [
        // `connectionId` is an informal consumer extension — must survive.
        { id: "e1", fromNode: "a", toNode: "b", label: "L", customData: { connectionId: "c-9" } } as never,
      ],
    });
    const out = yDocToCanvasData(doc);
    expect(getNode(out, "a")).toEqual(
      node("a", { x: 5, y: 6, width: 100, category: "note", customData: { status: "todo", n: 3 } }),
    );
    expect(out.edges?.[0]).toEqual({
      id: "e1",
      fromNode: "a",
      toNode: "b",
      label: "L",
      customData: { connectionId: "c-9" },
    });
  });
});

// ---------------------------------------------------------------------------
// Convergence — the plug-and-play conflict-free proof
// ---------------------------------------------------------------------------

describe("conflict-free convergence", () => {
  it("concurrent moves of DIFFERENT nodes both survive", () => {
    const [a, b] = makePair({ nodes: [node("a"), node("b")], edges: [] });
    updateNode(a, "a", { x: 100, y: 100 }); // user A drags node a
    updateNode(b, "b", { x: 200, y: 200 }); // user B drags node b
    sync(a, b);
    const da = yDocToCanvasData(a);
    const db = yDocToCanvasData(b);
    expect(da).toEqual(db); // converged
    expect(getNode(da, "a")).toMatchObject({ x: 100, y: 100 });
    expect(getNode(da, "b")).toMatchObject({ x: 200, y: 200 }); // neither clobbered
  });

  it("concurrent edits to DIFFERENT fields of the SAME node both survive", () => {
    const [a, b] = makePair({ nodes: [node("a")], edges: [] });
    updateNode(a, "a", { x: 100 }); // A moves it
    updateNode(b, "a", { text: "renamed" }); // B renames it — field-level merge
    sync(a, b);
    const da = yDocToCanvasData(a);
    expect(yDocToCanvasData(b)).toEqual(da);
    expect(getNode(da, "a")).toMatchObject({ x: 100, text: "renamed" });
  });

  it("concurrent ADD of different nodes both survive", () => {
    const [a, b] = makePair({ nodes: [], edges: [] });
    addNode(a, node("c"));
    addNode(b, node("d"));
    sync(a, b);
    const da = yDocToCanvasData(a);
    expect(yDocToCanvasData(b)).toEqual(da);
    expect(da.nodes?.map((n) => n.id).sort()).toEqual(["c", "d"]);
  });

  it("concurrent add + update converge", () => {
    const [a, b] = makePair({ nodes: [node("a")], edges: [] });
    addNode(a, node("c", { x: 9 }));
    updateNode(b, "a", { text: "hi" });
    sync(a, b);
    const da = yDocToCanvasData(a);
    expect(yDocToCanvasData(b)).toEqual(da);
    expect(getNode(da, "c")).toMatchObject({ x: 9 });
    expect(getNode(da, "a")).toMatchObject({ text: "hi" });
  });

  it("delete-vs-update on the same node CONVERGES (deterministic winner)", () => {
    const [a, b] = makePair({ nodes: [node("a"), node("b")], edges: [] });
    removeNode(a, "a"); // A deletes
    updateNode(b, "a", { text: "still here?" }); // B edits concurrently
    sync(a, b);
    // We don't assert who wins — only that both replicas agree.
    expect(yDocToCanvasData(a)).toEqual(yDocToCanvasData(b));
  });

  it("concurrent edge adds both survive and converge", () => {
    const [a, b] = makePair({ nodes: [node("a"), node("b"), node("c")], edges: [] });
    addEdge(a, { id: "e1", fromNode: "a", toNode: "b" });
    addEdge(b, { id: "e2", fromNode: "b", toNode: "c" });
    sync(a, b);
    const da = yDocToCanvasData(a);
    expect(yDocToCanvasData(b)).toEqual(da);
    expect(da.edges?.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("order of update application does not affect the converged result", () => {
    const [a, b] = makePair({ nodes: [node("a")], edges: [] });
    updateNode(a, "a", { x: 1 });
    updateNode(b, "a", { y: 2 });
    // apply in the opposite order to prove commutativity
    const ua = Y.encodeStateAsUpdate(a);
    const ub = Y.encodeStateAsUpdate(b);
    Y.applyUpdate(b, ua);
    Y.applyUpdate(a, ub);
    expect(yDocToCanvasData(a)).toEqual(yDocToCanvasData(b));
    expect(getNode(yDocToCanvasData(a), "a")).toMatchObject({ x: 1, y: 2 });
  });
});
