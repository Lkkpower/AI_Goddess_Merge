export type TutorialHighlightTarget = "generate_button" | "board" | "ad_button" | "skin_button";

export interface TutorialStepConfig {
    id: string;
    title: string;
    body: string;
    highlightTarget: TutorialHighlightTarget;
}

export const tutorialStepConfigs: TutorialStepConfig[] = [
    {
        id: "generate",
        title: "生成第一件服装",
        body: "点击生成服装，把衣橱里的空格填起来。",
        highlightTarget: "generate_button",
    },
    {
        id: "merge",
        title: "拖动合成升级",
        body: "拖动相同服装到一起，合成更高级的衣服。",
        highlightTarget: "board",
    },
    {
        id: "ad_reward",
        title: "衣橱拥挤时拿奖励",
        body: "衣橱快满时，可以观看广告并选择清理、金币或高级服装奖励。",
        highlightTarget: "ad_button",
    },
    {
        id: "skins",
        title: "点亮皮肤图鉴",
        body: "继续合成高等级服装，达到指定等级后解锁新皮肤。",
        highlightTarget: "skin_button",
    },
];

export function getTutorialStep(index: number): TutorialStepConfig | null {
    return tutorialStepConfigs[index] ?? null;
}

export function clampTutorialStepIndex(index: number): number {
    if (index < 0) {
        return 0;
    }
    if (index >= tutorialStepConfigs.length) {
        return tutorialStepConfigs.length - 1;
    }
    return index;
}
