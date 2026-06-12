# Stage 2B-B Guided Onboarding Feedback Ad Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add step-by-step tutorial guidance, lightweight feedback, and safer rewarded-ad platform flow while preserving the existing browser-preview merge loop.

**Architecture:** Keep the existing programmatic Cocos UI in `SceneBootstrap` and interaction orchestration in `MainView`. Move tutorial step definitions into a small data module so text, highlight targets, and navigation state are testable without Cocos. Route rewarded ads through `platformManager.showRewardAd()` so rewards are only granted after platform success.

**Tech Stack:** Cocos Creator 3.8.x TypeScript, Node test runner, `tsx` for TypeScript logic tests, existing Koa backend unchanged.

---

## File Structure

- Create `assets/scripts/data/TutorialStepConfig.ts`
  - Owns tutorial step definitions and pure helpers.
  - Exports `TutorialHighlightTarget`, `TutorialStepConfig`, `tutorialStepConfigs`, `getTutorialStep`, and `clampTutorialStepIndex`.
- Modify `assets/scripts/ui/TutorialView.ts`
  - Renders one tutorial step at a time.
  - Updates title/content/highlight state and previous/next/start button labels.
- Modify `assets/scripts/ui/SceneBootstrap.ts`
  - Adds tutorial title/content/highlight/previous/next/start nodes.
  - Adds a lightweight feedback panel and label.
  - Wires new nodes into `MainView` and `TutorialView`.
- Modify `assets/scripts/ui/MainView.ts`
  - Owns tutorial navigation and completion.
  - Shows feedback for merge, daily reward, skin unlock, ad success, and ad failure.
  - Keeps the reward modal open when ad viewing fails.
- Modify `assets/scripts/ui/RewardAdView.ts`
  - Calls `platformManager.showRewardAd()` and gates reward callbacks on success.
- Modify `assets/scripts/platform/PlatformManager.ts`
  - Keeps web ad success mock.
  - Keeps the public `showRewardAd(): Promise<boolean>` contract explicit.
- Modify `assets/scripts/platform/WechatAdapter.ts`
  - Adds explicit rewarded-ad integration constants/comments while preserving current mock behavior when unavailable.
- Modify `assets/scripts/platform/DouyinAdapter.ts`
  - Adds the same explicit rewarded-ad integration constants/comments for Douyin.
- Modify `tests/client-logic.test.ts`
  - Adds pure tests for tutorial step definitions and index clamping.
- Modify `tests/client-scaffold.test.js`
  - Adds scaffold tests for tutorial UI nodes, feedback wiring, platform-routed ads, and failure handling.
- Modify `README.md` and `README_CLIENT.md`
  - Documents Stage 2B-B behavior and preview checklist.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Updates the checkpoint after implementation and verification.

---

### Task 1: Tutorial Step Data

**Files:**
- Create: `assets/scripts/data/TutorialStepConfig.ts`
- Modify: `tests/client-logic.test.ts`

- [ ] **Step 1: Add failing tutorial step tests**

Append this test to `tests/client-logic.test.ts`:

```ts
test('tutorial step configs describe the stage 2B-B guided onboarding flow', async () => {
  const module = await import('../assets/scripts/data/TutorialStepConfig');

  assert.equal(module.tutorialStepConfigs.length, 4);
  assert.deepEqual(
    module.tutorialStepConfigs.map((step) => step.highlightTarget),
    ['generate_button', 'board', 'ad_button', 'skin_button']
  );
  assert.equal(module.getTutorialStep(0)?.title, '生成第一件服装');
  assert.match(module.getTutorialStep(1)?.body ?? '', /拖动相同服装/);
  assert.equal(module.getTutorialStep(99), null);
  assert.equal(module.clampTutorialStepIndex(-10), 0);
  assert.equal(module.clampTutorialStepIndex(99), 3);
});
```

- [ ] **Step 2: Run the focused client logic test and confirm failure**

Run:

```powershell
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
```

Expected: FAIL because `../assets/scripts/data/TutorialStepConfig` does not exist.

- [ ] **Step 3: Implement tutorial step data**

Create `assets/scripts/data/TutorialStepConfig.ts`:

```ts
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
```

- [ ] **Step 4: Run client logic tests and confirm pass**

Run:

```powershell
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
```

Expected: PASS, including the new tutorial step config test.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- tests/client-logic.test.ts assets/scripts/data/TutorialStepConfig.ts assets/scripts/data/TutorialStepConfig.ts.meta
git commit -m "feat: add guided tutorial step data"
```

If Cocos has not generated `TutorialStepConfig.ts.meta`, omit that meta file from the commit.

---

### Task 2: Tutorial View And Scene Wiring

**Files:**
- Modify: `assets/scripts/ui/TutorialView.ts`
- Modify: `assets/scripts/ui/SceneBootstrap.ts`
- Modify: `assets/scripts/ui/MainView.ts`
- Modify: `tests/client-scaffold.test.js`

- [ ] **Step 1: Add failing scaffold tests for guided tutorial UI**

Append these tests to `tests/client-scaffold.test.js`:

```js
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
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because the guided tutorial nodes and methods do not exist yet.

