# Stage 3 Ad Platform Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rewarded-ad rewards depend on real platform close-event completion and add lightweight server validation for ad reward claims.

**Architecture:** Keep the existing `RewardAdView -> PlatformManager -> platform adapter` flow. Add platform close-event handling inside the WeChat and Douyin adapters, align `/ad/reward` with the client reward types, and submit reward context from the client after local reward application.

**Tech Stack:** Cocos Creator 3.8.x TypeScript, Node.js Koa server, Node test runner, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Aligns server reward types with `assets/scripts/data/AdRewardConfig.ts`.
  - Adds ad claim cooldown and claim metadata updates.
  - Exports constants/helpers needed by server tests.
- Modify `tests/server.test.js`
  - Adds server tests for reward values, accepted claim metadata, invalid reward type, and rapid duplicate rejection.
- Modify `assets/scripts/core/StorageManager.ts`
  - Adds an `AdRewardClaimPayload` interface.
  - Sends reward context to `/ad/reward`.
- Modify `assets/scripts/core/GameManager.ts`
  - Sends reward value, coins, score, and highest item level to `StorageManager.claimAdReward`.
- Modify `tests/client-scaffold.test.js`
  - Adds scaffold assertions for the expanded claim payload and platform adapter close-event handling.
- Modify `assets/scripts/platform/WechatAdapter.ts`
  - Resolves real configured ads from `onClose` and `isEnded`.
  - Cleans up `onClose` and `onError` listeners.
- Modify `assets/scripts/platform/DouyinAdapter.ts`
  - Mirrors WeChat rewarded-ad close-event behavior for `tt`.
- Modify `README.md`
  - Documents Stage 3 rewarded-ad validation progress.
- Modify `README_CLIENT.md`
  - Adds a Stage 3 preview/platform checklist.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Updates the checkpoint after implementation and verification.

---

### Task 1: Server Reward Validation

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Add failing server reward validation tests**

Append this code to `tests/server.test.js`:

```js
test('getRewardValue maps stage 3 client ad reward types', () => {
  assert.equal(server.getRewardValue('clear_low_items'), 3);
  assert.equal(server.getRewardValue('coin_bonus'), 120);
  assert.equal(server.getRewardValue('high_level_item'), 4);
  assert.throws(() => server.getRewardValue('double_coins'), /Invalid rewardType/);
  assert.throws(() => server.getRewardValue('free_item'), /Invalid rewardType/);
});

test('claimAdRewardForPlayer records accepted ad claim metadata', () => {
  const store = {};
  const now = 1781450000000;

  const result = server.claimAdRewardForPlayer(store, {
    playerId: 'ad_player',
    rewardType: 'coin_bonus',
    clientRewardValue: 120,
    clientCoins: 240,
    clientScore: 360,
    clientHighestItemLevel: 8,
  }, now);

  assert.equal(result.ok, true);
  assert.equal(result.rewardType, 'coin_bonus');
  assert.equal(result.rewardValue, 120);
  assert.equal(result.adWatchCount, 1);
  assert.equal(result.lastAdRewardTime, now);
  assert.equal(store.ad_player.adWatchCount, 1);
  assert.equal(store.ad_player.lastAdRewardTime, now);
  assert.equal(store.ad_player.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(store.ad_player.lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 240,
    clientScore: 360,
    clientHighestItemLevel: 8,
  });
});

test('claimAdRewardForPlayer rejects invalid reward types and rapid duplicate claims', () => {
  const store = {};
  const now = 1781450000000;

  assert.throws(
    () => server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'unknown' }, now),
    /rewardType is invalid/
  );

  server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'clear_low_items' }, now);

  assert.throws(
    () => server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'clear_low_items' }, now + 1000),
    /ad reward claim is too frequent/
  );
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL. The existing duplicate `getRewardValue maps allowed ad reward types` test expects `double_coins` and `free_item`, and `claimAdRewardForPlayer` does not exist yet.

- [ ] **Step 3: Replace the old reward value test**

In `tests/server.test.js`, replace the existing test named `getRewardValue maps allowed ad reward types` with the Stage 3 version from Step 1 if both tests now exist. The file should contain only one reward value mapping test, with this exact body:

```js
test('getRewardValue maps stage 3 client ad reward types', () => {
  assert.equal(server.getRewardValue('clear_low_items'), 3);
  assert.equal(server.getRewardValue('coin_bonus'), 120);
  assert.equal(server.getRewardValue('high_level_item'), 4);
  assert.throws(() => server.getRewardValue('double_coins'), /Invalid rewardType/);
  assert.throws(() => server.getRewardValue('free_item'), /Invalid rewardType/);
});
```

- [ ] **Step 4: Implement server reward validation helpers**

In `server/server.js`, replace:

```js
const ALLOWED_REWARD_TYPES = ["clear_low_items", "double_coins", "free_item"];
```

with:

```js
const ALLOWED_REWARD_TYPES = ["clear_low_items", "coin_bonus", "high_level_item"];
const AD_REWARD_COOLDOWN_MS = 30 * 1000;
```

In `createDefaultPlayer`, add metadata fields after `adWatchCount: 0,`:

```js
    lastAdRewardTime: 0,
    lastAdRewardType: "",
    lastAdRewardClientContext: null,
