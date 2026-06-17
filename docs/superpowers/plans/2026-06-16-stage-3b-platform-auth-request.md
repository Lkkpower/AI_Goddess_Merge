# Stage 3B Platform Auth Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic platform login, platform-aware request adapters, authenticated player selection, and player-scoped local saves.

**Architecture:** Keep the existing client flow intact while introducing a platform auth boundary: `GameManager` asks `PlatformManager` for login, `StorageManager` exchanges that login with `/auth/login`, and all remote calls use `PlatformManager.request()`. Server auth remains deterministic and mock-backed so WeChat, Douyin, and browser preview can share one stable contract before real secret exchange is introduced.

**Tech Stack:** Cocos Creator 3.8.x TypeScript, Node.js Koa server, Node test runner, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Adds auth platform constants, mock openid resolution, session creation, and `POST /auth/login`.
  - Keeps existing player persistence and leaderboard behavior unchanged.
- Modify `tests/server.test.js`
  - Adds unit tests for deterministic mock identities, session creation, player creation, repeated login preservation, and validation errors.
- Modify `assets/scripts/platform/PlatformManager.ts`
  - Exports `PlatformName`, `PlatformLoginResult`, `PlatformRequestOptions`, and `PlatformResponse`.
  - Adds `PlatformManager.request()` and upgrades browser preview login to return a standard result.
- Modify `assets/scripts/platform/WechatAdapter.ts`
  - Standardizes `login()` output and adds a `wx.request` wrapper with fetch fallback.
- Modify `assets/scripts/platform/DouyinAdapter.ts`
  - Mirrors WeChat login and request behavior for `tt`.
- Modify `assets/scripts/core/StorageManager.ts`
  - Adds auth payload/result interfaces and `loginRemote()`.
  - Routes all remote calls through `platformManager.request()`.
  - Scopes local saves by `playerId` with legacy fallback normalization.
- Modify `assets/scripts/core/GameManager.ts`
  - Adds async auth initialization before selecting the player id.
  - Keeps local play available when auth or remote calls fail.
- Modify `tests/client-scaffold.test.js`
  - Adds source-level integration guardrails for exported types, auth calls, request routing, async initialization, and player-scoped local keys.
- Modify `tests/platform-adapter.test.ts`
  - Adds behavior tests for request wrappers and standardized login output.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Updates the checkpoint after implementation and verification.

---

### Task 1: Server Auth Session

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing server auth tests**

Append this code to `tests/server.test.js`:

```js
test('resolveMockPlatformOpenId maps supported platforms deterministically', () => {
  assert.equal(server.resolveMockPlatformOpenId('wechat', 'abc123'), 'wechat_mock_abc123');
  assert.equal(server.resolveMockPlatformOpenId('douyin', 'abc123'), 'douyin_mock_abc123');
  assert.equal(server.resolveMockPlatformOpenId('web', 'demo_player'), 'web_mock_demo_player');
  assert.throws(() => server.resolveMockPlatformOpenId('ios', 'abc123'), /platform is not supported/);
});

test('createAuthSession returns deterministic player identity and token', () => {
  const session = server.createAuthSession({
    platform: 'wechat',
    code: 'login-code',
  });

  assert.deepEqual(session, {
    ok: true,
    platform: 'wechat',
    openid: 'wechat_mock_login-code',
    playerId: 'wechat_wechat_mock_login-code',
    sessionToken: 'mock_session_wechat_wechat_mock_login-code',
  });
});

test('createAuthSession trims auth input and rejects invalid payloads', () => {
  assert.equal(
    server.createAuthSession({ platform: ' douyin ', code: ' code-1 ' }).playerId,
    'douyin_douyin_mock_code-1'
  );
  assert.throws(() => server.createAuthSession({ platform: '', code: 'x' }), /platform is required/);
  assert.throws(() => server.createAuthSession({ platform: 'ios', code: 'x' }), /platform is not supported/);
  assert.throws(() => server.createAuthSession({ platform: 'web', code: '' }), /code is required/);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `resolveMockPlatformOpenId` and `createAuthSession` are not exported yet.

- [ ] **Step 3: Add server auth helpers**

In `server/server.js`, add this constant near `ALLOWED_REWARD_TYPES`:

```js
const ALLOWED_AUTH_PLATFORMS = ["wechat", "douyin", "web"];
```

Add these helper functions after `mergePlayerSaveData`:

```js
function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function resolveMockPlatformOpenId(platform, code) {
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  return `${platform}_mock_${code}`;
}

