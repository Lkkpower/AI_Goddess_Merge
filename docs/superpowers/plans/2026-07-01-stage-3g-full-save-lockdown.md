# Stage 3-G Full Save Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent authenticated WeChat and Douyin full-player saves from overwriting server-owned board and economy fields while preserving web preview compatibility.

**Architecture:** Keep the existing Koa server and `POST /player/:playerId` route. Add a narrow locked-merge path selected from the already-validated bearer session: web sessions use the current broad merge, while non-web platform sessions preserve server-owned fields and accept only low-risk compatibility fields. Client code remains unchanged except for scaffold guardrails that keep Stage 3-F board command routing visible.

**Tech Stack:** Node.js Koa server, Node test runner, local JSON persistence, Cocos Creator 3.8.x TypeScript client, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Add `isPlatformFullSaveLocked()`.
  - Add `mergePlatformLockedPlayerSaveData()`.
  - Route `handlePlayerSave()` through the locked merge only for non-web platform sessions.
  - Export the new helper functions for direct tests.
- Modify `tests/server.test.js`
  - Add direct helper coverage for platform locked saves.
  - Replace the old broad WeChat full-save test with separate web compatibility and platform lockdown tests.
  - Add first-save behavior coverage for platform sessions without an existing stored player.
- Modify `tests/client-scaffold.test.js`
  - Add a Stage 3-G guardrail proving `GameManager.saveGame()` still submits compatibility saves while board generate/merge stay on remote command methods.
- Modify `server/README_SERVER.md`
  - Document the full-save compatibility boundary and platform lockdown fields.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Record Stage 3-G implementation completion and updated resume guidance.

---

### Task 1: Server Locked Full-Save Merge Helper

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing helper tests**

In `tests/server.test.js`, append this code after `mergePlayerSaveData prevents stale saves from rolling back adWatchCount`:

```js
test('isPlatformFullSaveLocked locks only non-web platform sessions', () => {
  assert.equal(server.isPlatformFullSaveLocked({ platform: 'web' }), false);
  assert.equal(server.isPlatformFullSaveLocked({ platform: 'wechat' }), true);
  assert.equal(server.isPlatformFullSaveLocked({ platform: 'douyin' }), true);
});

test('mergePlatformLockedPlayerSaveData preserves server-owned fields and accepts compatibility fields', () => {
  const now = 1781450000000;
  const existing = {
    ...server.createDefaultPlayer('locked_player', 'Server Name'),
    board: fullBoard(null),
    coins: 320,
    score: 640,
    highestItemLevel: 8,
    unlockedSkins: [1, 3],
    adWatchCount: 4,
    lastAdRewardTime: now - 30000,
    lastAdRewardType: 'coin_bonus',
    lastAdRewardClientContext: {
      clientRewardValue: 120,
      clientCoins: 999,
      clientScore: 888,
      clientHighestItemLevel: 7,
    },
    lastDailyRewardDate: '2026-06-30',
    tutorialCompleted: false,
  };
  existing.board[0] = { row: 0, col: 0, itemId: 4 };
  const incoming = {
    ...server.createDefaultPlayer('locked_player', 'Client Name'),
    board: fullBoard(9),
    coins: 9999,
    score: 9999,
    highestItemLevel: 20,
    unlockedSkins: [7],
    adWatchCount: 99,
    lastAdRewardTime: now + 1,
    lastAdRewardType: 'high_level_item',
    lastAdRewardClientContext: {
      clientRewardValue: 4,
      clientCoins: 9999,
      clientScore: 9999,
      clientHighestItemLevel: 20,
    },
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };

  const merged = server.mergePlatformLockedPlayerSaveData(existing, incoming, now);

  assert.equal(merged.playerId, 'locked_player');
  assert.equal(merged.nickname, 'Client Name');
  assert.deepEqual(merged.board, existing.board);
  assert.equal(merged.coins, 320);
  assert.equal(merged.score, 640);
  assert.equal(merged.highestItemLevel, 8);
  assert.deepEqual(merged.unlockedSkins, [1, 3]);
  assert.equal(merged.adWatchCount, 4);
  assert.equal(merged.lastAdRewardTime, now - 30000);
  assert.equal(merged.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(merged.lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 999,
    clientScore: 888,
    clientHighestItemLevel: 7,
  });
  assert.equal(merged.lastDailyRewardDate, '2026-07-01');
  assert.equal(merged.tutorialCompleted, true);
  assert.equal(merged.lastSaveTime, now);
});

test('mergePlatformLockedPlayerSaveData creates a locked default snapshot when no server data exists', () => {
  const now = 1781450000000;
  const incoming = {
    ...server.createDefaultPlayer('new_locked_player', 'New Client'),
    board: fullBoard(6),
    coins: 5000,
    score: 6000,
    highestItemLevel: 12,
    unlockedSkins: [1, 2, 3],
    adWatchCount: 7,
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };

  const merged = server.mergePlatformLockedPlayerSaveData(undefined, incoming, now);

  assert.equal(merged.playerId, 'new_locked_player');
  assert.equal(merged.nickname, 'New Client');
  assert.deepEqual(merged.board, []);
  assert.equal(merged.coins, 0);
  assert.equal(merged.score, 0);
  assert.equal(merged.highestItemLevel, 0);
  assert.deepEqual(merged.unlockedSkins, []);
  assert.equal(merged.adWatchCount, 0);
  assert.equal(merged.lastAdRewardTime, 0);
  assert.equal(merged.lastAdRewardType, '');
  assert.equal(merged.lastAdRewardClientContext, null);
  assert.equal(merged.lastDailyRewardDate, '2026-07-01');
  assert.equal(merged.tutorialCompleted, true);
  assert.equal(merged.lastSaveTime, now);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL with `server.isPlatformFullSaveLocked is not a function`.

- [ ] **Step 3: Add locked full-save helpers**

In `server/server.js`, add this block after `mergePlayerSaveData()`:

```js
function isPlatformFullSaveLocked(session) {
  return Boolean(session && session.platform && session.platform !== "web");
}

