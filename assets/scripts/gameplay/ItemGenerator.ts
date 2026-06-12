import { getRandomLowLevelItem } from "../data/ItemConfig";

class ItemGenerator {
    randomLowLevelItem(): number {
        // TODO: 后续根据玩家最高等级动态调整 1-3 级服装的生成权重。
        return getRandomLowLevelItem().id;
    }

    randomByWeights(weights: { itemId: number; weight: number }[]): number {
        const validWeights = weights.filter((item) => item.weight > 0);
        if (validWeights.length === 0) {
            return this.randomLowLevelItem();
        }

        const total = validWeights.reduce((sum, item) => sum + item.weight, 0);
        let cursor = Math.random() * total;
        for (const item of validWeights) {
            cursor -= item.weight;
            if (cursor <= 0) {
                return item.itemId;
            }
        }
        return validWeights[validWeights.length - 1].itemId;
    }

    randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}

export const itemGenerator = new ItemGenerator();
