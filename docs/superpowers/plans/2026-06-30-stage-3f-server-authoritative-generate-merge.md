# Stage 3-F Server-Authoritative Generate And Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move platform-authenticated initial board creation, item generation, and merge resolution to server-authoritative endpoints while keeping browser and Cocos preview local.

**Architecture:** Keep the current Koa server shape, but add a small server-side gameplay config module so board commands can use the same merge-chain economics as the client. The client gains intent-only remote action methods in `StorageManager`; `GameManager` chooses remote authority only for authenticated non-web platforms, and `MainView` calls `GameManager` instead of mutating `BoardManager` directly.

**Tech Stack:** Node.js Koa server, Node test runner, local JSON persistence, Cocos Creator 3.8.x TypeScript client, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Create `server/gameplayConfig.js`
  - Own server-side board dimensions, merge item config, and helper lookups.
  - Keep this free of Koa and persistence concerns.
- Modify `server/server.js`
  - Import gameplay config helpers.
  - Add pure board helpers for normalizing 5x6 boards, finding cells, spawning low-level items, and resolving merges.
  - Add `ensureBoardForPlayer()`, `generateBoardItemForPlayer()`, and `mergeBoardItemsForPlayer()`.
  - Add Koa handlers and routes for `/player/:playerId/board/ensure`, `/player/:playerId/board/generate`, and `/player/:playerId/board/merge`.
  - Export helper and handler functions for direct tests.
- Modify `tests/server.test.js`
  - Add pure helper tests for board creation, generation, merge rewards, and error cases.
  - Add handler tests for session authorization on all board actions.
- Modify `assets/scripts/core/StorageManager.ts`
  - Add `ensureRemoteBoard(playerId)`, `generateRemoteItem(playerId)`, and `mergeRemoteItems(playerId, fromIndex, toIndex)`.
- Modify `assets/scripts/core/GameManager.ts`
  - Add platform authority state.
  - Add `applyRemotePlayerData()`.
  - Add async `generateItem()` and `mergeItems()` methods that branch between remote platform mode and local preview mode.
  - Ensure remote board creation runs after authenticated non-web login.
- Modify `assets/scripts/ui/MainView.ts`
  - Make generate and drag-merge handlers await `GameManager` action methods.
  - Keep local preview messages and failure behavior.
- Modify `tests/client-scaffold.test.js`
  - Add guardrail tests for remote methods and UI/GameManager wiring.
- Modify `server/README_SERVER.md`
  - Document board action endpoints, authorization, and error responses.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Record Stage 3-F implementation completion after all tasks pass.

---

### Task 1: Server Gameplay Config And Pure Board Commands

**Files:**
- Create: `server/gameplayConfig.js`
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing server board helper tests**

Append this code after `handleAdRewardClaim requires a matching player session` in `tests/server.test.js`:

```js
function occupiedCells(board) {
  return board.filter((cell) => cell.itemId !== null);
}

function fullBoard(itemId = 1) {
  const cells = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      cells.push({ row, col, itemId });
    }
  }
  return cells;
}

test('ensureBoardForPlayer creates exactly six occupied cells for an empty board', () => {
  const now = 1781450000000;
  const store = {
    board_owner: server.createDefaultPlayer('board_owner', 'Board Owner'),
  };

  const player = server.ensureBoardForPlayer(store, 'board_owner', now, () => 0);

  assert.equal(player.playerId, 'board_owner');
  assert.equal(player.board.length, 30);
  assert.equal(occupiedCells(player.board).length, 6);
  assert.equal(occupiedCells(player.board).every((cell) => cell.itemId === 1), true);
  assert.equal(player.lastSaveTime, now);
});

test('ensureBoardForPlayer preserves an existing occupied board', () => {
  const now = 1781450000000;
  const existingBoard = fullBoard(null);
  existingBoard[7] = { row: 1, col: 1, itemId: 4 };
  const store = {
    board_owner: {
      ...server.createDefaultPlayer('board_owner'),
      board: existingBoard,
      lastSaveTime: 123,
    },
  };

  const player = server.ensureBoardForPlayer(store, 'board_owner', now, () => 0);

  assert.equal(occupiedCells(player.board).length, 1);
  assert.equal(player.board[7].itemId, 4);
  assert.equal(player.lastSaveTime, 123);
});

test('generateBoardItemForPlayer writes one low-level item into an empty cell', () => {
  const now = 1781450000000;
  const store = {
    generator: {
      ...server.createDefaultPlayer('generator'),
      board: fullBoard(null),
    },
  };

  const player = server.generateBoardItemForPlayer(store, 'generator', now, () => 0);

  assert.equal(player.board.length, 30);
  assert.equal(occupiedCells(player.board).length, 1);
  assert.equal(occupiedCells(player.board)[0].itemId, 1);
  assert.equal(player.lastSaveTime, now);
});

test('generateBoardItemForPlayer fails with BOARD_FULL when no cell is empty', () => {
  const store = {
    full_player: {
      ...server.createDefaultPlayer('full_player'),
      board: fullBoard(1),
    },
  };

  assert.throws(
    () => server.generateBoardItemForPlayer(store, 'full_player', 1781450000000, () => 0),
    /BOARD_FULL/
  );
});

test('mergeBoardItemsForPlayer resolves merge rewards and skin unlocks', () => {
  const now = 1781450000000;
  const board = fullBoard(null);
  board[0] = { row: 0, col: 0, itemId: 3 };
  board[1] = { row: 0, col: 1, itemId: 3 };
  const store = {
    merge_player: {
      ...server.createDefaultPlayer('merge_player'),
      coins: 10,
      score: 20,
      highestItemLevel: 2,
      board,
    },
  };

  const player = server.mergeBoardItemsForPlayer(store, 'merge_player', {
    fromIndex: 0,
    toIndex: 1,
  }, now);

  assert.equal(player.board[0].itemId, null);
  assert.equal(player.board[1].itemId, 4);
  assert.equal(player.coins, 28);
  assert.equal(player.score, 65);
  assert.equal(player.highestItemLevel, 4);
  assert.deepEqual(player.unlockedSkins, [1]);
  assert.equal(player.lastSaveTime, now);
});

test('mergeBoardItemsForPlayer rejects invalid merge requests with stable codes', () => {
  const board = fullBoard(null);
  board[0] = { row: 0, col: 0, itemId: 1 };
  board[1] = { row: 0, col: 1, itemId: 2 };
  board[2] = { row: 0, col: 2, itemId: 20 };
  board[3] = { row: 0, col: 3, itemId: 20 };
  const store = {
    merge_player: {
      ...server.createDefaultPlayer('merge_player'),
      board,
    },
  };

  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: -1, toIndex: 1 }), /INVALID_CELL_INDEX/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 4, toIndex: 1 }), /EMPTY_SOURCE_CELL/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 0, toIndex: 4 }), /EMPTY_TARGET_CELL/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 0, toIndex: 1 }), /ITEM_MISMATCH/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 2, toIndex: 3 }), /ITEM_MAX_LEVEL/);
  assert.throws(() => server.ensureBoardForPlayer({}, 'missing_player'), /PLAYER_NOT_FOUND/);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL with `server.ensureBoardForPlayer is not a function`.

- [ ] **Step 3: Add server gameplay config**

Create `server/gameplayConfig.js`:

```js
const BOARD_ROWS = 5;
const BOARD_COLS = 6;
const BOARD_CELL_COUNT = BOARD_ROWS * BOARD_COLS;

