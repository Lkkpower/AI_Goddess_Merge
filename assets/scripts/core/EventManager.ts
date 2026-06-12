export const GameEvents = {
    GAME_INIT: "GAME_INIT",
    BOARD_CHANGED: "BOARD_CHANGED",
    ITEM_MERGED: "ITEM_MERGED",
    ITEM_DRAG_END: "ITEM_DRAG_END",
    COINS_CHANGED: "COINS_CHANGED",
    SCORE_CHANGED: "SCORE_CHANGED",
    SKIN_UNLOCKED: "SKIN_UNLOCKED",
    DAILY_REWARD_CLAIMED: "DAILY_REWARD_CLAIMED",
    TUTORIAL_COMPLETED: "TUTORIAL_COMPLETED",
    AD_REWARD_CLAIMED: "AD_REWARD_CLAIMED",
    BOARD_FULL: "BOARD_FULL",
    AD_REWARD_SUCCESS: "AD_REWARD_SUCCESS",
} as const;

interface EventListener {
    callback: Function;
    target?: any;
}

class EventManager {
    private listeners: Map<string, EventListener[]> = new Map();

    on(eventName: string, callback: Function, target?: any): void {
        const list = this.listeners.get(eventName) ?? [];
        list.push({ callback, target });
        this.listeners.set(eventName, list);
    }

    off(eventName: string, callback: Function, target?: any): void {
        const list = this.listeners.get(eventName);
        if (!list) {
            return;
        }

        const next = list.filter((listener) => {
            const sameCallback = listener.callback === callback;
            const sameTarget = target === undefined || listener.target === target;
            return !(sameCallback && sameTarget);
        });

        if (next.length === 0) {
            this.listeners.delete(eventName);
            return;
        }
        this.listeners.set(eventName, next);
    }

    emit(eventName: string, ...args: any[]): void {
        const list = this.listeners.get(eventName);
        if (!list) {
            return;
        }

        [...list].forEach((listener) => {
            try {
                listener.callback.apply(listener.target, args);
            } catch (error) {
                console.warn(`[EventManager] listener failed: ${eventName}`, error);
            }
        });
    }

    clear(): void {
        this.listeners.clear();
    }
}

export const eventManager = new EventManager();