- [ ] **Step 3: Update `TutorialView.ts`**

Replace `assets/scripts/ui/TutorialView.ts` with:

```ts
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
```

- [ ] **Step 4: Update tutorial scene wiring in `SceneBootstrap.ts`**

In `createDemoScene`, replace the current tutorial panel setup block with code that retrieves the new nodes:

```ts
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
```

In the `mainView` assignment section, add:

```ts
mainView.tutorialPrevButton = tutorialPrevButton;
mainView.tutorialNextButton = tutorialNextButton;
mainView.tutorialStartButton = tutorialStartButton;
```

Replace `createTutorialPanel` with:

```ts
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
```

- [ ] **Step 5: Update guided tutorial navigation in `MainView.ts`**

Add this import:

```ts
import { clampTutorialStepIndex, tutorialStepConfigs } from "../data/TutorialStepConfig";
```

Add properties:

```ts
@property(Button) tutorialPrevButton: Button | null = null;
@property(Button) tutorialNextButton: Button | null = null;
@property(Button) tutorialStartButton: Button | null = null;
```

Add field:

```ts
private tutorialStepIndex = 0;
```

In `bindButtons`, add:

```ts
this.tutorialPrevButton?.node.on(Button.EventType.CLICK, this.onTutorialPrevClicked, this);
this.tutorialNextButton?.node.on(Button.EventType.CLICK, this.onTutorialNextClicked, this);
this.tutorialStartButton?.node.on(Button.EventType.CLICK, this.finishTutorial, this);
```

Update `showTutorialIfNeeded` to call:

```ts
this.tutorialStepIndex = 0;
this.showTutorialStep(0);
this.tutorialPanel.active = true;
```

Replace `onCloseTutorialClicked` body with:

```ts
audioManager.playClick();
this.finishTutorial();
```

Add methods:

```ts
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
```

- [ ] **Step 6: Run scaffold and logic tests**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/ui/TutorialView.ts assets/scripts/ui/SceneBootstrap.ts assets/scripts/ui/MainView.ts
git commit -m "feat: add guided tutorial navigation"
```

---

### Task 3: Feedback Layer

**Files:**
- Modify: `assets/scripts/ui/SceneBootstrap.ts`
- Modify: `assets/scripts/ui/MainView.ts`
- Modify: `tests/client-scaffold.test.js`

- [ ] **Step 1: Add failing scaffold tests for feedback UI**

Append this test to `tests/client-scaffold.test.js`:

```js
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
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `FeedbackPanel`, `FeedbackLabel`, and `showFeedback` do not exist.

- [ ] **Step 3: Add feedback nodes in `SceneBootstrap.ts`**

After `TipLabel` creation in `createDemoScene`, add:

```ts
const feedbackPanel = this.createNode("FeedbackPanel", mainNode, 0, -392, 0, 560, 56);
this.drawSolidRect(feedbackPanel, new Color(33, 24, 42, 230), 560, 56);
const feedbackLabel = this.createLabel("FeedbackLabel", feedbackPanel, 0, 2, "", 24, new Color(255, 236, 246, 255), 520, 42);
feedbackPanel.active = false;
```

In the `mainView` assignment section, add:

```ts
mainView.feedbackPanel = feedbackPanel;
mainView.feedbackLabel = feedbackLabel;
```

- [ ] **Step 4: Add feedback support in `MainView.ts`**

Add properties:

```ts
@property(Node) feedbackPanel: Node | null = null;
@property(Label) feedbackLabel: Label | null = null;
```

Add method:

```ts
private showFeedback(message: string, color: Color): void {
    if (this.feedbackLabel) {
        this.feedbackLabel.string = message;
        this.feedbackLabel.color = color;
    }
    if (this.feedbackPanel) {
        this.feedbackPanel.active = true;
    }
}
```

Update success and failure paths:

```ts
this.showFeedback("合成成功", new Color(255, 236, 120, 255));
this.showFeedback("签到成功", new Color(150, 235, 165, 255));
this.showFeedback(`解锁新皮肤 ${skinId}`, new Color(255, 188, 230, 255));
this.showFeedback(result.message, result.ok ? new Color(150, 220, 255, 255) : new Color(255, 140, 140, 255));
```

Place these next to the existing `setTip` calls in `onItemMerged`, successful `onDailyRewardClicked`, `onSkinUnlocked`, and `applyAdReward`.

