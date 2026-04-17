// Two-tier typed event bus.
// Tier 1 — sync: dispatch() fires handlers immediately (within-tick).
// Tier 2 — deferred: queue() collects events; flushDeferred() processes after tick.

import type { GameEventMap, GameEventName, GameEventPayload } from "./GameEvents.js";

type Handler<T extends GameEventName> = (payload: GameEventPayload<T>) => void;
type AnyHandler = (payload: unknown) => void;

type DeferredEntry = { name: GameEventName; payload: unknown };

export class EventBus {
  private readonly handlers = new Map<GameEventName, Set<AnyHandler>>();
  private readonly deferred: DeferredEntry[] = [];

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<T extends GameEventName>(name: T, handler: Handler<T>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as AnyHandler);
    return () => set!.delete(handler as AnyHandler);
  }

  /** Dispatch synchronously — fires all handlers immediately. Use within-tick only. */
  dispatch<T extends GameEventName>(name: T, payload: GameEventPayload<T>): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of set) handler(payload);
  }

  /** Queue for deferred (post-tick) processing. */
  queue<T extends GameEventName>(name: T, payload: GameEventPayload<T>): void {
    this.deferred.push({ name, payload });
  }

  /** Process all queued deferred events. Call once per tick, after simulation step. */
  flushDeferred(): void {
    // Snapshot to avoid infinite loops if handlers queue more events
    const snapshot = this.deferred.splice(0);
    for (const { name, payload } of snapshot) {
      this.dispatch(name as GameEventName, payload as GameEventPayload<typeof name>);
    }
  }

  /** Remove all handlers. Useful for teardown. */
  clear(): void {
    this.handlers.clear();
    this.deferred.length = 0;
  }
}
