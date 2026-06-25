# Stage 3-E Persistent Session Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist auth session records to `server/data/sessionData.json` so valid bearer sessions survive server restarts.

**Architecture:** Keep the existing single-file Koa server and in-memory `sessions` map for hot request lookup. Add JSON file helpers that mirror the existing player-store style, then wire login and startup to write and load non-expired session records.

**Tech Stack:** Node.js Koa server, Node test runner, local JSON files, Cocos Creator 3.8.x TypeScript client, `tsx`, TypeScript 5.4.5.

---

## File Structure

- Modify `server/server.js`
  - Add `SESSION_DATA_FILE`.
  - Add session-store file helpers.
  - Add session record validation, serialization, loading, and pruning helpers.
  - Persist new records from `loginPlatformPlayer()`.
  - Load persisted sessions in `createApp()`.
  - Export new helpers for tests.
- Modify `tests/server.test.js`
  - Add tests for session file initialization, read/write fallback, serialization, loading, pruning, and simulated restart behavior.
  - Use temporary file paths where file IO is tested directly.
- Modify `server/README_SERVER.md`
  - Document `server/data/sessionData.json` and restart behavior.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`
  - Record Stage 3-E plan completion and next implementation node.

---

### Task 1: Session Store File Helpers

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing session-store file helper tests**

Append this code after `getSessionTtlMs falls back for invalid values` in `tests/server.test.js`:

```js
function createTempSessionFilePath(name) {
  return path.join(__dirname, '..', 'server', 'data', name);
}

function cleanupTempFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

test('ensureSessionDataFile creates an empty session store file', () => {
  const filePath = createTempSessionFilePath('sessionData.ensure.test.json');
  cleanupTempFile(filePath);

  server.ensureSessionDataFile(filePath);

  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), {});
  cleanupTempFile(filePath);
});

test('readSessionStore reads valid session json and falls back for invalid content', () => {
  const filePath = createTempSessionFilePath('sessionData.read.test.json');
  cleanupTempFile(filePath);
  const sessionRecord = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  server.writeSessionStore({ token: sessionRecord }, filePath);

  assert.deepEqual(server.readSessionStore(filePath), { token: sessionRecord });

  fs.writeFileSync(filePath, '{bad json', 'utf8');
  assert.deepEqual(server.readSessionStore(filePath), {});

  fs.writeFileSync(filePath, '[]', 'utf8');
  assert.deepEqual(server.readSessionStore(filePath), {});
  cleanupTempFile(filePath);
});

test('writeSessionStore writes stable formatted session json', () => {
  const filePath = createTempSessionFilePath('sessionData.write.test.json');
  cleanupTempFile(filePath);
  const sessionRecord = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };

  server.writeSessionStore({ token: sessionRecord }, filePath);

  assert.equal(
    fs.readFileSync(filePath, 'utf8'),
    `${JSON.stringify({ token: sessionRecord }, null, 2)}\n`
  );
  cleanupTempFile(filePath);
});
```

At the top of `tests/server.test.js`, add these imports after the existing `assert` import:

```js
const fs = require('node:fs');
const path = require('node:path');
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `ensureSessionDataFile`, `readSessionStore`, and `writeSessionStore` are not implemented or exported.

- [ ] **Step 3: Add session-store constants and file helpers**

In `server/server.js`, add this constant after `DATA_FILE`:

```js
const SESSION_DATA_FILE = path.join(DATA_DIR, "sessionData.json");
```

Add these helpers after `writePlayerStore()`:

```js
function ensureSessionDataFile(filePath = SESSION_DATA_FILE) {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), "utf8");
  }
}

function readSessionStore(filePath = SESSION_DATA_FILE) {
  ensureSessionDataFile(filePath);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn("[server] failed to read session store", error);
    return {};
  }
}

function writeSessionStore(store, filePath = SESSION_DATA_FILE) {
  ensureSessionDataFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}
```

- [ ] **Step 4: Export session-store helpers**

Add these properties to `module.exports`:

```js
  SESSION_DATA_FILE,
  ensureSessionDataFile,
  readSessionStore,
  writeSessionStore,
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
git commit -m "feat: add session store file helpers"
```

---

### Task 2: Session Serialization, Loading, and Pruning

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing serialization and load tests**

Append this code after `registerAuthSession stores session records by token with expiry` in `tests/server.test.js`:

