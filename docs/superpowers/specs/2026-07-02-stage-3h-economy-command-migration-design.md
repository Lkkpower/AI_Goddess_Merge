# Stage 3-H Economy Command Migration Design

Date: 2026-07-02

## Status

Approved direction for Stage 3-H planning. This document defines the next server-authoritative economy slice after Stage 3-G full-save lockdown.

## Goals

- Move platform-authenticated ad reward effects to server-owned command execution.
- Move platform-authenticated daily reward claims to server-owned command execution.
- Keep browser and Cocos preview local fallback unchanged.
- Return enough result data for the UI to show the same messages and refresh the same board/economy state.
- Preserve Stage 3-F board command behavior and Stage 3-G full-save lockdown behavior.

## Non-Goals

- Do not migrate every future economy action in this stage.
- Do not change rewarded-video watch completion semantics. The client still calls the reward command only after `platformManager.showRewardAd()` succeeds.
- Do not replace JSON-file persistence or session storage.
- Do not remove `POST /player/:playerId` compatibility saves.
- Do not redesign leaderboard submission.

## Chosen Approach

Add two server-owned economy command endpoints and route only authenticated non-web platform clients through them:

- `POST /player/:playerId/economy/ad-reward`
- `POST /player/:playerId/economy/daily-reward`

The client will keep existing local implementations for web and Cocos preview. In platform-authoritative mode, `GameManager` will call remote command methods in `StorageManager`, apply the returned `PlayerData`, and return the same UI-facing result shape used today.

This approach keeps Stage 3-H focused on the two highest-value remaining economy bypasses without forcing a broader client architecture rewrite.

## Server API

### `POST /player/:playerId/economy/ad-reward`

Request body:

```json
{
  "rewardType": "coin_bonus"
}
```

Behavior:

- Requires a valid bearer session for `playerId`.
- Accepts the same reward types as the current client:
  - `clear_low_items`
  - `coin_bonus`
  - `high_level_item`
- Enforces the existing ad reward cooldown.
- Updates `adWatchCount`, `lastAdRewardTime`, and `lastAdRewardType` server-side.
- Stores a minimal server-owned reward context instead of trusting client economy snapshots.
- Applies the reward effect server-side:
  - `clear_low_items`: remove up to 3 lowest-level occupied board cells.
  - `coin_bonus`: add 120 coins.
  - `high_level_item`: spawn one item ID 4 into an empty board cell.
- Returns a command result plus the updated `PlayerData`.

Response body:

```json
{
  "ok": true,
  "rewardType": "coin_bonus",
  "message": "获得 120 金币",
  "value": 120,
  "player": {}
}
```

Error behavior:

- Invalid reward type returns `400` with `{ "ok": false, "error": "rewardType is invalid" }`.
- Cooldown violation returns `400` with `{ "ok": false, "error": "ad reward claim is too frequent" }`.
- `high_level_item` on a full board returns `400` with `{ "ok": false, "error": "BOARD_FULL" }`.
- Missing or mismatched session returns existing auth errors.

### `POST /player/:playerId/economy/daily-reward`

Request body is optional. The server derives the claim date from server time.

Behavior:

- Requires a valid bearer session for `playerId`.
- Uses a server-side `YYYY-MM-DD` key based on server time.
- Rejects duplicate claims for the same day.
- Adds 80 coins.
- Updates `lastDailyRewardDate`.
- Increments `dailyRewardClaimedCount`.
- Saves and returns the updated `PlayerData`.

Response body:

```json
{
  "ok": true,
  "rewardCoins": 80,
  "message": "领取每日奖励 80 金币",
  "player": {}
}
```

Error behavior:

- Duplicate same-day claim returns `400` with `{ "ok": false, "error": "DAILY_REWARD_ALREADY_CLAIMED" }`.
- Missing or mismatched session returns existing auth errors.

## Server Helper Design

Add pure helpers near the existing board and ad reward helpers:

- `getTodayKey(now)`
- `claimDailyRewardForPlayer(store, playerId, now)`
- `removeLowestLevelBoardItems(board, count)`
- `claimEconomyAdRewardForPlayer(store, playerId, rewardType, now, randomFn)`

The existing `claimAdRewardForPlayer()` can remain for compatibility with the older `/ad/reward` validation endpoint. The new economy command should own actual reward effects and return the full player snapshot.

The board-manipulation helpers should use server-side item config from `server/gameplayConfig.js` so low-level removal and high-level spawn are deterministic and testable.

## Client Data Flow

`StorageManager` gains:

- `claimRemoteAdReward(playerId, rewardType): Promise<RemoteAdRewardResult | null>`
- `claimRemoteDailyReward(playerId): Promise<RemoteDailyRewardResult | null>`

`GameManager` changes:

- `claimAdReward()` becomes `async`.
- In platform-authoritative mode, it calls `claimRemoteAdReward()`, applies returned `PlayerData`, emits the existing ad reward event, and returns the existing `AdRewardClaimResult` shape.
- In local preview mode, it keeps the current local ad reward behavior.
- `claimDailyReward()` becomes `async`.
- In platform-authoritative mode, it calls `claimRemoteDailyReward()`, applies returned `PlayerData`, emits the existing daily reward event, and returns the existing `DailyRewardResult` shape.
- In local preview mode, it keeps the current local daily reward behavior.

`MainView` changes:

- Daily reward click handler awaits `GameManager.claimDailyReward()`.
- Ad reward application awaits `GameManager.claimAdReward()`.
- Existing success/failure UI copy stays unchanged where possible.

## Compatibility Boundary

- Browser and Cocos preview remain local-first.
- Non-web platform sessions use server command endpoints for ad reward effects and daily rewards.
- Full player saves remain compatibility submissions and cannot overwrite server-owned platform economy state because of Stage 3-G.
- The older `/ad/reward` endpoint remains available during this stage for compatibility and tests, but platform clients should move to the new `/player/:playerId/economy/ad-reward` endpoint.

## Testing Requirements

Server tests:

- Daily reward command adds 80 coins, sets today key, increments claim count, saves, and returns updated player data.
- Daily reward command rejects duplicate same-day claims.
- Daily reward handler requires matching player session.
- Ad reward command applies `coin_bonus` server-side and updates ad metadata.
- Ad reward command removes the lowest-level occupied board cells for `clear_low_items`.
- Ad reward command spawns item ID 4 for `high_level_item`.
- Ad reward command rejects `high_level_item` when the board is full.
- Ad reward command rejects rapid duplicate claims through the existing cooldown.
- Ad reward handler requires matching player session.

Client scaffold tests:

- `StorageManager` exposes the two remote economy command methods.
- `GameManager.claimAdReward()` and `claimDailyReward()` are async and branch through remote commands in platform-authoritative mode.
- `MainView` awaits daily reward and ad reward application.
- Existing local preview paths remain present.

Verification commands:

- `node --test tests\server.test.js tests\client-scaffold.test.js`
- `npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts`
- `npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'`

## Documentation Updates

- Update `server/README_SERVER.md` with the new economy command endpoints.
- Update `docs/superpowers/CURRENT_CHECKPOINT.md` when Stage 3-H implementation completes.

## Follow-Up Work

- Migrate remaining skin/profile-specific commands if later gameplay introduces direct skin purchases or upgrades.
- Replace compatibility full-player saves with narrower profile/preference endpoints.
- Add production storage and account/session hardening after command boundaries are stable.
