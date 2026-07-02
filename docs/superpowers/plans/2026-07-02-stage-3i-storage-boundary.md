# Stage 3-I Storage Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract player and session JSON persistence behind a small storage boundary while preserving current server behavior and file formats.

**Architecture:** Add `server/storage/jsonStore.js` as a generic JSON document/object store. Keep `server/server.js` helper names as compatibility wrappers, but delegate all player/session file reads and writes to the new store boundary.

**Tech Stack:** Node.js CommonJS, built-in `fs`/`path`, `node:test`, existing Koa server code.

---

## File Structure

- Create `server/storage/jsonStore.js`: owns JSON file ensure/read/write behavior and object normalization.
- Modify `server/server.js`: imports the storage module, creates default player/session stores, and rewires existing persistence helpers.
- Modify `tests/server.test.js`: adds focused storage-boundary tests before implementation and keeps existing session helper compatibility tests.
- Modify `server/README_SERVER.md`: documents that persistence now goes through a storage boundary but remains JSON-backed.
- Modify `docs/superpowers/CURRENT_CHECKPOINT.md`: records Stage 3-I completion and verification after implementation.

## Task 1: Add Failing Storage Boundary Tests

**Files:**
- Modify: `tests/server.test.js`

- [ ] **Step 1: Import the storage module near the existing server import**

Add this after `const server = require('../server/server.js');`:

```js
const jsonStore = require('../server/storage/jsonStore.js');
```

- [ ] **Step 2: Add a temp JSON path helper near `createTempSessionFilePath`**

Add this below `createTempSessionFilePath(name)`:

```js
function createTempJsonFilePath(name) {
  return path.join(__dirname, '..', 'server', 'data', name);
}
```

- [ ] **Step 3: Add storage-boundary tests before the existing session store tests**

Insert these tests before `test('ensureSessionDataFile creates an empty session store file', ...)`:

```js
test('createJsonObjectStore creates a missing object store file', () => {
  const filePath = createTempJsonFilePath('jsonStore.ensure.test.json');
  cleanupTempFile(filePath);
  const store = jsonStore.createJsonObjectStore({
    filePath,
    label: 'test object store',
  });

  store.ensure();

  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), {});
  cleanupTempFile(filePath);
});

test('createJsonObjectStore falls back to empty object for invalid non-object content', () => {
  const filePath = createTempJsonFilePath('jsonStore.invalid.test.json');
  cleanupTempFile(filePath);
  const store = jsonStore.createJsonObjectStore({
    filePath,
    label: 'test object store',
  });

  fs.writeFileSync(filePath, '{bad json', 'utf8');
  assert.deepEqual(store.read(), {});

  fs.writeFileSync(filePath, '', 'utf8');
  assert.deepEqual(store.read(), {});

  fs.writeFileSync(filePath, '[]', 'utf8');
  assert.deepEqual(store.read(), {});

  fs.writeFileSync(filePath, '"value"', 'utf8');
  assert.deepEqual(store.read(), {});

  cleanupTempFile(filePath);
});

test('createJsonObjectStore round-trips object data with configurable newline', () => {
  const filePath = createTempJsonFilePath('jsonStore.write.test.json');
  cleanupTempFile(filePath);
  const store = jsonStore.createJsonObjectStore({
    filePath,
    label: 'test object store',
    trailingNewline: true,
  });
  const value = { player: { coins: 120 } };

  store.write(value);

  assert.equal(fs.readFileSync(filePath, 'utf8'), `${JSON.stringify(value, null, 2)}\n`);
  assert.deepEqual(store.read(), value);
  cleanupTempFile(filePath);
});
```

- [ ] **Step 4: Run the focused tests and confirm red**

Run:

```powershell
node --test tests\server.test.js
```

Expected: FAIL with an error equivalent to `Cannot find module '../server/storage/jsonStore.js'`.

- [ ] **Step 5: Commit only if a separate red-test commit is desired**

For this repo, keep the red test uncommitted until Task 2 makes it green. Do not commit a permanently failing state.

## Task 2: Implement JSON Store Module

**Files:**
- Create: `server/storage/jsonStore.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Create `server/storage/jsonStore.js`**

Use this implementation:

```js
const fs = require("fs");
const path = require("path");

function normalizeObjectStore(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function formatJson(value, trailingNewline = false) {
  const suffix = trailingNewline ? "\n" : "";
  return `${JSON.stringify(value, null, 2)}${suffix}`;
}

function createJsonDocumentStore(options) {
  const {
    filePath,
    fallbackValue = {},
    label = "json store",
    trailingNewline = false,
    normalize = (value) => value,
  } = options;

  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath is required");
  }

  function ensure() {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, formatJson(fallbackValue, trailingNewline), "utf8");
    }
  }

  function read() {
    ensure();
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = raw.trim() ? JSON.parse(raw) : fallbackValue;
      return normalize(parsed);
    } catch (error) {
      console.warn(`[server] failed to read ${label}`, error);
      return fallbackValue;
    }
  }

  function write(value) {
    ensure();
    fs.writeFileSync(filePath, formatJson(value, trailingNewline), "utf8");
  }

  return {
    filePath,
    ensure,
    read,
    write,
  };
}

function createJsonObjectStore(options) {
  return createJsonDocumentStore({
    fallbackValue: {},
    normalize: normalizeObjectStore,
    ...options,
  });
}

