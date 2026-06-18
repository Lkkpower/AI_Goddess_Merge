# Stage 3-D Platform Code Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side WeChat/Douyin code-exchange boundary with mock fallback and session expiration while preserving Stage 3-C client auth behavior.

**Architecture:** Keep the current single-file Koa server pattern, but introduce focused helper functions inside `server/server.js` for platform auth config, provider exchange, auth-session creation from normalized identity, and session expiration. `/auth/login` becomes async and uses injected/default fetch for real platform exchange; local preview remains deterministic when platform credentials are incomplete.

**Tech Stack:** Node.js Koa server, Node test runner, Cocos Creator 3.8.x TypeScript client, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Adds platform auth config constants and helpers.
  - Adds provider response parsing and fetch-based exchange helpers.
  - Adds `createAuthSessionFromIdentity()` and changes `createAuthSession()` to use the exchange boundary for mock identity.
  - Adds session TTL and expiration helpers.
  - Updates auth login route and helper functions to async.
  - Exports all new helpers for unit tests.
- Modify `tests/server.test.js`
  - Adds unit tests for config resolution, mock fallback, real provider exchange, provider failure, session expiration, and async auth login.
  - Updates existing auth/session tests for `expiresAt` and async login helpers.
- Modify `assets/scripts/core/StorageManager.ts`
  - Adds required `expiresAt: number` to `AuthLoginResponse`.
- Modify `tests/client-scaffold.test.js`
  - Adds guardrails that client login contract accepts `expiresAt`.
  - Adds guardrails that client source does not contain platform app secret names.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Records Stage 3-D completion and next recommended node.

---

### Task 1: Platform Auth Config and Mock Identity Boundary

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing config and mock exchange tests**

Append this code after the existing `resolveMockPlatformOpenId maps supported platforms deterministically` test in `tests/server.test.js`:

```js
test('resolvePlatformAuthConfig reads platform credentials and session ttl', () => {
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
    DOUYIN_APP_ID: 'dy-app',
    DOUYIN_APP_SECRET: 'dy-secret',
    DOUYIN_CODE_EXCHANGE_URL: 'https://douyin.example/code',
    AUTH_SESSION_TTL_MS: '60000',
  });

  assert.equal(config.wechat.appId, 'wx-app');
  assert.equal(config.wechat.appSecret, 'wx-secret');
  assert.equal(config.wechat.exchangeUrl, 'https://wechat.example/code');
  assert.equal(config.douyin.appId, 'dy-app');
  assert.equal(config.douyin.appSecret, 'dy-secret');
  assert.equal(config.douyin.exchangeUrl, 'https://douyin.example/code');
  assert.equal(config.sessionTtlMs, 60000);
});

test('getSessionTtlMs falls back for invalid values', () => {
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: '120000' }), 120000);
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: '0' }), server.DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: '-5' }), server.DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: 'abc' }), server.DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(server.getSessionTtlMs({}), server.DEFAULT_AUTH_SESSION_TTL_MS);
});

test('hasCompletePlatformAuthConfig requires app id secret and exchange url', () => {
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });

  assert.equal(server.hasCompletePlatformAuthConfig(config, 'wechat'), true);
  assert.equal(server.hasCompletePlatformAuthConfig(config, 'douyin'), false);
  assert.equal(server.hasCompletePlatformAuthConfig(config, 'web'), false);
});

test('exchangePlatformCode returns deterministic mock identity for web and incomplete platform config', async () => {
  const config = server.resolvePlatformAuthConfig({});

  assert.deepEqual(
    await server.exchangePlatformCode({ platform: 'web', code: 'demo_player' }, config),
    { platform: 'web', openid: 'web_mock_demo_player' }
  );

  assert.deepEqual(
    await server.exchangePlatformCode({ platform: 'wechat', code: 'login-code' }, config),
    { platform: 'wechat', openid: 'wechat_mock_login-code' }
  );

  assert.deepEqual(
    await server.exchangePlatformCode({ platform: 'douyin', code: 'login-code' }, config),
    { platform: 'douyin', openid: 'douyin_mock_login-code' }
  );
});

test('createAuthSessionFromIdentity returns stable player identity and token', () => {
  const session = server.createAuthSessionFromIdentity({
    platform: 'wechat',
    openid: 'real-openid',
  });

  assert.deepEqual(session, {
    ok: true,
    platform: 'wechat',
    openid: 'real-openid',
    playerId: 'wechat_real-openid',
    sessionToken: 'mock_session_wechat_real-openid',
  });
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `resolvePlatformAuthConfig`, `getSessionTtlMs`, `DEFAULT_AUTH_SESSION_TTL_MS`, `hasCompletePlatformAuthConfig`, `exchangePlatformCode`, and `createAuthSessionFromIdentity` are not exported or implemented.

- [ ] **Step 3: Add config constants and helpers**

In `server/server.js`, add these constants near the other top-level constants:

```js
const DEFAULT_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WECHAT_CODE_EXCHANGE_URL = "https://api.weixin.qq.com/sns/jscode2session";
const DEFAULT_DOUYIN_CODE_EXCHANGE_URL = "https://developer.toutiao.com/api/apps/v2/jscode2session";
```

Add these helpers after `resolveMockPlatformOpenId()`:

```js
function getSessionTtlMs(env = process.env) {
  const raw = Number(env.AUTH_SESSION_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUTH_SESSION_TTL_MS;
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolvePlatformAuthConfig(env = process.env) {
  return {
    wechat: {
      appId: normalizeOptionalString(env.WECHAT_APP_ID),
      appSecret: normalizeOptionalString(env.WECHAT_APP_SECRET),
      exchangeUrl: normalizeOptionalString(env.WECHAT_CODE_EXCHANGE_URL) || DEFAULT_WECHAT_CODE_EXCHANGE_URL,
    },
    douyin: {
      appId: normalizeOptionalString(env.DOUYIN_APP_ID),
      appSecret: normalizeOptionalString(env.DOUYIN_APP_SECRET),
      exchangeUrl: normalizeOptionalString(env.DOUYIN_CODE_EXCHANGE_URL) || DEFAULT_DOUYIN_CODE_EXCHANGE_URL,
    },
    sessionTtlMs: getSessionTtlMs(env),
  };
}

function hasCompletePlatformAuthConfig(config, platform) {
  const platformConfig = config && config[platform];
  return Boolean(
    platformConfig
    && platformConfig.appId
    && platformConfig.appSecret
    && platformConfig.exchangeUrl
  );
}

function createMockPlatformIdentity(platform, code) {
  return {
    platform,
    openid: resolveMockPlatformOpenId(platform, code),
  };
}

function createAuthSessionFromIdentity(identity) {
  const platform = normalizeRequiredString(identity && identity.platform, "platform");
  const openid = normalizeRequiredString(identity && identity.openid, "openid");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  const playerId = `${platform}_${openid}`;
  return {
    ok: true,
    platform,
    openid,
    playerId,
    sessionToken: `mock_session_${playerId}`,
  };
}

async function exchangePlatformCode(payload, config = resolvePlatformAuthConfig(), fetchImpl = globalThis.fetch) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  if (platform === "web" || !hasCompletePlatformAuthConfig(config, platform)) {
    return createMockPlatformIdentity(platform, code);
  }
  throw new Error("platform auth exchange failed");
}
```

- [ ] **Step 4: Route existing mock session creation through the new boundary**

Replace `createAuthSession(payload)` in `server/server.js` with:

```js
function createAuthSession(payload) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  return createAuthSessionFromIdentity(createMockPlatformIdentity(platform, code));
}
```

- [ ] **Step 5: Export new helpers**

Add these properties to `module.exports` in `server/server.js`:

```js
  DEFAULT_AUTH_SESSION_TTL_MS,
  DEFAULT_WECHAT_CODE_EXCHANGE_URL,
  DEFAULT_DOUYIN_CODE_EXCHANGE_URL,
  getSessionTtlMs,
  normalizeOptionalString,
  resolvePlatformAuthConfig,
  hasCompletePlatformAuthConfig,
  createMockPlatformIdentity,
  exchangePlatformCode,
  createAuthSessionFromIdentity,
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
git commit -m "feat: add platform auth config boundary"
```

---

### Task 2: Real Provider Code Exchange

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing real exchange tests**

Append this code after the mock exchange tests in `tests/server.test.js`:

```js
function createJsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    },
  };
}