function createAuthSession(payload) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }

  const openid = resolveMockPlatformOpenId(platform, code);
  const playerId = `${platform}_${openid}`;
  return {
    ok: true,
    platform,
    openid,
    playerId,
    sessionToken: `mock_session_${playerId}`,
  };
}
```

- [ ] **Step 4: Export server auth helpers**

Add these properties to `module.exports` in `server/server.js`:

```js
  ALLOWED_AUTH_PLATFORMS,
  normalizeRequiredString,
  resolveMockPlatformOpenId,
  createAuthSession,
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
git add -- tests/server.test.js server/server.js
git commit -m "feat: add mock platform auth sessions"
```

---

### Task 2: Server Auth Endpoint

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing endpoint tests**

Append this helper and tests to `tests/server.test.js`:

```js
function createMockContext(body) {
  return {
    status: 200,
    request: { body },
    body: undefined,
  };
}

test('loginPlatformPlayer creates a default player record for a new auth session', () => {
  const store = {};
  const ctx = createMockContext({
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  });

  const result = server.loginPlatformPlayer(store, ctx.request.body, 1781450000000);

  assert.equal(result.ok, true);
  assert.equal(result.platform, 'wechat');
  assert.equal(result.openid, 'wechat_mock_login-code');
  assert.equal(result.playerId, 'wechat_wechat_mock_login-code');
  assert.equal(result.sessionToken, 'mock_session_wechat_wechat_mock_login-code');
  assert.equal(store['wechat_wechat_mock_login-code'].nickname, 'Auth Nick');
  assert.equal(store['wechat_wechat_mock_login-code'].lastSaveTime, 1781450000000);
});

test('loginPlatformPlayer preserves existing gameplay data on repeat login', () => {
  const store = {
    web_web_mock_demo_player: {
      ...server.createDefaultPlayer('web_web_mock_demo_player', 'Existing'),
      coins: 300,
      score: 900,
      highestItemLevel: 7,
    },
  };

  const result = server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'demo_player',
    nickname: 'New Nick',
  });

  assert.equal(result.playerId, 'web_web_mock_demo_player');
  assert.equal(store.web_web_mock_demo_player.nickname, 'Existing');
  assert.equal(store.web_web_mock_demo_player.coins, 300);
  assert.equal(store.web_web_mock_demo_player.score, 900);
  assert.equal(store.web_web_mock_demo_player.highestItemLevel, 7);
});

