# Phase 2B-A Onboarding Leaderboard Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-run tutorial guidance, leaderboard display, and configurable rewarded-ad rewards without changing the core merge rules.

**Architecture:** Extend `PlayerData` with tutorial completion state, add small focused data modules for leaderboard and ad rewards, expose simple `GameManager` methods, then wire them into the existing programmatic Cocos UI created by `SceneBootstrap` and handled by `MainView`. Keep backend contracts unchanged because `/leaderboard` and `/ad/reward` already exist.

**Tech Stack:** Cocos Creator 3.8.x, TypeScript, Node test runner, tsx for TypeScript logic tests, existing Koa backend.

---

### Task 1: Player Data And Logic Tests

**Files:**
- Modify: `assets/scripts/data/PlayerData.ts`
- Create: `assets/scripts/data/AdRewardConfig.ts`
- Create: `assets/scripts/data/LeaderboardData.ts`
- Modify: `tests/client-logic.test.ts`

- [ ] Add failing tests for `tutorialCompleted`, ad reward configs, and leaderboard fallback sorting.
- [ ] Run `npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts` and confirm the new tests fail because the modules/fields do not exist.
- [ ] Implement the new data fields and small data modules.
- [ ] Re-run the client logic test and confirm it passes.

### Task 2: Game Manager Integration

**Files:**
- Modify: `assets/scripts/core/EventManager.ts`
- Modify: `assets/scripts/core/StorageManager.ts`
- Modify: `assets/scripts/core/GameManager.ts`
- Modify: `tests/client-scaffold.test.js`

- [ ] Add failing scaffold tests for `completeTutorial`, `getLeaderboard`, and `claimAdReward`.
- [ ] Run `node --test tests\client-scaffold.test.js` and confirm failure.
- [ ] Implement events and manager methods, using local fallback leaderboard when remote fetch fails.
- [ ] Re-run scaffold tests and confirm pass.

### Task 3: UI Entry Points And Modals

**Files:**
- Modify: `assets/scripts/ui/SceneBootstrap.ts`
- Modify: `assets/scripts/ui/MainView.ts`
- Create: `assets/scripts/ui/TutorialView.ts`
- Create: `assets/scripts/ui/LeaderboardView.ts`
- Modify: `tests/client-scaffold.test.js`

- [ ] Add failing scaffold tests for `TutorialPanel`, `LeaderboardButton`, `LeaderboardPanel`, `TutorialView`, and `LeaderboardView` wiring.
- [ ] Run scaffold tests and confirm failure.
- [ ] Implement first-run tutorial modal, leaderboard button/modal, and close handlers.
- [ ] Re-run scaffold tests and confirm pass.

### Task 4: Rewarded Ad Choices

**Files:**
- Modify: `assets/scripts/ui/SceneBootstrap.ts`
- Modify: `assets/scripts/ui/MainView.ts`
- Modify: `assets/scripts/ui/RewardAdView.ts`
- Modify: `assets/scripts/gameplay/BoardManager.ts`
- Modify: `tests/client-logic.test.ts`
- Modify: `tests/client-scaffold.test.js`

- [ ] Add failing tests for the three reward types: clear low-level clothes, add coins, spawn higher-level clothes.
- [ ] Run tests and confirm failure.
- [ ] Implement minimal reward choice handling behind the existing `广告清理` button as a small reward panel.
- [ ] Re-run tests and confirm pass.

### Task 5: Docs And Verification

**Files:**
- Modify: `README.md`
- Modify: `README_CLIENT.md`

- [ ] Update stage 2B-A documentation and preview checklist.
- [ ] Run `node --test tests\server.test.js tests\client-scaffold.test.js`.
- [ ] Run `npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts`.
- [ ] Run `npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'` and confirm no project script errors.
