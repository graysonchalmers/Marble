/**
 * engine/events.ts — Tiny typed event emitter (ARCHITECTURE §2).
 * Systems emit game events (tagged, roundStart, …); React/UI subscribes.
 * Phase 0: exists + tested, not yet wired.
 */

export interface GameEvents {
    roundStart: void
    countdownTick: number
    tagged: { survivalTime: number }
    aiStateChanged: { from: string; to: string }
}

type Handler<T> = (payload: T) => void

export class EventBus<E = GameEvents> {
    private handlers = new Map<keyof E, Set<Handler<never>>>()

    on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
        let set = this.handlers.get(event)
        if (!set) {
            set = new Set()
            this.handlers.set(event, set)
        }
        set.add(fn as Handler<never>)
        return () => set!.delete(fn as Handler<never>)
    }

    emit<K extends keyof E>(event: K, payload: E[K]): void {
        const set = this.handlers.get(event)
        if (!set) return
        for (const fn of set) (fn as Handler<E[K]>)(payload)
    }

    clear(): void {
        this.handlers.clear()
    }
}
