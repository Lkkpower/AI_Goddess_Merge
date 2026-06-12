export interface SkinConfig {
    id: number;
    name: string;
    desc: string;
    preview: string;
    unlockItemLevel: number;
}

export const skinConfigs: SkinConfig[] = [
    { id: 1, name: "甜酷女孩", desc: "合成甜酷套装后解锁。", preview: "skin_001", unlockItemLevel: 4 },
    { id: 2, name: "国风女神", desc: "合成国风套装后解锁。", preview: "skin_002", unlockItemLevel: 7 },
    { id: 3, name: "高定名媛", desc: "合成高定礼服后解锁。", preview: "skin_003", unlockItemLevel: 10 },
    { id: 4, name: "星光女神", desc: "合成传说星光套装后解锁。", preview: "skin_004", unlockItemLevel: 12 },
    { id: 5, name: "霓虹偶像", desc: "合成霓虹偶像套装后解锁。", preview: "skin_005", unlockItemLevel: 15 },
    { id: 6, name: "梦境公主", desc: "合成梦境公主礼服后解锁。", preview: "skin_006", unlockItemLevel: 18 },
    { id: 7, name: "终章女神", desc: "合成终章女神神装后解锁。", preview: "skin_007", unlockItemLevel: 20 },
];

export function getSkinConfigById(id: number): SkinConfig | null {
    return skinConfigs.find((skin) => skin.id === id) ?? null;
}

export function getSkinConfigByUnlockLevel(level: number): SkinConfig | null {
    return skinConfigs.find((skin) => skin.unlockItemLevel === level) ?? null;
}