```js
test('isValidSessionRecord accepts complete session records only', () => {
  const record = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };

  assert.equal(server.isValidSessionRecord(record), true);
  assert.equal(server.isValidSessionRecord({ ...record, sessionToken: '' }), false);
  assert.equal(server.isValidSessionRecord({ ...record, platform: 'ios' }), false);
  assert.equal(server.isValidSessionRecord({ ...record, createdAt: 'now' }), false);
  assert.equal(server.isValidSessionRecord({ ...record, expiresAt: 'later' }), false);
});

test('serializeSessions returns only valid non-expired records keyed by token', () => {
  const sessionMap = new Map();
  const active = {
    sessionToken: 'active-token',
    playerId: 'active-player',
    platform: 'web',
    openid: 'web_mock_active',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  const expired = {
    sessionToken: 'expired-token',
    playerId: 'expired-player',
    platform: 'wechat',
    openid: 'wechat_mock_expired',
    createdAt: 1781450000000,
    expiresAt: 1781450000500,
  };
  sessionMap.set(active.sessionToken, active);
  sessionMap.set(expired.sessionToken, expired);
  sessionMap.set('bad-token', { sessionToken: 'bad-token', playerId: '', platform: 'web' });

  assert.deepEqual(server.serializeSessions(sessionMap, 1781450001000), {
    'active-token': active,
  });
});

test('loadSessionsFromStore loads active records and skips expired or invalid records', () => {
  server.sessions.clear();
  const active = {
    sessionToken: 'active-token',
    playerId: 'active-player',
    platform: 'web',
    openid: 'web_mock_active',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  const expired = {
    sessionToken: 'expired-token',
    playerId: 'expired-player',
    platform: 'wechat',
    openid: 'wechat_mock_expired',
    createdAt: 1781450000000,
    expiresAt: 1781450000500,
  };

  const loaded = server.loadSessionsFromStore({
    [active.sessionToken]: active,
    [expired.sessionToken]: expired,
    invalid: { sessionToken: 'invalid', playerId: '', platform: 'web' },
  }, 1781450001000);

  assert.equal(loaded, 1);
  assert.deepEqual(server.sessions.get(active.sessionToken), active);
  assert.equal(server.sessions.has(expired.sessionToken), false);
  assert.equal(server.sessions.has('invalid'), false);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `isValidSessionRecord`, `serializeSessions`, and `loadSessionsFromStore` are missing.

- [ ] **Step 3: Add validation, serialization, and loading helpers**

In `server/server.js`, add these helpers after `isSessionExpired()`:

```js
function isValidSessionRecord(record) {
  return Boolean(
    record
    && typeof record === "object"
    && typeof record.sessionToken === "string"
    && record.sessionToken.trim()
    && typeof record.playerId === "string"
    && record.playerId.trim()
    && typeof record.platform === "string"
    && ALLOWED_AUTH_PLATFORMS.includes(record.platform)
    && typeof record.openid === "string"
    && record.openid.trim()
    && Number.isFinite(Number(record.createdAt))
    && Number.isFinite(Number(record.expiresAt))
  );
}

function serializeSessions(sessionMap = sessions, now = Date.now()) {
  const store = {};
  sessionMap.forEach((record, token) => {
    if (isValidSessionRecord(record) && token === record.sessionToken && !isSessionExpired(record, now)) {
      store[record.sessionToken] = record;
    }
  });
  return store;
}

function loadSessionsFromStore(store, now = Date.now()) {
  sessions.clear();
  Object.values(store && typeof store === "object" && !Array.isArray(store) ? store : {}).forEach((record) => {
    if (isValidSessionRecord(record) && !isSessionExpired(record, now)) {
      sessions.set(record.sessionToken, record);
    }
  });
  return sessions.size;
}
```

- [ ] **Step 4: Export the new helpers**

Add these properties to `module.exports`:

```js
  isValidSessionRecord,
  serializeSessions,
  loadSessionsFromStore,
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
git commit -m "feat: load persisted auth sessions"
```

---

### Task 3: Persist Login Sessions

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing persistence tests**

Append this code after `loginPlatformPlayer registers the returned session token with expiry` in `tests/server.test.js`:

```js
test('persistSessionRecord writes active sessions and prunes expired persisted records', () => {
  const filePath = createTempSessionFilePath('sessionData.persist.test.json');
  cleanupTempFile(filePath);
  const expired = {
    sessionToken: 'expired-token',
    playerId: 'expired-player',
    platform: 'web',
    openid: 'web_mock_expired',
    createdAt: 1781450000000,
    expiresAt: 1781450000500,
  };
  server.writeSessionStore({ [expired.sessionToken]: expired }, filePath);
  const active = {
    sessionToken: 'active-token',
    playerId: 'active-player',
    platform: 'web',
    openid: 'web_mock_active',
    createdAt: 1781450001000,
    expiresAt: 1781450061000,
  };

  server.persistSessionRecord(active, {
    now: 1781450001000,
    filePath,
  });

  assert.deepEqual(server.readSessionStore(filePath), {
    [active.sessionToken]: active,
  });
  assert.deepEqual(server.sessions.get(active.sessionToken), active);
  cleanupTempFile(filePath);
});

