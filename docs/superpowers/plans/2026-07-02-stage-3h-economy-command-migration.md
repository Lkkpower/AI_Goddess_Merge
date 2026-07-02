# Stage 3-H Economy Command Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move platform-authenticated ad reward effects and daily reward claims behind server-owned command endpoints while keeping browser and Cocos preview local.

**Architecture:** Add server-side economy command helpers and Koa routes under `/player/:playerId/economy/*`. Extend `StorageManager` with remote command methods, then make `GameManager` branch between platform-authoritative remote commands and existing local preview behavior. `MainView` awaits the now-async reward calls without changing the visible UI workflow.

**Tech Stack:** Node.js Koa server, Node test runner, local JSON persistence, Cocos Creator 3.8.x TypeScript client, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Add `DAILY_REWARD_COINS`.
  - Add `getTodayKey()`, `claimDailyRewardForPlayer()`, `removeLowestLevelBoardItems()`, and `claimEconomyAdRewardForPlayer()`.
  - Add handlers for `/player/:playerId/economy/daily-reward` and `/player/:playerId/economy/ad-reward`.
  - Register routes and export helpers/handlers.
- Modify `tests/server.test.js`
  - Add pure helper tests for daily reward and ad reward effects.
  - Add handler authorization/error tests for both new endpoints.
- Modify `assets/scripts/core/StorageManager.ts`
  - Add `RemoteAdRewardResult` and `RemoteDailyRewardResult`.
  - Add `claimRemoteAdReward()` and `claimRemoteDailyReward()`.
- Modify `assets/scripts/core/GameManager.ts`
  - Make `claimAdReward()` and `claimDailyReward()` async.
  - In platform-authoritative mode, route to remote command methods and apply returned `PlayerData`.
  - Preserve local preview behavior.
- Modify `assets/scripts/ui/MainView.ts`
  - Await daily reward and ad reward application.
- Modify `tests/client-scaffold.test.js`
  - Add guardrails for remote economy command methods and async UI routing.
- Modify `server/README_SERVER.md`
  - Document new economy command endpoints.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Record Stage 3-H completion and next handoff.

---

### Task 1: Server Daily Reward Command

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing daily reward helper and handler tests**

In `tests/server.test.js`, append this code after `handlePlayerSave creates locked defaults for first platform full save`:

