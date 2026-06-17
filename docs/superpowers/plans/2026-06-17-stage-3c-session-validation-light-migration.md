# Stage 3C Session Validation and Light Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stage 3-B session tokens server-recognized, require matching player sessions for player-owned writes, and make local legacy-save migration explicit.

**Architecture:** Keep the existing mock platform identity flow and add an in-memory server session map keyed by `sessionToken`. Server write handlers validate `Authorization: Bearer <sessionToken>` against the target `playerId`; the client stores the latest token from `loginRemote()` and attaches it only to authenticated player-owned requests.

**Tech Stack:** Cocos Creator 3.8.x TypeScript, Node.js Koa server, Node test runner, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Adds `sessions`, session registration, bearer parsing, authorization lookup, and player-session guard helpers.
  - Registers sessions during `/auth/login`.
  - Refactors player load/save and ad reward route behavior into testable handler helpers.
  - Requires session ownership for player save and ad reward writes.
- Modify `tests/server.test.js`
  - Adds server unit tests for session helpers, session registration during login, player save authorization, ad reward authorization, and public leaderboard behavior.
- Modify `assets/scripts/core/StorageManager.ts`
  - Stores latest `sessionToken` from `loginRemote()`.
  - Adds set/get/clear token helpers.
  - Adds `withAuthHeaders()` and applies it to player save, player load, and ad reward requests.
  - Persists normalized legacy local data under the player-scoped key.
- Modify `tests/client-scaffold.test.js`
  - Adds source-level guardrails for client token storage, auth header propagation, unauthenticated login/leaderboard requests, and explicit local migration behavior.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Records Stage 3-C completion and the next recommended development node.

---

### Task 1: Server Session Helpers

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing session helper tests**

Append this code to `tests/server.test.js`:

```js
test('registerAuthSession stores session records by token', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'wechat', code: 'session-code' });

  const record = server.registerAuthSession(session, 1781450000000);

  assert.deepEqual(record, {
    sessionToken: 'mock_session_wechat_wechat_mock_session-code',
    playerId: 'wechat_wechat_mock_session-code',
    platform: 'wechat',
    openid: 'wechat_mock_session-code',
    createdAt: 1781450000000,
  });
  assert.deepEqual(server.sessions.get(session.sessionToken), record);
});

test('parseBearerToken accepts bearer headers and rejects malformed values', () => {
  assert.equal(server.parseBearerToken('Bearer token-1'), 'token-1');
  assert.equal(server.parseBearerToken('bearer token-2'), 'token-2');
  assert.equal(server.parseBearerToken('Bearer   token-3  '), 'token-3');
  assert.equal(server.parseBearerToken('Token token-1'), '');
  assert.equal(server.parseBearerToken(''), '');
  assert.equal(server.parseBearerToken(undefined), '');
});

test('getSessionFromAuthorization returns stored sessions or null', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'web', code: 'demo_player' });
  const record = server.registerAuthSession(session, 1781450000000);

  assert.deepEqual(server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`), record);
  assert.equal(server.getSessionFromAuthorization('Bearer missing'), null);
  assert.equal(server.getSessionFromAuthorization(''), null);
});

test('requirePlayerSession returns session or writes auth errors', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'douyin', code: 'owner-code' });
  server.registerAuthSession(session, 1781450000000);

  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  const okSession = server.requirePlayerSession(okCtx, session.playerId);
  assert.equal(okSession.playerId, session.playerId);
  assert.equal(okCtx.status, 200);

  const missingCtx = createMockContext({}, {});
  assert.equal(server.requirePlayerSession(missingCtx, session.playerId), null);
  assert.equal(missingCtx.status, 401);
  assert.deepEqual(missingCtx.body, { ok: false, error: 'session is required' });

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  assert.equal(server.requirePlayerSession(mismatchCtx, 'wechat_other'), null);
  assert.equal(mismatchCtx.status, 403);
  assert.deepEqual(mismatchCtx.body, { ok: false, error: 'session player mismatch' });
});