module.exports = {
  createJsonDocumentStore,
  createJsonObjectStore,
  normalizeObjectStore,
};
```

- [ ] **Step 2: Run the focused tests and confirm green for new tests**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS for the new `createJsonObjectStore ...` tests and no new failures.

- [ ] **Step 3: Commit the storage module and tests**

Run:

```powershell
git add tests/server.test.js server/storage/jsonStore.js
git commit -m "feat: add json storage boundary"
```

## Task 3: Delegate Server Persistence Helpers To The Store Boundary

**Files:**
- Modify: `server/server.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Add the storage import in `server/server.js`**

Replace the current top import block:

```js
const fs = require("fs");
const path = require("path");
```

with:

```js
const path = require("path");
const { createJsonObjectStore } = require("./storage/jsonStore");
```

- [ ] **Step 2: Create default stores after data file constants**

Add this after `const SESSION_DATA_FILE = path.join(DATA_DIR, "sessionData.json");`:

```js
const playerStore = createJsonObjectStore({
  filePath: DATA_FILE,
  label: "player store",
});

const sessionStore = createJsonObjectStore({
  filePath: SESSION_DATA_FILE,
  label: "session store",
  trailingNewline: true,
});
```

- [ ] **Step 3: Add a session store factory for custom test file paths**

Add this after the default store constants:

```js
function createSessionStore(filePath = SESSION_DATA_FILE) {
  if (filePath === SESSION_DATA_FILE) {
    return sessionStore;
  }
  return createJsonObjectStore({
    filePath,
    label: "session store",
    trailingNewline: true,
  });
}
```

- [ ] **Step 4: Replace the file-backed helper implementations**

Replace the current `ensureDataFile`, `readPlayerStore`, `writePlayerStore`, `ensureSessionDataFile`, `readSessionStore`, and `writeSessionStore` functions with:

```js
function ensureDataFile() {
  playerStore.ensure();
}

function readPlayerStore() {
  return playerStore.read();
}

function writePlayerStore(store) {
  playerStore.write(store);
}

function ensureSessionDataFile(filePath = SESSION_DATA_FILE) {
  createSessionStore(filePath).ensure();
}

function readSessionStore(filePath = SESSION_DATA_FILE) {
  return createSessionStore(filePath).read();
}

function writeSessionStore(store, filePath = SESSION_DATA_FILE) {
  createSessionStore(filePath).write(store);
}
```

- [ ] **Step 5: Run focused compatibility tests**

Run:

```powershell
node --test tests\server.test.js
```

Expected: PASS. Existing session helper tests must still confirm stable formatted session JSON with a trailing newline.

- [ ] **Step 6: Confirm direct filesystem access was removed from server persistence helpers**

Run:

```powershell
rg -n "fs\.|mkdirSync|readFileSync|writeFileSync|existsSync" server\server.js
```

Expected: no matches in `server/server.js`.

- [ ] **Step 7: Commit the server delegation**

Run:

```powershell
git add server/server.js
git commit -m "refactor: delegate server persistence to json store"
```

## Task 4: Documentation, Baseline Verification, And Checkpoint

**Files:**
- Modify: `server/README_SERVER.md`
- Modify: `docs/superpowers/CURRENT_CHECKPOINT.md`

- [ ] **Step 1: Update `server/README_SERVER.md` storage note**

Find the current JSON-file storage note near the persistence/security section. Replace or extend it with:

```markdown
- Persistence currently flows through `server/storage/jsonStore.js`.
- The active implementation still stores player and session data as local JSON files under `server/data/`.
- This boundary keeps the demo JSON format stable while isolating the filesystem implementation for a later SQLite, Redis, or managed-store migration.
- Before production, replace the JSON-backed store with a production database or managed session store and add operational backup/restore handling.
```

- [ ] **Step 2: Update `docs/superpowers/CURRENT_CHECKPOINT.md`**

Update the current development node to Stage 3-I completed and add these completed capabilities:

```markdown
- Server player and session persistence now go through a JSON storage boundary.
- The JSON-backed store preserves existing `server/data/playerData.json` and `server/data/sessionData.json` formats.
- Existing server helper exports remain compatible while filesystem details are isolated below `server/storage/jsonStore.js`.
```

Add a Stage 3-I progress section:

```markdown
## Recent Stage 3-I Implementation Progress

Completed so far:

1. Stage 3-I storage boundary design and implementation plan are committed.
2. Added a focused JSON document/object store module for server persistence.
3. Rewired player and session persistence helpers to delegate to the JSON store boundary.
4. Preserved existing JSON file paths, write formatting, and helper exports.
5. Server tests cover missing files, invalid JSON, non-object JSON, and object round-trips through the store boundary.
```

Update `## Last Verification` with the final observed pass counts from the commands below.

- [ ] **Step 3: Run full automated verification**

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

Expected: no `assets/scripts` output. PowerShell may return exit code 1 when `Select-String` finds no matches.

- [ ] **Step 4: Commit documentation updates**

Run:

```powershell
git add server/README_SERVER.md docs/superpowers/CURRENT_CHECKPOINT.md
git commit -m "docs: record stage 3i storage boundary"
```

- [ ] **Step 5: Final repository check**

Run:

```powershell
git status --short --branch
```

Expected: `## master` with no modified or untracked files.

## Self-Review Notes

- Spec coverage: the plan covers storage module extraction, compatibility wrappers, unchanged JSON format, tests, README updates, and checkpoint updates.
- Scope control: no database migration, client change, auth redesign, or app-level store injection is included.
- Type consistency: store methods are consistently `ensure()`, `read()`, and `write(value)` across tests, implementation, and server delegation.
