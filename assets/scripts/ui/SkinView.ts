import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from "cc";
import { skinConfigs } from "../data/SkinConfig";
const { ccclass, property } = _decorator;

@ccclass("SkinView")
export class SkinView extends Component {
    @property(Label)
    contentLabel: Label | null = null;

    @property(Node)
    listRoot: Node | null = null;

    showSkins(unlockedSkins: number[]): void {
        const lines = this.renderSkinLines(unlockedSkins);
        if (this.listRoot) {
            this.createSkinRows(unlockedSkins);
            return;
        }
        if (this.contentLabel) {
            this.contentLabel.string = lines.join("\n");
        } else {
            console.log("[SkinView]", lines);
        }
    }

    renderSkinLines(unlockedSkins: number[]): string[] {
        return skinConfigs.map((skin) => {
            const state = unlockedSkins.indexOf(skin.id) !== -1 ? "已解锁" : "未解锁";
            return `${state}  Lv.${skin.unlockItemLevel}  ${skin.name}`;
        });
    }

    private createSkinRows(unlockedSkins: number[]): void {
        if (!this.listRoot) {
            return;
        }

        this.listRoot.removeAllChildren();
        skinConfigs.forEach((skin, index) => {
            const unlocked = unlockedSkins.indexOf(skin.id) !== -1;
            const y = 240 - index * 78;
            const row = this.createNode(`SkinRow_${skin.id}`, this.listRoot!, 0, y, 0, 540, 64);
            this.drawSolidRect(row, unlocked ? new Color(91, 54, 84, 255) : new Color(62, 45, 68, 255), 540, 64);

            const icon = this.createNode(`SkinIcon_${skin.id}`, row, -232, 0, 0, 44, 44);
            this.drawSolidRect(icon, unlocked ? new Color(255, 186, 215, 255) : new Color(118, 103, 123, 255), 44, 44);

            this.createLabel(`SkinName_${skin.id}`, row, -62, 9, skin.name, 23, unlocked ? new Color(255, 236, 246, 255) : new Color(188, 172, 190, 255), 280, 34);
            this.createLabel(`SkinLevel_${skin.id}`, row, -72, -18, `Lv.${skin.unlockItemLevel} 解锁`, 17, new Color(218, 182, 202, 255), 260, 28);

            const badge = this.createNode(`StatusBadge_${skin.id}`, row, 204, 0, 0, 104, 36);
            this.drawSolidRect(badge, unlocked ? new Color(116, 196, 132, 255) : new Color(110, 95, 120, 255), 104, 36);
            this.createLabel(`StatusText_${skin.id}`, badge, 0, 1, unlocked ? "解锁" : "待解锁", 18, Color.WHITE, 92, 30);
        });
    }

    private createNode(name: string, parent: Node, x: number, y: number, z: number, width: number, height: number): Node {
        const node = new Node(name);
        node.setParent(parent);
        node.setPosition(new Vec3(x, y, z));
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private createLabel(name: string, parent: Node, x: number, y: number, text: string, fontSize: number, color: Color, width: number, height: number): Label {
        const node = this.createNode(name, parent, x, y, 0, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 6;
        label.color = color;
        return label;
    }

    private drawSolidRect(node: Node, color: Color, width: number, height: number): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }
}

