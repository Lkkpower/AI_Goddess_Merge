import { _decorator, Button, Color, Component, Graphics, instantiate, Label, Node, Prefab, UITransform, Vec3 } from "cc";
import { GameManager } from "../core/GameManager";
import { audioManager } from "../core/AudioManager";
import { eventManager, GameEvents } from "../core/EventManager";
import { AdRewardType } from "../data/AdRewardConfig";
import { getDailyRewardTodayKey } from "../data/DailyReward";
import { getItemConfigById } from "../data/ItemConfig";
import { clampTutorialStepIndex, tutorialStepConfigs } from "../data/TutorialStepConfig";
import { MergeItem } from "../gameplay/MergeItem";
import { RewardAdView } from "./RewardAdView";
import { LeaderboardView } from "./LeaderboardView";
import { SkinView } from "./SkinView";
import { TutorialView } from "./TutorialView";
const { ccclass, property } = _decorator;

@ccclass("MainView")
export class MainView extends Component {
    @property(Node) boardRoot: Node | null = null;
    @property(Prefab) itemPrefab: Prefab | null = null;
    @property(Label) coinLabel: Label | null = null;
    @property(Label) scoreLabel: Label | null = null;
    @property(Label) tipLabel: Label | null = null;
    @property(Node) feedbackPanel: Node | null = null;
    @property(Label) feedbackLabel: Label | null = null;
    @property(Button) generateButton: Button | null = null;
    @property(Button) clearButton: Button | null = null;
    @property(Button) skinButton: Button | null = null;
    @property(Button) dailyRewardButton: Button | null = null;
    @property(Label) dailyRewardButtonLabel: Label | null = null;
    @property(Node) dailyRewardDisabledMask: Node | null = null;
    @property(Button) leaderboardButton: Button | null = null;
    @property(Button) closeSkinButton: Button | null = null;
    @property(Button) closeTutorialButton: Button | null = null;
    @property(Button) tutorialPrevButton: Button | null = null;
    @property(Button) tutorialNextButton: Button | null = null;
    @property(Button) tutorialStartButton: Button | null = null;
    @property(Button) closeLeaderboardButton: Button | null = null;
    @property(Button) closeAdRewardButton: Button | null = null;
    @property(Button) adClearButton: Button | null = null;
    @property(Button) adCoinButton: Button | null = null;
    @property(Button) adItemButton: Button | null = null;
    @property(Node) skinPanel: Node | null = null;
    @property(Node) tutorialPanel: Node | null = null;
    @property(Node) leaderboardPanel: Node | null = null;
    @property(Node) adRewardPanel: Node | null = null;
    @property(SkinView) skinView: SkinView | null = null;
    @property(TutorialView) tutorialView: TutorialView | null = null;
    @property(LeaderboardView) leaderboardView: LeaderboardView | null = null;

    cellSize = 108;
    gap = 5;

    private gameManager: GameManager | null = null;
    private tutorialStepIndex = 0;

    start(): void {
        this.gameManager = GameManager.instance ?? this.node.getComponent(GameManager);
        if (!this.gameManager) {
            this.gameManager = this.node.addComponent(GameManager);
        }

        this.bindButtons();
        this.registerEvents();
        this.refreshPlayerInfo();
        this.refreshSkinView();
        this.refreshDailyRewardButtonState();
        this.refreshBoard();
        this.showTutorialIfNeeded();
    }

    onDestroy(): void {
        eventManager.off(GameEvents.BOARD_CHANGED, this.refreshBoard, this);
        eventManager.off(GameEvents.ITEM_MERGED, this.onItemMerged, this);
        eventManager.off(GameEvents.BOARD_FULL, this.onBoardFull, this);
        eventManager.off(GameEvents.ITEM_DRAG_END, this.onItemDragEnd, this);
        eventManager.off(GameEvents.SKIN_UNLOCKED, this.onSkinUnlocked, this);
    }

    refreshBoard(): void {
        if (!this.boardRoot || !this.gameManager) {
            return;
        }

        this.boardRoot.removeAllChildren();
        const board = this.gameManager.boardManager;
        this.drawBoardGrid(board.rows, board.cols);
        for (let row = 0; row < board.rows; row += 1) {
            for (let col = 0; col < board.cols; col += 1) {
                const itemId = board.getCell(row, col);
                if (itemId === null) {
                    continue;
                }

                const itemNode = this.createItemNode(itemId, row, col);
                itemNode.setParent(this.boardRoot);
                itemNode.setPosition(this.getCellPosition(row, col));

                const mergeItem = itemNode.getComponent(MergeItem);
                if (mergeItem) {
                    mergeItem.setData(itemId, row, col);
                }
            }
        }
    }

