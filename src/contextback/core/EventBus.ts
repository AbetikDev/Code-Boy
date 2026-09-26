/** Minimal synchronous in-process event bus. */
type Handler<T> = (payload: T) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventBus<Events extends Record<string, any>> {
  private readonly listeners = new Map<keyof Events, Set<Handler<unknown>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): { dispose(): void } {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(handler as Handler<unknown>);
    return { dispose: () => { set?.delete(handler as Handler<unknown>); } };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (set) for (const handler of set) { try { handler(payload); } catch { /* isolate */ } }
  }

  dispose(): void { this.listeners.clear(); }
}

/** ContextBack global event types */
export interface CBEvents {
  activity: { projectId: string; sessionId: string };
  sessionEnd: { sessionId: string };
  welcomeBack: { projectId: string; topic: string; hoursAgo: number; openBlockers: number };
  healthChanged: { projectId: string };
  projectChanged: { projectId?: string };
  commitRecorded: { projectId: string; hash: string; message: string };
  analysisReady: { projectId: string; sessionId: string };
  [key: string]: unknown;
}
