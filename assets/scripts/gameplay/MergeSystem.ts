import { getItemConfigById, isMaxLevelItem } from "../data/ItemConfig";

class MergeSystem {
    canMerge(itemIdA: number | null, itemIdB: number | null): boolean {
        if (itemIdA === null || itemIdB === null || itemIdA !== itemIdB) {
            return false;
        }
        return !this.isMaxLevel(itemIdA);
    }

    getNextItemId(itemId: number): number | null {
        const config = getItemConfigById(itemId);
        if (!config || config.nextId === 0) {
            return null;
        }
        return config.nextId;
    }

    getMergeReward(itemId: number): { score: number; coin: number; unlockSkinId?: number } {
        const nextId = this.getNextItemId(itemId);
        const rewardConfig = nextId ? getItemConfigById(nextId) : getItemConfigById(itemId);
        if (!rewardConfig) {
            return { score: 0, coin: 0 };
        }
        return {
            score: rewardConfig.score,
            coin: rewardConfig.coin,
            unlockSkinId: rewardConfig.unlockSkinId,
        };
    }

    getItemLevel(itemId: number): number {
        return getItemConfigById(itemId)?.level ?? 0;
    }

    isMaxLevel(itemId: number): boolean {
        return isMaxLevelItem(itemId);
    }
}

export const mergeSystem = new MergeSystem();
