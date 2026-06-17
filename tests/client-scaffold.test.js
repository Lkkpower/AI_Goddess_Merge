const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

test('SceneBootstrap script exists and creates the first-playable UI nodes', () => {
  const source = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(source, /@ccclass\("SceneBootstrap"\)/);
  assert.match(source, /BoardRoot/);
  assert.match(source, /GenerateButton/);
  assert.match(source, /ClearButton/);
  assert.match(source, /CoinLabel/);
  assert.match(source, /ScoreLabel/);
  assert.match(source, /TipLabel/);
  assert.match(source, /MainView/);
});

test('MainView can create merge item nodes without a prefab for demo preview', () => {
  const source = read('assets/scripts/ui/MainView.ts');

  assert.match(source, /createItemNode/);
  assert.match(source, /createFallbackItemNode/);
  assert.match(source, /this\.itemPrefab \? instantiate\(this\.itemPrefab\)/);
});

test('demo preview renders placeholder rectangles without external sprite assets', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(bootstrap, /Graphics/);
  assert.match(bootstrap, /drawSolidRect/);
  assert.match(mainView, /Graphics/);
  assert.match(mainView, /drawSolidRect/);
});

test('demo preview layout uses portrait mobile game structure', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(bootstrap, /createNode\("Background", this\.node, 0, 0, -1, backgroundWidth, backgroundHeight\)/);
  assert.match(bootstrap, /createNode\("MainView", this\.node, 0, 0, 0, 720, 1280\)/);
  assert.match(bootstrap, /HeaderBar", mainNode, 0, 530/);
  assert.match(bootstrap, /BoardRoot", mainNode, 0, 130/);
  assert.match(bootstrap, /ActionBar", mainNode, 0, -315/);
  assert.match(bootstrap, /TipLabel", mainNode, 0, -230/);
});

test('MainView renders an empty 5x6 board grid behind item nodes', () => {
  const source = read('assets/scripts/ui/MainView.ts');

  assert.match(source, /drawBoardGrid/);
  assert.match(source, /createCellBackground/);
  assert.match(source, /for \(let row = 0; row < board\.rows; row \+= 1\)/);
});

test('demo preview uses a lightweight portrait game shell', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(bootstrap, /TitleLabel/);
  assert.match(bootstrap, /女神衣橱大合成/);
  assert.match(bootstrap, /Background/);
  assert.match(bootstrap, /HeaderBar/);
  assert.match(bootstrap, /new Color\(29, 18, 40, 255\)/);
  assert.match(bootstrap, /mainView\.cellSize = 108/);
  assert.match(bootstrap, /mainView\.gap = 5/);
  assert.match(mainView, /cellSize = 108/);
  assert.match(mainView, /gap = 5/);
  assert.match(mainView, /createLevelBadge/);
});
test('portrait preview configures Cocos design resolution and fills visible background', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(bootstrap, /view/);
  assert.match(bootstrap, /ResolutionPolicy/);
  assert.match(bootstrap, /setDesignResolutionSize\(720, 1280, ResolutionPolicy\.FIXED_WIDTH\)/);
  assert.match(bootstrap, /getVisibleSize\(\)/);
  assert.match(bootstrap, /Math\.max\(720, visibleSize\.width\)/);
  assert.match(bootstrap, /Math\.max\(1280, visibleSize\.height\)/);
});
test('Main scene stores a portrait Canvas baseline for editor preview', () => {
  const scene = read('assets/Main.scene.scene');

  assert.match(scene, /"_name": "Canvas"/);
  assert.match(scene, /"x": 360/);
  assert.match(scene, /"y": 640/);
  assert.match(scene, /"width": 720/);
  assert.match(scene, /"height": 1280/);
});
test('portrait gameplay area is enlarged for touch operation', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(bootstrap, /WardrobeShell", mainNode, 0, 130, 0, 704, 600/);
  assert.match(bootstrap, /BoardRoot", mainNode, 0, 130, 0, 682, 570/);
  assert.match(bootstrap, /ActionBar", mainNode, 0, -315, 0, 682, 116/);
  assert.match(bootstrap, /createButton\("GenerateButton", actionBar, -168, 0, "生成服装", new Color\(247, 76, 122, 255\), 320, 92, 34\)/);
  assert.match(bootstrap, /createButton\("ClearButton", actionBar, 168, 0, "广告清理", new Color\(66, 148, 224, 255\), 320, 92, 34\)/);
  assert.match(mainView, /nameLabel\.fontSize = 18/);
  assert.match(mainView, /levelLabel\.fontSize = 16/);
});
test('MergeItem keeps drag working when touch starts on enlarged child labels or badges', () => {
  const mergeItem = read('assets/scripts/gameplay/MergeItem.ts');

  assert.match(mergeItem, /private touchTargets: Node\[\] = \[\]/);
  assert.match(mergeItem, /private bindTouchTargets\(\): void/);
  assert.match(mergeItem, /private collectTouchTargets\(node: Node, targets: Node\[\]\): void/);
  assert.match(mergeItem, /target\.on\(Node\.EventType\.TOUCH_START, this\.onTouchStart, this\)/);
  assert.match(mergeItem, /target\.off\(Node\.EventType\.TOUCH_START, this\.onTouchStart, this\)/);
  assert.match(mergeItem, /this\.stopTouchPropagation\(event\)/);
});
test('GameManager exposes daily reward claim and emits reward event', () => {
  const gameManager = read('assets/scripts/core/GameManager.ts');
  const events = read('assets/scripts/core/EventManager.ts');

  assert.match(events, /DAILY_REWARD_CLAIMED/);
  assert.match(gameManager, /claimDailyReward\(todayKey\?: string\)/);
  assert.match(gameManager, /claimDailyReward\(data, todayKey\)/);
  assert.match(gameManager, /GameEvents\.DAILY_REWARD_CLAIMED/);
});

test('stage 2A portrait scene creates skin and daily reward entry points', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(bootstrap, /SkinButton/);
  assert.match(bootstrap, /DailyRewardButton/);
  assert.match(bootstrap, /SkinPanel/);
  assert.match(bootstrap, /SkinContentLabel/);
  assert.match(bootstrap, /CloseSkinButton/);
  assert.match(bootstrap, /mainView\.skinButton = skinButton/);
  assert.match(bootstrap, /DailyRewardDisabledMask/);
  assert.match(bootstrap, /mainView\.dailyRewardButton = dailyRewardButton/);
  assert.match(bootstrap, /mainView\.dailyRewardDisabledMask = dailyRewardDisabledMask/);
  assert.match(bootstrap, /mainView\.skinPanel = skinPanel/);
});

test('MainView wires skin list, daily reward, unlock feedback, and audio hooks', () => {
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(mainView, /import \{ audioManager \}/);
  assert.match(mainView, /import \{ SkinView \}/);
  assert.match(mainView, /skinButton: Button \| null = null/);
  assert.match(mainView, /dailyRewardButton: Button \| null = null/);
  assert.match(mainView, /skinPanel: Node \| null = null/);
  assert.match(mainView, /refreshSkinView\(\)/);
  assert.match(mainView, /onDailyRewardClicked\(\)/);
  assert.match(mainView, /onSkinUnlocked\(skinId: number\)/);
  assert.match(mainView, /audioManager\.playClick\(\)/);
  assert.match(mainView, /audioManager\.playMerge\(\)/);
  assert.match(mainView, /audioManager\.playFail\(\)/);
  assert.match(mainView, /audioManager\.playUnlock\(\)/);
});

test('SkinView renders locked and unlocked skin list text', () => {
  const skinView = read('assets/scripts/ui/SkinView.ts');

  assert.match(skinView, /renderSkinLines\(unlockedSkins: number\[\]\): string\[\]/);
  assert.match(skinView, /skinConfigs\.map/);
  assert.match(skinView, /已解锁/);
  assert.match(skinView, /未解锁/);
  assert.match(skinView, /Lv\.\$\{skin\.unlockItemLevel\}/);
});


test('daily reward button becomes disabled and shows claimed copy after successful claim', () => {
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(mainView, /private refreshDailyRewardButtonState\(\): void/);
  assert.match(mainView, /this\.dailyRewardButton\.interactable = !claimedToday/);
  assert.match(mainView, /this\.dailyRewardButtonLabel\.string = claimedToday \? "今日已签到" : "每日奖励"/);
  assert.match(mainView, /dailyRewardDisabledMask: Node \| null = null/);
  assert.match(mainView, /this\.dailyRewardDisabledMask\.active = claimedToday/);
  assert.match(mainView, /this\.dailyRewardButtonLabel\.string = "签到成功"/);
  assert.match(mainView, /this\.refreshDailyRewardButtonState\(\)/);
});

test('skin gallery popup uses a polished modal shell with styled list rows and status labels', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');
  const skinView = read('assets/scripts/ui/SkinView.ts');

  assert.match(bootstrap, /SkinOverlay/);
  assert.match(bootstrap, /SkinPanelHeader/);
  assert.match(bootstrap, /SkinListPanel/);
  assert.match(bootstrap, /SkinFooterLabel/);
  assert.match(bootstrap, /createButton\("CloseSkinButton", skinCard, 0, -330, "关闭"/);
  assert.match(skinView, /createSkinRows/);
  assert.match(skinView, /SkinRow_/);
  assert.match(skinView, /StatusBadge_/);
  assert.match(skinView, /解锁/);
  assert.match(skinView, /待解锁/);
});





test('GameManager exposes tutorial completion, leaderboard loading, and configurable ad rewards', () => {
  const gameManager = read('assets/scripts/core/GameManager.ts');
  const storage = read('assets/scripts/core/StorageManager.ts');
  const events = read('assets/scripts/core/EventManager.ts');

  assert.match(events, /TUTORIAL_COMPLETED/);
  assert.match(events, /AD_REWARD_CLAIMED/);
  assert.match(gameManager, /completeTutorial\(\): void/);
  assert.match(gameManager, /getLeaderboard\(\): Promise<LeaderboardRow\[\]>/);
  assert.match(gameManager, /claimAdReward\(rewardType: AdRewardType\)/);
  assert.match(gameManager, /createLocalLeaderboard\(data\)/);
  assert.match(storage, /loadLeaderboard\(\): Promise<RemoteLeaderboardRow\[\]>/);
  assert.match(storage, /claimAdReward\(payload: AdRewardClaimPayload\): Promise<boolean>/);
});

test('stage 3 client submits ad reward context to remote validation endpoint', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');
  const gameManager = read('assets/scripts/core/GameManager.ts');

  assert.match(storage, /export interface AdRewardClaimPayload/);
  assert.match(storage, /playerId: string/);
  assert.match(storage, /rewardType: AdRewardType/);
  assert.match(storage, /clientRewardValue\?: number/);
  assert.match(storage, /clientCoins\?: number/);
  assert.match(storage, /clientScore\?: number/);
  assert.match(storage, /clientHighestItemLevel\?: number/);
  assert.match(storage, /claimAdReward\(payload: AdRewardClaimPayload\): Promise<boolean>/);
  assert.match(storage, /body: JSON\.stringify\(payload\)/);
  assert.match(gameManager, /storageManager\.claimAdReward\(\{/);
  assert.match(gameManager, /playerId: data\.playerId/);
  assert.match(gameManager, /rewardType/);
  assert.match(gameManager, /clientRewardValue: result\.value/);
  assert.match(gameManager, /clientCoins: data\.coins/);
  assert.match(gameManager, /clientScore: data\.score/);
  assert.match(gameManager, /clientHighestItemLevel: data\.highestItemLevel/);
});

test('stage 2B-A scene creates tutorial, leaderboard, and ad reward modal UI', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(bootstrap, /TutorialPanel/);
  assert.match(bootstrap, /TutorialContentLabel/);
  assert.match(bootstrap, /CloseTutorialButton/);
  assert.match(bootstrap, /LeaderboardButton/);
  assert.match(bootstrap, /LeaderboardPanel/);
  assert.match(bootstrap, /LeaderboardListPanel/);
  assert.match(bootstrap, /CloseLeaderboardButton/);
  assert.match(bootstrap, /AdRewardPanel/);
  assert.match(bootstrap, /AdRewardButton_clear_low_items/);
  assert.match(bootstrap, /AdRewardButton_coin_bonus/);
  assert.match(bootstrap, /AdRewardButton_high_level_item/);
});

test('MainView wires tutorial, leaderboard, and ad reward modal handlers', () => {
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(mainView, /import \{ TutorialView \}/);
  assert.match(mainView, /import \{ LeaderboardView \}/);
  assert.match(mainView, /tutorialPanel: Node \| null = null/);
  assert.match(mainView, /leaderboardPanel: Node \| null = null/);
  assert.match(mainView, /adRewardPanel: Node \| null = null/);
  assert.match(mainView, /onCloseTutorialClicked\(\)/);
  assert.match(mainView, /onLeaderboardClicked\(\)/);
  assert.match(mainView, /onAdRewardClicked\(rewardType: AdRewardType\)/);
  assert.match(mainView, /this\.gameManager\.completeTutorial\(\)/);
  assert.match(mainView, /this\.gameManager\.getLeaderboard\(\)/);
  assert.match(mainView, /this\.gameManager\.claimAdReward\(rewardType\)/);
});

test('TutorialView and LeaderboardView render modal content from data', () => {
  const tutorialView = read('assets/scripts/ui/TutorialView.ts');
  const tutorialConfig = read('assets/scripts/data/TutorialStepConfig.ts');
  const leaderboardView = read('assets/scripts/ui/LeaderboardView.ts');

  assert.match(tutorialView, /renderTutorialLines\(\): string\[\]/);
  assert.match(tutorialConfig, /生成服装/);
  assert.match(tutorialConfig, /拖动相同服装/);
  assert.match(leaderboardView, /showLeaderboard\(rows: LeaderboardRow\[\]\): void/);
  assert.match(leaderboardView, /LeaderboardRow_/);
  assert.match(leaderboardView, /Lv\.\$\{row\.highestItemLevel\}/);
});

test('stage 2B-B tutorial scene creates step navigation and highlight nodes', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(bootstrap, /TutorialStepTitleLabel/);
  assert.match(bootstrap, /TutorialStepBodyLabel/);
  assert.match(bootstrap, /TutorialHighlight/);
  assert.match(bootstrap, /TutorialPrevButton/);
  assert.match(bootstrap, /TutorialNextButton/);
  assert.match(bootstrap, /TutorialStartButton/);
  assert.match(bootstrap, /tutorialView\.titleLabel = tutorialStepTitleLabel/);
  assert.match(bootstrap, /tutorialView\.bodyLabel = tutorialStepBodyLabel/);
  assert.match(bootstrap, /tutorialView\.highlightNode = tutorialHighlight/);
  assert.match(bootstrap, /mainView\.tutorialPrevButton = tutorialPrevButton/);
  assert.match(bootstrap, /mainView\.tutorialNextButton = tutorialNextButton/);
  assert.match(bootstrap, /mainView\.tutorialStartButton = tutorialStartButton/);
});

test('TutorialView renders one guided tutorial step and controls navigation copy', () => {
  const tutorialView = read('assets/scripts/ui/TutorialView.ts');

  assert.match(tutorialView, /import \{ TutorialHighlightTarget/);
  assert.match(tutorialView, /showStep\(index: number\): void/);
  assert.match(tutorialView, /setHighlightTarget\(step\.highlightTarget\)/);
  assert.match(tutorialView, /prevButtonLabel\.string = "上一步"/);
  assert.match(tutorialView, /nextButtonLabel\.string = index >= tutorialStepConfigs\.length - 1 \? "完成" : "下一步"/);
  assert.match(tutorialView, /startButtonLabel\.string = "开始游戏"/);
});

test('MainView owns guided tutorial step navigation before completion', () => {
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(mainView, /tutorialPrevButton: Button \| null = null/);
  assert.match(mainView, /tutorialNextButton: Button \| null = null/);
  assert.match(mainView, /tutorialStartButton: Button \| null = null/);
  assert.match(mainView, /private tutorialStepIndex = 0/);
  assert.match(mainView, /showTutorialStep\(0\)/);
  assert.match(mainView, /onTutorialPrevClicked\(\)/);
  assert.match(mainView, /onTutorialNextClicked\(\)/);
  assert.match(mainView, /finishTutorial\(\)/);
  assert.match(mainView, /clampTutorialStepIndex\(this\.tutorialStepIndex - 1\)/);
  assert.match(mainView, /clampTutorialStepIndex\(this\.tutorialStepIndex \+ 1\)/);
});

test('stage 2B-B feedback layer shows action result messages', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(bootstrap, /FeedbackPanel/);
  assert.match(bootstrap, /FeedbackLabel/);
  assert.match(bootstrap, /mainView\.feedbackPanel = feedbackPanel/);
  assert.match(bootstrap, /mainView\.feedbackLabel = feedbackLabel/);
  assert.match(mainView, /feedbackPanel: Node \| null = null/);
  assert.match(mainView, /feedbackLabel: Label \| null = null/);
  assert.match(mainView, /showFeedback\(message: string, color: Color\)/);
  assert.match(mainView, /this\.showFeedback\("合成成功"/);
  assert.match(mainView, /this\.showFeedback\("签到成功"/);
  assert.match(mainView, /this\.showFeedback\(`解锁新皮肤 \$\{skinId\}`/);
  assert.match(mainView, /this\.showFeedback\(result\.message/);
});

test('RewardAdView routes rewarded ads through PlatformManager success result', () => {
  const rewardAdView = read('assets/scripts/ui/RewardAdView.ts');

  assert.match(rewardAdView, /import \{ platformManager \}/);
  assert.match(rewardAdView, /await platformManager\.showRewardAd\(\)/);
  assert.match(rewardAdView, /if \(!watched\)/);
  assert.match(rewardAdView, /GameEvents\.AD_REWARD_FAILED/);
  assert.match(rewardAdView, /GameEvents\.AD_REWARD_SUCCESS/);
});

test('MainView keeps reward modal open and shows feedback when ad viewing fails', () => {
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(mainView, /RewardAdView\.showRewardAd\(\(\) => \{/);
  assert.match(mainView, /\}, \(\) => \{/);
  assert.match(mainView, /this\.showFeedback\("广告未完成，未发放奖励"/);
  assert.match(mainView, /this\.setTip\("广告未完成，未发放奖励"\)/);
});

test('platform adapters keep explicit rewarded ad integration points', () => {
  const platform = read('assets/scripts/platform/PlatformManager.ts');
  const wechat = read('assets/scripts/platform/WechatAdapter.ts');
  const douyin = read('assets/scripts/platform/DouyinAdapter.ts');

  assert.match(platform, /async showRewardAd\(\): Promise<boolean>/);
  assert.match(wechat, /REWARDED_AD_UNIT_ID/);
  assert.match(wechat, /createRewardedVideoAd/);
  assert.match(douyin, /REWARDED_AD_UNIT_ID/);
  assert.match(douyin, /createRewardedVideoAd/);
});

test('stage 3 platform adapters resolve rewarded ads from close events', () => {
  const wechat = read('assets/scripts/platform/WechatAdapter.ts');
  const douyin = read('assets/scripts/platform/DouyinAdapter.ts');

  for (const source of [wechat, douyin]) {
    assert.match(source, /onClose/);
    assert.match(source, /offClose/);
    assert.match(source, /onError/);
    assert.match(source, /offError/);
    assert.match(source, /isEnded/);
    assert.match(source, /settled/);
    assert.match(source, /cleanup\(\)/);
    assert.match(source, /rewardedAd\.show\(\)/);
    assert.match(source, /rewardedAd\.load\(\)/);
    assert.match(source, /settle\(Boolean\(result && result\.isEnded\)\)/);
  }
});

test('leaderboard shows loading state before data and highlights top three ranks', () => {
  const mainView = read('assets/scripts/ui/MainView.ts');
  const leaderboardView = read('assets/scripts/ui/LeaderboardView.ts');
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(mainView, /this\.leaderboardView\?\.showLoading\(\)/);
  assert.match(mainView, /this\.leaderboardPanel\.active = true/);
  assert.match(leaderboardView, /showLoading\(\): void/);
  assert.match(leaderboardView, /加载中/);
  assert.match(leaderboardView, /getRankMedal\(rank: number\): string/);
  assert.match(leaderboardView, /🥇/);
  assert.match(leaderboardView, /🥈/);
  assert.match(leaderboardView, /🥉/);
  assert.match(leaderboardView, /TopRankMedal_/);
  assert.match(bootstrap, /createLabel\("LeaderboardTitleLabel", card, 0, 325, "排行榜"/);
});

test('skin gallery close button is placed at the bottom center of the modal', () => {
  const bootstrap = read('assets/scripts/ui/SceneBootstrap.ts');

  assert.match(bootstrap, /createButton\("CloseSkinButton", skinCard, 0, -330, "关闭"/);
});

test('stage 3B platform manager exports login and request contracts', () => {
  const platform = read('assets/scripts/platform/PlatformManager.ts');

  assert.match(platform, /export type PlatformName = "wechat" \| "douyin" \| "web"/);
  assert.match(platform, /export interface PlatformLoginResult/);
  assert.match(platform, /platform: PlatformName/);
  assert.match(platform, /code: string/);
  assert.match(platform, /playerId\?: string/);
  assert.match(platform, /export interface PlatformRequestOptions/);
  assert.match(platform, /export interface PlatformResponse<T = any>/);
  assert.match(platform, /request\(url: string, options\?: PlatformRequestOptions\): Promise<PlatformResponse>/);
  assert.match(platform, /return this\.getAdapter\(\)\.request\(url, options\)/);
});