const itemConfigs = [
  { id: 1, name: "基础T恤", level: 1, nextId: 2, score: 5, coin: 2 },
  { id: 2, name: "高腰短裙", level: 2, nextId: 3, score: 12, coin: 5 },
  { id: 3, name: "清新连衣裙", level: 3, nextId: 4, score: 25, coin: 10 },
  { id: 4, name: "甜酷套装", level: 4, nextId: 5, score: 45, coin: 18, unlockSkinId: 1 },
  { id: 5, name: "职场套装", level: 5, nextId: 6, score: 75, coin: 30 },
  { id: 6, name: "校园风套装", level: 6, nextId: 7, score: 120, coin: 48 },
  { id: 7, name: "国风套装", level: 7, nextId: 8, score: 180, coin: 72, unlockSkinId: 2 },
  { id: 8, name: "晚礼服", level: 8, nextId: 9, score: 260, coin: 104 },
  { id: 9, name: "舞台造型", level: 9, nextId: 10, score: 360, coin: 144 },
  { id: 10, name: "高定礼服", level: 10, nextId: 11, score: 500, coin: 200, unlockSkinId: 3 },
  { id: 11, name: "女神限定装", level: 11, nextId: 12, score: 700, coin: 280 },
  { id: 12, name: "传说星光套装", level: 12, nextId: 13, score: 1000, coin: 400, unlockSkinId: 4 },
  { id: 13, name: "璀璨红毯礼服", level: 13, nextId: 14, score: 1350, coin: 540 },
  { id: 14, name: "未来感战衣", level: 14, nextId: 15, score: 1750, coin: 700 },
  { id: 15, name: "霓虹偶像套装", level: 15, nextId: 16, score: 2200, coin: 880, unlockSkinId: 5 },
  { id: 16, name: "皇家舞会礼裙", level: 16, nextId: 17, score: 2750, coin: 1100 },
  { id: 17, name: "幻境精灵套装", level: 17, nextId: 18, score: 3400, coin: 1360 },
  { id: 18, name: "梦境公主礼服", level: 18, nextId: 19, score: 4200, coin: 1680, unlockSkinId: 6 },
  { id: 19, name: "银河女王套装", level: 19, nextId: 20, score: 5200, coin: 2080 },
  { id: 20, name: "终章女神神装", level: 20, nextId: 0, score: 6600, coin: 2640, unlockSkinId: 7 },
];

function getItemConfigById(id) {
  return itemConfigs.find((item) => item.id === id) || null;
}

function getRandomLowLevelItemId(randomFn = Math.random) {
  const lowLevelItems = itemConfigs.filter((item) => item.level >= 1 && item.level <= 3);
  const index = Math.min(lowLevelItems.length - 1, Math.floor(randomFn() * lowLevelItems.length));
  return lowLevelItems[index].id;
}

module.exports = {
  BOARD_ROWS,
  BOARD_COLS,
  BOARD_CELL_COUNT,
  itemConfigs,
  getItemConfigById,
  getRandomLowLevelItemId,
};
```

- [ ] **Step 4: Import gameplay config in the server**

In `server/server.js`, add after the existing `path` import:

```js
const {
  BOARD_ROWS,
  BOARD_COLS,
  BOARD_CELL_COUNT,
  getItemConfigById,
  getRandomLowLevelItemId,
} = require("./gameplayConfig");
```

- [ ] **Step 5: Add pure board helper functions**

Add this block after `mergePlayerSaveData()` in `server/server.js`:

```js
function createBoardError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createEmptyBoardCells() {
  const cells = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      cells.push({ row, col, itemId: null });
    }
  }
  return cells;
}

function normalizeBoardCells(board) {
  const cells = createEmptyBoardCells();
  if (!Array.isArray(board)) {
    return cells;
  }
  board.forEach((cell) => {
    if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
      return;
    }
    if (cell.row < 0 || cell.row >= BOARD_ROWS || cell.col < 0 || cell.col >= BOARD_COLS) {
      return;
    }
    const index = cell.row * BOARD_COLS + cell.col;
    cells[index].itemId = Number.isInteger(cell.itemId) ? cell.itemId : null;
  });
  return cells;
}

function getBoardCell(board, index) {
  if (!Number.isInteger(index) || index < 0 || index >= BOARD_CELL_COUNT) {
    throw createBoardError("INVALID_CELL_INDEX");
  }
  return board[index];
}

function getOccupiedBoardCells(board) {
  return board.filter((cell) => cell.itemId !== null);
}

function getEmptyBoardCells(board) {
  return board.filter((cell) => cell.itemId === null);
}

function pickRandomCell(cells, randomFn = Math.random) {
  const index = Math.min(cells.length - 1, Math.floor(randomFn() * cells.length));
  return cells[index];
}

function spawnServerLowLevelItem(board, randomFn = Math.random) {
  const emptyCells = getEmptyBoardCells(board);
  if (emptyCells.length === 0) {
    throw createBoardError("BOARD_FULL");
  }
  const target = pickRandomCell(emptyCells, randomFn);
  target.itemId = getRandomLowLevelItemId(randomFn);
  return target;
}