test('handleAuthLogin writes auth result or bad request response', () => {
  const store = {};
  const okCtx = createMockContext({ platform: 'douyin', code: 'abc', nickname: 'Douyin' });

  server.handleAuthLogin(okCtx, store, 1781450000000);

  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.playerId, 'douyin_douyin_mock_abc');
  assert.equal(store.douyin_douyin_mock_abc.nickname, 'Douyin');

  const badCtx = createMockContext({ platform: 'ios', code: 'abc' });
  server.handleAuthLogin(badCtx, store, 1781450000000);

  assert.equal(badCtx.status, 400);
  assert.deepEqual(badCtx.body, {
    ok: false,
    error: 'platform is not supported',
  });
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `loginPlatformPlayer` and `handleAuthLogin` are not exported yet.

- [ ] **Step 3: Add endpoint helpers**

In `server/server.js`, add these functions after `createAuthSession`:

```js
function loginPlatformPlayer(store, payload, now = Date.now()) {
  const session = createAuthSession(payload);
  const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : "";

  if (!store[session.playerId]) {
    const player = createDefaultPlayer(session.playerId, nickname || "游客");
    player.lastSaveTime = now;
    store[session.playerId] = player;
  }

  return session;
}

function handleAuthLogin(ctx, store, now = Date.now()) {
  try {
    ctx.body = loginPlatformPlayer(store, ctx.request.body || {}, now);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}
```

- [ ] **Step 4: Add `POST /auth/login` route**

In `createApp()`, add this route before `router.get("/player/:playerId", ...)`:

```js
  router.post("/auth/login", (ctx) => {
    const store = readPlayerStore();
    handleAuthLogin(ctx, store);
    if (ctx.status !== 400) {
      writePlayerStore(store);
    }
  });
```

- [ ] **Step 5: Export endpoint helpers**

Add these properties to `module.exports` in `server/server.js`:

```js
  loginPlatformPlayer,
  handleAuthLogin,
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
git commit -m "feat: add platform auth login endpoint"
```

---

### Task 3: Platform Request and Login Adapters

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `tests/platform-adapter.test.ts`
- Modify: `assets/scripts/platform/PlatformManager.ts`
- Modify: `assets/scripts/platform/WechatAdapter.ts`
- Modify: `assets/scripts/platform/DouyinAdapter.ts`

- [ ] **Step 1: Write failing scaffold test for shared platform contracts**

Append this test to `tests/client-scaffold.test.js`:

```js
test('stage 3B platform manager exports login and request contracts', () => {
  const platform = read('assets/scripts/platform/PlatformManager.ts');

  assert.match(platform, /export type PlatformName = "wechat" \| "douyin" \| "web"/);
  assert.match(platform, /export interface PlatformLoginResult/);
  assert.match(platform, /platform: PlatformName/);
  assert.match(platform, /code: string/);
  assert.match(platform, /playerId\?: string/);
  assert.match(platform, /export interface PlatformRequestOptions/);
  assert.match(platform, /export interface PlatformResponse<T = any>/);
  assert.match(platform, /request\(url: string, options\?: PlatformRequestOptions\): Promise<PlatformResponse>/);
  assert.match(platform, /return this\.getAdapter\(\)\.request\(url, options\)/);
});
```

- [ ] **Step 2: Write failing adapter behavior tests**

Append this code to `tests/platform-adapter.test.ts`:

```ts
test('WechatAdapter returns a standard mock login when SDK is unavailable', async () => {
    delete (globalThis as any).wx;

    const login = await new WechatAdapter().login();

    assert.deepEqual(login, {
        platform: "wechat",
        code: "mock_wechat_code",
        mock: true,
    });
});

test('DouyinAdapter returns a standard mock login when SDK is unavailable', async () => {
    delete (globalThis as any).tt;

    const login = await new DouyinAdapter().login();

    assert.deepEqual(login, {
        platform: "douyin",
        code: "mock_douyin_code",
        mock: true,
    });
});

test('WechatAdapter wraps wx.request responses', async () => {
    let requestOptions: any = null;
    (globalThis as any).wx = {
        request(options: any) {
            requestOptions = options;
            options.success({
                statusCode: 201,
                data: { ok: true },
            });
        },
    };

    const response = await new WechatAdapter().request("http://example.test/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "wechat" }),
    });

    assert.equal(response.ok, true);
    assert.equal(response.status, 201);
    assert.deepEqual(response.data, { ok: true });
    assert.equal(requestOptions.url, "http://example.test/auth/login");
    assert.equal(requestOptions.method, "POST");
    assert.deepEqual(requestOptions.header, { "Content-Type": "application/json" });
    assert.deepEqual(requestOptions.data, { platform: "wechat" });
});

test('DouyinAdapter wraps tt.request failures as rejected promises', async () => {
    (globalThis as any).tt = {
        request(options: any) {
            options.fail({ errMsg: "network failed" });
        },
    };

    await assert.rejects(
        () => new DouyinAdapter().request("http://example.test/player/demo", { method: "GET" }),
        /network failed/
    );
});
```

- [ ] **Step 3: Run scaffold and adapter tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\platform-adapter.test.ts
```

Expected: FAIL because platform request contracts and adapter request wrappers do not exist yet.

- [ ] **Step 4: Add shared platform contracts and browser request behavior**

In `assets/scripts/platform/PlatformManager.ts`, replace the private `type PlatformName` and `WebAdapter` login with these exports and methods:

```ts
export type PlatformName = "wechat" | "douyin" | "web";

export interface PlatformLoginResult {
    platform: PlatformName;
    code: string;
    mock?: boolean;
    playerId?: string;
}

export interface PlatformRequestOptions {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
}

export interface PlatformResponse<T = any> {
    ok: boolean;
    status: number;
    data: T;
}

async function requestWithFetch(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
    if (typeof fetch !== "function") {
        throw new Error("fetch is not available in this runtime");
    }
    const response = await fetch(url, options as RequestInit);
    return {
        ok: response.ok,
        status: response.status,
        data: await response.json(),
    };
}

class WebAdapter {
    async login(): Promise<PlatformLoginResult> {
        return { platform: "web", code: "demo_player", mock: true, playerId: "web_demo_player" };
    }

    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        return requestWithFetch(url, options);
    }
```

In `PlatformManager`, change `login()` and add `request()`:

```ts
    login(): Promise<PlatformLoginResult> {
        return this.getAdapter().login();
    }

    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        return this.getAdapter().request(url, options);
    }
