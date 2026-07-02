# Stage 3-I Storage Boundary Design

Date: 2026-07-02

## Status

Approved direction for Stage 3-I planning. This document defines the first production storage hardening slice after Stage 3-H economy command migration.

## Goals

- Extract player and session persistence behind a small storage boundary.
- Keep the existing JSON file persistence format and default paths unchanged.
- Preserve current server API behavior, auth behavior, and test-facing helper exports.
- Make the storage layer replaceable by a future SQLite, Redis, or managed database implementation.
- Keep browser, Cocos preview, WeChat, and Douyin client behavior unchanged.

## Non-Goals

- Do not migrate data to SQLite, Redis, or any external service in this stage.
- Do not change player data schema, session token schema, or persisted JSON file names.
- Do not redesign platform auth, session expiry, board commands, or economy commands.
- Do not remove compatibility helper exports from `server/server.js`.
- Do not change client code in this stage unless tests prove a server contract regression.

## Chosen Approach

Create a focused JSON object-store module and route server persistence through it while preserving current behavior. The new module owns filesystem concerns such as directory creation, missing-file initialization, JSON parse fallback, object validation, and write formatting.

`server/server.js` will keep its public helper names, but those helpers will delegate to the storage boundary instead of reading and writing files directly. This keeps existing tests and local tooling stable while making persistence dependencies explicit.

This is intentionally smaller than a database migration. It gives the next stage a clear seam for injecting a production store without combining interface extraction, data migration, and operational configuration in one change.

## Architecture

Add `server/storage/jsonStore.js` with a factory-style API:

- `createJsonDocumentStore(options)`: generic JSON file store with `ensure()`, `read()`, and `write(value)`.
- `createJsonObjectStore(options)`: object-only wrapper that normalizes invalid, empty, missing, or non-object content to `{}`.
- `normalizeObjectStore(value)`: shared object validation helper for focused unit coverage.

`server/server.js` will instantiate default stores for:

- `server/data/playerData.json`
- `server/data/sessionData.json`

The default player store will preserve the current no-trailing-newline write format. The default session store will preserve the current trailing-newline write format. Invalid or unreadable JSON will continue to log a warning and return `{}`.

## Components

### `server/storage/jsonStore.js`

Responsibilities:

- Create parent directories recursively.
- Initialize a missing JSON file with the configured fallback value.
- Read JSON safely and return a normalized fallback on empty, invalid, or non-object content.
- Write formatted JSON with configurable trailing newline behavior.
- Avoid any knowledge of players, sessions, auth, board commands, or economy commands.

### `server/server.js`

Responsibilities:

- Keep route and gameplay logic unchanged.
- Replace direct filesystem persistence helpers with calls to default store instances.
- Preserve existing helper exports:
  - `ensureDataFile()`
  - `readPlayerStore()`
  - `writePlayerStore(store)`
  - `ensureSessionDataFile(filePath)`
  - `readSessionStore(filePath)`
  - `writeSessionStore(store, filePath)`
- Keep custom `filePath` support for session helper tests by creating a session store for the requested file path.
- Leave player helper signatures unchanged because current route tests use the default player data file.

### Tests

Storage behavior will be covered through focused Node tests before implementation:

- Missing JSON file is created with `{}`.
- Empty or invalid JSON reads as `{}`.
- Array and primitive JSON values read as `{}` for object stores.
- Object JSON values round-trip through `read()` and `write()`.
- Session helper compatibility keeps the existing trailing-newline write behavior.

Existing server route tests must continue to pass without client-side changes.

## Data Flow

Current route behavior remains the same:

1. Server startup ensures the player and session data files exist.
2. Startup loads non-expired persisted sessions into the in-memory session map.
3. Player, board, economy, auth, and leaderboard handlers read the player store through the existing helper boundary.
4. Mutating handlers write the updated player store through the existing helper boundary.
5. Session creation, pruning, and restart restoration use the session store through the existing helper boundary.

After this stage, filesystem details are below the storage boundary. Server command helpers should not need to know whether persistence is backed by JSON files or a later production store.

## Error Handling

- Missing data directories are created recursively.
- Missing data files are initialized to `{}`.
- Empty files read as `{}`.
- Invalid JSON logs the same class of server warning and reads as `{}`.
- JSON arrays, strings, numbers, booleans, and `null` read as `{}` for object stores.
- Write failures are not swallowed; they should fail the request or startup path as they do today.
- No automatic backup, repair file, or migration file is introduced in this slice.

## Testing Requirements

TDD order:

1. Add failing storage-boundary coverage to the Node server test suite.
2. Run the focused Node test command and confirm it fails for the missing storage module or missing exports.
3. Implement `server/storage/jsonStore.js`.
4. Delegate `server/server.js` persistence helpers to the new storage boundary.
5. Re-run the focused Node test command until it passes.
6. Run the full existing automated baseline.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

## Documentation Updates

- Update `server/README_SERVER.md` to describe the storage boundary and clarify that the current implementation is still JSON-backed.
- Update `docs/superpowers/CURRENT_CHECKPOINT.md` after implementation completes with the Stage 3-I result and verification output.

## Follow-Up Work

- Add explicit store injection to `createApp()` if the next stage needs in-memory, SQLite, or service-backed integration tests.
- Introduce production store selection through environment configuration.
- Migrate player and session persistence to SQLite, Redis, or managed storage.
- Add account binding and session revocation flows once persistence is production-backed.