function getPlayerForBoardAction(store, playerId) {
  if (!store[playerId]) {
    throw createBoardError("PLAYER_NOT_FOUND");
  }
  return store[playerId];
}

function ensureBoardForPlayer(store, playerId, now = Date.now(), randomFn = Math.random) {
  const player = getPlayerForBoardAction(store, playerId);
  player.board = normalizeBoardCells(player.board);
  if (getOccupiedBoardCells(player.board).length > 0) {
    return player;
  }
  for (let i = 0; i < 6; i += 1) {
    spawnServerLowLevelItem(player.board, randomFn);
  }
  player.lastSaveTime = now;
  store[playerId] = player;
  return player;
}

function generateBoardItemForPlayer(store, playerId, now = Date.now(), randomFn = Math.random) {
  const player = getPlayerForBoardAction(store, playerId);
  player.board = normalizeBoardCells(player.board);
  spawnServerLowLevelItem(player.board, randomFn);
  player.lastSaveTime = now;
  store[playerId] = player;
  return player;
}

function mergeBoardItemsForPlayer(store, playerId, body = {}, now = Date.now()) {
  const player = getPlayerForBoardAction(store, playerId);
  player.board = normalizeBoardCells(player.board);

  const fromCell = getBoardCell(player.board, body.fromIndex);
  const toCell = getBoardCell(player.board, body.toIndex);
  if (fromCell.itemId === null) {
    throw createBoardError("EMPTY_SOURCE_CELL");
  }
  if (toCell.itemId === null) {
    throw createBoardError("EMPTY_TARGET_CELL");
  }
  if (fromCell.itemId !== toCell.itemId) {
    throw createBoardError("ITEM_MISMATCH");
  }

  const sourceConfig = getItemConfigById(fromCell.itemId);
  const resultConfig = sourceConfig && sourceConfig.nextId ? getItemConfigById(sourceConfig.nextId) : null;
  if (!resultConfig) {
    throw createBoardError("ITEM_MAX_LEVEL");
  }

  fromCell.itemId = null;
  toCell.itemId = resultConfig.id;
  player.score = (Number(player.score) || 0) + resultConfig.score;
  player.coins = (Number(player.coins) || 0) + resultConfig.coin;
  player.highestItemLevel = Math.max(Number(player.highestItemLevel) || 0, resultConfig.level);
  if (resultConfig.unlockSkinId && !player.unlockedSkins.includes(resultConfig.unlockSkinId)) {
    player.unlockedSkins.push(resultConfig.unlockSkinId);
  }
  player.lastSaveTime = now;
  store[playerId] = player;
  return player;
}
```

- [ ] **Step 6: Export board helpers**

Add these names to `module.exports` in `server/server.js`:

```js
  createBoardError,
  createEmptyBoardCells,
  normalizeBoardCells,
  getBoardCell,
  getOccupiedBoardCells,
  getEmptyBoardCells,
  spawnServerLowLevelItem,
  getPlayerForBoardAction,
  ensureBoardForPlayer,
  generateBoardItemForPlayer,
  mergeBoardItemsForPlayer,
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
git add -- server/gameplayConfig.js server/server.js tests/server.test.js
git commit -m "feat: add server board command helpers"
```

---

### Task 2: Server Board Action HTTP Endpoints

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing handler authorization and response tests**

Append this code after the Task 1 board helper tests in `tests/server.test.js`:

```js
test('board action handlers require matching player sessions', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('wechat', 'board-owner');
  const otherSession = createAuthorizedSession('wechat', 'board-other');

  const missingCtx = createMockContext({});
  missingCtx.params = { playerId: session.playerId };
  server.handleBoardEnsure(missingCtx, store, 1781450000000);
  assert.equal(missingCtx.status, 401);

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: session.playerId };
  server.handleBoardGenerate(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  okCtx.params = { playerId: session.playerId };
  server.handleBoardEnsure(okCtx, store, 1781450000000, () => 0);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.playerId, session.playerId);
  assert.equal(occupiedCells(okCtx.body.board).length, 6);
});