    private drawBoardGrid(rows: number, cols: number): void {
        for (let row = 0; row < rows; row += 1) {
            for (let col = 0; col < cols; col += 1) {
                const cell = this.createCellBackground(row, col);
                cell.setParent(this.boardRoot!);
                cell.setPosition(this.getCellPosition(row, col));
            }
        }
    }

    private createCellBackground(row: number, col: number): Node {
        const cell = new Node(`Cell_${row}_${col}`);
        cell.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
        const isEven = (row + col) % 2 === 0;
        const color = isEven ? new Color(255, 246, 250, 255) : new Color(244, 225, 235, 255);
        this.drawSolidRect(cell, color, this.cellSize, this.cellSize);
        return cell;
    }

    private createItemNode(itemId: number, row: number, col: number): Node {
        const itemNode = this.itemPrefab ? instantiate(this.itemPrefab) : this.createFallbackItemNode();
        const mergeItem = itemNode.getComponent(MergeItem) ?? itemNode.addComponent(MergeItem);
        mergeItem.setData(itemId, row, col);
        return itemNode;
    }

    private createFallbackItemNode(): Node {
        const itemNode = new Node("MergeItemFallback");
        itemNode.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
        this.drawSolidRect(itemNode, new Color(251, 194, 214, 255), this.cellSize, this.cellSize);
        this.createGarmentMarker(itemNode);

        const nameNode = new Node("NameLabel");
        nameNode.setParent(itemNode);
        nameNode.setPosition(0, -12, 0);
        nameNode.addComponent(UITransform).setContentSize(this.cellSize - 14, 42);
        const nameLabel = nameNode.addComponent(Label);
        nameLabel.fontSize = 18;
        nameLabel.lineHeight = 25;
        nameLabel.color = new Color(70, 38, 64, 255);

        const levelLabel = this.createLevelBadge(itemNode);
        const mergeItem = itemNode.addComponent(MergeItem);
        mergeItem.nameLabel = nameLabel;
        mergeItem.levelLabel = levelLabel;
        return itemNode;
    }

    private createGarmentMarker(parent: Node): void {
        const marker = new Node("GarmentMarker");
        marker.setParent(parent);
        marker.setPosition(0, 28, 0);
        marker.addComponent(UITransform).setContentSize(56, 38);
        this.drawSolidRect(marker, new Color(255, 234, 242, 255), 56, 38);
    }

    private createLevelBadge(parent: Node): Label {
        const badge = new Node("LevelBadge");
        badge.setParent(parent);
        badge.setPosition(31, 35, 0);
        badge.addComponent(UITransform).setContentSize(52, 30);
        this.drawSolidRect(badge, new Color(151, 60, 96, 255), 52, 30);

        const labelNode = new Node("LevelLabel");
        labelNode.setParent(badge);
        labelNode.addComponent(UITransform).setContentSize(48, 26);
        const levelLabel = labelNode.addComponent(Label);
        levelLabel.fontSize = 16;
        levelLabel.lineHeight = 22;
        levelLabel.color = Color.WHITE;
        return levelLabel;
    }