test('exchangePlatformCode calls WeChat exchange when config is complete', async () => {
  const requests = [];
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });
  const identity = await server.exchangePlatformCode(
    { platform: 'wechat', code: 'wx-code' },
    config,
    async (url) => {
      requests.push(url);
      return createJsonResponse({ openid: 'wx-openid', unionid: 'wx-union' });
    }
  );

  assert.deepEqual(identity, {
    platform: 'wechat',
    openid: 'wx-openid',
    unionid: 'wx-union',
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/wechat\.example\/code\?/);
  assert.match(requests[0], /appid=wx-app/);
  assert.match(requests[0], /secret=wx-secret/);
  assert.match(requests[0], /js_code=wx-code/);
  assert.match(requests[0], /grant_type=authorization_code/);
});

test('exchangePlatformCode calls Douyin exchange when config is complete', async () => {
  const requests = [];
  const config = server.resolvePlatformAuthConfig({
    DOUYIN_APP_ID: 'dy-app',
    DOUYIN_APP_SECRET: 'dy-secret',
    DOUYIN_CODE_EXCHANGE_URL: 'https://douyin.example/code',
  });
  const identity = await server.exchangePlatformCode(
    { platform: 'douyin', code: 'dy-code' },
    config,
    async (url) => {
      requests.push(url);
      return createJsonResponse({ data: { openid: 'dy-openid', unionid: 'dy-union' } });
    }
  );

  assert.deepEqual(identity, {
    platform: 'douyin',
    openid: 'dy-openid',
    unionid: 'dy-union',
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/douyin\.example\/code\?/);
  assert.match(requests[0], /appid=dy-app/);
  assert.match(requests[0], /secret=dy-secret/);
  assert.match(requests[0], /code=dy-code/);
});

test('exchangePlatformCode rejects provider failure responses', async () => {
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'wechat', code: 'bad-code' },
      config,
      async () => createJsonResponse({ errcode: 40029, errmsg: 'invalid code' })
    ),
    /platform auth exchange failed/
  );
});

test('exchangePlatformCode rejects missing openid rejected fetch and invalid json', async () => {
  const config = server.resolvePlatformAuthConfig({
    DOUYIN_APP_ID: 'dy-app',
    DOUYIN_APP_SECRET: 'dy-secret',
    DOUYIN_CODE_EXCHANGE_URL: 'https://douyin.example/code',
  });

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'douyin', code: 'missing-openid' },
      config,
      async () => createJsonResponse({ data: {} })
    ),
    /platform auth exchange failed/
  );

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'douyin', code: 'network-fail' },
      config,
      async () => {
        throw new Error('network failed');
      }
    ),
    /platform auth exchange failed/
  );

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'douyin', code: 'bad-json' },
      config,
      async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new Error('bad json');
        },
      })
    ),
    /platform auth exchange failed/
  );
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because complete WeChat/Douyin config currently throws `platform auth exchange failed` without calling the injected fetch.

- [ ] **Step 3: Add provider parsing and URL helpers**

In `server/server.js`, add these helpers before `exchangePlatformCode()`:

```js
function buildUrlWithQuery(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function parseWechatExchangeResponse(data) {
  if (!data || typeof data !== "object" || data.errcode || !data.openid) {
    throw new Error("platform auth exchange failed");
  }
  return {
    platform: "wechat",
    openid: String(data.openid),
    ...(data.unionid ? { unionid: String(data.unionid) } : {}),
  };
}

function parseDouyinExchangeResponse(data) {
  const body = data && typeof data === "object" && data.data && typeof data.data === "object"
    ? data.data
    : data;
  if (!body || typeof body !== "object" || body.err_code || body.error || !body.openid) {
    throw new Error("platform auth exchange failed");
  }
  return {
    platform: "douyin",
    openid: String(body.openid),
    ...(body.unionid ? { unionid: String(body.unionid) } : {}),
  };
}

async function fetchJson(url, fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("platform auth exchange failed");
  }
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error("platform auth exchange failed");
  }
  if (!response || response.ok === false) {
    throw new Error("platform auth exchange failed");
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error("platform auth exchange failed");
  }
}
```

- [ ] **Step 4: Implement fetch-based exchange**

Replace `exchangePlatformCode()` in `server/server.js` with:

```js
async function exchangePlatformCode(payload, config = resolvePlatformAuthConfig(), fetchImpl = globalThis.fetch) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  if (platform === "web" || !hasCompletePlatformAuthConfig(config, platform)) {
    return createMockPlatformIdentity(platform, code);
  }

  const platformConfig = config[platform];
  if (platform === "wechat") {
    const url = buildUrlWithQuery(platformConfig.exchangeUrl, {
      appid: platformConfig.appId,
      secret: platformConfig.appSecret,
      js_code: code,
      grant_type: "authorization_code",
    });
    return parseWechatExchangeResponse(await fetchJson(url, fetchImpl));
  }

  if (platform === "douyin") {
    const url = buildUrlWithQuery(platformConfig.exchangeUrl, {
      appid: platformConfig.appId,
      secret: platformConfig.appSecret,
      code,
    });
    return parseDouyinExchangeResponse(await fetchJson(url, fetchImpl));
  }

  throw new Error("platform is not supported");
}
```

- [ ] **Step 5: Export provider helpers**

Add these properties to `module.exports`:

```js
  buildUrlWithQuery,
  parseWechatExchangeResponse,
  parseDouyinExchangeResponse,
  fetchJson,
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
git commit -m "feat: exchange platform login codes"
```

---

### Task 3: Session Expiration

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing expiration tests**

Replace the existing `registerAuthSession stores session records by token` test in `tests/server.test.js` with:

```js
test('registerAuthSession stores session records by token with expiry', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'wechat', code: 'session-code' });

  const record = server.registerAuthSession(session, 1781450000000, 60000);

  assert.deepEqual(record, {
    sessionToken: 'mock_session_wechat_wechat_mock_session-code',
    playerId: 'wechat_wechat_mock_session-code',
    platform: 'wechat',
    openid: 'wechat_mock_session-code',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  });
  assert.deepEqual(server.sessions.get(session.sessionToken), record);
});
```

Append these tests after `getSessionFromAuthorization returns stored sessions or null`:

```js
test('isSessionExpired covers active boundary and expired sessions', () => {
  const session = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1000,
    expiresAt: 2000,
  };

  assert.equal(server.isSessionExpired(session, 1999), false);
  assert.equal(server.isSessionExpired(session, 2000), true);
  assert.equal(server.isSessionExpired(session, 2001), true);
  assert.equal(server.isSessionExpired({ ...session, expiresAt: undefined }, 2001), false);
});

test('getSessionFromAuthorization returns null for expired sessions', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'web', code: 'demo_player' });
  server.registerAuthSession(session, 1781450000000, 1000);

  assert.equal(
    server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`, 1781450000500).playerId,
    session.playerId
  );
  assert.equal(server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`, 1781450001000), null);
});

test('requirePlayerSession writes a distinct error for expired sessions', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'douyin', code: 'expired-owner' });
  server.registerAuthSession(session, 1781450000000, 1000);

  const ctx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  assert.equal(server.requirePlayerSession(ctx, session.playerId, 1781450001000), null);
  assert.equal(ctx.status, 401);
  assert.deepEqual(ctx.body, { ok: false, error: 'session expired' });
});
```

- [ ] **Step 2: Update existing session helper test calls for non-expired sessions**

In `tests/server.test.js`, update these calls to pass explicit active timestamps:

```js
assert.deepEqual(server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`, 1781450000000), record);
```

```js
const okSession = server.requirePlayerSession(okCtx, session.playerId, 1781450000000);
```

```js
assert.equal(server.requirePlayerSession(missingCtx, session.playerId, 1781450000000), null);
```

```js
assert.equal(server.requirePlayerSession(mismatchCtx, 'wechat_other', 1781450000000), null);
```

- [ ] **Step 3: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because sessions do not include `expiresAt`, `isSessionExpired` is missing, and session lookup does not distinguish expired sessions.

- [ ] **Step 4: Add expiration helpers**

In `server/server.js`, replace `registerAuthSession()` with:

```js
function registerAuthSession(session, now = Date.now(), ttlMs = DEFAULT_AUTH_SESSION_TTL_MS) {
  const record = {
    sessionToken: session.sessionToken,
    playerId: session.playerId,
    platform: session.platform,
    openid: session.openid,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  sessions.set(session.sessionToken, record);
  return record;
}
```

Add this helper after `registerAuthSession()`:

```js
function isSessionExpired(session, now = Date.now()) {
  return Boolean(session && Number.isFinite(Number(session.expiresAt)) && now >= Number(session.expiresAt));
}
```

- [ ] **Step 5: Update session lookup and guard**

Replace `getSessionFromAuthorization()` and `requirePlayerSession()` in `server/server.js` with:

```js
function getSessionFromAuthorization(headerValue, now = Date.now()) {
  const token = parseBearerToken(headerValue);
  if (!token) {
    return null;
  }
  const session = sessions.get(token) || null;
  if (!session || isSessionExpired(session, now)) {
    return null;
  }
  return session;
}

function requirePlayerSession(ctx, expectedPlayerId, now = Date.now()) {
  const token = parseBearerToken(getAuthorizationHeader(ctx));
  if (!token) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session is required" };
    return null;
  }

  const session = sessions.get(token) || null;
  if (!session) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session is required" };
    return null;
  }
  if (isSessionExpired(session, now)) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session expired" };
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

- [ ] **Step 6: Pass timestamps through player-owned handlers**

In `server/server.js`, update:

```js
function handlePlayerLoad(ctx, store) {
```

to:

```js
function handlePlayerLoad(ctx, store, now = Date.now()) {
```

Inside `handlePlayerLoad`, replace:

```js
const session = requirePlayerSession(ctx, playerId);
```

with:

```js
const session = requirePlayerSession(ctx, playerId, now);
```

Inside `handlePlayerSave`, replace:

```js
const session = requirePlayerSession(ctx, playerId);
```

with:

```js
const session = requirePlayerSession(ctx, playerId, now);
```

Inside `handleAdRewardClaim`, replace:

```js
const session = requirePlayerSession(ctx, playerId);
```

with:

```js
const session = requirePlayerSession(ctx, playerId, now);
```

- [ ] **Step 7: Export `isSessionExpired`**

Add this property to `module.exports`:

```js
  isSessionExpired,
```