test('loginPlatformPlayer registers the returned session token', () => {
  server.sessions.clear();
  const store = {};

  const session = server.loginPlatformPlayer(store, {
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  }, 1781450000000);

  assert.equal(server.sessions.get(session.sessionToken).playerId, session.playerId);
  assert.equal(server.sessions.get(session.sessionToken).createdAt, 1781450000000);
});
```

- [ ] **Step 2: Update the existing mock context helper**

Replace the existing `createMockContext(body)` helper in `tests/server.test.js` with:

```js
function createMockContext(body, headers = {}) {
  return {
    status: 200,
    request: {
      body,
      headers,
    },
    body: undefined,
    get(name) {
      return headers[String(name).toLowerCase()] || '';
    },
  };
}
```

- [ ] **Step 3: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `sessions`, `registerAuthSession`, `parseBearerToken`, `getSessionFromAuthorization`, and `requirePlayerSession` are not exported yet.

- [ ] **Step 4: Add session helpers**

In `server/server.js`, add this constant near the other top-level constants:

```js
const sessions = new Map();
```

Add these helpers after `createAuthSession`:

```js
function registerAuthSession(session, now = Date.now()) {
  const record = {
    sessionToken: session.sessionToken,
    playerId: session.playerId,
    platform: session.platform,
    openid: session.openid,
    createdAt: now,
  };
  sessions.set(session.sessionToken, record);
  return record;
}

function parseBearerToken(headerValue) {
  if (typeof headerValue !== "string") {
    return "";
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function getAuthorizationHeader(ctx) {
  if (ctx && typeof ctx.get === "function") {
    return ctx.get("authorization");
  }
  return ctx && ctx.request && ctx.request.headers
    ? ctx.request.headers.authorization || ctx.request.headers.Authorization || ""
    : "";
}

function getSessionFromAuthorization(headerValue) {
  const token = parseBearerToken(headerValue);
  return token ? sessions.get(token) || null : null;
}

function requirePlayerSession(ctx, expectedPlayerId) {
  const session = getSessionFromAuthorization(getAuthorizationHeader(ctx));
  if (!session) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session is required" };
    return null;
  }
  if (session.playerId !== expectedPlayerId) {
    ctx.status = 403;
    ctx.body = { ok: false, error: "session player mismatch" };
    return null;
  }
  return session;
}
```

In `loginPlatformPlayer`, add session registration before returning:

```js
  registerAuthSession(session, now);
```

The function should end as:

```js
  registerAuthSession(session, now);
  return session;
}
```

- [ ] **Step 5: Export session helpers**

Add these properties to `module.exports` in `server/server.js`:

```js
  sessions,
  registerAuthSession,
  parseBearerToken,
  getAuthorizationHeader,
  getSessionFromAuthorization,
  requirePlayerSession,
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
git commit -m "feat: add server auth session helpers"
```

---

### Task 2: Server Write Authorization

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing server authorization tests**

Append this code to `tests/server.test.js`:

```js
function createAuthorizedSession(platform, code, now = 1781450000000) {
  const session = server.createAuthSession({ platform, code });
  server.registerAuthSession(session, now);
  return session;
}

test('handlePlayerSave rejects missing or mismatched sessions before saving', () => {
  server.sessions.clear();
  const store = {};
  const saveData = {
    ...server.createDefaultPlayer('wechat_wechat_mock_owner'),
    coins: 50,
  };

  const missingCtx = createMockContext(saveData);
  missingCtx.params = { playerId: saveData.playerId };
  server.handlePlayerSave(missingCtx, store, 1781450000000);
  assert.equal(missingCtx.status, 401);
  assert.equal(store[saveData.playerId], undefined);

  const otherSession = createAuthorizedSession('wechat', 'other');
  const mismatchCtx = createMockContext(saveData, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: saveData.playerId };
  server.handlePlayerSave(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);
  assert.equal(store[saveData.playerId], undefined);
});

test('handlePlayerSave writes player data with a matching session', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('wechat', 'owner');
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Owner'),
    coins: 88,
    score: 120,
  };
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, 1781450000000);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].coins, 88);
  assert.equal(store[session.playerId].score, 120);
});