    private drawSolidRect(node: Node, color: Color, width: number, height: number): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }

    private bindButtons(): void {
        this.generateButton?.node.on(Button.EventType.CLICK, this.onGenerateClicked, this);
        this.clearButton?.node.on(Button.EventType.CLICK, this.onClearClicked, this);
        this.skinButton?.node.on(Button.EventType.CLICK, this.onSkinClicked, this);
        this.leaderboardButton?.node.on(Button.EventType.CLICK, this.onLeaderboardClicked, this);
        this.closeSkinButton?.node.on(Button.EventType.CLICK, this.onCloseSkinClicked, this);
        this.closeTutorialButton?.node.on(Button.EventType.CLICK, this.onCloseTutorialClicked, this);
        this.tutorialPrevButton?.node.on(Button.EventType.CLICK, this.onTutorialPrevClicked, this);
        this.tutorialNextButton?.node.on(Button.EventType.CLICK, this.onTutorialNextClicked, this);
        this.tutorialStartButton?.node.on(Button.EventType.CLICK, this.finishTutorial, this);
        this.closeLeaderboardButton?.node.on(Button.EventType.CLICK, this.onCloseLeaderboardClicked, this);
        this.closeAdRewardButton?.node.on(Button.EventType.CLICK, this.onCloseAdRewardClicked, this);
        this.dailyRewardButton?.node.on(Button.EventType.CLICK, this.onDailyRewardClicked, this);
        this.adClearButton?.node.on(Button.EventType.CLICK, () => this.onAdRewardClicked("clear_low_items"), this);
        this.adCoinButton?.node.on(Button.EventType.CLICK, () => this.onAdRewardClicked("coin_bonus"), this);
        this.adItemButton?.node.on(Button.EventType.CLICK, () => this.onAdRewardClicked("high_level_item"), this);
    }

    private registerEvents(): void {
        eventManager.on(GameEvents.BOARD_CHANGED, this.refreshBoard, this);
        eventManager.on(GameEvents.ITEM_MERGED, this.onItemMerged, this);
        eventManager.on(GameEvents.BOARD_FULL, this.onBoardFull, this);
        eventManager.on(GameEvents.ITEM_DRAG_END, this.onItemDragEnd, this);
        eventManager.on(GameEvents.SKIN_UNLOCKED, this.onSkinUnlocked, this);
    }

    private showTutorialIfNeeded(): void {
        const data = this.gameManager?.getPlayerData();
        if (!data || data.tutorialCompleted || !this.tutorialPanel) {
            return;
        }
        this.tutorialStepIndex = 0;
        this.showTutorialStep(0);
        this.tutorialPanel.active = true;
    }

    private async onGenerateClicked(): Promise<void> {
        audioManager.playClick();
        if (!this.gameManager) {
            return;
        }
        const ok = await this.gameManager.generateItem();
        if (ok) {
            this.refreshPlayerInfo();
            this.refreshBoard();
            this.setTip("生成了一件新服装");
            return;
        }
        audioManager.playFail();
    }

    private onClearClicked(): void {
        audioManager.playClick();
        if (this.adRewardPanel) {
            this.adRewardPanel.active = true;
        }
    }

    private onSkinClicked(): void {
        audioManager.playClick();
        this.refreshSkinView();
        if (this.skinPanel) {
            this.skinPanel.active = true;
        }
    }

    private async onLeaderboardClicked(): Promise<void> {
        audioManager.playClick();
        if (!this.gameManager) {
            return;
        }
        this.leaderboardView?.showLoading();
        if (this.leaderboardPanel) {
            this.leaderboardPanel.active = true;
        }
        const rows = await this.gameManager.getLeaderboard();
        this.leaderboardView?.showLeaderboard(rows);
    }

    private onCloseSkinClicked(): void {
        audioManager.playClick();
        if (this.skinPanel) {
            this.skinPanel.active = false;
        }
    }

    private onCloseTutorialClicked(): void {
        audioManager.playClick();
        this.finishTutorial();
    }

    private showTutorialStep(index: number): void {
        this.tutorialStepIndex = clampTutorialStepIndex(index);
        this.tutorialView?.showStep(this.tutorialStepIndex);
    }

    private onTutorialPrevClicked(): void {
        audioManager.playClick();
        this.showTutorialStep(clampTutorialStepIndex(this.tutorialStepIndex - 1));
    }

    private onTutorialNextClicked(): void {
        audioManager.playClick();
        if (this.tutorialStepIndex >= tutorialStepConfigs.length - 1) {
            this.finishTutorial();
            return;
        }
        this.showTutorialStep(clampTutorialStepIndex(this.tutorialStepIndex + 1));
    }

    private finishTutorial(): void {
        if (!this.gameManager) {
            return;
        }
        this.gameManager.completeTutorial();
        if (this.tutorialPanel) {
            this.tutorialPanel.active = false;
        }
    }

    private onCloseLeaderboardClicked(): void {
        audioManager.playClick();
        if (this.leaderboardPanel) {
            this.leaderboardPanel.active = false;
        }
    }

    private onCloseAdRewardClicked(): void {
        audioManager.playClick();
        if (this.adRewardPanel) {
            this.adRewardPanel.active = false;
        }
    }

    private async onDailyRewardClicked(): Promise<void> {
        audioManager.playClick();
        if (!this.gameManager) {
            return;
        }
        const result = await this.gameManager.claimDailyReward();
        if (result.ok) {
            this.refreshPlayerInfo();
            this.refreshDailyRewardButtonState();
            if (this.dailyRewardButtonLabel) {
                this.dailyRewardButtonLabel.string = "签到成功";
            }
            this.showFeedback("签到成功", new Color(150, 235, 165, 255));
            return;
        }
        audioManager.playFail();
        this.refreshDailyRewardButtonState();
    }

    private onAdRewardClicked(rewardType: AdRewardType): void {
        audioManager.playClick();
        if (!this.gameManager) {
            return;
        }
        RewardAdView.showRewardAd(() => {
            this.applyAdReward(rewardType);
        }, () => {
            audioManager.playFail();
            this.setTip("广告未完成，未发放奖励");
            this.showFeedback("广告未完成，未发放奖励", new Color(255, 140, 140, 255));
        });
    }


    private async applyAdReward(rewardType: AdRewardType): Promise<void> {
        if (!this.gameManager) {
            return;
        }
        const result = await this.gameManager.claimAdReward(rewardType);
        if (!result.ok) {
            audioManager.playFail();
        }
        this.refreshPlayerInfo();
        this.refreshBoard();
        this.setTip(result.message);
        this.showFeedback(result.message, result.ok ? new Color(150, 220, 255, 255) : new Color(255, 140, 140, 255));
        if (this.adRewardPanel) {
            this.adRewardPanel.active = false;
        }
    }
    private onItemMerged(): void {
        audioManager.playMerge();
        this.refreshPlayerInfo();
        this.refreshSkinView();
        this.setTip("合成成功");
        this.showFeedback("合成成功", new Color(255, 236, 120, 255));
    }

    private onSkinUnlocked(skinId: number): void {
        audioManager.playUnlock();
        this.refreshSkinView();
        this.setTip(`解锁新皮肤 ${skinId}`);
        this.showFeedback(`解锁新皮肤 ${skinId}`, new Color(255, 188, 230, 255));
    }

    private onBoardFull(): void {
        audioManager.playFail();
        this.setTip("衣橱已满，可以看广告清理低级服装");
    }

    private async onItemDragEnd(payload: { fromRow: number; fromCol: number; worldPosition: Vec3 }): Promise<void> {
        if (!this.gameManager || !this.boardRoot) {
            return;
        }

        const target = this.worldToCell(payload.worldPosition);
        if (!target) {
            audioManager.playFail();
            this.refreshBoard();
            return;
        }

        const result = await this.gameManager.mergeItems(payload.fromRow, payload.fromCol, target.row, target.col);
        if (!result.ok) {
            audioManager.playFail();
            this.setTip("不同服装不能合成");
            this.refreshBoard();
            return;
        }

        const config = getItemConfigById(result.resultItemId);
        this.refreshPlayerInfo();
        this.refreshSkinView();
        this.refreshBoard();
        this.setTip(`获得 ${config?.name ?? "新服装"}`);
    }

    private refreshPlayerInfo(): void {
        const data = this.gameManager?.getPlayerData();
        if (!data) {
            return;
        }
        if (this.coinLabel) {
            this.coinLabel.string = `金币 ${data.coins}`;
        }
        if (this.scoreLabel) {
            this.scoreLabel.string = `分数 ${data.score}`;
        }
    }

    private refreshSkinView(): void {
        const data = this.gameManager?.getPlayerData();
        if (!data || !this.skinView) {
            return;
        }
        this.skinView.showSkins(data.unlockedSkins);
    }

    private refreshDailyRewardButtonState(): void {
        const data = this.gameManager?.getPlayerData();
        if (!data || !this.dailyRewardButton) {
            return;
        }
        const claimedToday = data.lastDailyRewardDate === getDailyRewardTodayKey();
        this.dailyRewardButton.interactable = !claimedToday;
        if (this.dailyRewardDisabledMask) {
            this.dailyRewardDisabledMask.active = claimedToday;
        }
        if (this.dailyRewardButtonLabel) {
            this.dailyRewardButtonLabel.string = claimedToday ? "今日已签到" : "每日奖励";
        }
    }

    private setTip(message: string): void {
        if (this.tipLabel) {
            this.tipLabel.string = message;
        }
    }

    private showFeedback(message: string, color: Color): void {
        if (this.feedbackLabel) {
            this.feedbackLabel.string = message;
            this.feedbackLabel.color = color;
        }
        if (this.feedbackPanel) {
            this.feedbackPanel.active = true;
        }
    }

    private getCellPosition(row: number, col: number): Vec3 {
        const totalWidth = this.cellSize * 6 + this.gap * 5;
        const totalHeight = this.cellSize * 5 + this.gap * 4;
        const x = -totalWidth / 2 + this.cellSize / 2 + col * (this.cellSize + this.gap);
        const y = totalHeight / 2 - this.cellSize / 2 - row * (this.cellSize + this.gap);
        return new Vec3(x, y, 0);
    }

    private worldToCell(worldPosition: Vec3): { row: number; col: number } | null {
        if (!this.boardRoot) {
            return null;
        }

        const transform = this.boardRoot.getComponent(UITransform);
        if (!transform) {
            return null;
        }

        const local = transform.convertToNodeSpaceAR(worldPosition);
        const totalWidth = this.cellSize * 6 + this.gap * 5;
        const totalHeight = this.cellSize * 5 + this.gap * 4;
        const x = local.x + totalWidth / 2;
        const y = totalHeight / 2 - local.y;
        const stride = this.cellSize + this.gap;
        const col = Math.floor(x / stride);
        const row = Math.floor(y / stride);

        if (!this.gameManager?.boardManager.isInside(row, col)) {
            return null;
        }
        return { row, col };
    }
}