```

- [ ] **Step 5: Add WeChat login and request wrapper**

In `assets/scripts/platform/WechatAdapter.ts`, add this import at the top:

```ts
import type { PlatformLoginResult, PlatformRequestOptions, PlatformResponse } from "./PlatformManager";
```

Replace `login()` with:

```ts
    async login(): Promise<PlatformLoginResult> {
        if (typeof wx === "undefined" || typeof wx.login !== "function") {
            return { platform: "wechat", code: "mock_wechat_code", mock: true };
        }
        return new Promise((resolve, reject) => {
            wx.login({
                success: (result: { code?: string }) => {
                    if (result && typeof result.code === "string" && result.code.trim()) {
                        resolve({ platform: "wechat", code: result.code.trim() });
                    } else {
                        reject(new Error("wechat login code is missing"));
                    }
                },
                fail: reject,
            });
        });
    }
```

Add this method before `showRewardAd()`:

```ts
    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        if (typeof wx === "undefined" || typeof wx.request !== "function") {
            return requestWithFetch(url, options);
        }

        return new Promise((resolve, reject) => {
            wx.request({
                url,
                method: options.method || "GET",
                header: options.headers || {},
                data: parseRequestBody(options.body),
                success: (result: { statusCode?: number; data?: any }) => {
                    const status = Number(result.statusCode) || 0;
                    resolve({
                        ok: status >= 200 && status < 300,
                        status,
                        data: result.data,
                    });
                },
                fail: (error: any) => reject(new Error(error && error.errMsg ? error.errMsg : "wechat request failed")),
            });
        });
    }
```

Add this helper above the class:

```ts
async function requestWithFetch(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
    if (typeof fetch !== "function") {
        throw new Error("fetch is not available in this runtime");
    }
    const response = await fetch(url, options as RequestInit);
    return {
        ok: response.ok,
        status: response.status,
        data: await response.json(),
    };
}

function parseRequestBody(body?: string): any {
    if (!body) {
        return undefined;
    }
    try {
        return JSON.parse(body);
    } catch (error) {
        return body;
    }
}
```

- [ ] **Step 6: Add Douyin login and request wrapper**

In `assets/scripts/platform/DouyinAdapter.ts`, add this import at the top:

```ts
import type { PlatformLoginResult, PlatformRequestOptions, PlatformResponse } from "./PlatformManager";
```

Replace `login()` with:

```ts
    async login(): Promise<PlatformLoginResult> {
        if (typeof tt === "undefined" || typeof tt.login !== "function") {
            return { platform: "douyin", code: "mock_douyin_code", mock: true };
        }
        return new Promise((resolve, reject) => {
            tt.login({
                success: (result: { code?: string }) => {
                    if (result && typeof result.code === "string" && result.code.trim()) {
                        resolve({ platform: "douyin", code: result.code.trim() });
                    } else {
                        reject(new Error("douyin login code is missing"));
                    }
                },
                fail: reject,
            });
        });
    }