test('loginPlatformPlayer persists the returned session record when a session file is provided', async () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.login.test.json');
  cleanupTempFile(filePath);
  const store = {};

  const session = await server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'demo_player',
    nickname: 'Demo',
  }, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  assert.deepEqual(server.readSessionStore(filePath), {
    [session.sessionToken]: {
      sessionToken: session.sessionToken,
      playerId: session.playerId,
      platform: session.platform,
      openid: session.openid,
      createdAt: 1781450000000,
      expiresAt: 1781450060000,
    },
  });
  cleanupTempFile(filePath);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `persistSessionRecord` is missing and `loginPlatformPlayer()` does not accept `sessionFilePath`.

- [ ] **Step 3: Add session persistence helper**

In `server/server.js`, add this helper after `loadSessionsFromStore()`:

```js
function persistSessionRecord(record, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const filePath = options.filePath || SESSION_DATA_FILE;
  if (!isValidSessionRecord(record) || isSessionExpired(record, now)) {
    return serializeSessions(sessions, now);
  }
  sessions.set(record.sessionToken, record);
  const store = {
    ...readSessionStore(filePath),
    [record.sessionToken]: record,
  };
  const prunedStore = {};
  Object.values(store).forEach((sessionRecord) => {
    if (isValidSessionRecord(sessionRecord) && !isSessionExpired(sessionRecord, now)) {
      prunedStore[sessionRecord.sessionToken] = sessionRecord;
    }
  });
  writeSessionStore(prunedStore, filePath);
  return prunedStore;
}
```

- [ ] **Step 4: Persist records from login**

In `loginPlatformPlayer()` in `server/server.js`, replace:

```js
  const record = registerAuthSession(session, now, config.sessionTtlMs);
```

with:

```js
  const record = registerAuthSession(session, now, config.sessionTtlMs);
  persistSessionRecord(record, {
    now,
    filePath: options.sessionFilePath,
  });
```

- [ ] **Step 5: Export `persistSessionRecord`**

Add this property to `module.exports`:

```js
  persistSessionRecord,
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
git commit -m "feat: persist auth sessions on login"
```

---

### Task 4: Startup Restore and Simulated Restart Authorization

**Files:**
- Modify: `tests/server.test.js`
- Modify: `server/server.js`

- [ ] **Step 1: Write failing startup restore tests**

Append this code after `handlePlayerLoad remains public without token and rejects invalid token when supplied` in `tests/server.test.js`:

```js
test('loadPersistedSessionsFromFile restores active sessions from disk', () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.restore.test.json');
  cleanupTempFile(filePath);
  const active = {
    sessionToken: 'restore-token',
    playerId: 'restore-player',
    platform: 'web',
    openid: 'web_mock_restore',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  server.writeSessionStore({ [active.sessionToken]: active }, filePath);

  const loaded = server.loadPersistedSessionsFromFile({
    now: 1781450001000,
    filePath,
  });

  assert.equal(loaded, 1);
  assert.deepEqual(server.sessions.get(active.sessionToken), active);
  cleanupTempFile(filePath);
});

test('persisted session authorizes player request after simulated restart', async () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.restart.test.json');
  cleanupTempFile(filePath);
  const store = {};
  const session = await server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'restart-player',
    nickname: 'Restart',
  }, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  server.sessions.clear();
  server.loadPersistedSessionsFromFile({
    now: 1781450001000,
    filePath,
  });

  const ctx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };
  server.handlePlayerLoad(ctx, store, 1781450001000);

  assert.equal(ctx.status, 200);
  assert.equal(ctx.body.playerId, session.playerId);
  cleanupTempFile(filePath);
});
```

