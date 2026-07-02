# Current Checkpoint - 2026-07-02

## Project

- Path: `D:\project\AI_Goddess_Merge`
- Engine: Cocos Creator 3.8.x, currently developed around Cocos Creator 3.8.8
- Preview style: browser preview through `SceneBootstrap.ts` mounted on Canvas
- Target: portrait mobile mini-game

## Current Completed Stage

Current development node: **Stage 3-I storage boundary completed**.

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
- WeChat and Douyin rewarded-video adapters resolve success from platform close events when real ad unit IDs are configured.
- Early ad close, SDK error, and show/load failure do not grant rewards.
- Server ad reward validation accepts the same reward types used by the client.
- Server ad reward claims record watch count, last reward type, last reward time, and client reward context.
- Rapid duplicate ad reward claims are rejected server-side.
- Server `/auth/login` returns deterministic mock identities for WeChat, Douyin, and web preview.
- Platform adapters expose standardized login results and request wrappers.
- Remote save, remote load, leaderboard, and ad reward validation route through `PlatformManager.request()`.
- Game initialization selects an authenticated `playerId` when auth succeeds and keeps local play available when auth fails.
- Local saves are scoped by selected `playerId` with legacy fallback normalization.
- Server session helpers are in place and player-owned writes now require matching bearer sessions.
- Server stores issued mock session tokens in memory after `/auth/login`.
- Player saves and ad reward claims require a matching bearer session token.
- Player reads validate bearer tokens when supplied while preserving public preview fallback without a token.
- Client stores the latest `sessionToken` and attaches it to player save, player load, and ad reward validation requests.
- Legacy local saves are normalized and written to the authenticated player-scoped key without a backend migration endpoint.
- Server has a platform auth config boundary for WeChat, Douyin, and web login flows.
- Server can exchange configured WeChat and Douyin login codes through injected provider requests while preserving deterministic mock fallback for incomplete local config.
- Auth sessions now include `expiresAt`, and expired bearer sessions are rejected by the shared player-owned request guard.
- Server auth login now uses a platform auth provider boundary with deterministic mock fallback.
- WeChat and Douyin login codes can be exchanged through configured server-side credentials and endpoints.
- Complete platform auth configuration fails closed when provider exchange fails instead of silently minting mock identities.
- Client auth response typing accepts the server session expiry field without storing platform secrets.
- Server auth sessions are persisted to `server/data/sessionData.json`.
- Server startup restores non-expired persisted auth sessions.
- Expired persisted sessions are pruned during load and write boundaries.
- WeChat and Douyin full-player saves can no longer overwrite server-owned board and economy fields.
- Web preview full-player saves remain broadly compatible for local development.
- Platform ad reward effects are applied through server-owned economy commands.
- Platform daily rewards are claimed through server-owned economy commands.
- Server player and session persistence now go through a JSON storage boundary.
- The JSON-backed store preserves existing `server/data/playerData.json` and `server/data/sessionData.json` formats.
- Existing server helper exports remain compatible while filesystem details are isolated below `server/storage/jsonStore.js`.

## Recent Stage 3-E Progress

Completed so far:

1. Stage 3-E persistent session store design and implementation plan are committed.
2. Server session records persist to `server/data/sessionData.json`.
3. Startup loads active persisted sessions into the in-memory session map.
4. Expired or malformed persisted session records are skipped and pruned.
5. Simulated restart authorization is covered by server tests.

## Recent Stage 3-F Planning Progress

Completed so far:

1. Stage 3-F direction selected: server-authoritative gameplay.
2. First Stage 3-F slice selected: server-authoritative initial board creation, generate, and merge.
3. Platform behavior selected: platform environments are strict server-authoritative; browser and Cocos preview keep local fallback.
4. Initial board creation is included in the server-authoritative scope.
5. Design approach selected: add server-authoritative board action endpoints while keeping `POST /player/:playerId` as a transitional compatibility path.
6. Stage 3-F design spec is committed at `docs/superpowers/specs/2026-06-29-stage-3f-server-authoritative-generate-merge-design.md`.
7. Latest Stage 3-F planning commit: `31110ae docs: add stage 3f authoritative gameplay design`.

## Recent Stage 3-F Implementation Progress

Completed so far:

1. Added server-side gameplay config for the 5x6 board and 20-level merge chain.
2. Added server-authoritative board ensure, generate, and merge helpers.
3. Added authenticated Koa endpoints for board ensure, generate, and merge.
4. Added client remote board action requests.
5. Routed authenticated non-web platform generation and merge through server board actions.
6. Preserved browser and Cocos preview local generation and merge fallback.
7. Documented the board action API.

## Recent Stage 3-G Implementation Progress

Completed so far:

1. Stage 3-G full-save lockdown design and implementation plan are committed.
2. Server full-player save merging now branches by verified session platform.
3. WeChat and Douyin full saves preserve server-owned board, economy, skin unlock, and ad reward metadata fields.
4. Web full saves keep broad compatibility for browser and Cocos preview.
5. Platform first-save fallback creates a locked default snapshot instead of accepting client-authored board or economy bootstrap data.
6. Client scaffold guardrails confirm full saves remain compatibility submissions while board actions stay on server command endpoints.

## Recent Stage 3-H Implementation Progress

Completed so far:

1. Stage 3-H economy command migration design and implementation plan are committed.
2. Server exposes authenticated economy commands for ad rewards and daily rewards.
3. Server-owned ad reward commands apply coin, clear-low-item, and high-level-item effects.
4. Server-owned daily reward commands grant one daily reward per player per day.
5. `StorageManager.ts` exposes authenticated remote economy command requests.
6. Platform-authoritative `GameManager.ts` ad rewards and daily rewards now use server economy commands.
7. Browser and Cocos preview retain local reward fallback behavior.
8. Client scaffold guardrails confirm platform economy rewards route through remote commands.

## Recent Stage 3-I Implementation Progress

Completed so far:

1. Stage 3-I storage boundary design and implementation plan are committed.
2. Added a focused JSON document/object store module for server persistence.
3. Rewired player and session persistence helpers to delegate to the JSON store boundary.
4. Preserved existing JSON file paths, write formatting, and helper exports.
5. Server tests cover missing files, invalid JSON, non-object JSON, and object round-trips through the store boundary.

## Recent Stage 3-D Progress

Completed so far:

1. Stage 3-D platform code exchange design and implementation plan are committed.
2. `server.js` now exposes platform auth config helpers and deterministic normalized mock identity helpers.
3. `server.js` now supports injected WeChat and Douyin provider code exchange when credentials and exchange URLs are configured.
4. Provider failure responses, missing `openid`, rejected fetches, and invalid JSON now fail closed with `platform auth exchange failed`.
5. WeChat `error` responses and Douyin `errcode` responses are covered by regression tests.
6. Auth session records now include `expiresAt`.
7. Expired bearer sessions return `401` with `{ ok: false, error: "session expired" }`.
8. `/auth/login` now awaits the platform exchange boundary and returns session `expiresAt`.
9. Configured platform exchange failures return `502` with `{ ok: false, error: "platform auth exchange failed" }`.
10. `StorageManager.ts` accepts `expiresAt` in the auth response contract.
11. Client scaffold guardrails verify no platform app secret names are present in client auth code.
12. Stage 3-D Tasks 1 through 6 are committed and verified.

## Recent Stage 3-C Progress

Completed so far:

1. `server.js` now stores mock sessions in memory and exposes helper functions for bearer parsing and session lookup.
2. `server.js` now rejects player save and ad reward write requests when the bearer session is missing or points at another player.
3. `tests/server.test.js` covers the new session helpers and write authorization behavior.
4. `server.js` routes `/player/:playerId` and `/ad/reward` through helper functions that enforce ownership.
5. `StorageManager.ts` stores the latest session token and attaches it to player save, player load, and ad reward validation requests.
6. `StorageManager.ts` explicitly migrates legacy local saves by normalizing the `playerId` and writing the data under the player-scoped key.
7. `tests/client-scaffold.test.js` covers token propagation and legacy local migration guardrails.
8. Stage 3-C Tasks 1 through 4 are committed and verified.

## Recent Stage 3-A Changes

Latest development changes completed:

1. `server.js` aligns `/ad/reward` with client reward types and rejects invalid or rapid duplicate claims.
2. `StorageManager.ts` sends ad reward claim context to the server.
3. `GameManager.ts` submits reward value, coins, score, and highest item level after local reward application.
4. `WechatAdapter.ts` and `DouyinAdapter.ts` resolve rewarded ads from `onClose` completion instead of show success.
5. `tests/platform-adapter.test.ts` verifies completed watch, early close, show/load failure, and SDK error behavior for platform adapters.
6. Documentation now records the Stage 3-A platform ad validation checkpoint.
7. `tests/platform-adapter.test.ts` now covers browser preview fallback behavior for configured ad unit IDs without SDK globals.
8. `server.js` keeps `adWatchCount` server-owned during normal player saves.

## Current Resume Node

Current development node for next session: **Stage 3-I storage boundary completed; manual Cocos/platform preview pending if not already performed**.

Recommended next node:

- Run the Cocos Creator preview checklist below.
- If platform preview is available, verify ad rewards and daily rewards hit the `/economy/*` endpoints.
- Confirm platform full saves still cannot overwrite board/economy state after authenticated command actions.
- Then choose the next Stage 3-J scope: remaining server-owned economy surfaces or production database/session-store migration.

