import { _decorator, Component, Label } from "cc";
const { ccclass, property } = _decorator;

@ccclass("TutorialView")
export class TutorialView extends Component {
    @property(Label)
    contentLabel: Label | null = null;

    showTutorial(): void {
        const lines = this.renderTutorialLines();
        if (this.contentLabel) {
            this.contentLabel.string = lines.join("\n");
        }
    }

    renderTutorialLines(): string[] {
        return [
            "1. 点击生成服装，填充衣橱格子",
            "2. 拖动合成相同服装，升级到更高等级",
            "3. 衣橱快满时，观看广告选择奖励",
            "4. 达到指定等级，解锁皮肤图鉴",
        ];
    }
}
