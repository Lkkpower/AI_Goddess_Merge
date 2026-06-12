import { _decorator, Color, Component, Graphics, Label, Node, UITransform, Vec3 } from "cc";
import { LeaderboardRow } from "../data/LeaderboardData";
const { ccclass, property } = _decorator;

@ccclass("LeaderboardView")
export class LeaderboardView extends Component {
    @property(Node)
    listRoot: Node | null = null;

    showLoading(): void {
        if (!this.listRoot) {
            return;
        }
        this.listRoot.removeAllChildren();
        this.createLabel("LeaderboardLoadingLabel", this.listRoot, 0, 0, "加载中...", 28, new Color(255, 236, 246, 255), 280, 58);
    }

    showLeaderboard(rows: LeaderboardRow[]): void {
        if (!this.listRoot) {
            return;
        }
        this.listRoot.removeAllChildren();
        rows.slice(0, 8).forEach((row, index) => {
            const y = 236 - index * 68;
            const isTopRank = row.rank <= 3;
            const item = this.createNode(`LeaderboardRow_${row.rank}`, this.listRoot!, 0, y, 0, 540, 56);
            this.drawSolidRect(item, isTopRank ? this.getTopRankColor(row.rank) : new Color(55, 40, 64, 255), 540, 56);
            this.createLabel(isTopRank ? `TopRankMedal_${row.rank}` : `Rank_${row.rank}`, item, -236, 0, this.getRankMedal(row.rank), 28, this.getRankTextColor(row.rank), 58, 42);
            this.createLabel(`Name_${row.rank}`, item, -92, 0, row.nickname, isTopRank ? 24 : 22, new Color(255, 236, 246, 255), 220, 40);
            this.createLabel(`Score_${row.rank}`, item, 104, 0, `${row.score}`, 22, new Color(211, 235, 255, 255), 120, 40);
            this.createLabel(`Level_${row.rank}`, item, 224, 0, `Lv.${row.highestItemLevel}`, 20, new Color(237, 199, 220, 255), 86, 36);
        });
    }

    private getRankMedal(rank: number): string {
        if (rank === 1) {
            return "🥇";
        }
        if (rank === 2) {
            return "🥈";
        }
        if (rank === 3) {
            return "🥉";
        }
        return `${rank}`;
    }

    private getTopRankColor(rank: number): Color {
        if (rank === 1) {
            return new Color(128, 88, 45, 255);
        }
        if (rank === 2) {
            return new Color(88, 91, 112, 255);
        }
        return new Color(114, 72, 56, 255);
    }

    private getRankTextColor(rank: number): Color {
        if (rank === 1) {
            return new Color(255, 224, 112, 255);
        }
        if (rank === 2) {
            return new Color(225, 232, 245, 255);
        }
        if (rank === 3) {
            return new Color(238, 178, 122, 255);
        }
        return new Color(255, 232, 174, 255);
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