## Next Session Handoff

Start here next time:

1. Confirm the repository is still on `master` at or after the Stage 3-I completion commit.
2. Run the automated baseline verification listed in `## Last Verification`.
3. Run the Cocos browser preview checklist for local fallback.
4. If WeChat or Douyin preview is available with the backend running, verify authenticated board actions still hit:
   - `POST /player/:playerId/board/ensure`
   - `POST /player/:playerId/board/generate`
   - `POST /player/:playerId/board/merge`
5. In platform preview, verify economy rewards hit:
   - `POST /player/:playerId/economy/ad-reward`
   - `POST /player/:playerId/economy/daily-reward`
6. Trigger a normal platform full save after server command actions and confirm board/economy state is not rolled back by `POST /player/:playerId`.
7. Choose the next scope:
   - remaining economy command migration for skin unlocks and related score/coin mutations not already covered by board merge and reward commands
   - production database/session-store migration and account/session hardening

Immediate Stage 3-J candidates:

1. **Remaining economy command migration**: move skin unlocks and any remaining score/coin mutations behind server-owned command endpoints.
2. **Production storage migration**: replace JSON-file persistence and in-memory/session-file assumptions with a production database or managed session store.

Recommended first Stage 3-J slice: **production database/session-store migration and account/session hardening**, because Stage 3-F through Stage 3-I now isolate persistence behind a JSON boundary, but the active implementation still stores data in local JSON files.

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
- `server/server.js`

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
- `tests/platform-adapter.test.ts`
- `tests/server.test.js`

Docs:

- `README.md`
- `README_CLIENT.md`
- `server/README_SERVER.md`
- `docs/superpowers/specs/2026-07-02-stage-3h-economy-command-migration-design.md`
- `docs/superpowers/plans/2026-07-02-stage-3h-economy-command-migration.md`
- `docs/superpowers/specs/2026-07-01-stage-3g-full-save-lockdown-design.md`
- `docs/superpowers/plans/2026-07-01-stage-3g-full-save-lockdown.md`
- `docs/superpowers/specs/2026-06-29-stage-3f-server-authoritative-generate-merge-design.md`
- `docs/superpowers/specs/2026-06-16-stage-3b-platform-auth-request-design.md`
- `docs/superpowers/specs/2026-06-25-stage-3e-persistent-session-store-design.md`
- `docs/superpowers/plans/2026-06-25-stage-3e-persistent-session-store.md`
- `docs/superpowers/plans/2026-06-16-stage-3b-platform-auth-request.md`
- `docs/superpowers/plans/2026-06-15-stage-3-ad-platform-validation.md`
- `docs/superpowers/specs/2026-06-12-stage-2b-b-design.md`
- `docs/superpowers/plans/2026-06-12-stage-2b-b-guided-onboarding-feedback-ad-prep.md`
- `docs/superpowers/CURRENT_CHECKPOINT.md`

## Last Verification

Most recent verification for this checkpoint:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
# 127 pass, 0 fail

npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
# 37 pass, 0 fail

npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
# no assets/scripts output; PowerShell returned exit code 1 because there were no matches
```

Known note:

- Full unfiltered `tsc --noEmit` still reports Cocos engine declaration and Node test type environment errors. Filtered `assets/scripts` output is clean when it prints no `assets/scripts` lines.

## Git / Workspace State

Current implementation branch after Stage 3-I work: `master`.

Repository is expected to be on `master` at or after the Stage 3-I completion commit. Check `git status --short` before resuming; unrelated local editor output should not be reverted.

## Suggested Next Development Stage

Recommended next node: **Stage 3-J scope selection**.

Suggested scope:

- Production database/session-store migration and account/session hardening.
- Remaining server-owned economy command migration for skin unlocks or other uncovered mutations.

Avoid starting Stage 3-J before the Cocos/browser preview checklist has been run for the Stage 3-I flow.

## How To Resume

When reopening development, start from:

1. Open `D:\project\AI_Goddess_Merge`.
2. Read `docs/superpowers/CURRENT_CHECKPOINT.md`.
3. Run baseline verification:
   ```powershell
   node --test tests\server.test.js tests\client-scaffold.test.js
   npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
   ```
4. For Cocos preview checks, open the project in Cocos Creator, confirm Canvas has `assets/scripts/ui/SceneBootstrap.ts` mounted, run browser preview, and check:
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
5. If platform preview is available with the backend running, confirm `/board/ensure`, `/board/generate`, `/board/merge`, `/economy/ad-reward`, and `/economy/daily-reward` are used for authenticated non-web sessions.
6. Trigger a normal platform full save after server command actions and confirm board/economy state is not rolled back.
7. Choose the Stage 3-J scope and write a focused design and implementation plan before changing code.
