import { useCallback, useEffect, useState } from "react";
import type { CollaboratorInfo } from "system-canvas";

/**
 * Structural subset of a Yjs `Awareness` (from `y-protocols/awareness`)
 * that this hook uses. Declared locally so the collab package doesn't
 * force a `y-protocols` dependency on consumers — the real Awareness
 * satisfies this shape. Presence is ephemeral: never persisted, never in
 * the Y.Doc.
 */
export interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, unknown>>;
  on(event: "change", cb: () => void): void;
  off(event: "change", cb: () => void): void;
  setLocalStateField(field: string, value: unknown): void;
}

/** The per-client presence payload this package reads/writes on awareness. */
export interface CollabUser {
  id: string;
  name: string;
  color: string;
  image?: string | null;
}

const USER_FIELD = "user";
const CURSOR_FIELD = "cursor";
const SELECTION_FIELD = "selectedNodeId";

function statesToCollaborators(
  states: Map<number, Record<string, unknown>>,
  localClientId: number,
): CollaboratorInfo[] {
  const out: CollaboratorInfo[] = [];
  states.forEach((state, clientId) => {
    if (clientId === localClientId) return; // exclude self
    const user = state[USER_FIELD] as CollabUser | undefined;
    if (!user || typeof user.id !== "string") return; // no identity → skip
    const cursor = state[CURSOR_FIELD] as { x: number; y: number } | null | undefined;
    const selectedNodeId = state[SELECTION_FIELD] as string | null | undefined;
    out.push({
      id: user.id,
      name: user.name,
      color: user.color,
      image: user.image ?? null,
      cursor: cursor ?? null,
      selectedNodeId: selectedNodeId ?? null,
    });
  });
  return out;
}

/**
 * Map a Yjs Awareness to the renderer's `CollaboratorInfo[]` — feed the
 * result straight into `<CollaboratorsOverlay collaborators={...}/>` (or
 * the `collaborators` prop of `<SystemCanvas>`). Returns setters for this
 * client's identity, cursor, and selection.
 */
export function useCollaborators(awareness: AwarenessLike): {
  collaborators: CollaboratorInfo[];
  setLocalUser: (user: CollabUser) => void;
  setLocalCursor: (cursor: { x: number; y: number } | null) => void;
  setLocalSelection: (nodeId: string | null) => void;
} {
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>(() =>
    statesToCollaborators(awareness.getStates(), awareness.clientID),
  );

  useEffect(() => {
    const onChange = () =>
      setCollaborators(
        statesToCollaborators(awareness.getStates(), awareness.clientID),
      );
    onChange();
    awareness.on("change", onChange);
    return () => {
      awareness.off("change", onChange);
    };
  }, [awareness]);

  const setLocalUser = useCallback(
    (user: CollabUser) => awareness.setLocalStateField(USER_FIELD, user),
    [awareness],
  );
  const setLocalCursor = useCallback(
    (cursor: { x: number; y: number } | null) =>
      awareness.setLocalStateField(CURSOR_FIELD, cursor),
    [awareness],
  );
  const setLocalSelection = useCallback(
    (nodeId: string | null) =>
      awareness.setLocalStateField(SELECTION_FIELD, nodeId),
    [awareness],
  );

  return { collaborators, setLocalUser, setLocalCursor, setLocalSelection };
}
