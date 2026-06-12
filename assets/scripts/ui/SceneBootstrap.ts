import { _decorator, Button, Color, Component, Graphics, Label, Node, ResolutionPolicy, UITransform, Vec3, view } from "cc";
import { GameManager } from "../core/GameManager";
import { MainView } from "./MainView";
import { LeaderboardView } from "./LeaderboardView";
import { SkinView } from "./SkinView";
import { TutorialView } from "./TutorialView";
const { ccclass } = _decorator;

@ccclass("SceneBootstrap")
export class SceneBootstrap extends Component {
    onLoad(): void {
        this.configurePortraitResolution();
        if (this.node.getChildByName("MainView")) {
            return;
        }
        this.createDemoScene();
    }

    private configurePortraitResolution(): void {
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_WIDTH);
        const visibleSize = view.getVisibleSize();
        this.node.getComponent(UITransform)?.setContentSize(visibleSize.width, visibleSize.height);
    }

    private createDemoScene(): void {
        const visibleSize = view.getVisibleSize();
        const backgroundWidth = Math.max(720, visibleSize.width);
        const backgroundHeight = Math.max(1280, visibleSize.height);
        const background = this.createNode("Background", this.node, 0, 0, -1, backgroundWidth, backgroundHeight);
        this.drawSolidRect(background, new Color(29, 18, 40, 255), backgroundWidth, backgroundHeight);

        const mainNode = this.createNode("MainView", this.node, 0, 0, 0, 720, 1280);
        mainNode.addComponent(GameManager);
        const mainView = mainNode.addComponent(MainView);
        mainView.cellSize = 108;
        mainView.gap = 5;

        this.createLabel("TitleLabel", mainNode, 0, 590, "女神衣橱大合成", 42, new Color(255, 226, 239, 255), 600, 64);

        const headerBar = this.createNode("HeaderBar", mainNode, 0, 530, 0, 640, 82);
        this.drawSolidRect(headerBar, new Color(72, 42, 70, 245), 640, 82);
        const coinLabel = this.createLabel("CoinLabel", headerBar, -165, 6, "金币 0", 30, new Color(255, 234, 178, 255), 240, 50);
        const scoreLabel = this.createLabel("ScoreLabel", headerBar, 165, 6, "分数 0", 30, new Color(211, 235, 255, 255), 240, 50);
        this.createLabel("CoinCaption", headerBar, -165, -25, "COINS", 15, new Color(210, 168, 190, 255), 160, 26);
        this.createLabel("ScoreCaption", headerBar, 165, -25, "SCORE", 15, new Color(168, 190, 220, 255), 160, 26);

        const featureBar = this.createNode("FeatureBar", mainNode, 0, 455, 0, 640, 64);
        const dailyRewardButton = this.createButton("DailyRewardButton", featureBar, -216, 0, "每日奖励", new Color(112, 184, 124, 255), 196, 58, 22);
        const dailyRewardDisabledMask = this.createNode("DailyRewardDisabledMask", dailyRewardButton.node, 0, 0, 0, 196, 58);
        this.drawSolidRect(dailyRewardDisabledMask, new Color(80, 80, 88, 175), 196, 58);
        dailyRewardDisabledMask.active = false;
        const dailyRewardButtonLabel = dailyRewardButton.node.getChildByName("Label")?.getComponent(Label) ?? null;
        dailyRewardButtonLabel?.node.setSiblingIndex(9);
        const skinButton = this.createButton("SkinButton", featureBar, 0, 0, "皮肤图鉴", new Color(170, 104, 206, 255), 196, 58, 22);
        const leaderboardButton = this.createButton("LeaderboardButton", featureBar, 216, 0, "排行榜", new Color(225, 152, 78, 255), 196, 58, 22);

        const boardShell = this.createNode("WardrobeShell", mainNode, 0, 130, 0, 704, 600);
        this.drawSolidRect(boardShell, new Color(117, 70, 91, 255), 704, 600);
        const boardRoot = this.createNode("BoardRoot", mainNode, 0, 130, 0, 682, 570);
        this.drawSolidRect(boardRoot, new Color(255, 239, 246, 255), 682, 570);

        const actionBar = this.createNode("ActionBar", mainNode, 0, -315, 0, 682, 116);
        this.drawSolidRect(actionBar, new Color(57, 35, 59, 235), 682, 116);
        const generateButton = this.createButton("GenerateButton", actionBar, -168, 0, "生成服装", new Color(247, 76, 122, 255), 320, 92, 34);
        const clearButton = this.createButton("ClearButton", actionBar, 168, 0, "广告清理", new Color(66, 148, 224, 255), 320, 92, 34);

        const tipLabel = this.createLabel("TipLabel", mainNode, 0, -230, "拖动相同服装进行合成", 28, new Color(255, 205, 230, 255), 660, 56);
        const feedbackPanel = this.createNode("FeedbackPanel", mainNode, 0, -392, 0, 560, 56);
        this.drawSolidRect(feedbackPanel, new Color(33, 24, 42, 230), 560, 56);
        const feedbackLabel = this.createLabel("FeedbackLabel", feedbackPanel, 0, 2, "", 24, new Color(255, 236, 246, 255), 520, 42);
        feedbackPanel.active = false;

        const skinPanel = this.createSkinPanel(mainNode);
        const skinCard = skinPanel.getChildByName("SkinPanel")!;
        const closeSkinButton = skinCard.getChildByName("CloseSkinButton")!.getComponent(Button)!;
        const skinListPanel = skinCard.getChildByName("SkinListPanel")!;
        const skinContentLabel = skinListPanel.getChildByName("SkinContentLabel")!.getComponent(Label)!;
        const skinView = skinCard.addComponent(SkinView);
        skinView.contentLabel = skinContentLabel;
        skinView.listRoot = skinListPanel;
        skinPanel.active = false;

        const tutorialPanel = this.createTutorialPanel(mainNode);
        const tutorialCard = tutorialPanel.getChildByName("TutorialCard")!;
        const tutorialHighlight = tutorialPanel.getChildByName("TutorialHighlight")!;
        const closeTutorialButton = tutorialCard.getChildByName("CloseTutorialButton")!.getComponent(Button)!;
        const tutorialPrevButton = tutorialCard.getChildByName("TutorialPrevButton")!.getComponent(Button)!;
        const tutorialNextButton = tutorialCard.getChildByName("TutorialNextButton")!.getComponent(Button)!;
        const tutorialStartButton = tutorialCard.getChildByName("TutorialStartButton")!.getComponent(Button)!;
        const tutorialContentLabel = tutorialCard.getChildByName("TutorialContentLabel")!.getComponent(Label)!;
        const tutorialStepTitleLabel = tutorialCard.getChildByName("TutorialStepTitleLabel")!.getComponent(Label)!;
        const tutorialStepBodyLabel = tutorialCard.getChildByName("TutorialStepBodyLabel")!.getComponent(Label)!;
        const tutorialView = tutorialCard.addComponent(TutorialView);
        tutorialView.contentLabel = tutorialContentLabel;
        tutorialView.titleLabel = tutorialStepTitleLabel;
        tutorialView.bodyLabel = tutorialStepBodyLabel;
        tutorialView.highlightNode = tutorialHighlight;
        tutorialView.prevButtonLabel = tutorialPrevButton.node.getChildByName("Label")?.getComponent(Label) ?? null;
        tutorialView.nextButtonLabel = tutorialNextButton.node.getChildByName("Label")?.getComponent(Label) ?? null;
        tutorialView.startButtonLabel = tutorialStartButton.node.getChildByName("Label")?.getComponent(Label) ?? null;
        tutorialPanel.active = false;

        const leaderboardPanel = this.createLeaderboardPanel(mainNode);
        const leaderboardCard = leaderboardPanel.getChildByName("LeaderboardCard")!;
        const closeLeaderboardButton = leaderboardCard.getChildByName("CloseLeaderboardButton")!.getComponent(Button)!;
        const leaderboardListPanel = leaderboardCard.getChildByName("LeaderboardListPanel")!;
        const leaderboardView = leaderboardCard.addComponent(LeaderboardView);
        leaderboardView.listRoot = leaderboardListPanel;
        leaderboardPanel.active = false;

        const adRewardPanel = this.createAdRewardPanel(mainNode);
        const adRewardCard = adRewardPanel.getChildByName("AdRewardCard")!;
        const closeAdRewardButton = adRewardCard.getChildByName("CloseAdRewardButton")!.getComponent(Button)!;
        const adClearButton = adRewardCard.getChildByName("AdRewardButton_clear_low_items")!.getComponent(Button)!;
        const adCoinButton = adRewardCard.getChildByName("AdRewardButton_coin_bonus")!.getComponent(Button)!;
        const adItemButton = adRewardCard.getChildByName("AdRewardButton_high_level_item")!.getComponent(Button)!;
        adRewardPanel.active = false;

        mainView.boardRoot = boardRoot;
        mainView.coinLabel = coinLabel;
        mainView.scoreLabel = scoreLabel;
        mainView.tipLabel = tipLabel;
        mainView.feedbackPanel = feedbackPanel;
        mainView.feedbackLabel = feedbackLabel;
        mainView.generateButton = generateButton;
        mainView.clearButton = clearButton;
        mainView.skinButton = skinButton;
        mainView.leaderboardButton = leaderboardButton;
        mainView.dailyRewardButton = dailyRewardButton;
        mainView.dailyRewardButtonLabel = dailyRewardButtonLabel;
        mainView.dailyRewardDisabledMask = dailyRewardDisabledMask;
        mainView.closeSkinButton = closeSkinButton;
        mainView.closeTutorialButton = closeTutorialButton;
        mainView.tutorialPrevButton = tutorialPrevButton;
        mainView.tutorialNextButton = tutorialNextButton;
        mainView.tutorialStartButton = tutorialStartButton;
        mainView.closeLeaderboardButton = closeLeaderboardButton;
        mainView.closeAdRewardButton = closeAdRewardButton;
        mainView.adClearButton = adClearButton;
        mainView.adCoinButton = adCoinButton;
        mainView.adItemButton = adItemButton;
        mainView.skinPanel = skinPanel;
        mainView.tutorialPanel = tutorialPanel;
        mainView.leaderboardPanel = leaderboardPanel;
        mainView.adRewardPanel = adRewardPanel;
        mainView.skinView = skinView;
        mainView.tutorialView = tutorialView;
        mainView.leaderboardView = leaderboardView;
    }

    private createSkinPanel(mainNode: Node): Node {
        const skinPanel = this.createNode("SkinOverlay", mainNode, 0, 0, 8, 720, 1280);
        this.drawSolidRect(skinPanel, new Color(8, 6, 12, 165), 720, 1280);
        const skinCard = this.createNode("SkinPanel", skinPanel, 0, 8, 0, 650, 820);
        this.drawSolidRect(skinCard, new Color(54, 32, 61, 255), 650, 820);
        const skinPanelHeader = this.createNode("SkinPanelHeader", skinCard, 0, 350, 0, 610, 82);
        this.drawSolidRect(skinPanelHeader, new Color(126, 66, 103, 255), 610, 82);
        this.createLabel("SkinTitleLabel", skinPanelHeader, -120, 7, "皮肤图鉴", 34, new Color(255, 236, 246, 255), 300, 56);
        this.createLabel("SkinSubTitleLabel", skinPanelHeader, 95, -17, "合成指定等级服装解锁", 19, new Color(236, 190, 215, 255), 300, 36);
        this.createButton("CloseSkinButton", skinCard, 0, -330, "关闭", new Color(96, 84, 112, 255), 240, 58, 24);
        const skinListPanel = this.createNode("SkinListPanel", skinCard, 0, 5, 0, 590, 590);
        this.drawSolidRect(skinListPanel, new Color(41, 27, 49, 255), 590, 590);
        this.createLabel("SkinContentLabel", skinListPanel, 0, 0, "", 22, new Color(245, 224, 238, 255), 540, 520);
        this.createLabel("SkinFooterLabel", skinCard, 0, -270, "继续合成高等级服装，逐步点亮完整衣橱", 22, new Color(255, 214, 232, 255), 580, 44);
        return skinPanel;
    }

    private createTutorialPanel(mainNode: Node): Node {
        const tutorialPanel = this.createNode("TutorialPanel", mainNode, 0, 0, 9, 720, 1280);
        this.drawSolidRect(tutorialPanel, new Color(8, 6, 12, 170), 720, 1280);
        const tutorialHighlight = this.createNode("TutorialHighlight", tutorialPanel, 0, 130, 1, 690, 578);
        this.drawSolidRect(tutorialHighlight, new Color(255, 214, 82, 95), 690, 578);
        const card = this.createNode("TutorialCard", tutorialPanel, 0, 35, 2, 620, 610);
        this.drawSolidRect(card, new Color(52, 33, 62, 255), 620, 610);
        this.createLabel("TutorialTitleLabel", card, 0, 242, "新手引导", 38, new Color(255, 236, 246, 255), 420, 60);
        this.createLabel("TutorialStepTitleLabel", card, 0, 160, "", 32, new Color(255, 236, 246, 255), 520, 54);
        this.createLabel("TutorialStepBodyLabel", card, 0, 74, "", 26, new Color(248, 224, 238, 255), 540, 110);
        this.createLabel("TutorialContentLabel", card, 0, -20, "", 22, new Color(220, 190, 210, 255), 540, 96);
        this.createButton("TutorialPrevButton", card, -205, -172, "上一步", new Color(96, 84, 112, 255), 160, 58, 22);
        this.createButton("TutorialNextButton", card, 0, -172, "下一步", new Color(247, 76, 122, 255), 180, 58, 24);
        this.createButton("TutorialStartButton", card, 205, -172, "开始游戏", new Color(112, 184, 124, 255), 180, 58, 24);
        this.createButton("CloseTutorialButton", card, 0, -254, "关闭引导", new Color(96, 84, 112, 255), 240, 54, 22);
        return tutorialPanel;
    }

    private createLeaderboardPanel(mainNode: Node): Node {
        const leaderboardPanel = this.createNode("LeaderboardPanel", mainNode, 0, 0, 9, 720, 1280);
        this.drawSolidRect(leaderboardPanel, new Color(8, 6, 12, 165), 720, 1280);
        const card = this.createNode("LeaderboardCard", leaderboardPanel, 0, 10, 0, 650, 780);
        this.drawSolidRect(card, new Color(47, 34, 58, 255), 650, 780);
        this.createLabel("LeaderboardTitleLabel", card, 0, 325, "排行榜", 36, new Color(255, 236, 246, 255), 300, 58);
        this.createButton("CloseLeaderboardButton", card, 252, 322, "关闭", new Color(96, 84, 112, 255), 108, 52, 22);
        const listPanel = this.createNode("LeaderboardListPanel", card, 0, 5, 0, 590, 580);
        this.drawSolidRect(listPanel, new Color(38, 28, 47, 255), 590, 580);
        return leaderboardPanel;
    }

    private createAdRewardPanel(mainNode: Node): Node {
        const adRewardPanel = this.createNode("AdRewardPanel", mainNode, 0, 0, 9, 720, 1280);
        this.drawSolidRect(adRewardPanel, new Color(8, 6, 12, 165), 720, 1280);
        const card = this.createNode("AdRewardCard", adRewardPanel, 0, 10, 0, 620, 540);
        this.drawSolidRect(card, new Color(47, 34, 58, 255), 620, 540);
        this.createLabel("AdRewardTitleLabel", card, 0, 210, "选择广告奖励", 34, new Color(255, 236, 246, 255), 420, 58);
        this.createButton("AdRewardButton_clear_low_items", card, 0, 106, "清理低级服装", new Color(66, 148, 224, 255), 440, 72, 26);
        this.createButton("AdRewardButton_coin_bonus", card, 0, 12, "获得金币", new Color(112, 184, 124, 255), 440, 72, 26);
        this.createButton("AdRewardButton_high_level_item", card, 0, -82, "生成高级服装", new Color(225, 152, 78, 255), 440, 72, 26);
        this.createButton("CloseAdRewardButton", card, 0, -206, "取消", new Color(96, 84, 112, 255), 240, 58, 24);
        return adRewardPanel;
    }

    private createNode(name: string, parent: Node, x: number, y: number, z: number, width: number, height: number): Node {
        const node = new Node(name);
        node.setParent(parent);
        node.setPosition(new Vec3(x, y, z));
        node.addComponent(UITransform).setContentSize(width, height);
        return node;
    }

    private createLabel(name: string, parent: Node, x: number, y: number, text: string, fontSize: number, color: Color, width = 260, height = 48): Label {
        const node = this.createNode(name, parent, x, y, 0, width, height);
        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 8;
        label.color = color;
        return label;
    }

    private createButton(name: string, parent: Node, x: number, y: number, text: string, color: Color, width: number, height: number, fontSize: number): Button {
        const node = this.createNode(name, parent, x, y, 0, width, height);
        this.drawSolidRect(node, color, width, height);
        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        this.createLabel("Label", node, 0, 2, text, fontSize, Color.WHITE, width - 24, height - 16);
        return button;
    }

    private drawSolidRect(node: Node, color: Color, width: number, height: number): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }
}


