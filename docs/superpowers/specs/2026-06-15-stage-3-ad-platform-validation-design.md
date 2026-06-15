# Stage 3 Design: Platform Ad Completion and Reward Validation

## Goal

Stage 3 starts platform integration prep with the rewarded-ad path. The goal is to make ad rewards depend on real platform close-event semantics and to add lightweight server validation for ad reward claims.

This stage keeps the core merge rules unchanged. It focuses on the existing rewarded-ad flow introduced in Stage 2B-B:

`MainView -> RewardAdView -> platformManager.showRewardAd() -> platform adapter -> GameManager.claimAdReward() -> StorageManager.claimAdReward() -> server /ad/reward`

## Current Context

Stage 2B-B already routes rewarded ads through `platformManager.showRewardAd()` before granting rewards. Browser preview returns success immediately. WeChat and Douyin adapters currently expose integration points, but still return success after creating a rewarded-video ad object.

The server already has `/ad/reward`, but its allowed reward types are not aligned with the client. The client uses:

- `clear_low_items`
- `coin_bonus`
- `high_level_item`

The server currently accepts older names for two of those reward types. The endpoint records watch count, but it does not reject rapid duplicate claims or capture enough context for later auditing.

## Recommended Approach

Use a narrow platform-and-validation pass.

The WeChat and Douyin adapters will resolve rewarded-ad results from SDK close events. They return success only when the close callback reports that the ad was completed. Cancellation, SDK error, missing ad object, or unavailable ad unit returns failure.

The server will align reward types with the client and add lightweight claim validation. It will validate `playerId` and `rewardType`, record `adWatchCount`, `lastAdRewardTime`, and the last claimed reward type, and reject claims that arrive too quickly for the same player.

Client rewards remain locally applied after platform ad completion. Remote validation failure is logged and surfaced for future tightening, but this stage does not roll back the local board or coin changes because the current MVP still has local-first save behavior.

## Feature Design

### Platform Rewarded-Ad Close Events

`PlatformManager.showRewardAd()` keeps its public contract:

```ts
showRewardAd(): Promise<boolean>
```

Adapters map platform SDK outcomes to that boolean:

- `true`: the user watched the ad to completion.
- `false`: the user cancelled, closed early, the SDK failed, or a configured real ad cannot be shown.

The browser web adapter remains a successful mock so Cocos browser preview stays fast.

WeChat adapter behavior:

- If `wx` is unavailable or `REWARDED_AD_UNIT_ID` is empty, return `true` for preview compatibility.
- If a real ID exists, create or load `wx.createRewardedVideoAd`.
- Resolve `true` only from `onClose` when `res && res.isEnded` is true.
- Resolve `false` for early close, load/show error, or missing SDK method.
- Remove event handlers after the promise resolves so repeated button clicks do not accumulate callbacks.

Douyin adapter behavior mirrors WeChat with `tt.createRewardedVideoAd`.

### Server Reward Validation

`server/server.js` will align `ALLOWED_REWARD_TYPES` with the client:

- `clear_low_items`
- `coin_bonus`
- `high_level_item`

`getRewardValue` will map those types to the current client reward values:

- `clear_low_items`: `3`
- `coin_bonus`: `120`
- `high_level_item`: `4`

`POST /ad/reward` will continue accepting `playerId` and `rewardType`. It will also accept optional client context such as `clientRewardValue`, `clientCoins`, `clientScore`, and `clientHighestItemLevel` for logging and future audit.

The endpoint will reject:

- missing or non-string `playerId`
- unknown `rewardType`
- repeated claims from the same player inside a short cooldown window

For accepted claims, the endpoint updates the stored player record:

- increments `adWatchCount`
- sets `lastAdRewardTime`
- sets `lastAdRewardType`
- updates `lastSaveTime`

The endpoint returns:

```json
{
  "ok": true,
  "rewardType": "coin_bonus",
  "rewardValue": 120,
  "adWatchCount": 3,
  "lastAdRewardTime": 1781450000000
}
```

### Client Remote Claim Payload

`StorageManager.claimAdReward` will keep returning `Promise<boolean>`, but the request body will include the client reward result where available.

`GameManager.claimAdReward` already calculates the local reward result. After saving locally, it will submit:

- `playerId`
- `rewardType`
- `rewardValue`
- current `coins`
- current `score`
- current `highestItemLevel`

Remote failure still logs a warning and does not block the local MVP flow.

### UI Failure Behavior

`RewardAdView` continues to call the success callback only after `platformManager.showRewardAd()` returns true. If the adapter returns false or throws, the reward modal stays open and `MainView` shows the existing failure feedback:

`MainView`'s existing "ad not completed, no reward granted" message.

No new UI surfaces are added in this stage.

## Data Flow

Successful ad:

1. Player chooses an ad reward in `MainView`.
2. `RewardAdView.showRewardAd` awaits `platformManager.showRewardAd`.
3. Platform adapter resolves true from SDK close-event completion.
4. `MainView.applyAdReward` calls `GameManager.claimAdReward`.
5. `GameManager` applies local reward, saves, emits feedback events, and submits the remote claim.
6. Server validates reward type and cooldown, records ad claim metadata, and returns reward summary.

Cancelled or failed ad:

1. Adapter resolves false or throws.
2. `RewardAdView` emits `AD_REWARD_FAILED`.
3. `MainView` shows failure feedback.
4. `GameManager.claimAdReward` is not called.

Remote validation failure after local success:

1. Local reward remains applied.
2. `StorageManager.claimAdReward` returns false.
3. `GameManager` logs the failure.
4. Future stages can tighten this into server-authoritative rewards.

## Error Handling

Platform adapters must settle each ad promise exactly once. Close, error, and rejected show/load calls all clean up listeners.

The server returns `400` for invalid input and rapid duplicate claims. The server must not throw for missing existing player data; it creates the default player record as the current endpoint does.

Browser preview must remain unaffected by missing platform SDK globals.

## Testing

Use the existing test style:

- `tests/client-scaffold.test.js`
  - Checks WeChat and Douyin adapters use `onClose`, `isEnded`, `onError`, and listener cleanup.
  - Checks `RewardAdView` still gates rewards on `platformManager.showRewardAd()`.
  - Checks `StorageManager.claimAdReward` submits reward context.
- `tests/server.test.js`
  - Checks server reward values align with client reward types.
  - Checks invalid reward types are rejected.
  - Checks accepted claims update `adWatchCount`, `lastAdRewardTime`, and `lastAdRewardType`.
  - Checks rapid duplicate claims are rejected.
- `tests/client-logic.test.ts`
  - Existing ad reward config tests remain unchanged unless a small pure helper is added.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

The filtered TypeScript check should print no `assets/scripts` output.

## Out Of Scope

- Full platform login integration.
- `wx.request` / `tt.request` replacement for all remote calls.
- Open data domain leaderboard implementation.
- Server-authoritative board mutation or reward rollback.
- Real production anti-cheat, signatures, or platform-side ad verification tokens.
- Database migration from JSON file storage.

## Acceptance Criteria

- WeChat and Douyin adapters only report ad success from completed close events when a real ad unit is configured.
- Early close, SDK error, and show/load failure do not grant rewards.
- Browser preview still grants mock ad success.
- Server `/ad/reward` accepts the same three reward types used by the client.
- Server rejects invalid reward types and overly rapid duplicate ad claims.
- Accepted server claims record ad count, last reward type, and last reward time.
- Existing Stage 2B-B gameplay, tutorial, leaderboard, and feedback tests remain passing.
