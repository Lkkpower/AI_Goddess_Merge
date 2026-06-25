# Stage 3-E Persistent Session Store Design

## Goal

Stage 3-E makes auth sessions survive a server restart by persisting issued session records to a local JSON file. It keeps the current bearer-token client contract, platform login flow, and JSON-backed demo storage style.

This stage does not introduce a database, refresh tokens, account linking, server-authoritative gameplay mutation, or client UI changes.

## Scope

In scope:

- Add a JSON-backed server session store at `server/data/sessionData.json`.
- Load non-expired persisted sessions into the existing `sessions` map during server startup.
- Persist new session records when `/auth/login` registers a session.
- Preserve the current session record shape: `sessionToken`, `playerId`, `platform`, `openid`, `createdAt`, and `expiresAt`.
- Prune expired persisted sessions during load and write boundaries.
- Keep expired bearer behavior unchanged: `401` with `{ ok: false, error: "session expired" }` when a known token is expired.
- Add server tests for file initialization, read/write helpers, persisted session loading, pruning, and simulated restart authorization.
- Update server docs and checkpoint notes.

Out of scope:

- Replacing JSON files with SQLite, Redis, Postgres, or another database.
- Refresh-token rotation.
- Session revocation UI or logout.
- Account linking or migration between web, WeChat, and Douyin identities.
- Server-authoritative generate, merge, board, coin, score, or reward mutation.
- Any client-side token contract change.

## Current Context

Stage 3-C made bearer tokens server-recognized and required matching sessions for player-owned writes. Stage 3-D added session expiration and real platform code exchange boundaries.

Current server behavior:

- `sessions` is a process-local `Map`.
- `registerAuthSession()` writes session records only to memory.
- `getSessionFromAuthorization()` returns active sessions from memory and hides expired sessions as `null`.
- `requirePlayerSession()` distinguishes missing, expired, and mismatched tokens.
- Player data is stored in `server/data/playerData.json`.

The main production gap is restart behavior. A valid client token becomes unusable after server restart because the in-memory `sessions` map is empty.

## Storage Design

Add a separate JSON file:

```text
server/data/sessionData.json
```

The persisted shape should be an object keyed by `sessionToken`:

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

Use an object rather than an array so token lookup, dedupe, and overwrite are deterministic. The in-memory `Map` remains the runtime lookup structure.

Primary helpers:

- `ensureSessionDataFile()` creates `server/data/sessionData.json` when missing.
- `readSessionStore()` returns a plain object and falls back to `{}` on malformed or unreadable data.
- `writeSessionStore(store)` writes the object with stable JSON formatting.
- `serializeSessions(sessionMap, now)` returns a plain object containing only non-expired records.
- `loadSessionsFromStore(store, now)` clears and repopulates the `sessions` map with only non-expired valid records.
- `persistSessionRecord(record, now)` reads the current file, stores the record, prunes expired records, writes the file, and updates the in-memory map.

The design keeps session persistence explicit instead of hiding disk writes inside unrelated player-store helpers.

## Server Flow

Startup:

- `createApp()` should call `ensureDataFile()` and `ensureSessionDataFile()`.
- It should load existing session records into `sessions` before routes are used.
- Expired records should not be loaded back into memory.
- If a corrupted session file is encountered, the server should warn and continue with an empty session store, matching the existing player-store fallback style.

Login:

- `loginPlatformPlayer()` should keep returning the auth session plus `expiresAt`.
- After `registerAuthSession()` creates the record, the record should be persisted through the new session-store helper.
- If a session with the same token already exists, the newer record should overwrite it.

Authorization:

- `getSessionFromAuthorization()` and `requirePlayerSession()` should continue reading from the in-memory `sessions` map.
- No per-request disk read is needed. Disk is the restart persistence boundary, not the hot lookup path.
- Expired known tokens should keep returning the existing `session expired` response in `requirePlayerSession()`.

Pruning:

- Expired records should be removed from the persisted store when sessions are loaded and when a new session is persisted.
- A background cleanup job is unnecessary for this stage.

## Error Handling

- Missing `sessionData.json` should be created automatically.
- Invalid JSON or a non-object store should log a warning and return `{}`.
- Invalid session records in the file should be ignored during load.
- Disk write failures should surface from `writeSessionStore()` in tests, but route-level behavior should remain simple. This local demo server already assumes player-store writes can throw during direct writes.

## Testing Plan

Server unit tests should cover:

- `ensureSessionDataFile()` creates an empty object file.
- `readSessionStore()` reads valid JSON and falls back to `{}` for malformed content.
- `writeSessionStore()` writes stable JSON.
- `loadSessionsFromStore()` loads valid active sessions and skips expired or malformed records.
- `serializeSessions()` prunes expired records.
- `persistSessionRecord()` writes the new record and prunes expired persisted records.
- Simulated restart: register and persist a session, clear `sessions`, load persisted sessions, and verify a player-owned request accepts the bearer token.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

The final TypeScript command is expected to print no `assets/scripts` lines. PowerShell may return exit code 1 when there are no matches; empty output is the expected result.

## Acceptance Criteria

- Server restart can restore active sessions from `server/data/sessionData.json`.
- Expired sessions are not restored or persisted after pruning.
- `/auth/login` persists new session records.
- Existing bearer-token request behavior remains compatible.
- Client code does not change.
- Server tests and existing client tests pass.