```

Replace `getRewardValue` with:

```js
function getRewardValue(rewardType) {
  if (rewardType === "clear_low_items") {
    return 3;
  }
  if (rewardType === "coin_bonus") {
    return 120;
  }
  if (rewardType === "high_level_item") {
    return 4;
  }
  throw new Error("Invalid rewardType");
}
```

Add these helpers after `getRewardValue`:

```js
function normalizeAdRewardClientContext(body) {
  return {
    clientRewardValue: Number(body.clientRewardValue) || 0,
    clientCoins: Number(body.clientCoins) || 0,
    clientScore: Number(body.clientScore) || 0,
    clientHighestItemLevel: Number(body.clientHighestItemLevel) || 0,
  };
}

function claimAdRewardForPlayer(store, body, now = Date.now()) {
  const { playerId, rewardType } = body || {};
  if (!playerId || typeof playerId !== "string") {
    throw new Error("playerId is required");
  }
  if (!ALLOWED_REWARD_TYPES.includes(rewardType)) {
    throw new Error("rewardType is invalid");
  }

  const player = store[playerId] || createDefaultPlayer(playerId);
  const lastAdRewardTime = Number(player.lastAdRewardTime) || 0;
  if (lastAdRewardTime > 0 && now - lastAdRewardTime < AD_REWARD_COOLDOWN_MS) {
    throw new Error("ad reward claim is too frequent");
  }

  player.adWatchCount = (Number(player.adWatchCount) || 0) + 1;
  player.lastAdRewardTime = now;
  player.lastAdRewardType = rewardType;
  player.lastAdRewardClientContext = normalizeAdRewardClientContext(body);
  player.lastSaveTime = now;
  store[playerId] = player;

  return {
    ok: true,
    rewardType,
    rewardValue: getRewardValue(rewardType),
    adWatchCount: player.adWatchCount,
    lastAdRewardTime: player.lastAdRewardTime,
  };
}
```

- [ ] **Step 5: Use the helper in `/ad/reward`**

Replace the body of the `router.post("/ad/reward", (ctx) => { ... })` handler with:

```js
  router.post("/ad/reward", (ctx) => {
    const store = readPlayerStore();
    try {
      const result = claimAdRewardForPlayer(store, ctx.request.body || {});
      writePlayerStore(store);
      ctx.body = result;
    } catch (error) {
      sendBadRequest(ctx, error.message);
    }
  });
```

Add the new exports at the bottom:

```js
  ALLOWED_REWARD_TYPES,
  AD_REWARD_COOLDOWN_MS,
  normalizeAdRewardClientContext,
  claimAdRewardForPlayer,
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
git add -- tests/server.test.js server/server.js
git commit -m "feat: validate server ad reward claims"
```

---

### Task 2: Client Remote Reward Claim Context

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`
- Modify: `assets/scripts/core/GameManager.ts`

- [ ] **Step 1: Add failing scaffold test for reward claim context**

Append this test to `tests/client-scaffold.test.js`:

```js
test('stage 3 client submits ad reward context to remote validation endpoint', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');
  const gameManager = read('assets/scripts/core/GameManager.ts');

  assert.match(storage, /export interface AdRewardClaimPayload/);
  assert.match(storage, /clientRewardValue\?: number/);
  assert.match(storage, /clientCoins\?: number/);
  assert.match(storage, /clientScore\?: number/);
  assert.match(storage, /clientHighestItemLevel\?: number/);
  assert.match(storage, /claimAdReward\(payload: AdRewardClaimPayload\): Promise<boolean>/);
  assert.match(storage, /body: JSON\.stringify\(payload\)/);
  assert.match(gameManager, /storageManager\.claimAdReward\(\{/);
  assert.match(gameManager, /playerId: data\.playerId/);
  assert.match(gameManager, /rewardType/);
  assert.match(gameManager, /clientRewardValue: result\.value/);
  assert.match(gameManager, /clientCoins: data\.coins/);
  assert.match(gameManager, /clientScore: data\.score/);
  assert.match(gameManager, /clientHighestItemLevel: data\.highestItemLevel/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `AdRewardClaimPayload` and the expanded `claimAdReward` signature do not exist.

- [ ] **Step 3: Add `AdRewardClaimPayload` and update storage request**

In `assets/scripts/core/StorageManager.ts`, add this interface after `const LOCAL_SAVE_KEY = "AI_GODDESS_MERGE_PLAYER_DATA";`:

```ts
export interface AdRewardClaimPayload {
    playerId: string;
    rewardType: AdRewardType;
    clientRewardValue?: number;
    clientCoins?: number;
    clientScore?: number;
    clientHighestItemLevel?: number;
}
```

Replace `claimAdReward` with:

```ts
    async claimAdReward(payload: AdRewardClaimPayload): Promise<boolean> {
        try {
            const response = await this.request("/ad/reward", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            return Boolean(response?.ok);
        } catch (error) {
            console.warn("[StorageManager] claimAdReward failed", error);
            return false;
        }
    }
```

- [ ] **Step 4: Submit context from `GameManager.claimAdReward`**

In `assets/scripts/core/GameManager.ts`, replace:

```ts
        storageManager.claimAdReward(data.playerId, rewardType).catch((error) => {
            console.warn("[GameManager] remote ad reward failed", error);
        });
```

with:

```ts
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
```

- [ ] **Step 5: Run scaffold tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold tests PASS. Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/core/StorageManager.ts assets/scripts/core/GameManager.ts
git commit -m "feat: submit ad reward claim context"
```

---

### Task 3: Platform Rewarded-Ad Close Event Handling

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/platform/WechatAdapter.ts`
- Modify: `assets/scripts/platform/DouyinAdapter.ts`

- [ ] **Step 1: Add failing scaffold test for platform close-event handling**

Append this test to `tests/client-scaffold.test.js`:

```js
test('stage 3 platform adapters resolve rewarded ads from close events', () => {
  const wechat = read('assets/scripts/platform/WechatAdapter.ts');
  const douyin = read('assets/scripts/platform/DouyinAdapter.ts');

  for (const source of [wechat, douyin]) {
    assert.match(source, /onClose/);
    assert.match(source, /offClose/);
    assert.match(source, /onError/);
    assert.match(source, /offError/);
    assert.match(source, /isEnded/);
    assert.match(source, /settled/);
    assert.match(source, /cleanup\(\)/);
    assert.match(source, /rewardedAd\.show\(\)/);
    assert.match(source, /rewardedAd\.load\(\)/);
    assert.match(source, /settle\(Boolean\(result && result\.isEnded\)\)/);
  }
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because the adapters do not bind `onClose`, `onError`, or cleanup handlers yet.

- [ ] **Step 3: Implement WeChat close-event handling**

In `assets/scripts/platform/WechatAdapter.ts`, replace `showRewardAd` with:

```ts
    async showRewardAd(): Promise<boolean> {
        if (typeof wx === "undefined" || !REWARDED_AD_UNIT_ID) {
            return true;
        }
        if (typeof wx.createRewardedVideoAd !== "function") {
            return false;
        }

        const rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        if (!rewardedAd) {
            return false;
        }
        if (typeof rewardedAd.show !== "function") {
            return false;
        }

        return new Promise((resolve) => {
            let settled = false;

            function cleanup(): void {
                rewardedAd.offClose?.(handleClose);
                rewardedAd.offError?.(handleError);
            }

            function settle(value: boolean): void {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(value);
            }

            function handleClose(result: { isEnded?: boolean }): void {
                settle(Boolean(result && result.isEnded));
            }

            function handleError(): void {
                settle(false);
            }

            rewardedAd.onClose?.(handleClose);
            rewardedAd.onError?.(handleError);

            const showResult = rewardedAd.show();
            Promise.resolve(showResult).catch(() => {
                if (typeof rewardedAd.load !== "function") {
                    settle(false);
                    return;
                }
                const loadResult = rewardedAd.load();
                Promise.resolve(loadResult)
                    .then(() => rewardedAd.show())
                    .catch(() => settle(false));
            });
        });
    }
```

- [ ] **Step 4: Implement Douyin close-event handling**

In `assets/scripts/platform/DouyinAdapter.ts`, replace `showRewardAd` with:

```ts
    async showRewardAd(): Promise<boolean> {
        if (typeof tt === "undefined" || !REWARDED_AD_UNIT_ID) {
            return true;
        }
        if (typeof tt.createRewardedVideoAd !== "function") {
            return false;
        }

        const rewardedAd = tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        if (!rewardedAd) {
            return false;
        }
        if (typeof rewardedAd.show !== "function") {
            return false;
        }

        return new Promise((resolve) => {
            let settled = false;

            function cleanup(): void {
                rewardedAd.offClose?.(handleClose);
                rewardedAd.offError?.(handleError);
            }

            function settle(value: boolean): void {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(value);
            }

            function handleClose(result: { isEnded?: boolean }): void {
                settle(Boolean(result && result.isEnded));
            }

            function handleError(): void {
                settle(false);
            }

            rewardedAd.onClose?.(handleClose);
            rewardedAd.onError?.(handleError);

            const showResult = rewardedAd.show();
            Promise.resolve(showResult).catch(() => {
                if (typeof rewardedAd.load !== "function") {
                    settle(false);
                    return;
                }
                const loadResult = rewardedAd.load();
                Promise.resolve(loadResult)
                    .then(() => rewardedAd.show())
                    .catch(() => settle(false));
            });
        });
    }
```

- [ ] **Step 5: Run scaffold tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold tests PASS. Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/platform/WechatAdapter.ts assets/scripts/platform/DouyinAdapter.ts
git commit -m "feat: resolve rewarded ads from close events"
```

---

### Task 4: Documentation, Checkpoint, and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `README_CLIENT.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update README stage notes**

In `README.md`, under `### 阶段 3：平台接入`, add this completed subsection before the existing bullet list:

```markdown
阶段 3-A 已完成：

- 微信/抖音激励视频广告接入从占位成功改为监听平台关闭事件。
- 只有平台返回完整观看后才会发放广告奖励。
- 服务器 `/ad/reward` 已对齐客户端三类广告奖励类型。
- 服务器会记录广告领取次数、最近领取时间和最近领取类型，并拒绝过快重复领取。
- 客户端会随广告奖励上报奖励值、金币、分数和最高服装等级摘要，便于后续审计。
```

- [ ] **Step 2: Update client checklist**

In `README_CLIENT.md`, add this section near the existing preview checklist:

```markdown
## Stage 3-A 平台广告检查

- 浏览器预览环境仍会使用 mock 激励广告成功路径。
- 配置微信广告位 ID 后，奖励只应在 `onClose` 返回 `isEnded: true` 时发放。
- 配置抖音广告位 ID 后，奖励只应在 `onClose` 返回 `isEnded: true` 时发放。
- 提前关闭、广告加载失败或广告展示失败时，不应调用本地奖励领取逻辑。
- 后端 `/ad/reward` 只接受 `clear_low_items`、`coin_bonus`、`high_level_item`。
```

- [ ] **Step 3: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, update:

```markdown
Current development node: **Stage 2B-B completed**.
```

to:

```markdown
Current development node: **Stage 3-A completed**.
```

Add these bullets under completed capabilities:

```markdown
- WeChat and Douyin rewarded-video adapters resolve success from platform close events when real ad unit IDs are configured.
- Early ad close, SDK error, and show/load failure do not grant rewards.
- Server ad reward validation accepts the same reward types used by the client.
- Server ad reward claims record watch count, last reward type, last reward time, and client reward context.
- Rapid duplicate ad reward claims are rejected server-side.
```

Update the suggested next development stage to:

```markdown
Recommended next node: **Stage 3 platform login and request adapter integration**.

Suggested scope:

- Add platform login identity flow for WeChat and Douyin.
- Replace fetch-only remote calls with platform request adapters.
- Start leaderboard submission integration after player identity is stable.
- Keep server-authoritative board mutation out of scope until request and identity paths are reliable.
```

- [ ] **Step 4: Run full verification**

Run:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected:

- `node --test` reports all tests pass.
- `tsx --test` reports all tests pass.
- Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- README.md README_CLIENT.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: update stage 3 ad validation checkpoint"
```

---

## Final Review

After all tasks are complete:

- Run `git status --short`.
- Confirm there are no uncommitted changes.
- Summarize the completed Stage 3-A features.
- Include the verification commands and results in the final response.