- [ ] **Step 5: Run scaffold tests**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/ui/SceneBootstrap.ts assets/scripts/ui/MainView.ts
git commit -m "feat: add action feedback layer"
```

---

### Task 4: Platform-Routed Rewarded Ads

**Files:**
- Modify: `assets/scripts/ui/RewardAdView.ts`
- Modify: `assets/scripts/ui/MainView.ts`
- Modify: `assets/scripts/platform/PlatformManager.ts`
- Modify: `assets/scripts/platform/WechatAdapter.ts`
- Modify: `assets/scripts/platform/DouyinAdapter.ts`
- Modify: `tests/client-scaffold.test.js`

- [ ] **Step 1: Add failing scaffold tests for platform-routed ads**

Append these tests to `tests/client-scaffold.test.js`:

```js
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
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `RewardAdView` still uses a timeout mock directly.

- [ ] **Step 3: Update `RewardAdView.ts`**

Replace `assets/scripts/ui/RewardAdView.ts` with:

```ts
import { _decorator, Component } from "cc";
import { eventManager, GameEvents } from "../core/EventManager";
import { platformManager } from "../platform/PlatformManager";
const { ccclass } = _decorator;

@ccclass("RewardAdView")
export class RewardAdView extends Component {
    showRewardAd(onSuccess: Function, onFail?: Function): void {
        RewardAdView.showRewardAd(onSuccess, onFail);
    }

    static async showRewardAd(onSuccess: Function, onFail?: Function): Promise<void> {
        try {
            const watched = await platformManager.showRewardAd();
            if (!watched) {
                eventManager.emit(GameEvents.AD_REWARD_FAILED);
                onFail?.();
                return;
            }
            onSuccess();
            eventManager.emit(GameEvents.AD_REWARD_SUCCESS);
        } catch (error) {
            console.warn("[RewardAdView] reward ad failed", error);
            eventManager.emit(GameEvents.AD_REWARD_FAILED, error);
            onFail?.(error);
        }
    }
}
```

- [ ] **Step 4: Update ad failure handling in `MainView.ts`**

Replace `onAdRewardClicked` with:

```ts
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
```

- [ ] **Step 5: Update platform adapter integration points**

In `assets/scripts/platform/WechatAdapter.ts`, add near the top:

```ts
const REWARDED_AD_UNIT_ID = "";
```

Replace `showRewardAd` with:

```ts
async showRewardAd(): Promise<boolean> {
    if (typeof wx === "undefined" || !REWARDED_AD_UNIT_ID) {
        return true;
    }
    // Real integration path: wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID }).
    // Resolve true only from the close event when res.isEnded is true.
    wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
    return true;
}
```

In `assets/scripts/platform/DouyinAdapter.ts`, add the same constant and update `showRewardAd` to:

```ts
async showRewardAd(): Promise<boolean> {
    if (typeof tt === "undefined" || !REWARDED_AD_UNIT_ID) {
        return true;
    }
    // Real integration path: tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID }).
    // Resolve true only from the close event when res.isEnded is true.
    tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
    return true;
}
```

- [ ] **Step 6: Run scaffold tests**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/ui/RewardAdView.ts assets/scripts/ui/MainView.ts assets/scripts/platform/PlatformManager.ts assets/scripts/platform/WechatAdapter.ts assets/scripts/platform/DouyinAdapter.ts
git commit -m "feat: route rewarded ads through platform manager"
```

---

### Task 5: Documentation And Final Verification

**Files:**
- Modify: `README.md`
- Modify: `README_CLIENT.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update README stage notes**

In `README.md`, update the Stage 2 section so Stage 2B-B is marked complete with these bullets:

```markdown
阶段 2B-B 已完成：

- 新手引导从静态说明升级为分步骤引导。
- 引导会高亮当前步骤对应的主要操作区域。
- 合成、签到、解锁皮肤、广告奖励成功/失败会显示更清晰的反馈。
- 激励广告奖励改为等待平台广告成功后再发放。
- 微信/抖音平台适配层保留真实激励广告接入点。
```

- [ ] **Step 2: Update client preview checklist**

In `README_CLIENT.md`, add this checklist:

```markdown
## Stage 2B-B 预览检查

- 首次进入会显示分步骤新手引导。
- 点击下一步/上一步会切换引导文案和高亮区域。
- 最后一步点击完成或开始游戏后，引导完成状态会写入存档。
- 合成成功、每日奖励、皮肤解锁、广告奖励成功都会显示反馈。
- 广告未完成时不会发放奖励，并会保留奖励选择弹窗。
```

- [ ] **Step 3: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, update the completed stage to Stage 2B-B and add the new completed capabilities from Step 1.

- [ ] **Step 4: Run full verification**

Run:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected:

- `node --test` reports all tests pass.
- `tsx --test` reports all tests pass.
- Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- README.md README_CLIENT.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: update stage 2b-b checkpoint"
```

---

## Final Review

After all tasks are complete:

- Run `git status --short`.
- Confirm only unrelated pre-existing untracked files remain, or no files remain.
- Summarize the completed Stage 2B-B features and verification commands.
