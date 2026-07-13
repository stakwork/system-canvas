import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

/**
 * Zero-server Yjs transport for same-origin browser tabs, over
 * `BroadcastChannel`. Syncs both the Y.Doc and a y-protocols `Awareness`.
 *
 * This is the SIMPLEST possible transport adapter — it exists to prove
 * multiplayer in the demo with no backend. A real consumer (e.g. hive)
 * swaps this class for a WebSocket / HTTP+pubsub provider that speaks the
 * same three moves: (1) broadcast local doc updates, (2) apply remote
 * ones, (3) exchange full state on join. The rest of the stack —
 * `useYjsCanvas`, `useCollaborators`, the renderer — is unchanged.
 *
 * Echo guard: updates applied FROM the channel are tagged with `origin =
 * this`, and the local update handler skips anything with that origin, so
 * a received update is never rebroadcast.
 */
type Message =
  | { type: "doc"; update: Uint8Array }
  | { type: "awareness"; update: Uint8Array }
  | { type: "sync-request" };

export class BroadcastChannelProvider {
  readonly awareness: Awareness;
  private readonly channel: BroadcastChannel;
  private readonly doc: Y.Doc;

  constructor(room: string, doc: Y.Doc) {
    this.doc = doc;
    this.awareness = new Awareness(doc);
    this.channel = new BroadcastChannel(room);

    doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    this.channel.onmessage = this.handleMessage;
    window.addEventListener("beforeunload", this.handleUnload);

    // Ask any already-open tab for its current doc + awareness state.
    this.post({ type: "sync-request" });
  }

  private post(msg: Message): void {
    this.channel.postMessage(msg);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return; // came from the channel — don't echo
    this.post({ type: "doc", update });
  };

  private handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;
    const changed = changes.added.concat(changes.updated, changes.removed);
    this.post({
      type: "awareness",
      update: encodeAwarenessUpdate(this.awareness, changed),
    });
  };

  private handleMessage = (ev: MessageEvent<Message>): void => {
    const msg = ev.data;
    if (msg.type === "doc") {
      Y.applyUpdate(this.doc, msg.update, this);
    } else if (msg.type === "awareness") {
      applyAwarenessUpdate(this.awareness, msg.update, this);
    } else if (msg.type === "sync-request") {
      // A new tab joined — send it our full doc + awareness snapshot.
      this.post({ type: "doc", update: Y.encodeStateAsUpdate(this.doc) });
      this.post({
        type: "awareness",
        update: encodeAwarenessUpdate(this.awareness, [
          ...this.awareness.getStates().keys(),
        ]),
      });
    }
  };

  private handleUnload = (): void => {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "unload");
  };

  destroy(): void {
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    window.removeEventListener("beforeunload", this.handleUnload);
    this.handleUnload();
    this.channel.close();
    this.awareness.destroy();
  }
}