test('board action handlers return stable bad request error codes', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('web', 'board-errors');
  store[session.playerId] = {
    ...server.createDefaultPlayer(session.playerId),
    board: fullBoard(1),
  };

  const generateCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  generateCtx.params = { playerId: session.playerId };
  server.handleBoardGenerate(generateCtx, store, 1781450000000, () => 0);
  assert.equal(generateCtx.status, 400);
  assert.deepEqual(generateCtx.body, { ok: false, error: 'BOARD_FULL' });

  const mergeCtx = createMockContext({ fromIndex: 0, toIndex: 99 }, { authorization: `Bearer ${session.sessionToken}` });
  mergeCtx.params = { playerId: session.playerId };
  server.handleBoardMerge(mergeCtx, store, 1781450000000);
  assert.equal(mergeCtx.status, 400);
  assert.deepEqual(mergeCtx.body, { ok: false, error: 'INVALID_CELL_INDEX' });
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL with `server.handleBoardEnsure is not a function`.

- [ ] **Step 3: Add board action handlers**

Add this block after `handleAdRewardClaim()` in `server/server.js`:

```js
function handleBoardEnsure(ctx, store, now = Date.now(), randomFn = Math.random) {
  const { playerId } = ctx.params;
  const session = requirePlayerSession(ctx, playerId, now);
  if (!session) {
    return;
  }
  try {
    ctx.body = ensureBoardForPlayer(store, playerId, now, randomFn);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}

function handleBoardGenerate(ctx, store, now = Date.now(), randomFn = Math.random) {
  const { playerId } = ctx.params;
  const session = requirePlayerSession(ctx, playerId, now);
  if (!session) {
    return;
  }
  try {
    ctx.body = generateBoardItemForPlayer(store, playerId, now, randomFn);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}

function handleBoardMerge(ctx, store, now = Date.now()) {
  const { playerId } = ctx.params;
  const session = requirePlayerSession(ctx, playerId, now);
  if (!session) {
    return;
  }
  try {
    ctx.body = mergeBoardItemsForPlayer(store, playerId, ctx.request.body || {}, now);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}
```

- [ ] **Step 4: Register Koa routes**

In `createApp()` in `server/server.js`, add these routes after the existing `router.post("/player/:playerId", ...)` route:

```js
  router.post("/player/:playerId/board/ensure", (ctx) => {
    const store = readPlayerStore();
    handleBoardEnsure(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });

  router.post("/player/:playerId/board/generate", (ctx) => {
    const store = readPlayerStore();
    handleBoardGenerate(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });

  router.post("/player/:playerId/board/merge", (ctx) => {
    const store = readPlayerStore();
    handleBoardMerge(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });
```

- [ ] **Step 5: Export handlers**

Add these names to `module.exports` in `server/server.js`:

```js
  handleBoardEnsure,
  handleBoardGenerate,
  handleBoardMerge,
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
git commit -m "feat: expose server board action endpoints"
```

---

### Task 3: Client Remote Board Action Requests

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`

- [ ] **Step 1: Write failing StorageManager scaffold test**

Append this code after `stage 3D storage manager accepts auth session expiry from server` in `tests/client-scaffold.test.js`:

```js
test('stage 3F storage manager exposes authenticated remote board actions', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /ensureRemoteBoard\(playerId: string\): Promise<PlayerData \| null>/);
  assert.match(storage, /generateRemoteItem\(playerId: string\): Promise<PlayerData \| null>/);
  assert.match(storage, /mergeRemoteItems\(playerId: string, fromIndex: number, toIndex: number\): Promise<PlayerData \| null>/);
  assert.match(storage, /`\/player\/\$\{playerId\}\/board\/ensure`/);
  assert.match(storage, /`\/player\/\$\{playerId\}\/board\/generate`/);
  assert.match(storage, /`\/player\/\$\{playerId\}\/board\/merge`/);
  assert.match(storage, /body: JSON\.stringify\(\{ fromIndex, toIndex \}\)/);
  assert.match(storage, /headers: this\.withAuthHeaders\(\{ "Content-Type": "application\/json" \}\)/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because the remote board action methods do not exist.

- [ ] **Step 3: Add remote board methods**

In `assets/scripts/core/StorageManager.ts`, add these methods after `loadRemote(playerId: string): Promise<PlayerData | null>`:

```ts
    async ensureRemoteBoard(playerId: string): Promise<PlayerData | null> {
        try {
            return await this.request(`/player/${playerId}/board/ensure`, {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
            }) as PlayerData;
        } catch (error) {
            console.warn("[StorageManager] ensureRemoteBoard failed", error);
            return null;
        }
    }

    async generateRemoteItem(playerId: string): Promise<PlayerData | null> {
        try {
            return await this.request(`/player/${playerId}/board/generate`, {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
            }) as PlayerData;
        } catch (error) {
            console.warn("[StorageManager] generateRemoteItem failed", error);
            return null;
        }
    }

    async mergeRemoteItems(playerId: string, fromIndex: number, toIndex: number): Promise<PlayerData | null> {
        try {
            return await this.request(`/player/${playerId}/board/merge`, {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ fromIndex, toIndex }),
            }) as PlayerData;
        } catch (error) {
            console.warn("[StorageManager] mergeRemoteItems failed", error);
            return null;
        }
    }
```

- [ ] **Step 4: Run scaffold tests and confirm pass**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 5: Run TypeScript asset filter**

Run:

```powershell
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: no `assets/scripts` output. PowerShell may return exit code 1 when there are no matches.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- assets/scripts/core/StorageManager.ts tests/client-scaffold.test.js
git commit -m "feat: add remote board action requests"
```

---

### Task 4: Client Authority Mode And UI Action Routing

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/GameManager.ts`
- Modify: `assets/scripts/ui/MainView.ts`

- [ ] **Step 1: Write failing client wiring scaffold test**

Append this code after the Task 3 scaffold test in `tests/client-scaffold.test.js`:

```js
test('stage 3F game manager routes platform board actions through remote authority', () => {
  const gameManager = read('assets/scripts/core/GameManager.ts');
  const mainView = read('assets/scripts/ui/MainView.ts');

  assert.match(gameManager, /private remoteAuthoritative = false/);
  assert.match(gameManager, /private isPlatformAuthoritative\(\): boolean/);
  assert.match(gameManager, /platformManager\.detectPlatform\(\) !== "web"/);
  assert.match(gameManager, /storageManager\.getSessionToken\(\)/);
  assert.match(gameManager, /storageManager\.ensureRemoteBoard\(auth\.playerId\)/);
  assert.match(gameManager, /async generateItem\(\): Promise<boolean>/);
  assert.match(gameManager, /storageManager\.generateRemoteItem\(data\.playerId\)/);
  assert.match(gameManager, /async mergeItems\(fromRow: number, fromCol: number, toRow: number, toCol: number\)/);
  assert.match(gameManager, /storageManager\.mergeRemoteItems\(data\.playerId, fromIndex, toIndex\)/);
  assert.match(gameManager, /private applyRemotePlayerData\(remoteData: PlayerData\): void/);
  assert.match(mainView, /private async onGenerateClicked\(\): Promise<void>/);
  assert.match(mainView, /await this\.gameManager\.generateItem\(\)/);
  assert.match(mainView, /private async onItemDragEnd/);
  assert.match(mainView, /await this\.gameManager\.mergeItems\(payload\.fromRow, payload\.fromCol, target\.row, target\.col\)/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `GameManager.generateItem()` and remote authority wiring do not exist.

- [ ] **Step 3: Add result type and authority state**

In `assets/scripts/core/GameManager.ts`, add this interface after `AdRewardClaimResult`:

```ts
export interface MergeActionResult {
    ok: boolean;
    resultItemId: number;
}
```

Add this field after `private readonly fallbackPlayerId = "demo_player";`:

```ts
    private remoteAuthoritative = false;
```

- [ ] **Step 4: Replace async initialization flow**

Replace `private async initGameAsync(): Promise<void>` in `assets/scripts/core/GameManager.ts` with:

```ts
    private async initGameAsync(): Promise<void> {
        const login = await platformManager.login();
        const auth = await storageManager.loginRemote({
            platform: login.platform,
            code: login.code,
        });

        if (auth && auth.ok && auth.playerId) {
            if (auth.platform !== "web") {
                const remoteData = await storageManager.ensureRemoteBoard(auth.playerId);
                if (remoteData) {
                    this.remoteAuthoritative = true;
                    this.applyRemotePlayerData(remoteData);
                    this.initialized = true;
                    eventManager.emit(GameEvents.GAME_INIT, this.getPlayerData());
                    return;
                }
            }
            this.initGame(auth.playerId);
            return;
        }

        this.initGame(login.playerId || this.fallbackPlayerId);
    }
```

Keep the existing `resolvePlayerId()` method in place for now if string scaffold tests still assert it; it becomes unused but harmless. Remove it in a later cleanup stage only if tests and call sites are updated deliberately.

- [ ] **Step 5: Add remote data application and authority helpers**

Add these methods after `getPlayerData()` in `assets/scripts/core/GameManager.ts`:

```ts
    private applyRemotePlayerData(remoteData: PlayerData): void {
        this.playerData = normalizePlayerData(remoteData);
        this.boardManager.loadBoard(this.playerData.board);
        eventManager.emit(GameEvents.COINS_CHANGED, this.playerData.coins);
        eventManager.emit(GameEvents.SCORE_CHANGED, this.playerData.score);
    }

    private isPlatformAuthoritative(): boolean {
        return this.remoteAuthoritative
            && platformManager.detectPlatform() !== "web"
            && Boolean(storageManager.getSessionToken());
    }

    private toBoardIndex(row: number, col: number): number {
        return row * this.boardManager.cols + col;
    }
```

- [ ] **Step 6: Add GameManager action methods**

Add these methods before `claimAdReward()` in `assets/scripts/core/GameManager.ts`:

```ts
    async generateItem(): Promise<boolean> {
        const data = this.getPlayerData();
        if (this.isPlatformAuthoritative()) {
            const remoteData = await storageManager.generateRemoteItem(data.playerId);
            if (!remoteData) {
                return false;
            }
            this.applyRemotePlayerData(remoteData);
            return true;
        }

        const ok = this.boardManager.spawnRandomItem();
        if (ok) {
            this.saveGame();
        }
        return ok;
    }

    async mergeItems(fromRow: number, fromCol: number, toRow: number, toCol: number): Promise<MergeActionResult> {
        const data = this.getPlayerData();
        if (this.isPlatformAuthoritative()) {
            const toIndex = this.toBoardIndex(toRow, toCol);
            const remoteData = await storageManager.mergeRemoteItems(
                data.playerId,
                this.toBoardIndex(fromRow, fromCol),
                toIndex
            );
            if (!remoteData) {
                return { ok: false, resultItemId: 0 };
            }
            const resultCell = remoteData.board[toIndex];
            this.applyRemotePlayerData(remoteData);
            return { ok: true, resultItemId: resultCell?.itemId ?? 0 };
        }

        const result = this.boardManager.merge(fromRow, fromCol, toRow, toCol);
        return {
            ok: Boolean(result),
            resultItemId: result?.resultItemId ?? 0,
        };
    }
```

- [ ] **Step 7: Route generate through GameManager**

In `assets/scripts/ui/MainView.ts`, replace `private onGenerateClicked(): void` with:

```ts
    private async onGenerateClicked(): Promise<void> {
        audioManager.playClick();
        if (!this.gameManager) {
            return;
        }
        const ok = await this.gameManager.generateItem();
        if (ok) {
            this.refreshPlayerInfo();
            this.refreshBoard();
            this.setTip("生成了一件新服装");
            return;
        }
        audioManager.playFail();
    }
```

- [ ] **Step 8: Route drag merge through GameManager**

In `assets/scripts/ui/MainView.ts`, replace `private onItemDragEnd(payload: { fromRow: number; fromCol: number; worldPosition: Vec3 }): void` with:

```ts
    private async onItemDragEnd(payload: { fromRow: number; fromCol: number; worldPosition: Vec3 }): Promise<void> {
        if (!this.gameManager || !this.boardRoot) {
            return;
        }

        const target = this.worldToCell(payload.worldPosition);
        if (!target) {
            audioManager.playFail();
            this.refreshBoard();
            return;
        }

        const result = await this.gameManager.mergeItems(payload.fromRow, payload.fromCol, target.row, target.col);
        if (!result.ok) {
            audioManager.playFail();
            this.setTip("不同服装不能合成");
            this.refreshBoard();
            return;
        }

        const config = getItemConfigById(result.resultItemId);
        this.refreshPlayerInfo();
        this.refreshSkinView();
        this.refreshBoard();
        this.setTip(`获得 ${config?.name ?? "新服装"}`);
    }
```

- [ ] **Step 9: Run client scaffold tests and confirm pass**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: PASS.

- [ ] **Step 10: Run client logic tests**

Run:

```powershell
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 11: Run TypeScript asset filter**

Run:

```powershell
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: no `assets/scripts` output. PowerShell may return exit code 1 when there are no matches.

- [ ] **Step 12: Commit**

Run:

```powershell
git add -- assets/scripts/core/GameManager.ts assets/scripts/ui/MainView.ts tests/client-scaffold.test.js
git commit -m "feat: route platform board actions through server"
```

---

### Task 5: Documentation, Checkpoint, And Full Verification

**Files:**
- Modify: `server/README_SERVER.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update server API documentation**

In `server/README_SERVER.md`, add this section after `### Save Player`:

````md
### Board Ensure

Creates the initial remote board only when the authenticated player's persisted board has no occupied cells.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/board/ensure \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json"
```

### Board Generate

Generates one server-selected low-level item into an empty board cell.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/board/generate \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json"
```

### Board Merge

Merges two occupied cells when both item IDs match and the item is not max level.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/board/merge \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json" \
  -d '{"fromIndex":0,"toIndex":1}'
```

Board action errors return `{ "ok": false, "error": "<CODE>" }`. Current codes are `BOARD_FULL`, `INVALID_CELL_INDEX`, `EMPTY_SOURCE_CELL`, `EMPTY_TARGET_CELL`, `ITEM_MISMATCH`, `ITEM_MAX_LEVEL`, and `PLAYER_NOT_FOUND`.
````

- [ ] **Step 2: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`:

Replace:

```md
Current development node: **Stage 3-E completed**.
```

with:

```md
Current development node: **Stage 3-F implementation completed**.
```

Append this list under `## Recent Stage 3-F Planning Progress`:

```md

## Recent Stage 3-F Implementation Progress

Completed so far:

1. Added server-side gameplay config for the 5x6 board and 20-level merge chain.
2. Added server-authoritative board ensure, generate, and merge helpers.
3. Added authenticated Koa endpoints for board ensure, generate, and merge.
4. Added client remote board action requests.
5. Routed authenticated non-web platform generation and merge through server board actions.
6. Preserved browser and Cocos preview local generation and merge fallback.
7. Documented the board action API.
```

Replace the `## Current Resume Node` section body with:

```md
Current development node for next session: **Stage 3-F implementation completed; manual Cocos/platform preview pending if not already performed**.

Recommended next node:

- Run the Cocos Creator preview checklist below.
- Then choose the next Stage 3-G scope: full-save lockdown, remaining economy command migration, or production storage.
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
```

Expected: PASS.

Run:

```powershell
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
```

Expected: PASS.

Run:

```powershell
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: no `assets/scripts` output. PowerShell may return exit code 1 when there are no matches.

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3f server authority completion"
```

---

## Manual Preview Checklist

Run this after automated verification if Cocos Creator is available:

- Open `D:\project\AI_Goddess_Merge` in Cocos Creator 3.8.x.
- Confirm Canvas has `assets/scripts/ui/SceneBootstrap.ts` mounted.
- Run browser preview and confirm local fallback still works:
  - first-run tutorial opens
  - generate clothing adds one item
  - drag merge of equal items succeeds
  - drag merge of different items fails without changing board
  - merge success updates coins and score
  - daily reward, skin gallery, leaderboard, and ad reward paths still open
- In WeChat or Douyin platform preview with backend running, confirm authenticated board actions:
  - login succeeds
  - initial board is created by `/board/ensure`
  - generate calls `/board/generate`
  - merge calls `/board/merge`
  - failed remote action leaves current board unchanged

---

## Self-Review Notes

- Spec coverage: covered server-authoritative initial board creation, generate, merge validation, reward calculation, authenticated action endpoints, missing-player errors, browser/Cocos preview fallback, transitional full-save compatibility, server tests, client guardrail tests, docs, and verification.
- Scope check: this plan does not move ad rewards, daily rewards, skins, production storage, or full-save lockdown into Stage 3-F.
- Type consistency: client remote methods return `Promise<PlayerData | null>` and `GameManager` applies returned `PlayerData`; server action helpers return full player snapshots.