- [ ] **Step 8: Run server tests and confirm pass**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add -- tests/server.test.js server/server.js
git commit -m "feat: expire auth sessions"
```

---

### Task 4: Async Auth Login Integration

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing async login tests**

Replace the existing `loginPlatformPlayer registers the returned session token` test with:

```js
test('loginPlatformPlayer registers the returned session token with expiry', async () => {
  server.sessions.clear();
  const store = {};

  const session = await server.loginPlatformPlayer(store, {
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  }, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
  });

  assert.equal(server.sessions.get(session.sessionToken).playerId, session.playerId);
  assert.equal(server.sessions.get(session.sessionToken).createdAt, 1781450000000);
  assert.equal(server.sessions.get(session.sessionToken).expiresAt, 1781450060000);
  assert.equal(session.expiresAt, 1781450060000);
});
```

Change the existing `loginPlatformPlayer creates a default player record for a new auth session` test to be async and replace the login call with:

```js
const result = await server.loginPlatformPlayer(store, ctx.request.body, {
  now: 1781450000000,
  config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
});
```

Add this assertion to that test:

```js
assert.equal(result.expiresAt, 1781450060000);
```

Change the existing `loginPlatformPlayer preserves existing gameplay data on repeat login` test to be async and replace the login call with:

```js
const result = await server.loginPlatformPlayer(store, {
  platform: 'web',
  code: 'demo_player',
  nickname: 'New Nick',
});
```

Change the existing `handleAuthLogin writes auth result or bad request response` test to be async and replace handler calls with:

```js
await server.handleAuthLogin(okCtx, store, {
  now: 1781450000000,
  config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
});
```

and:

```js
await server.handleAuthLogin(badCtx, store, {
  now: 1781450000000,
});
```

Append this test after `handleAuthLogin writes auth result or bad request response`:

```js
test('handleAuthLogin returns 502 when configured platform exchange fails', async () => {
  const store = {};
  const ctx = createMockContext({ platform: 'wechat', code: 'bad-code' });
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });

  await server.handleAuthLogin(ctx, store, {
    now: 1781450000000,
    config,
    fetchImpl: async () => createJsonResponse({ errcode: 40029, errmsg: 'invalid code' }),
  });

  assert.equal(ctx.status, 502);
  assert.deepEqual(ctx.body, { ok: false, error: 'platform auth exchange failed' });
  assert.deepEqual(store, {});
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `loginPlatformPlayer()` and `handleAuthLogin()` still use the synchronous mock-only path and do not return `expiresAt`.

- [ ] **Step 3: Add `sendAuthExchangeError`**

Add this helper after `sendBadRequest()` in `server/server.js`:

```js
function sendAuthExchangeError(ctx) {
  ctx.status = 502;
  ctx.body = {
    ok: false,
    error: "platform auth exchange failed",
  };
}
```

- [ ] **Step 4: Make login use platform exchange**

Replace `loginPlatformPlayer()` in `server/server.js` with:

```js
async function loginPlatformPlayer(store, payload, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const config = options.config || resolvePlatformAuthConfig();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const identity = await exchangePlatformCode(payload, config, fetchImpl);
  const session = createAuthSessionFromIdentity(identity);
  const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : "";

  if (!store[session.playerId]) {
    const player = createDefaultPlayer(session.playerId, nickname || "游客");
    player.lastSaveTime = now;
    store[session.playerId] = player;
  }

  const record = registerAuthSession(session, now, config.sessionTtlMs);
  return {
    ...session,
    expiresAt: record.expiresAt,
  };
}
```

- [ ] **Step 5: Make auth handler async and map exchange failures to 502**

Replace `handleAuthLogin()` in `server/server.js` with:

```js
async function handleAuthLogin(ctx, store, options = {}) {
  try {
    ctx.body = await loginPlatformPlayer(store, ctx.request.body || {}, options);
  } catch (error) {
    if (error && error.message === "platform auth exchange failed") {
      sendAuthExchangeError(ctx);
      return;
    }
    sendBadRequest(ctx, error.message);
  }
}
```

- [ ] **Step 6: Make Koa auth route await the handler**

Replace the `/auth/login` route in `createApp()` with:

```js
  router.post("/auth/login", async (ctx) => {
    const store = readPlayerStore();
    await handleAuthLogin(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });
```

- [ ] **Step 7: Update `createAuthorizedSession` helper in tests for default expiry**

In `tests/server.test.js`, keep `createAuthorizedSession()` synchronous but update session registration to pass a long TTL:

```js
function createAuthorizedSession(platform, code, now = 1781450000000) {
  const session = server.createAuthSession({ platform, code });
  server.registerAuthSession(session, now, server.DEFAULT_AUTH_SESSION_TTL_MS);
  return session;
}
```

- [ ] **Step 8: Export `sendAuthExchangeError`**

Add this property to `module.exports`:

```js
  sendAuthExchangeError,
```

- [ ] **Step 9: Run server tests and confirm pass**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

Run:

```powershell
git add -- tests/server.test.js server/server.js
git commit -m "feat: authenticate through platform exchange"
```

---

### Task 5: Client Contract Guardrails

**Files:**
- Modify: `tests/client-scaffold.test.js`
- Modify: `assets/scripts/core/StorageManager.ts`

- [ ] **Step 1: Write failing client scaffold tests**

Append this code to `tests/client-scaffold.test.js`:

```js
test('stage 3D storage manager accepts auth session expiry from server', () => {
  const storage = read('assets/scripts/core/StorageManager.ts');

  assert.match(storage, /expiresAt: number/);
  assert.match(storage, /export interface AuthLoginResponse/);
  assert.match(storage, /sessionToken: string/);
});

test('stage 3D client does not contain platform app secrets', () => {
  const files = [
    'assets/scripts/core/StorageManager.ts',
    'assets/scripts/core/GameManager.ts',
    'assets/scripts/platform/PlatformManager.ts',
    'assets/scripts/platform/WechatAdapter.ts',
    'assets/scripts/platform/DouyinAdapter.ts',
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /APP_SECRET/);
    assert.doesNotMatch(source, /WECHAT_APP_SECRET/);
    assert.doesNotMatch(source, /DOUYIN_APP_SECRET/);
  }
});
```

- [ ] **Step 2: Run scaffold tests and confirm failure**

Run:

```powershell
node --test tests\client-scaffold.test.js
```

Expected: FAIL because `AuthLoginResponse` does not yet include `expiresAt`.

- [ ] **Step 3: Add `expiresAt` to auth response type**

In `assets/scripts/core/StorageManager.ts`, update `AuthLoginResponse` to:

```ts
export interface AuthLoginResponse {
    ok: boolean;
    platform: PlatformName;
    openid: string;
    playerId: string;
    sessionToken: string;
    expiresAt: number;
}
```

- [ ] **Step 4: Run scaffold tests and TypeScript filtered check**

Run:

```powershell
node --test tests\client-scaffold.test.js
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

Expected: scaffold tests PASS. Filtered TypeScript command prints no `assets/scripts` output. In this PowerShell environment, `Select-String` may return exit code 1 when there are no matches; treat empty output as the expected result.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- tests/client-scaffold.test.js assets/scripts/core/StorageManager.ts
git commit -m "feat: expose auth session expiry to client"
```

---

### Task 6: Checkpoint and Final Verification

**Files:**
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, update the current completed stage to:

```markdown
Current development node: **Stage 3-D completed**.
```

Add these bullets under completed capabilities:

```markdown
- Server auth login now uses a platform auth provider boundary with deterministic mock fallback.
- WeChat and Douyin login codes can be exchanged through configured server-side credentials and endpoints.
- Complete platform auth configuration fails closed when provider exchange fails instead of silently minting mock identities.
- Auth sessions include `expiresAt`, and expired bearer sessions are rejected for player-owned requests.
- Client auth response typing accepts the server session expiry field without storing platform secrets.
```

Replace the current resume node section with:

```markdown
## Current Resume Node

Current development node for next session: **Stage 3-E planning pending**.

Recommended next node: persistent session storage, server-authoritative board mutation, account linking/migration, or production platform credential deployment checks after real code exchange has been verified.
```

Update the suggested next development stage to:

```markdown
Recommended next node: **Stage 3-E planning**.

Suggested scope:

- Decide whether sessions should move from in-memory storage to a persistent store.
- Decide whether generate, merge, ad reward, and score changes should become server-authoritative.
- Decide whether account linking or account migration is needed before production launch.
```

Update the last verification block after running final verification in Step 2.

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
- Filtered TypeScript command prints no `assets/scripts` output. In this PowerShell environment, `Select-String` may return exit code 1 when there are no matches; treat empty output as expected.

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3d platform auth checkpoint"
```

---

## Final Review

After all tasks are complete:

- Run `git status --short`.
- Confirm there are no uncommitted changes.
- Summarize the completed Stage 3-D features.
- Include the verification commands and results in the final response.
