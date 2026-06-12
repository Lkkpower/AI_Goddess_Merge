# Stage 2B-B Design: Guided Onboarding, Feedback, and Ad Prep

## Goal

Stage 2B-B improves the browser-preview MVP without taking on full WeChat or Douyin SDK integration. The stage keeps the existing merge rules intact and adds a more useful first-run tutorial, clearer player feedback, safer rewarded-ad handling, and platform-adapter preparation.

## Current Context

Stage 2B-A is complete. The game already has a 5x6 merge board, 20 merge levels, skin unlocks, daily rewards, a tutorial modal, leaderboard modal with fallback data, and three rewarded-ad reward choices.

The current tutorial is static text. Rewarded ads use a direct timeout mock in `RewardAdView`, so rewards are granted as long as the callback runs. Feedback for merge, rewards, and unlocks is mostly short tip-label text.

## Approach

Use a narrow incremental enhancement of the existing programmatic Cocos UI. Keep `SceneBootstrap` as the UI construction point and keep `MainView` as the interaction coordinator. Add small data helpers only where they make behavior easier to test.

This avoids a premature UI framework rewrite and keeps the stage compatible with the current browser-preview workflow.

## Feature Design

### Step-by-Step Tutorial

`TutorialView` will render a tutorial step model instead of static lines. The first version contains four steps:

1. Generate clothing with the main generate button.
2. Drag matching clothing items to merge.
3. Use ad rewards when the wardrobe is crowded.
4. Open the skin gallery and keep merging to unlock skins.

`SceneBootstrap` will add tutorial title/content labels, previous/next/start buttons, and a simple highlight node. `MainView` will own the current step index and move the tutorial forward or backward. Closing the tutorial on the final step will call `GameManager.completeTutorial()`.

Highlights use fixed target names and approximate positions for the existing portrait layout. They are simple programmatic rectangles, not complex cut-out masks.

### Feedback Layer

`SceneBootstrap` will create a lightweight feedback label or panel near the tip area. `MainView` will use it for:

- Merge success.
- Daily reward claimed.
- Skin unlocked.
- Ad reward claimed.
- Ad failed or cancelled.

The feedback is intentionally simple: text plus color. No art assets or animation libraries are introduced in this stage.

### Rewarded Ad Handling

`RewardAdView` will call `platformManager.showRewardAd()` and only run the reward callback when the platform adapter returns success. If the adapter returns false or throws, `RewardAdView` calls the failure callback and emits the existing ad failure path.

The web adapter remains a successful mock so browser preview stays fast. WeChat and Douyin adapters keep placeholder implementations with explicit integration points for real rewarded-video APIs.

### Platform Adapter Preparation

The platform layer will keep one public `showRewardAd(): Promise<boolean>` contract. Adapter implementations can later map platform SDK events to:

- `true`: user watched the ad to completion.
- `false`: user cancelled, SDK unavailable, or ad failed.

This stage may add small config fields or comments for future ad unit IDs, but it does not perform full real-device SDK integration.

## Data Flow

Tutorial:

`SceneBootstrap` creates nodes -> `MainView` wires buttons -> `TutorialView` renders step data -> final close calls `GameManager.completeTutorial()` -> player data saves locally and remotely through existing save flow.

Ad reward:

Reward button click -> `RewardAdView.showRewardAd()` -> `platformManager.showRewardAd()` -> success calls `GameManager.claimAdReward()` -> UI refreshes board/player state and shows feedback. Failure does not call `claimAdReward()`.

Feedback:

Gameplay event or action result -> `MainView.showFeedback()` -> feedback node updates text, color, and active state.

## Error Handling

Tutorial rendering must tolerate missing labels or buttons so editor binding mistakes do not crash preview.

Ad reward failure must not grant rewards. Failure cases include rejected promises, false adapter results, and callback errors. The UI should show a short failure message and leave the reward modal open unless the user cancels.

Leaderboard, save, and remote ad-claim behavior stay as they are.

## Testing

Use the existing test style:

- `tests/client-scaffold.test.js` checks tutorial step UI nodes, view methods, feedback wiring, and `RewardAdView` platform-manager usage.
- `tests/client-logic.test.ts` checks pure tutorial step data and any pure helper behavior added for ad result handling.
- Existing server tests must remain green.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

The filtered TypeScript check should produce no `assets/scripts` output.

## Out of Scope

- Full WeChat rewarded-video SDK integration.
- Full Douyin rewarded-video SDK integration.
- Open data domain leaderboard implementation.
- New image, audio, or animation assets.
- Replacing the programmatic UI with Prefabs.

## Acceptance Criteria

- First-run tutorial can move through multiple steps.
- Tutorial completion is still saved only when the player finishes or starts the game from the final step.
- Tutorial highlights point to the main action areas in the current portrait layout.
- Merge, daily reward, skin unlock, ad success, and ad failure show clear feedback.
- Ad rewards are granted only after `platformManager.showRewardAd()` succeeds.
- Web preview still works with mock ad success.
- Existing Stage 2A and Stage 2B-A tests remain passing.