function getOptionalStringValue(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function mergePlatformLockedPlayerSaveData(existingPlayer, incomingData, now = Date.now()) {
  const defaultPlayer = createDefaultPlayer(incomingData.playerId, incomingData.nickname);
  const serverData = existingPlayer || defaultPlayer;
  const nickname = getOptionalStringValue(incomingData.nickname, serverData.nickname || defaultPlayer.nickname).trim()
    || serverData.nickname
    || defaultPlayer.nickname;

  return {
    ...defaultPlayer,
    ...serverData,
    playerId: incomingData.playerId,
    nickname,
    lastDailyRewardDate: getOptionalStringValue(
      incomingData.lastDailyRewardDate,
      serverData.lastDailyRewardDate || ""
    ),
    tutorialCompleted: Boolean(incomingData.tutorialCompleted),
    lastSaveTime: now,
  };
}
```

- [ ] **Step 4: Export locked full-save helpers**

In `server/server.js`, add these names to `module.exports` after `mergePlayerSaveData`:

```js
  isPlatformFullSaveLocked,
  mergePlatformLockedPlayerSaveData,
```

- [ ] **Step 5: Run server tests and confirm pass**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- server/server.js tests/server.test.js
git commit -m "feat: add platform locked save merge"
```

---

### Task 2: Route Player Save Through Lockdown Boundary

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Replace broad WeChat save test with web compatibility and platform lockdown tests**

In `tests/server.test.js`, replace the entire test named `handlePlayerSave writes player data with a matching session` with this block:

```js
test('handlePlayerSave keeps broad full-save compatibility for web sessions', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('web', 'owner');
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Web Owner'),
    board: fullBoard(2),
    coins: 88,
    score: 120,
    highestItemLevel: 4,
    unlockedSkins: [1],
  };
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, 1781450000000);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].coins, 88);
  assert.equal(store[session.playerId].score, 120);
  assert.equal(store[session.playerId].highestItemLevel, 4);
  assert.deepEqual(store[session.playerId].unlockedSkins, [1]);
  assert.deepEqual(store[session.playerId].board, saveData.board);
});

test('handlePlayerSave locks server-owned fields for platform sessions', () => {
  server.sessions.clear();
  const session = createAuthorizedSession('wechat', 'owner');
  const now = 1781450000000;
  const existingBoard = fullBoard(null);
  existingBoard[0] = { row: 0, col: 0, itemId: 5 };
  const store = {
    [session.playerId]: {
      ...server.createDefaultPlayer(session.playerId, 'Server Owner'),
      board: existingBoard,
      coins: 310,
      score: 620,
      highestItemLevel: 7,
      unlockedSkins: [1, 2],
      adWatchCount: 3,
      lastAdRewardTime: now - 30000,
      lastAdRewardType: 'coin_bonus',
      lastAdRewardClientContext: {
        clientRewardValue: 120,
        clientCoins: 310,
        clientScore: 620,
        clientHighestItemLevel: 7,
      },
      lastDailyRewardDate: '2026-06-30',
      tutorialCompleted: false,
    },
  };
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Client Owner'),
    board: fullBoard(9),
    coins: 9999,
    score: 9999,
    highestItemLevel: 20,
    unlockedSkins: [7],
    adWatchCount: 99,
    lastAdRewardTime: now + 1,
    lastAdRewardType: 'high_level_item',
    lastAdRewardClientContext: {
      clientRewardValue: 4,
      clientCoins: 9999,
      clientScore: 9999,
      clientHighestItemLevel: 20,
    },
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, now);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].nickname, 'Client Owner');
  assert.deepEqual(store[session.playerId].board, existingBoard);
  assert.equal(store[session.playerId].coins, 310);
  assert.equal(store[session.playerId].score, 620);
  assert.equal(store[session.playerId].highestItemLevel, 7);
  assert.deepEqual(store[session.playerId].unlockedSkins, [1, 2]);
  assert.equal(store[session.playerId].adWatchCount, 3);
  assert.equal(store[session.playerId].lastAdRewardTime, now - 30000);
  assert.equal(store[session.playerId].lastAdRewardType, 'coin_bonus');
  assert.deepEqual(store[session.playerId].lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 310,
    clientScore: 620,
    clientHighestItemLevel: 7,
  });
  assert.equal(store[session.playerId].lastDailyRewardDate, '2026-07-01');
  assert.equal(store[session.playerId].tutorialCompleted, true);
  assert.equal(store[session.playerId].lastSaveTime, now);
});

test('handlePlayerSave creates locked defaults for first platform full save', () => {
  server.sessions.clear();
  const session = createAuthorizedSession('douyin', 'fresh');
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Fresh Client'),
    board: fullBoard(8),
    coins: 8888,
    score: 7777,
    highestItemLevel: 18,
    unlockedSkins: [1, 2, 3, 4, 5, 6],
    adWatchCount: 6,
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };
  const store = {};
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, 1781450000000);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].nickname, 'Fresh Client');
  assert.deepEqual(store[session.playerId].board, []);
  assert.equal(store[session.playerId].coins, 0);
  assert.equal(store[session.playerId].score, 0);
  assert.equal(store[session.playerId].highestItemLevel, 0);
  assert.deepEqual(store[session.playerId].unlockedSkins, []);
  assert.equal(store[session.playerId].adWatchCount, 0);
  assert.equal(store[session.playerId].lastDailyRewardDate, '2026-07-01');
  assert.equal(store[session.playerId].tutorialCompleted, true);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because platform `handlePlayerSave()` still uses broad `mergePlayerSaveData()` and accepts the client-authored board/economy fields.

- [ ] **Step 3: Route handlePlayerSave through locked merge for non-web sessions**

In `server/server.js`, replace this line in `handlePlayerSave()`:

```js
  const data = mergePlayerSaveData(store[playerId], incomingData, now);
```

with:

```js
  const data = isPlatformFullSaveLocked(session)
    ? mergePlatformLockedPlayerSaveData(store[playerId], incomingData, now)
    : mergePlayerSaveData(store[playerId], incomingData, now);
```

- [ ] **Step 4: Run server tests and confirm pass**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- server/server.js tests/server.test.js
git commit -m "feat: lock platform full player saves"
```

---

### Task 3: Client Scaffold Guardrail

**Files:**
- Modify: `tests/client-scaffold.test.js`

- [ ] **Step 1: Add client guardrail test**

In `tests/client-scaffold.test.js`, append this code after `stage 3F game manager routes platform board actions through remote authority`:

```js
test('stage 3G keeps full saves as compatibility while board actions use commands', () => {
  const gameManager = read('assets/scripts/core/GameManager.ts');
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(gameManager, /saveGame\(\): void/);
  assert.match(gameManager, /storageManager\.saveLocal\(data\)/);
  assert.match(gameManager, /storageManager\.saveRemote\(data\)\.catch/);
  assert.match(gameManager, /storageManager\.generateRemoteItem\(data\.playerId\)/);
  assert.match(gameManager, /storageManager\.mergeRemoteItems\(data\.playerId, fromIndex, toIndex\)/);
  assert.match(storage, /async saveRemote\(playerData: PlayerData\): Promise<boolean>/);
  assert.match(storage, /this\.request\(`\/player\/\$\{playerData\.playerId\}`/);
  assert.match(storage, /async generateRemoteItem\(playerId: string\): Promise<PlayerData \| null>/);
  assert.match(storage, /async mergeRemoteItems\(playerId: string, fromIndex: number, toIndex: number\): Promise<PlayerData \| null>/);
});
```

- [ ] **Step 2: Run client scaffold tests**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS. This is a regression guard for existing client behavior; no client production code changes are required for Stage 3-G.

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js
git commit -m "test: guard stage 3g client save routing"
```

---

### Task 4: Documentation And Checkpoint

**Files:**
- Modify: `server/README_SERVER.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update server save documentation**

In `server/README_SERVER.md`, add this section after the `### Save Player` curl example and before `### Board Ensure`:

```md
Save compatibility boundary:

- Web sessions keep broad full-player save compatibility for browser and Cocos preview.
- WeChat and Douyin sessions may still call this endpoint, but server-owned gameplay fields are preserved from the stored player record.
- Locked platform full saves cannot overwrite `board`, `coins`, `score`, `highestItemLevel`, `unlockedSkins`, `adWatchCount`, `lastAdRewardTime`, `lastAdRewardType`, or `lastAdRewardClientContext`.
- Platform board creation, generation, and merge results must go through the board command endpoints below.
```

- [ ] **Step 2: Update checkpoint completed capabilities**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, under `Completed capabilities:`, append these bullets after `Expired persisted sessions are pruned during load and write boundaries.`:

```md
- WeChat and Douyin full-player saves can no longer overwrite server-owned board and economy fields.
- Web preview full-player saves remain broadly compatible for local development.
```

- [ ] **Step 3: Add Stage 3-G implementation progress section**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, add this section after `## Recent Stage 3-F Implementation Progress`:

```md
## Recent Stage 3-G Implementation Progress

Completed so far:

1. Stage 3-G full-save lockdown design and implementation plan are committed.
2. Server full-player save merging now branches by verified session platform.
3. WeChat and Douyin full saves preserve server-owned board, economy, skin unlock, and ad reward metadata fields.
4. Web full saves keep broad compatibility for browser and Cocos preview.
5. Platform first-save fallback creates a locked default snapshot instead of accepting client-authored board or economy bootstrap data.
6. Client scaffold guardrails confirm full saves remain compatibility submissions while board actions stay on server command endpoints.
```

- [ ] **Step 4: Update Current Resume Node**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, replace the body under `## Current Resume Node` with:

```md
Current development node for next session: **Stage 3-G full-save lockdown completed; manual Cocos/platform preview pending if not already performed**.

Recommended next node:

- Run the Cocos Creator preview checklist below.
- If platform preview is available, verify full saves cannot overwrite board/economy state after authenticated board actions.
- Then choose the next Stage 3-H scope: remaining economy command migration or production storage hardening.
```

- [ ] **Step 5: Update Next Session Handoff**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, replace the numbered list under `## Next Session Handoff` with:

```md
Start here next time:

1. Confirm the repository is still on `master` at or after the Stage 3-G completion commit.
2. Run the automated baseline verification listed in `## Last Verification`.
3. Run the Cocos browser preview checklist for local fallback.
4. If WeChat or Douyin preview is available with the backend running, verify authenticated board actions still hit:
   - `POST /player/:playerId/board/ensure`
   - `POST /player/:playerId/board/generate`
   - `POST /player/:playerId/board/merge`
5. In platform preview, trigger a normal save after server board actions and confirm board/economy state is not rolled back by `POST /player/:playerId`.
6. Choose the next scope:
   - remaining economy command migration for ad rewards, daily rewards, skins, and related score/coin mutations
   - production storage and account/session hardening
```

- [ ] **Step 6: Run documentation diff review**

Run:

```powershell
git diff -- server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
```

Expected: diff documents Stage 3-G lockdown without removing Stage 3-F preview checklist details.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3g full save lockdown"
```

---

### Task 5: Full Verification

**Files:**
- Verify: `server/server.js`
- Verify: `tests/server.test.js`
- Verify: `tests/client-scaffold.test.js`
- Verify: `tests/client-logic.test.ts`
- Verify: `tests/platform-adapter.test.ts`
- Verify: `assets/scripts/**/*.ts`

- [ ] **Step 1: Run combined server and scaffold tests**

Run:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 2: Run client logic and platform adapter tests**

Run:

```powershell
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript asset filter**

Run:

```powershell
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: no `assets/scripts` output. PowerShell may return exit code 1 when there are no matches.

- [ ] **Step 4: Review final diff**

Run:

```powershell
git diff --stat HEAD~4..HEAD
```

Expected: changes are limited to Stage 3-G server save lockdown, tests, docs, and checkpoint updates.

---

## Self-Review Notes

- Spec coverage: covered platform-only lockdown, web preview compatibility, server-owned fields, accepted compatibility fields, first-save behavior, client guardrails, documentation, and verification.
- Placeholder scan: no placeholder sections or deferred implementation steps remain.
- Type consistency: helper names are `isPlatformFullSaveLocked()` and `mergePlatformLockedPlayerSaveData()` throughout the plan, and `handlePlayerSave()` keeps the existing `session` variable from `requirePlayerSession()`.