```

Add this method before `showRewardAd()`:

```ts
    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        if (typeof tt === "undefined" || typeof tt.request !== "function") {
            return requestWithFetch(url, options);
        }

        return new Promise((resolve, reject) => {
            tt.request({
                url,
                method: options.method || "GET",
                header: options.headers || {},
                data: parseRequestBody(options.body),
                success: (result: { statusCode?: number; data?: any }) => {
                    const status = Number(result.statusCode) || 0;
                    resolve({
                        ok: status >= 200 && status < 300,
                        status,
                        data: result.data,
                    });
                },
                fail: (error: any) => reject(new Error(error && error.errMsg ? error.errMsg : "douyin request failed")),
            });
        });
    }
```

Add this helper above the class:

```ts
async function requestWithFetch(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
    if (typeof fetch !== "function") {
        throw new Error("fetch is not available in this runtime");
    }
    const response = await fetch(url, options as RequestInit);
    return {
        ok: response.ok,
        status: response.status,
        data: await response.json(),
    };
}

function parseRequestBody(body?: string): any {
    if (!body) {
        return undefined;
    }
    try {
        return JSON.parse(body);
    } catch (error) {
        return body;
    }
}
```

- [ ] **Step 7: Run platform tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold and adapter tests PASS. Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js tests/platform-adapter.test.ts assets/scripts/platform/PlatformManager.ts assets/scripts/platform/WechatAdapter.ts assets/scripts/platform/DouyinAdapter.ts
git commit -m "feat: add platform request adapters"
```

---

