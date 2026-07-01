# Stage 3-G Full Save Lockdown Design

Date: 2026-07-01

## Status

Approved design direction for Stage 3-G planning. This document defines the first lockdown slice after Stage 3-F server-authoritative board commands.

## Goals

- Stop authenticated WeChat and Douyin clients from bypassing server-owned board and economy state through the transitional full player save endpoint.
- Preserve browser and Cocos preview workflows so local development remains fast and forgiving.
- Keep `POST /player/:playerId` available as a compatibility endpoint while narrowing what platform full saves may change.
- Make the lockdown behavior explicit, testable, and easy to extend when more economy commands move server-side.

## Non-Goals

- Do not remove `POST /player/:playerId` in this stage.
- Do not move ad rewards, daily rewards, tutorial completion, skin unlocks, or leaderboard submission to new server command endpoints in this stage.
- Do not replace JSON file persistence with production storage.
- Do not block browser or Cocos preview from using the current local fallback save behavior.
- Do not add platform-specific secrets or trust client-supplied platform names for authorization decisions.

## Chosen Approach

Lock server-owned fields only for authenticated non-web platform sessions.

`handlePlayerSave()` already requires a bearer session for writes. Stage 3-G will use that verified session to decide how to merge incoming full-save data:

- `session.platform === "web"`: keep current broad save compatibility for preview and local development.
- `session.platform === "wechat"` or `session.platform === "douyin"`: preserve server-owned gameplay fields from the existing stored player record, even if the client sends different values in the full-save body.

This keeps platform builds from overwriting authoritative board results while avoiding unnecessary friction in browser preview.

## Server-Owned Fields

For locked platform full saves, these fields are server-owned and must not be overwritten from the request body:

- `board`
- `coins`
- `score`
- `highestItemLevel`
- `unlockedSkins`
- `adWatchCount`
- `lastAdRewardTime`
- `lastAdRewardType`
- `lastAdRewardClientContext`

The current Stage 3-F board actions own `board`, `coins`, `score`, `highestItemLevel`, and merge-driven `unlockedSkins`. Existing ad reward validation already treats ad metadata as server-owned. Keeping these fields together gives the server one clear protection boundary.

When a locked platform player has no existing stored player record, the server should create a default player snapshot and then apply only client-owned fields from the incoming save. It should not accept a client-authored board or economy bootstrap through full save. Platform board creation remains the responsibility of `/player/:playerId/board/ensure`.

## Client-Owned Compatibility Fields

For locked platform full saves, these fields may still be accepted from the client:

- `playerId`, only when it matches the URL and session player.
- `nickname`
- `tutorialCompleted`
- `lastDailyRewardDate`

These are low-risk compatibility fields for the current client. Daily reward itself is not fully server-authoritative yet, so this stage only preserves the existing daily reward date compatibility instead of designing the full economy command migration.

`lastSaveTime` remains server-assigned.

## Data Flow

1. Client sends `POST /player/:playerId` with the current `PlayerData` snapshot.
2. `handlePlayerSave()` validates the bearer session and confirms it belongs to `playerId`.
3. Server validates the request body shape for compatibility.
4. Server merges according to session platform:
   - web session: existing `mergePlayerSaveData()` behavior.
   - non-web platform session: new locked merge behavior.
5. Server persists the merged player snapshot and returns `{ ok: true, playerId }`.

Board command endpoints remain unchanged. Platform generation and merge continue to use:

- `POST /player/:playerId/board/ensure`
- `POST /player/:playerId/board/generate`
- `POST /player/:playerId/board/merge`

## Error Handling

This stage should not introduce new normal-path errors for valid saves.

Existing errors remain:

- missing `playerId`
- missing or invalid bearer session
- mismatched session player
- request body `playerId` not matching the URL
- malformed required `PlayerData` fields

Invalid client-owned optional fields should be normalized through existing player data normalization patterns instead of creating a new broad validation system in this slice.

## Testing Requirements

Server tests:

- Web session full save keeps current compatibility and can update board/economy fields.
- WeChat or Douyin session full save cannot overwrite an existing server-owned board.
- WeChat or Douyin session full save cannot overwrite coins, score, highest item level, unlocked skins, or ad reward metadata.
- WeChat or Douyin session full save can update nickname, tutorial completion, and daily reward date.
- WeChat or Douyin first full save without an existing player creates a default locked snapshot instead of accepting client-authored board/economy state.
- Existing authorization tests for missing and mismatched sessions continue to pass.

Client scaffold tests:

- `GameManager.saveGame()` still calls `storageManager.saveRemote(data)` so compatibility saves continue to happen.
- Platform-authoritative board actions remain routed through remote command methods, not through full save.

Verification commands:

- `node --test tests\server.test.js tests\client-scaffold.test.js`
- `npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts`
- `npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'`

## Documentation Updates

- Update `server/README_SERVER.md` to describe the platform full-save lockdown boundary.
- Update `docs/superpowers/CURRENT_CHECKPOINT.md` when Stage 3-G implementation completes.

## Follow-Up Work

- Move daily rewards behind a server-owned command endpoint.
- Move ad reward effects, skin unlocks, and other economy changes behind server commands.
- Eventually replace broad full player saves with narrower profile or preferences endpoints.
- Add production storage and account/session hardening after command boundaries are stable.