test('handlePlayerLoad remains public without token and rejects invalid token when supplied', () => {
  server.sessions.clear();
  const publicPlayer = server.createDefaultPlayer('public_player', 'Public');
  const store = { public_player: publicPlayer };

  const publicCtx = createMockContext({});
  publicCtx.params = { playerId: 'public_player' };
  server.handlePlayerLoad(publicCtx, store);
  assert.equal(publicCtx.status, 200);
  assert.equal(publicCtx.body.playerId, 'public_player');

  const invalidCtx = createMockContext({}, { authorization: 'Bearer missing' });
  invalidCtx.params = { playerId: 'public_player' };
  server.handlePlayerLoad(invalidCtx, store);
  assert.equal(invalidCtx.status, 401);
  assert.deepEqual(invalidCtx.body, { ok: false, error: 'session is required' });

  const otherSession = createAuthorizedSession('web', 'other');
  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: 'public_player' };
  server.handlePlayerLoad(mismatchCtx, store);
  assert.equal(mismatchCtx.status, 403);
});

test('handleAdRewardClaim requires a matching player session', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('douyin', 'reward-owner');

  const missingCtx = createMockContext({ playerId: session.playerId, rewardType: 'coin_bonus' });
  server.handleAdRewardClaim(missingCtx, store, 1781450000000);
  assert.equal(missingCtx.status, 401);

  const otherSession = createAuthorizedSession('douyin', 'reward-other');
  const mismatchCtx = createMockContext(
    { playerId: session.playerId, rewardType: 'coin_bonus' },
    { authorization: `Bearer ${otherSession.sessionToken}` }
  );
  server.handleAdRewardClaim(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext(
    { playerId: session.playerId, rewardType: 'coin_bonus' },
    { authorization: `Bearer ${session.sessionToken}` }
  );
  server.handleAdRewardClaim(okCtx, store, 1781450000000);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.ok, true);
  assert.equal(okCtx.body.rewardType, 'coin_bonus');
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `handlePlayerSave`, `handlePlayerLoad`, and `handleAdRewardClaim` are not exported yet.

- [ ] **Step 3: Add route handler helpers**

In `server/server.js`, add these helpers after `handleAuthLogin`:

```js
function handlePlayerLoad(ctx, store) {
  const { playerId } = ctx.params;
  if (!playerId) {
    sendBadRequest(ctx, "playerId is required");
    return;
  }

  const authorization = getAuthorizationHeader(ctx);
  if (authorization) {
    const session = requirePlayerSession(ctx, playerId);
    if (!session) {
      return;
    }
  }

  ctx.body = store[playerId] || createDefaultPlayer(playerId);
}

function handlePlayerSave(ctx, store, now = Date.now()) {
  const { playerId } = ctx.params;
  if (!playerId) {
    sendBadRequest(ctx, "playerId is required");
    return;
  }
  const session = requirePlayerSession(ctx, playerId);
  if (!session) {
    return;
  }

  const body = ctx.request.body || {};
  const incomingData = {
    ...body,
    playerId: body.playerId || playerId,
    nickname: body.nickname || "游客",
    lastSaveTime: now,
  };

  if (incomingData.playerId !== playerId) {
    sendBadRequest(ctx, "body.playerId must match URL playerId");
    return;
  }

  try {
    validatePlayerData(incomingData);
  } catch (error) {
    sendBadRequest(ctx, error.message);
    return;
  }

  const data = mergePlayerSaveData(store[playerId], incomingData, now);
  store[playerId] = data;
  ctx.body = {
    ok: true,
    playerId,
  };
}

function handleAdRewardClaim(ctx, store, now = Date.now()) {
  const body = ctx.request.body || {};
  const playerId = body.playerId;
  if (!playerId || typeof playerId !== "string") {
    sendBadRequest(ctx, "playerId is required");
    return;
  }
  const session = requirePlayerSession(ctx, playerId);
  if (!session) {
    return;
  }

  try {
    ctx.body = claimAdRewardForPlayer(store, body, now);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}
```

- [ ] **Step 4: Wire Koa routes through helpers**

Replace the current `router.get("/player/:playerId", ...)` body with:

```js
  router.get("/player/:playerId", (ctx) => {
    const store = readPlayerStore();
    handlePlayerLoad(ctx, store);
  });
```

Replace the current `router.post("/player/:playerId", ...)` body with:

```js
  router.post("/player/:playerId", (ctx) => {
    const store = readPlayerStore();
    handlePlayerSave(ctx, store);
    if (ctx.status !== 400 && ctx.status !== 401 && ctx.status !== 403) {
      writePlayerStore(store);
    }
  });
```

Replace the current `router.post("/ad/reward", ...)` body with:

```js
  router.post("/ad/reward", (ctx) => {
    const store = readPlayerStore();
    handleAdRewardClaim(ctx, store);
    if (ctx.status !== 400 && ctx.status !== 401 && ctx.status !== 403) {
      writePlayerStore(store);
    }
  });
```

- [ ] **Step 5: Export route handler helpers**

Add these properties to `module.exports`:

```js
  handlePlayerLoad,
  handlePlayerSave,
  handleAdRewardClaim,
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
git commit -m "feat: require sessions for player writes"
```

---

### Task 3: Client Session Token Propagation

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`

- [ ] **Step 1: Write failing scaffold tests**

Append this code to `tests/client-scaffold.test.js`:

```js
test('stage 3C storage manager stores session tokens from remote login', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /private sessionToken = ""/);
  assert.match(storage, /setSessionToken\(sessionToken: string\): void/);
  assert.match(storage, /getSessionToken\(\): string/);
  assert.match(storage, /clearSessionToken\(\): void/);
  assert.match(storage, /this\.setSessionToken\(response\.sessionToken\)/);
  assert.match(storage, /if \(response && response\.ok && response\.sessionToken\)/);
});

