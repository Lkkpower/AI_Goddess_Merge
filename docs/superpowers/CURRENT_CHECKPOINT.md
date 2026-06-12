# Current Checkpoint - 2026-06-12

## Project

- Path: `D:\project\AI_Goddess_Merge`
- Engine: Cocos Creator 3.8.x, currently developed around Cocos Creator 3.8.8
- Preview style: browser preview through `SceneBootstrap.ts` mounted on Canvas
- Target: portrait mobile mini-game

## Current Completed Stage

Current development node: **Stage 2B-B completed**.

Completed capabilities:

- Core 5x6 merge board.
- Generate clothing items.
- Drag-and-drop same-level merge.
- Coins, score, highest item level tracking.
- Local save and remote save fallback.
- 20-level merge chain.
- 7 skin unlock targets.
- Daily reward with claimed button state.
- Skin gallery modal with styled list rows.
- First-run tutorial completion save flag.
- Leaderboard button and leaderboard modal.
- Leaderboard remote load with local fallback rows.
- Leaderboard loading state before data renders.
- Leaderboard title centered.
- Top 3 leaderboard rows use medal display: gold, silver, bronze.
- Rewarded-ad choice modal with three reward types:
  - clear low-level clothes
  - coin bonus
  - spawn high-level item
- Skin gallery close button moved to bottom center.
- Step-by-step first-run tutorial with previous, next, finish, and start controls.
- Tutorial highlight rectangles for generate, board, ad reward, and skin-gallery steps.
- Lightweight feedback panel for merge success, daily reward, skin unlock, ad reward success, and ad failure.
- Rewarded-ad flow now waits for `platformManager.showRewardAd()` success before claiming rewards.
- WeChat and Douyin adapters include explicit rewarded-video ad unit integration points.

## Recent Stage 2B-B Changes

Latest development changes completed:

1. `TutorialStepConfig.ts` defines four tutorial steps and highlight targets.
2. `TutorialView.ts` renders one step at a time and updates navigation copy.
3. `SceneBootstrap.ts` creates tutorial navigation controls, highlight node, and feedback node.
4. `MainView.ts` owns tutorial step navigation and action feedback.
5. `RewardAdView.ts` routes rewarded ads through the platform manager before granting rewards.
6. `WechatAdapter.ts` and `DouyinAdapter.ts` expose rewarded-video ad unit integration points.

## Key Files

Data and logic:

- `assets/scripts/data/PlayerData.ts`
- `assets/scripts/data/AdRewardConfig.ts`
- `assets/scripts/data/LeaderboardData.ts`
- `assets/scripts/data/DailyReward.ts`
- `assets/scripts/data/TutorialStepConfig.ts`
- `assets/scripts/data/ItemConfig.ts`
- `assets/scripts/data/SkinConfig.ts`
- `assets/scripts/gameplay/BoardManager.ts`
- `assets/scripts/core/GameManager.ts`
- `assets/scripts/core/StorageManager.ts`
- `assets/scripts/core/EventManager.ts`
- `assets/scripts/platform/PlatformManager.ts`
- `assets/scripts/platform/WechatAdapter.ts`
- `assets/scripts/platform/DouyinAdapter.ts`

UI:

- `assets/scripts/ui/SceneBootstrap.ts`
- `assets/scripts/ui/MainView.ts`
- `assets/scripts/ui/SkinView.ts`
- `assets/scripts/ui/TutorialView.ts`
- `assets/scripts/ui/LeaderboardView.ts`
- `assets/scripts/ui/RewardAdView.ts`

Tests:

- `tests/client-scaffold.test.js`
- `tests/client-logic.test.ts`
- `tests/server.test.js`

Docs:

- `README.md`
- `README_CLIENT.md`
- `docs/superpowers/specs/2026-06-12-stage-2b-b-design.md`
- `docs/superpowers/plans/2026-06-12-stage-2b-b-guided-onboarding-feedback-ad-prep.md`
- `docs/superpowers/CURRENT_CHECKPOINT.md`

## Last Verification

Most recent verification before this checkpoint:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
# 33 pass, 0 fail

npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
# 15 pass, 0 fail

npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
# no assets/scripts output
```

Known note:

- Full unfiltered `tsc --noEmit` still reports Cocos engine declaration and Node test type environment errors. Filtered `assets/scripts` output is clean when it prints no `assets/scripts` lines.

## Git / Workspace State

The repository now has commits for the Stage 2B-B spec, implementation plan, and implementation slices. Check `git status --short` before resuming; unrelated local editor output should not be reverted.

## Suggested Next Development Stage

Recommended next node: **Stage 3 platform integration prep**.

Suggested scope:

- Fill real WeChat and Douyin rewarded-video ad unit IDs.
- Replace placeholder rewarded-video behavior with SDK close-event handling.
- Prepare platform login and request adapters.
- Start leaderboard platform/open-data-domain or backend submission integration.
- Add server-side validation for ad rewards and critical score updates.

Avoid changing core merge rules while platform SDK behavior is being integrated.

## How To Resume

When reopening development, start from:

1. Open `D:\project\AI_Goddess_Merge` in Cocos Creator.
2. Confirm Canvas has `assets/scripts/ui/SceneBootstrap.ts` mounted.
3. Run browser preview.
4. Check these flows:
   - first-run tutorial
   - tutorial previous/next/finish controls and highlight areas
   - generate clothing
   - drag merge
   - merge success feedback
   - daily reward claimed state
   - daily reward feedback
   - skin gallery close button bottom center
   - skin unlock feedback
   - leaderboard loading and medal rows
   - ad reward choice modal and reward feedback
   - ad failure message path when platform ad returns false
5. Re-run verification commands before making new changes.