- [ ] **Step 2: Run server tests and confirm failure**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL because `loadPersistedSessionsFromFile` is missing.

- [ ] **Step 3: Add persisted-session load helper**

In `server/server.js`, add this helper after `persistSessionRecord()`:

```js
function loadPersistedSessionsFromFile(options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const filePath = options.filePath || SESSION_DATA_FILE;
  const store = readSessionStore(filePath);
  const loaded = loadSessionsFromStore(store, now);
  const prunedStore = serializeSessions(sessions, now);
  writeSessionStore(prunedStore, filePath);
  return loaded;
}
```

- [ ] **Step 4: Load persisted sessions at startup**

In `createApp()` in `server/server.js`, replace:

```js
  ensureDataFile();
```

with:

```js
  ensureDataFile();
  ensureSessionDataFile();
  loadPersistedSessionsFromFile();
```

- [ ] **Step 5: Export `loadPersistedSessionsFromFile`**

Add this property to `module.exports`:

```js
  loadPersistedSessionsFromFile,
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
git commit -m "feat: restore auth sessions on startup"
```

---

### Task 5: Docs, Checkpoint, and Final Verification

**Files:**
- Modify: `server/README_SERVER.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update server README**

In `server/README_SERVER.md`, replace the `## Data` paragraph:

```markdown
Player data is stored in `server/data/playerData.json` for the demo.
```

with:

```markdown
Player data is stored in `server/data/playerData.json` for the demo.
Auth sessions are stored in `server/data/sessionData.json` so active bearer tokens can survive a local server restart.
```

After the player data JSON example and ad reward context paragraph, add:

````markdown
Session records are keyed by `sessionToken`:

```json
{
  "mock_session_web_web_mock_demo_player": {
    "sessionToken": "mock_session_web_web_mock_demo_player",
    "playerId": "web_web_mock_demo_player",
    "platform": "web",
    "openid": "web_mock_demo_player",
    "createdAt": 1781450000000,
    "expiresAt": 1782054800000
  }
}
```

Expired sessions are pruned when the server loads persisted sessions and when a new session is persisted.
````

In the notes list, replace:

```markdown
- Use a database and login/session validation before production.
```

with:

```markdown
- Use a database or managed session store before production traffic.
```

- [ ] **Step 2: Update checkpoint**

In `docs/superpowers/CURRENT_CHECKPOINT.md`, update the current node:

```markdown
Current development node: **Stage 3-E completed**.
```

Add these completed capability bullets:

```markdown
- Server auth sessions are persisted to `server/data/sessionData.json`.
- Server startup restores non-expired persisted auth sessions.
- Expired persisted sessions are pruned during load and write boundaries.
```

Add a new `## Recent Stage 3-E Progress` section before `## Recent Stage 3-D Progress`:

```markdown
## Recent Stage 3-E Progress

Completed so far:

1. Stage 3-E persistent session store design and implementation plan are committed.
2. Server session records persist to `server/data/sessionData.json`.
3. Startup loads active persisted sessions into the in-memory session map.
4. Expired or malformed persisted session records are skipped and pruned.
5. Simulated restart authorization is covered by server tests.
```

Replace the current resume node with:

```markdown
Current development node for next session: **Stage 3-F planning pending**.

Recommended next node:

- Production storage selection, server-authoritative board mutation, or account linking/migration after persistent session behavior has been verified.
```

Update the suggested next development stage to:

```markdown
Recommended next node: **Stage 3-F planning**.

Suggested scope:

- Decide whether player data should move from JSON files to SQLite, Redis, Postgres, or another persistent store.
- Decide whether generate, merge, ad reward, and score changes should become server-authoritative.
- Decide whether account linking or account migration is needed before production launch.
```

Update the final verification block after Step 3 with the actual pass counts.

- [ ] **Step 3: Run full verification**

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

- [ ] **Step 4: Commit**

Run:

```powershell
git add -- server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3e session persistence checkpoint"
```

---

## Final Review

After all tasks are complete:

- Run `git status --short`.
- Confirm there are no uncommitted changes.
- Summarize the completed Stage 3-E features.
- Include verification commands and results in the final response.
