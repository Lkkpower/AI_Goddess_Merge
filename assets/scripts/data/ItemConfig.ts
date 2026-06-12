export interface MergeItemConfig {
    id: number;
    name: string;
    level: number;
    nextId: number;
    icon: string;
    score: number;
    coin: number;
    unlockSkinId?: number;
}

export const itemConfigs: MergeItemConfig[] = [
    { id: 1, name: "基础T恤", level: 1, nextId: 2, icon: "item_001", score: 5, coin: 2 },
    { id: 2, name: "高腰短裙", level: 2, nextId: 3, icon: "item_002", score: 12, coin: 5 },
    { id: 3, name: "清新连衣裙", level: 3, nextId: 4, icon: "item_003", score: 25, coin: 10 },
    { id: 4, name: "甜酷套装", level: 4, nextId: 5, icon: "item_004", score: 45, coin: 18, unlockSkinId: 1 },
    { id: 5, name: "职场套装", level: 5, nextId: 6, icon: "item_005", score: 75, coin: 30 },
    { id: 6, name: "校园风套装", level: 6, nextId: 7, icon: "item_006", score: 120, coin: 48 },
    { id: 7, name: "国风套装", level: 7, nextId: 8, icon: "item_007", score: 180, coin: 72, unlockSkinId: 2 },
    { id: 8, name: "晚礼服", level: 8, nextId: 9, icon: "item_008", score: 260, coin: 104 },
    { id: 9, name: "舞台造型", level: 9, nextId: 10, icon: "item_009", score: 360, coin: 144 },
    { id: 10, name: "高定礼服", level: 10, nextId: 11, icon: "item_010", score: 500, coin: 200, unlockSkinId: 3 },
    { id: 11, name: "女神限定装", level: 11, nextId: 12, icon: "item_011", score: 700, coin: 280 },
    { id: 12, name: "传说星光套装", level: 12, nextId: 13, icon: "item_012", score: 1000, coin: 400, unlockSkinId: 4 },
    { id: 13, name: "璀璨红毯礼服", level: 13, nextId: 14, icon: "item_013", score: 1350, coin: 540 },
    { id: 14, name: "未来感战衣", level: 14, nextId: 15, icon: "item_014", score: 1750, coin: 700 },
    { id: 15, name: "霓虹偶像套装", level: 15, nextId: 16, icon: "item_015", score: 2200, coin: 880, unlockSkinId: 5 },
    { id: 16, name: "皇家舞会礼裙", level: 16, nextId: 17, icon: "item_016", score: 2750, coin: 1100 },
    { id: 17, name: "幻境精灵套装", level: 17, nextId: 18, icon: "item_017", score: 3400, coin: 1360 },
    { id: 18, name: "梦境公主礼服", level: 18, nextId: 19, icon: "item_018", score: 4200, coin: 1680, unlockSkinId: 6 },
    { id: 19, name: "银河女王套装", level: 19, nextId: 20, icon: "item_019", score: 5200, coin: 2080 },
    { id: 20, name: "终章女神神装", level: 20, nextId: 0, icon: "item_020", score: 6600, coin: 2640, unlockSkinId: 7 },
];

export function getItemConfigById(id: number): MergeItemConfig | null {
    return itemConfigs.find((item) => item.id === id) ?? null;
}

export function getRandomLowLevelItem(): MergeItemConfig {
    const lowLevelItems = itemConfigs.filter((item) => item.level >= 1 && item.level <= 3);
    const index = Math.floor(Math.random() * lowLevelItems.length);
    return lowLevelItems[index];
}

export function getMaxItemLevel(): number {
    return itemConfigs.reduce((max, item) => Math.max(max, item.level), 0);
}

export function isMaxLevelItem(itemId: number): boolean {
    const config = getItemConfigById(itemId);
    return !config || config.nextId === 0;
}