test('stage 3C storage manager attaches auth headers only to player-owned requests', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /private withAuthHeaders\(headers: Record<string, string> = \{\}\): Record<string, string>/);
  assert.match(storage, /Authorization: `Bearer \$\{this\.sessionToken\}`/);
  assert.match(storage, /headers: this\.withAuthHeaders\(\{ "Content-Type": "application\/json" \}\)/);
  assert.match(storage, /this\.request\(`\/player\/\$\{playerData\.playerId\}`/);
  assert.match(storage, /this\.request\(`\/player\/\$\{playerId\}`/);
  assert.match(storage, /this\.request\("\/ad\/reward"/);
  assert.match(storage, /this\.request\("\/auth\/login", \{\s*method: "POST",\s*headers: \{ "Content-Type": "application\/json" \}/s);
  assert.match(storage, /this\.request\("\/leaderboard", \{ method: "GET" \}/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `sessionToken`, token helpers, and auth header propagation do not exist yet.

- [ ] **Step 3: Add token state and helper methods**

In `assets/scripts/core/StorageManager.ts`, add this field under `remoteBaseUrl`:

```ts
    private sessionToken = "";
```

Add these methods before `saveLocal`:

```ts
    setSessionToken(sessionToken: string): void {
        this.sessionToken = sessionToken.trim();
    }

    getSessionToken(): string {
        return this.sessionToken;
    }

    clearSessionToken(): void {
        this.sessionToken = "";
    }
```

Add this helper before `request`:

```ts
    private withAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
        if (!this.sessionToken) {
            return headers;
        }
        return {
            ...headers,
            Authorization: `Bearer ${this.sessionToken}`,
        };
    }
```

- [ ] **Step 4: Store token from login response**

In `loginRemote`, replace:

```ts
            return response as AuthLoginResponse;
```

with:

```ts
            if (response && response.ok && response.sessionToken) {
                this.setSessionToken(response.sessionToken);
            }
            return response as AuthLoginResponse;
```

- [ ] **Step 5: Attach auth headers to player-owned requests**

In `saveRemote`, replace:

```ts
                headers: { "Content-Type": "application/json" },
```

with:

```ts
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
```

In `loadRemote`, replace:

```ts
            const response = await this.request(`/player/${playerId}`, { method: "GET" });
```

with:

```ts
            const response = await this.request(`/player/${playerId}`, {
                method: "GET",
                headers: this.withAuthHeaders(),
            });
```

In `claimAdReward`, replace:

```ts
                headers: { "Content-Type": "application/json" },
```

with:

```ts
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
```

Do not change `loginRemote` headers beyond token storage. Do not change `loadLeaderboard`.

- [ ] **Step 6: Run scaffold tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold tests PASS. Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/core/StorageManager.ts
git commit -m "feat: attach session tokens to remote requests"
```

---

### Task 4: Explicit Local Legacy Migration

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`

- [ ] **Step 1: Write failing scaffold test**

Append this code to `tests/client-scaffold.test.js`:

```js
test('stage 3C storage manager saves normalized legacy local data under player key', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /const scopedRaw = sys\.localStorage\.getItem\(this\.getLocalSaveKey\(playerId\)\)/);
  assert.match(storage, /if \(scopedRaw\) \{/);
  assert.match(storage, /const legacyRaw = sys\.localStorage\.getItem\(LEGACY_LOCAL_SAVE_KEY\)/);
  assert.match(storage, /const data = JSON\.parse\(legacyRaw\) as PlayerData/);
  assert.match(storage, /data\.playerId = playerId/);
  assert.match(storage, /sys\.localStorage\.setItem\(this\.getLocalSaveKey\(playerId\), JSON\.stringify\(data\)\)/);
  assert.doesNotMatch(storage, /removeItem\(LEGACY_LOCAL_SAVE_KEY\)/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `loadLocal` does not explicitly separate scoped and legacy reads or save normalized legacy data under the player key.

- [ ] **Step 3: Update `loadLocal` to migrate legacy data**

Replace `loadLocal` in `assets/scripts/core/StorageManager.ts` with:

```ts
    loadLocal(playerId: string): PlayerData | null {
        try {
            const scopedRaw = sys.localStorage.getItem(this.getLocalSaveKey(playerId));
            if (scopedRaw) {
                return JSON.parse(scopedRaw) as PlayerData;
            }

            const legacyRaw = sys.localStorage.getItem(LEGACY_LOCAL_SAVE_KEY);
            if (!legacyRaw) {
                return null;
            }
            const data = JSON.parse(legacyRaw) as PlayerData;
            data.playerId = playerId;
            sys.localStorage.setItem(this.getLocalSaveKey(playerId), JSON.stringify(data));
            return data;
        } catch (error) {
            console.warn("[StorageManager] loadLocal failed", error);
            return null;
        }
    }
```

- [ ] **Step 4: Run scaffold tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold tests PASS. Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/core/StorageManager.ts
git commit -m "feat: migrate legacy local saves by player"
```

---

### Task 5: Checkpoint and Final Verification

**Files:**
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, update:

```markdown
Current development node: **Stage 3-B completed**.
```

to:

```markdown
Current development node: **Stage 3-C completed**.
```

Add these bullets under completed capabilities:

```markdown
- Server stores issued mock session tokens in memory after `/auth/login`.
- Player saves and ad reward claims require a matching bearer session token.
- Player reads validate bearer tokens when supplied while preserving public preview fallback without a token.
- Client stores the latest `sessionToken` and attaches it to player save, player load, and ad reward validation requests.
- Legacy local saves are normalized and written to the authenticated player-scoped key without a backend migration endpoint.
```

Replace the current resume node section with:

```markdown
## Current Resume Node

Current development node for next session: **Stage 3-D planning pending**.

Recommended next node: real platform code exchange design, persistent session/token expiry design, or server-authoritative board mutation design after session ownership has been verified in preview.
```

Update the suggested next development stage to:

```markdown
Recommended next node: **Stage 3-D planning**.

Suggested scope:

- Decide whether to integrate real WeChat/Douyin code exchange and secret handling.
- Decide whether sessions need persistence and expiration.
- Consider server-authoritative board mutation after authenticated request ownership is stable.
```

- [ ] **Step 2: Run full verification**

Run:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected:

- `node --test` reports all tests pass.
- `tsx --test` reports all tests pass.
- Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3c session checkpoint"
```

---

## Final Review

After all tasks are complete:

- Run `git status --short`.
- Confirm there are no uncommitted changes.
- Summarize the completed Stage 3-C features.
- Include the verification commands and results in the final response.