### Task 4: Storage Auth and Player-Scoped Local Saves

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`

- [ ] **Step 1: Write failing scaffold test for storage auth and request routing**

Append this test to `tests/client-scaffold.test.js`:

```js
test('stage 3B storage manager authenticates remotely through platform requests', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /import \{ platformManager, PlatformName/);
  assert.match(storage, /export interface AuthLoginPayload/);
  assert.match(storage, /platform: PlatformName/);
  assert.match(storage, /export interface AuthLoginResponse/);
  assert.match(storage, /sessionToken: string/);
  assert.match(storage, /loginRemote\(payload: AuthLoginPayload\): Promise<AuthLoginResponse \| null>/);
  assert.match(storage, /this\.request\("\/auth\/login"/);
  assert.match(storage, /platformManager\.request\(`\$\{this\.remoteBaseUrl\}\$\{path\}`/);
  assert.doesNotMatch(storage, /await fetch\(`/);
});

test('stage 3B storage manager scopes local saves by selected player id', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /const LEGACY_LOCAL_SAVE_KEY = "AI_GODDESS_MERGE_PLAYER_DATA"/);
  assert.match(storage, /private getLocalSaveKey\(playerId: string\): string/);
  assert.match(storage, /AI_GODDESS_MERGE_PLAYER_DATA_\$\{playerId\}/);
  assert.match(storage, /saveLocal\(playerData: PlayerData\): void/);
  assert.match(storage, /sys\.localStorage\.setItem\(this\.getLocalSaveKey\(data\.playerId\)/);
  assert.match(storage, /loadLocal\(playerId: string\): PlayerData \| null/);
  assert.match(storage, /sys\.localStorage\.getItem\(this\.getLocalSaveKey\(playerId\)\)/);
  assert.match(storage, /sys\.localStorage\.getItem\(LEGACY_LOCAL_SAVE_KEY\)/);
  assert.match(storage, /data\.playerId = playerId/);
  assert.match(storage, /clearLocal\(playerId: string\): void/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because storage auth, platform request routing, and player-scoped local keys do not exist yet.

- [ ] **Step 3: Add auth interfaces and platform import**

In `assets/scripts/core/StorageManager.ts`, add this import:

```ts
import { platformManager, PlatformName, PlatformRequestOptions } from "../platform/PlatformManager";
```

Replace `const LOCAL_SAVE_KEY = "AI_GODDESS_MERGE_PLAYER_DATA";` with:

```ts
const LEGACY_LOCAL_SAVE_KEY = "AI_GODDESS_MERGE_PLAYER_DATA";
```

Add these interfaces after `AdRewardClaimPayload`:

```ts
export interface AuthLoginPayload {
    platform: PlatformName;
    code: string;
    nickname?: string;
}

export interface AuthLoginResponse {
    ok: boolean;
    platform: PlatformName;
    openid: string;
    playerId: string;
    sessionToken: string;
}
```

- [ ] **Step 4: Implement player-scoped local save methods**

Replace `saveLocal`, `loadLocal`, and `clearLocal` in `assets/scripts/core/StorageManager.ts` with:

```ts
    saveLocal(playerData: PlayerData): void {
        try {
            const data = clonePlayerData(playerData);
            data.lastSaveTime = Date.now();
            sys.localStorage.setItem(this.getLocalSaveKey(data.playerId), JSON.stringify(data));
        } catch (error) {
            console.warn("[StorageManager] saveLocal failed", error);
        }
    }

    loadLocal(playerId: string): PlayerData | null {
        try {
            const raw = sys.localStorage.getItem(this.getLocalSaveKey(playerId))
                || sys.localStorage.getItem(LEGACY_LOCAL_SAVE_KEY);
            if (!raw) {
                return null;
            }
            const data = JSON.parse(raw) as PlayerData;
            data.playerId = playerId;
            return data;
        } catch (error) {
            console.warn("[StorageManager] loadLocal failed", error);
            return null;
        }
    }

    clearLocal(playerId: string): void {
        try {
            sys.localStorage.removeItem(this.getLocalSaveKey(playerId));
        } catch (error) {
            console.warn("[StorageManager] clearLocal failed", error);
        }
    }

    private getLocalSaveKey(playerId: string): string {
        return `AI_GODDESS_MERGE_PLAYER_DATA_${playerId}`;
    }
```

- [ ] **Step 5: Add remote login and platform request routing**

In `assets/scripts/core/StorageManager.ts`, add this method before `saveRemote`:

```ts
    async loginRemote(payload: AuthLoginPayload): Promise<AuthLoginResponse | null> {
        try {
            const response = await this.request("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            return response as AuthLoginResponse;
        } catch (error) {
            console.warn("[StorageManager] loginRemote failed", error);
            return null;
        }
    }
```

Replace the private `request` method with:

```ts
    private async request(path: string, options: PlatformRequestOptions): Promise<any> {
        const response = await platformManager.request(`${this.remoteBaseUrl}${path}`, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.data;
    }
```

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
git commit -m "feat: add authenticated storage requests"
```

---

### Task 5: Game Auth Initialization

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/GameManager.ts`

- [ ] **Step 1: Write failing scaffold test for async auth initialization**

Append this test to `tests/client-scaffold.test.js`:

```js
test('stage 3B game manager authenticates before selecting local player data', () => {
  const gameManager = read('assets/scripts/core/GameManager.ts');

  assert.match(gameManager, /import \{ platformManager \}/);
  assert.match(gameManager, /private readonly fallbackPlayerId = "demo_player"/);
  assert.match(gameManager, /onLoad\(\): void/);
  assert.match(gameManager, /this\.initGameAsync\(\)/);
  assert.match(gameManager, /private async initGameAsync\(\): Promise<void>/);
  assert.match(gameManager, /const playerId = await this\.resolvePlayerId\(\)/);
  assert.match(gameManager, /private async resolvePlayerId\(\): Promise<string>/);
  assert.match(gameManager, /const login = await platformManager\.login\(\)/);
  assert.match(gameManager, /const auth = await storageManager\.loginRemote\(\{/);
  assert.match(gameManager, /platform: login\.platform/);
  assert.match(gameManager, /code: login\.code/);
  assert.match(gameManager, /return auth\.playerId/);
  assert.match(gameManager, /return login\.playerId \|\| this\.fallbackPlayerId/);
  assert.match(gameManager, /storageManager\.loadLocal\(playerId\)/);
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `GameManager` still initializes synchronously with `demo_player`.

- [ ] **Step 3: Import platform manager and add fallback field**

In `assets/scripts/core/GameManager.ts`, add this import:

```ts
import { platformManager } from "../platform/PlatformManager";
```

Add this field below `private initialized = false;`:

```ts
    private readonly fallbackPlayerId = "demo_player";
```

- [ ] **Step 4: Route `onLoad` through async initialization**

Replace this line in `onLoad()`:

```ts
        this.initGame();
```

with:

```ts
        this.initGameAsync().catch((error) => {
            console.warn("[GameManager] async init failed", error);
            this.initGame(this.fallbackPlayerId);
        });
```

Add this method before `initGame`:

```ts
    private async initGameAsync(): Promise<void> {
        const playerId = await this.resolvePlayerId();
        this.initGame(playerId);
    }
```

- [ ] **Step 5: Add player id resolution**

Add this method before `getPlayerData()`:

```ts
    private async resolvePlayerId(): Promise<string> {
        try {
            const login = await platformManager.login();
            const auth = await storageManager.loginRemote({
                platform: login.platform,
                code: login.code,
            });
            if (auth && auth.ok && auth.playerId) {
                return auth.playerId;
            }
            return login.playerId || this.fallbackPlayerId;
        } catch (error) {
            console.warn("[GameManager] platform auth failed", error);
            return this.fallbackPlayerId;
        }
    }
```

- [ ] **Step 6: Use selected player id when loading local data**

Replace `loadGame` with:

```ts
    loadGame(playerId: string = this.fallbackPlayerId): void {
        const localData = storageManager.loadLocal(playerId);
        this.playerData = localData ? normalizePlayerData(localData) : createDefaultPlayerData(playerId);
    }
```

Replace `getPlayerData()` with:

```ts
    getPlayerData(): PlayerData {
        if (!this.playerData) {
            this.playerData = createDefaultPlayerData(this.fallbackPlayerId);
        }
        return this.playerData;
    }
```

- [ ] **Step 7: Run scaffold tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold tests PASS. Filtered TypeScript command prints no `assets/scripts` output.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/core/GameManager.ts
git commit -m "feat: initialize game with platform auth"
```

---

### Task 6: Checkpoint and Final Verification

**Files:**
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, update the current completed stage from:

```markdown
Current development node: **Stage 3-A completed**.
```

to:

```markdown
Current development node: **Stage 3-B completed**.
```

Add these bullets under completed capabilities:

```markdown
- Server `/auth/login` returns deterministic mock identities for WeChat, Douyin, and web preview.
- Platform adapters expose standardized login results and request wrappers.
- Remote save, remote load, leaderboard, and ad reward validation route through `PlatformManager.request()`.
- Game initialization selects an authenticated `playerId` when auth succeeds and keeps local play available when auth fails.
- Local saves are scoped by selected `playerId` with legacy fallback normalization.
```

Replace the current resume node section with:

```markdown
## Current Resume Node

Current development node for next session: **Stage 3-C planning pending**.

Recommended next node: server-side session validation and account migration design, or server-authoritative board mutation design after platform identity has been verified in preview.
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
git commit -m "docs: record stage 3b auth checkpoint"
```

---

## Final Review

After all tasks are complete:

- Run `git status --short`.
- Confirm there are no uncommitted changes.
- Summarize the completed Stage 3B features.
- Include the verification commands and results in the final response.
