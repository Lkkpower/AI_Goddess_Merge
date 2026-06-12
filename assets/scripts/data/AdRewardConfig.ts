export type AdRewardType = "clear_low_items" | "coin_bonus" | "high_level_item";

export interface AdRewardConfig {
    type: AdRewardType;
    title: string;
    description: string;
    clearCount?: number;
    coinAmount?: number;
    itemId?: number;
}

export const adRewardConfigs: AdRewardConfig[] = [
    {
        type: "clear_low_items",
        title: "清理低级服装",
        description: "移除 3 件最低等级服装",
        clearCount: 3,
    },
    {
        type: "coin_bonus",
        title: "金币奖励",
        description: "立即获得 120 金币",
        coinAmount: 120,
    },
    {
        type: "high_level_item",
        title: "高级服装",
        description: "生成 1 件 Lv.4 服装",
        itemId: 4,
    },
];

export function getAdRewardConfig(type: AdRewardType): AdRewardConfig | undefined {
    return adRewardConfigs.find((config) => config.type === type);
}
