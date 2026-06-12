import { _decorator, Component, Label, Node, UITransform, Vec3 } from "cc";
import { TutorialHighlightTarget, getTutorialStep, tutorialStepConfigs } from "../data/TutorialStepConfig";
const { ccclass, property } = _decorator;

@ccclass("TutorialView")
export class TutorialView extends Component {
    @property(Label) contentLabel: Label | null = null;
    @property(Label) titleLabel: Label | null = null;
    @property(Label) bodyLabel: Label | null = null;
    @property(Label) prevButtonLabel: Label | null = null;
    @property(Label) nextButtonLabel: Label | null = null;
    @property(Label) startButtonLabel: Label | null = null;
    @property(Node) highlightNode: Node | null = null;

    showTutorial(): void {
        this.showStep(0);
    }

    showStep(index: number): void {
        const step = getTutorialStep(index) ?? getTutorialStep(0);
        if (!step) {
            return;
        }

        if (this.titleLabel) {
            this.titleLabel.string = step.title;
        }
        if (this.bodyLabel) {
            this.bodyLabel.string = step.body;
        }
        if (this.contentLabel) {
            this.contentLabel.string = `${step.title}\n${step.body}`;
        }
        if (this.prevButtonLabel) {
            this.prevButtonLabel.string = "上一步";
        }
        if (this.nextButtonLabel) {
            this.nextButtonLabel.string = index >= tutorialStepConfigs.length - 1 ? "完成" : "下一步";
        }
        if (this.startButtonLabel) {
            this.startButtonLabel.string = "开始游戏";
        }
        this.setHighlightTarget(step.highlightTarget);
    }

    renderTutorialLines(): string[] {
        return tutorialStepConfigs.map((step, index) => `${index + 1}. ${step.body}`);
    }

    private setHighlightTarget(target: TutorialHighlightTarget): void {
        if (!this.highlightNode) {
            return;
        }

        const rects: Record<TutorialHighlightTarget, { x: number; y: number; width: number; height: number }> = {
            generate_button: { x: -168, y: -315, width: 332, height: 104 },
            board: { x: 0, y: 130, width: 690, height: 578 },
            ad_button: { x: 168, y: -315, width: 332, height: 104 },
            skin_button: { x: 0, y: 455, width: 206, height: 68 },
        };
        const rect = rects[target];
        this.highlightNode.setPosition(new Vec3(rect.x, rect.y, 0));
        this.highlightNode.getComponent(UITransform)?.setContentSize(rect.width, rect.height);
        this.highlightNode.active = true;
    }
}