```js
test('claimDailyRewardForPlayer grants one server-owned daily reward per day', () => {
  const now = Date.UTC(2026, 6, 2, 1, 30, 0);
  const store = {
    daily_player: {
      ...server.createDefaultPlayer('daily_player', 'Daily'),
      coins: 20,
      lastDailyRewardDate: '',
      dailyRewardClaimedCount: 0,
    },
  };

  const result = server.claimDailyRewardForPlayer(store, 'daily_player', now);

  assert.equal(result.ok, true);
  assert.equal(result.rewardCoins, 80);
  assert.equal(result.message, '领取每日奖励 80 金币');
  assert.equal(result.player.coins, 100);
  assert.equal(result.player.lastDailyRewardDate, '2026-07-02');
  assert.equal(result.player.dailyRewardClaimedCount, 1);
  assert.equal(result.player.lastSaveTime, now);
  assert.equal(store.daily_player.coins, 100);
});

test('claimDailyRewardForPlayer rejects duplicate same-day claims', () => {
  const now = Date.UTC(2026, 6, 2, 1, 30, 0);
  const store = {
    daily_player: {
      ...server.createDefaultPlayer('daily_player', 'Daily'),
      lastDailyRewardDate: '2026-07-02',
      dailyRewardClaimedCount: 2,
    },
  };

  assert.throws(
    () => server.claimDailyRewardForPlayer(store, 'daily_player', now),
    /DAILY_REWARD_ALREADY_CLAIMED/
  );
});

test('daily reward handler requires matching player sessions and returns player data', () => {
  server.sessions.clear();
  const now = Date.UTC(2026, 6, 2, 1, 30, 0);
  const store = {};
  const session = createAuthorizedSession('wechat', 'daily-owner');
  const otherSession = createAuthorizedSession('wechat', 'daily-other');
  store[session.playerId] = {
    ...server.createDefaultPlayer(session.playerId, 'Daily Owner'),
    coins: 10,
    lastDailyRewardDate: '',
    dailyRewardClaimedCount: 0,
  };

  const missingCtx = createMockContext({});
  missingCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(missingCtx, store, now);
  assert.equal(missingCtx.status, 401);

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(mismatchCtx, store, now);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  okCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(okCtx, store, now);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.ok, true);
  assert.equal(okCtx.body.rewardCoins, 80);
  assert.equal(okCtx.body.player.playerId, session.playerId);
  assert.equal(okCtx.body.player.coins, 90);

  const duplicateCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  duplicateCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(duplicateCtx, store, now);
  assert.equal(duplicateCtx.status, 400);
  assert.deepEqual(duplicateCtx.body, { ok: false, error: 'DAILY_REWARD_ALREADY_CLAIMED' });
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL with `server.claimDailyRewardForPlayer is not a function`.

- [ ] **Step 3: Add daily reward server helpers**

In `server/server.js`, add this constant after `AD_REWARD_COOLDOWN_MS`:

```js
const DAILY_REWARD_COINS = 80;
```

Add this block after `claimAdRewardForPlayer()`:

```js
function getTodayKey(now = Date.now()) {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function claimDailyRewardForPlayer(store, playerId, now = Date.now()) {
  const player = store[playerId] || createDefaultPlayer(playerId);
  const todayKey = getTodayKey(now);
  if (player.lastDailyRewardDate === todayKey) {
    throw new Error("DAILY_REWARD_ALREADY_CLAIMED");
  }

  player.coins = (Number(player.coins) || 0) + DAILY_REWARD_COINS;
  player.lastDailyRewardDate = todayKey;
  player.dailyRewardClaimedCount = (Number(player.dailyRewardClaimedCount) || 0) + 1;
  player.lastSaveTime = now;
  store[playerId] = player;

  return {
    ok: true,
    rewardCoins: DAILY_REWARD_COINS,
    message: `领取每日奖励 ${DAILY_REWARD_COINS} 金币`,
    player,
  };
}
```

- [ ] **Step 4: Add daily reward handler**

In `server/server.js`, add this block after `handleBoardMerge()`:

```js
function handleDailyRewardClaim(ctx, store, now = Date.now()) {
  const { playerId } = ctx.params;
  const session = requirePlayerSession(ctx, playerId, now);
  if (!session) {
    return;
  }

  try {
    ctx.body = claimDailyRewardForPlayer(store, playerId, now);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}
```

- [ ] **Step 5: Register daily reward route**

In `createApp()` in `server/server.js`, add this route after the board merge route:

```js
  router.post("/player/:playerId/economy/daily-reward", (ctx) => {
    const store = readPlayerStore();
    handleDailyRewardClaim(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });
```

- [ ] **Step 6: Export daily reward helpers and handler**

In `module.exports` in `server/server.js`, add:

```js
  DAILY_REWARD_COINS,
  getTodayKey,
  claimDailyRewardForPlayer,
  handleDailyRewardClaim,
```

- [ ] **Step 7: Run server tests and confirm pass**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- server/server.js tests/server.test.js
git commit -m "feat: add server daily reward command"
```

---

### Task 2: Server Ad Reward Economy Command

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing ad reward economy tests**

In `tests/server.test.js`, append this code after the daily reward tests from Task 1:

```js
test('claimEconomyAdRewardForPlayer applies coin bonus server-side', () => {
  const now = 1781450000000;
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      coins: 30,
      board: fullBoard(null),
    },
  };

  const result = server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'coin_bonus', now);

  assert.equal(result.ok, true);
  assert.equal(result.rewardType, 'coin_bonus');
  assert.equal(result.value, 120);
  assert.equal(result.message, '获得 120 金币');
  assert.equal(result.player.coins, 150);
  assert.equal(result.player.adWatchCount, 1);
  assert.equal(result.player.lastAdRewardTime, now);
  assert.equal(result.player.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(result.player.lastAdRewardClientContext, {
    serverRewardValue: 120,
  });
});

test('claimEconomyAdRewardForPlayer removes the lowest-level occupied cells', () => {
  const now = 1781450000000;
  const board = fullBoard(null);
  board[0] = { row: 0, col: 0, itemId: 4 };
  board[1] = { row: 0, col: 1, itemId: 1 };
  board[2] = { row: 0, col: 2, itemId: 3 };
  board[3] = { row: 0, col: 3, itemId: 2 };
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      board,
    },
  };

  const result = server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'clear_low_items', now);

  assert.equal(result.ok, true);
  assert.equal(result.value, 3);
  assert.equal(result.message, '已清理 3 件低级服装');
  assert.equal(result.player.board[0].itemId, 4);
  assert.equal(result.player.board[1].itemId, null);
  assert.equal(result.player.board[2].itemId, null);
  assert.equal(result.player.board[3].itemId, null);
});

test('claimEconomyAdRewardForPlayer spawns high-level item and rejects full board', () => {
  const now = 1781450000000;
  const board = fullBoard(null);
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      board,
    },
  };

  const result = server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'high_level_item', now, () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.value, 4);
  assert.equal(result.message, '获得 1 件高级服装');
  assert.equal(result.player.board[0].itemId, 4);

  const fullStore = {
    full_ad_player: {
      ...server.createDefaultPlayer('full_ad_player', 'Full'),
      board: fullBoard(1),
    },
  };
  assert.throws(
    () => server.claimEconomyAdRewardForPlayer(fullStore, 'full_ad_player', 'high_level_item', now, () => 0),
    /BOARD_FULL/
  );
});

test('claimEconomyAdRewardForPlayer rejects rapid duplicate claims', () => {
  const now = 1781450000000;
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      board: fullBoard(null),
    },
  };

  server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'coin_bonus', now);

  assert.throws(
    () => server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'coin_bonus', now + 1000),
    /ad reward claim is too frequent/
  );
});

test('economy ad reward handler requires matching player sessions and returns player data', () => {
  server.sessions.clear();
  const now = 1781450000000;
  const store = {};
  const session = createAuthorizedSession('wechat', 'economy-ad-owner');
  const otherSession = createAuthorizedSession('wechat', 'economy-ad-other');
  store[session.playerId] = {
    ...server.createDefaultPlayer(session.playerId, 'Ad Owner'),
    board: fullBoard(null),
  };

  const missingCtx = createMockContext({ rewardType: 'coin_bonus' });
  missingCtx.params = { playerId: session.playerId };
  server.handleEconomyAdRewardClaim(missingCtx, store, now);
  assert.equal(missingCtx.status, 401);

  const mismatchCtx = createMockContext({ rewardType: 'coin_bonus' }, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: session.playerId };
  server.handleEconomyAdRewardClaim(mismatchCtx, store, now);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext({ rewardType: 'coin_bonus' }, { authorization: `Bearer ${session.sessionToken}` });
  okCtx.params = { playerId: session.playerId };
  server.handleEconomyAdRewardClaim(okCtx, store, now);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.ok, true);
  assert.equal(okCtx.body.rewardType, 'coin_bonus');
  assert.equal(okCtx.body.player.playerId, session.playerId);
  assert.equal(okCtx.body.player.coins, 120);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL with `server.claimEconomyAdRewardForPlayer is not a function`.

- [ ] **Step 3: Add ad reward economy helpers**

In `server/server.js`, add this helper after `getEmptyBoardCells()`:

```js
function removeLowestLevelBoardItems(board, count) {
  const occupiedCells = getOccupiedBoardCells(board)
    .map((cell) => ({
      cell,
      config: getItemConfigById(cell.itemId),
    }))
    .filter((entry) => entry.config)
    .sort((a, b) => {
      if (a.config.level !== b.config.level) {
        return a.config.level - b.config.level;
      }
      return (a.cell.row * BOARD_COLS + a.cell.col) - (b.cell.row * BOARD_COLS + b.cell.col);
    });

  const targets = occupiedCells.slice(0, count);
  targets.forEach((entry) => {
    entry.cell.itemId = null;
  });
  return targets.length;
}
```

Add this function after `claimDailyRewardForPlayer()`:

```js
function claimEconomyAdRewardForPlayer(store, playerId, rewardType, now = Date.now(), randomFn = Math.random) {
  if (!ALLOWED_REWARD_TYPES.includes(rewardType)) {
    throw new Error("rewardType is invalid");
  }

  const player = store[playerId] || createDefaultPlayer(playerId);
  player.board = normalizeBoardCells(player.board);

  const lastAdRewardTime = Number(player.lastAdRewardTime) || 0;
  if (lastAdRewardTime > 0 && now - lastAdRewardTime < AD_REWARD_COOLDOWN_MS) {
    throw new Error("ad reward claim is too frequent");
  }

  let value = 0;
  let message = "广告奖励已领取";
  if (rewardType === "clear_low_items") {
    value = removeLowestLevelBoardItems(player.board, 3);
    message = `已清理 ${value} 件低级服装`;
  }
  if (rewardType === "coin_bonus") {
    value = getRewardValue(rewardType);
    player.coins = (Number(player.coins) || 0) + value;
    message = `获得 ${value} 金币`;
  }
  if (rewardType === "high_level_item") {
    const emptyCells = getEmptyBoardCells(player.board);
    if (emptyCells.length === 0) {
      throw createBoardError("BOARD_FULL");
    }
    const target = pickRandomCell(emptyCells, randomFn);
    value = getRewardValue(rewardType);
    target.itemId = value;
    message = "获得 1 件高级服装";
  }

  player.adWatchCount = (Number(player.adWatchCount) || 0) + 1;
  player.lastAdRewardTime = now;
  player.lastAdRewardType = rewardType;
  player.lastAdRewardClientContext = { serverRewardValue: value };
  player.lastSaveTime = now;
  store[playerId] = player;

  return {
    ok: true,
    rewardType,
    message,
    value,
    player,
  };
}
```

- [ ] **Step 4: Add ad reward economy handler and route**

In `server/server.js`, add this handler after `handleDailyRewardClaim()`:

```js
function handleEconomyAdRewardClaim(ctx, store, now = Date.now(), randomFn = Math.random) {
  const { playerId } = ctx.params;
  const session = requirePlayerSession(ctx, playerId, now);
  if (!session) {
    return;
  }

  try {
    const body = ctx.request.body || {};
    ctx.body = claimEconomyAdRewardForPlayer(store, playerId, body.rewardType, now, randomFn);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}
```

In `createApp()` in `server/server.js`, add this route after the daily reward economy route:

```js
  router.post("/player/:playerId/economy/ad-reward", (ctx) => {
    const store = readPlayerStore();
    handleEconomyAdRewardClaim(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });
```

- [ ] **Step 5: Export ad reward economy helpers and handler**

In `module.exports` in `server/server.js`, add:

```js
  removeLowestLevelBoardItems,
  claimEconomyAdRewardForPlayer,
  handleEconomyAdRewardClaim,
```

- [ ] **Step 6: Run server tests and confirm pass**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- server/server.js tests/server.test.js
git commit -m "feat: add server ad reward economy command"
```

---

### Task 3: Client Remote Economy Requests

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`

- [ ] **Step 1: Write failing StorageManager scaffold test**

Append this code after `stage 3G keeps full saves as compatibility while board actions use commands` in `tests/client-scaffold.test.js`:

```js
test('stage 3H storage manager exposes remote economy commands', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /export interface RemoteAdRewardResult/);
  assert.match(storage, /rewardType: AdRewardType/);
  assert.match(storage, /message: string/);
  assert.match(storage, /value: number/);
  assert.match(storage, /player: PlayerData/);
  assert.match(storage, /export interface RemoteDailyRewardResult/);
  assert.match(storage, /rewardCoins: number/);
  assert.match(storage, /claimRemoteAdReward\(playerId: string, rewardType: AdRewardType\): Promise<RemoteAdRewardResult \| null>/);
  assert.match(storage, /claimRemoteDailyReward\(playerId: string\): Promise<RemoteDailyRewardResult \| null>/);
  assert.match(storage, /`\/player\/\$\{playerId\}\/economy\/ad-reward`/);
  assert.match(storage, /`\/player\/\$\{playerId\}\/economy\/daily-reward`/);
  assert.match(storage, /body: JSON\.stringify\(\{ rewardType \}\)/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because the remote economy result interfaces and methods do not exist.

- [ ] **Step 3: Add remote economy result interfaces**

In `assets/scripts/core/StorageManager.ts`, add after `AuthLoginResponse`:

```ts
export interface RemoteAdRewardResult {
    ok: boolean;
    rewardType: AdRewardType;
    message: string;
    value: number;
    player: PlayerData;
}

export interface RemoteDailyRewardResult {
    ok: boolean;
    rewardCoins: number;
    message: string;
    player: PlayerData;
}
```

- [ ] **Step 4: Add remote economy methods**

In `assets/scripts/core/StorageManager.ts`, add these methods after `mergeRemoteItems()`:

```ts
    async claimRemoteAdReward(playerId: string, rewardType: AdRewardType): Promise<RemoteAdRewardResult | null> {
        try {
            return await this.request(`/player/${playerId}/economy/ad-reward`, {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ rewardType }),
            }) as RemoteAdRewardResult;
        } catch (error) {
            console.warn("[StorageManager] claimRemoteAdReward failed", error);
            return null;
        }
    }

    async claimRemoteDailyReward(playerId: string): Promise<RemoteDailyRewardResult | null> {
        try {
            return await this.request(`/player/${playerId}/economy/daily-reward`, {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
            }) as RemoteDailyRewardResult;
        } catch (error) {
            console.warn("[StorageManager] claimRemoteDailyReward failed", error);
            return null;
        }
    }
```

- [ ] **Step 5: Run scaffold tests and confirm pass**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 6: Run TypeScript asset filter**

Run:

```powershell
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: no `assets/scripts` output. PowerShell may return exit code 1 when there are no matches.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- assets/scripts/core/StorageManager.ts tests/client-scaffold.test.js
git commit -m "feat: add remote economy command requests"
```

---

### Task 4: Client Platform Economy Routing

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/GameManager.ts`
- Modify: `assets/scripts/ui/MainView.ts`

- [ ] **Step 1: Write failing client routing scaffold test**

Append this code after the Task 3 scaffold test in `tests/client-scaffold.test.js`:

```js
test('stage 3H game manager routes platform economy rewards through remote commands', () => {
  const gameManager = read('assets/scripts/core/GameManager.ts');
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(gameManager, /async claimAdReward\(rewardType: AdRewardType\): Promise<AdRewardClaimResult>/);
  assert.match(gameManager, /storageManager\.claimRemoteAdReward\(data\.playerId, rewardType\)/);
  assert.match(gameManager, /this\.applyRemotePlayerData\(remoteResult\.player\)/);
  assert.match(gameManager, /async claimDailyReward\(todayKey\?: string\): Promise<DailyRewardResult>/);
  assert.match(gameManager, /storageManager\.claimRemoteDailyReward\(data\.playerId\)/);
  assert.match(gameManager, /rewardCoins: remoteResult\.rewardCoins/);
  assert.match(mainView, /private async onDailyRewardClicked\(\): Promise<void>/);
  assert.match(mainView, /const result = await this\.gameManager\.claimDailyReward\(\)/);
  assert.match(mainView, /private async applyAdReward\(rewardType: AdRewardType\): Promise<void>/);
  assert.match(mainView, /const result = await this\.gameManager\.claimAdReward\(rewardType\)/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `GameManager` and `MainView` still use synchronous local reward methods.

- [ ] **Step 3: Make `GameManager.claimAdReward()` async and remote-aware**

In `assets/scripts/core/GameManager.ts`, replace `claimAdReward(rewardType: AdRewardType): AdRewardClaimResult` with:

```ts
    async claimAdReward(rewardType: AdRewardType): Promise<AdRewardClaimResult> {
        const data = this.getPlayerData();
        const config = getAdRewardConfig(rewardType);
        if (!config) {
            return { ok: false, rewardType, message: "奖励类型不存在", value: 0 };
        }

        if (this.isPlatformAuthoritative()) {
            const remoteResult = await storageManager.claimRemoteAdReward(data.playerId, rewardType);
            if (!remoteResult || !remoteResult.ok) {
                return { ok: false, rewardType, message: "奖励领取失败", value: 0 };
            }
            this.applyRemotePlayerData(remoteResult.player);
            const result = {
                ok: true,
                rewardType: remoteResult.rewardType,
                message: remoteResult.message,
                value: remoteResult.value,
            };
            eventManager.emit(GameEvents.AD_REWARD_CLAIMED, result);
            return result;
        }

        let value = 0;
        let message = "广告奖励已领取";
        if (rewardType === "clear_low_items") {
            value = this.boardManager.removeLowLevelItems(config.clearCount ?? 3);
            message = `已清理 ${value} 件低级服装`;
        }
        if (rewardType === "coin_bonus") {
            value = config.coinAmount ?? 0;
            this.addCoins(value);
            message = `获得 ${value} 金币`;
        }
        if (rewardType === "high_level_item") {
            const ok = this.boardManager.spawnItem(config.itemId ?? 4);
            if (!ok) {
                eventManager.emit(GameEvents.BOARD_FULL);
                return { ok: false, rewardType, message: "衣橱已满，无法生成高级服装", value: 0 };
            }
            value = config.itemId ?? 4;
            message = "获得 1 件高级服装";
        }

        data.adWatchCount += 1;
        const result = { ok: true, rewardType, message, value };
        eventManager.emit(GameEvents.AD_REWARD_CLAIMED, result);
        this.saveGame();
        storageManager.claimAdReward({
            playerId: data.playerId,
            rewardType,
            clientRewardValue: result.value,
            clientCoins: data.coins,
            clientScore: data.score,
            clientHighestItemLevel: data.highestItemLevel,
        }).catch((error) => {
            console.warn("[GameManager] remote ad reward failed", error);
        });
        return result;
    }
```

- [ ] **Step 4: Make `GameManager.claimDailyReward()` async and remote-aware**

In `assets/scripts/core/GameManager.ts`, replace `claimDailyReward(todayKey?: string): DailyRewardResult` with:

```ts
    async claimDailyReward(todayKey?: string): Promise<DailyRewardResult> {
        const data = this.getPlayerData();
        if (this.isPlatformAuthoritative()) {
            const remoteResult = await storageManager.claimRemoteDailyReward(data.playerId);
            if (!remoteResult || !remoteResult.ok) {
                return {
                    ok: false,
                    rewardCoins: 0,
                    message: "今日奖励已领取",
                };
            }
            this.applyRemotePlayerData(remoteResult.player);
            const result = {
                ok: true,
                rewardCoins: remoteResult.rewardCoins,
                message: remoteResult.message,
            };
            eventManager.emit(GameEvents.DAILY_REWARD_CLAIMED, result);
            return result;
        }

        const result = claimDailyReward(data, todayKey);
        if (result.ok) {
            eventManager.emit(GameEvents.COINS_CHANGED, data.coins);
            eventManager.emit(GameEvents.DAILY_REWARD_CLAIMED, result);
            this.saveGame();
        }
        return result;
    }
```

- [ ] **Step 5: Await daily reward in MainView**

In `assets/scripts/ui/MainView.ts`, replace `private onDailyRewardClicked(): void` with:

```ts
    private async onDailyRewardClicked(): Promise<void> {
        audioManager.playClick();
        if (!this.gameManager) {
            return;
        }
        const result = await this.gameManager.claimDailyReward();
        if (result.ok) {
            this.refreshPlayerInfo();
            this.refreshDailyRewardButtonState();
            if (this.dailyRewardButtonLabel) {
                this.dailyRewardButtonLabel.string = "签到成功";
            }
            this.showFeedback("签到成功", new Color(150, 235, 165, 255));
            return;
        }
        audioManager.playFail();
        this.refreshDailyRewardButtonState();
    }
```

- [ ] **Step 6: Await ad reward in MainView**

In `assets/scripts/ui/MainView.ts`, replace `private applyAdReward(rewardType: AdRewardType): void` with:

```ts
    private async applyAdReward(rewardType: AdRewardType): Promise<void> {
        if (!this.gameManager) {
            return;
        }
        const result = await this.gameManager.claimAdReward(rewardType);
        if (!result.ok) {
            audioManager.playFail();
        }
        this.refreshPlayerInfo();
        this.refreshBoard();
        this.setTip(result.message);
        this.showFeedback(result.message, result.ok ? new Color(150, 220, 255, 255) : new Color(255, 140, 140, 255));
        if (this.adRewardPanel) {
            this.adRewardPanel.active = false;
        }
    }
```

- [ ] **Step 7: Run scaffold tests and confirm pass**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 8: Run client logic and TypeScript checks**

Run:

```powershell
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: client logic/platform tests PASS; TypeScript filter prints no `assets/scripts` output.

- [ ] **Step 9: Commit**

Run:

```powershell
git add -- assets/scripts/core/GameManager.ts assets/scripts/ui/MainView.ts tests/client-scaffold.test.js
git commit -m "feat: route platform economy rewards through server"
```

---

### Task 5: Documentation, Checkpoint, And Full Verification

**Files:**
- Modify: `server/README_SERVER.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update server API documentation**

In `server/README_SERVER.md`, add this section after the board action endpoint section:

````md
### Economy Daily Reward

Claims the authenticated player's daily reward on the server.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/economy/daily-reward \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json"
```

### Economy Ad Reward

Applies an ad reward effect on the server after the client has completed the rewarded-video watch.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/economy/ad-reward \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json" \
  -d '{"rewardType":"coin_bonus"}'
```

Economy command errors return `{ "ok": false, "error": "<CODE>" }`. Current codes include `rewardType is invalid`, `ad reward claim is too frequent`, `BOARD_FULL`, and `DAILY_REWARD_ALREADY_CLAIMED`.
````

- [ ] **Step 2: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`:

Add these bullets under `Completed capabilities:`:

```md
- Platform ad reward effects are applied through server-owned economy commands.
- Platform daily rewards are claimed through server-owned economy commands.
```

Add this section after `## Recent Stage 3-G Implementation Progress`:

```md
## Recent Stage 3-H Implementation Progress

Completed so far:

1. Stage 3-H economy command migration design and implementation plan are committed.
2. Server exposes authenticated economy commands for ad rewards and daily rewards.
3. Platform ad reward effects are calculated and persisted server-side.
4. Platform daily reward claims are calculated and persisted server-side.
5. Browser and Cocos preview retain local fallback reward behavior.
```

Replace `## Current Resume Node` body with:

```md
Current development node for next session: **Stage 3-H economy command migration completed; manual Cocos/platform preview pending if not already performed**.

Recommended next node:

- Run the Cocos Creator preview checklist below.
- If platform preview is available, verify ad rewards and daily rewards hit the `/economy/*` endpoints.
- Then choose the next Stage 3-I scope: production storage hardening or remaining profile/preference command cleanup.
```

Update `## Last Verification` counts after running full verification.

- [ ] **Step 3: Run full verification**

Run:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: server/scaffold tests PASS, client logic/platform tests PASS, TypeScript filter prints no `assets/scripts` output.

- [ ] **Step 4: Update exact Last Verification counts**

If the first command reports a new test count, update this line in `docs/superpowers/CURRENT_CHECKPOINT.md`:

```md
# <actual count> pass, 0 fail
```

Keep the `37 pass, 0 fail` client logic/platform line unless that command reports a different count.

- [ ] **Step 5: Review final diff**

Run:

```powershell
git diff -- server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
```

Expected: documentation records Stage 3-H endpoints and handoff without removing Stage 3-G context.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3h economy command migration"
```

---

## Self-Review Notes

- Spec coverage: covered remote ad reward effects, remote daily reward claims, platform-only authority routing, local preview fallback, server routes, client methods, UI async behavior, docs, and verification.
- Placeholder scan: no placeholder sections or deferred implementation steps remain.
- Type consistency: remote result types are `RemoteAdRewardResult` and `RemoteDailyRewardResult`; server helpers are `claimEconomyAdRewardForPlayer()` and `claimDailyRewardForPlayer()` throughout the plan.
