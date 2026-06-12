# Current Checkpoint - 2026-06-09

## Project

- Path: `D:\project\AI_Goddess_Merge`
- Engine: Cocos Creator 3.8.x, currently developed around Cocos Creator 3.8.8
- Preview style: browser preview through `SceneBootstrap.ts` mounted on Canvas
- Target: portrait mobile mini-game

## Current Completed Stage

Current development node: **Stage 2B-A completed plus UI polish pass**.

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
- First-run tutorial modal and tutorial completion save flag.
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

## Recent UI Polish

Latest user-requested changes completed:

1. Clicking `排行榜` now opens the modal immediately and shows `加载中...` before data arrives.
2. `排行榜` modal title is centered.
3. Top 3 leaderboard ranks use `🥇`, `🥈`, `🥉` and stronger row colors.
4. `皮肤图鉴` close button moved from top-right to bottom center.

## Key Files

Data and logic:

- `assets/scripts/data/PlayerData.ts`
- `assets/scripts/data/AdRewardConfig.ts`
- `assets/scripts/data/LeaderboardData.ts`
- `assets/scripts/data/DailyReward.ts`
- `assets/scripts/data/ItemConfig.ts`
- `assets/scripts/data/SkinConfig.ts`
- `assets/scripts/gameplay/BoardManager.ts`
- `assets/scripts/core/GameManager.ts`
- `assets/scripts/core/StorageManager.ts`
- `assets/scripts/core/EventManager.ts`

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
- `docs/superpowers/plans/2026-06-09-phase-2b-a-onboarding-leaderboard-ads.md`
- `docs/superpowers/CURRENT_CHECKPOINT.md`

## Last Verification

Most recent verification before this checkpoint:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
# 26 pass, 0 fail

npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
# 14 pass, 0 fail

npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
# no assets/scripts output
```

Known note:

- Full unfiltered `tsc --noEmit` still reports Cocos engine declaration and Node test type environment errors. Filtered `assets/scripts` output is clean.

## Git / Workspace State

Current repository status is still largely untracked:

```text
?? .creator/
?? .gitignore
?? README.md
?? README_CLIENT.md
?? assets/
?? docs/
?? package.json
?? server/
?? settings/
?? tests/
?? tsconfig.json
```

This is expected for the current project state. No commit has been made yet.

## Suggested Next Development Stage

Recommended next node: **Stage 2B-B**.

Suggested scope:

- Improve tutorial from static modal to step-by-step guidance with highlighted target areas.
- Add simple visual feedback for merge success, reward claim, and unlock skin.
- Strengthen rewarded-ad reward handling before true platform SDK integration.
- Start preparing platform adapter details for WeChat/Douyin requests and rewarded ads.

Avoid doing all platform SDK work at once until the browser-preview gameplay loop is visually stable.

## How To Resume

When reopening development, start from:

1. Open `D:\project\AI_Goddess_Merge` in Cocos Creator.
2. Confirm Canvas has `assets/scripts/ui/SceneBootstrap.ts` mounted.
3. Run browser preview.
4. Check these flows:
   - first-run tutorial
   - generate clothing
   - drag merge
   - daily reward claimed state
   - skin gallery close button bottom center
   - leaderboard loading and medal rows
   - ad reward choice modal
5. Re-run verification commands before making new changes.
