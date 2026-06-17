# Stage 3-C Session Validation and Light Migration Design

## Goal

Stage 3-C turns the Stage 3-B placeholder `sessionToken` into a server-recognized session contract and adds lightweight local account migration. The goal is to stop trusting only request-body `playerId` values for player-owned writes while keeping browser preview and offline fallback usable.

This stage still uses deterministic mock platform identity. It does not add real WeChat or Douyin secret exchange, persistent server sessions, server-authoritative board mutation, or a backend account merge endpoint.

## Scope

In scope:

- Store mock sessions server-side after `/auth/login`.
- Add reusable server session helpers for parsing and validating `Authorization: Bearer <sessionToken>`.
- Require valid session ownership for player save and ad reward claim writes.
- Allow player reads to use session ownership when a token is provided, while preserving public fallback for preview compatibility.
- Keep leaderboard reads public.
- Store the latest `sessionToken` on the client after `loginRemote()`.
- Attach `Authorization` headers to player save, player load, and ad reward claim requests when a session token exists.
- Preserve non-blocking gameplay when auth or remote requests fail.
- Keep account migration lightweight and local: legacy local data loaded for a newly authenticated player is normalized to the selected `playerId` and saved under the new player-scoped local key.
- Add tests for server session behavior, client token propagation, and migration scaffold.

Out of scope:

- Real platform code exchange with app secrets.
- Persistent session database or token expiration.
- `/auth/migrate` or server-side account merge.
- Full anti-cheat.
- Server-authoritative generate, merge, board, coins, or score mutation.
- Login status UI.
- Changing core merge rules.

## Current Context

Stage 3-B added `POST /auth/login`, deterministic `playerId` derivation, platform request wrappers, `StorageManager.loginRemote()`, and player-scoped local saves.

Current server behavior:

- `/auth/login` returns `sessionToken: mock_session_${playerId}`.
- The server does not remember issued sessions beyond deterministic token construction.
- `/player/:playerId` writes validate body shape but do not validate session ownership.
- `/ad/reward` trusts `body.playerId`.
- `/leaderboard` is public.

Current client behavior:

- `GameManager` logs in through `platformManager.login()` and `storageManager.loginRemote()`.
- `GameManager` uses `auth.playerId` when remote login succeeds.
- `StorageManager.request()` routes through `PlatformManager.request()`.
- `StorageManager.loadLocal(playerId)` reads player-scoped data first, then the legacy local key, and normalizes the loaded `playerId`.
- The returned `sessionToken` is not stored or sent on later requests.

## Server Session Design

Add an in-memory session store:

```js
const sessions = new Map();
```

Session record shape:

```js
{
  sessionToken: "mock_session_wechat_wechat_mock_login-code",
  playerId: "wechat_wechat_mock_login-code",
  platform: "wechat",
  openid: "wechat_mock_login-code",
  createdAt: 1781450000000
}
```

`loginPlatformPlayer(store, payload, now)` should register or refresh the session after `createAuthSession(payload)` succeeds.

Add helpers:

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

function getSessionFromAuthorization(headerValue) {
  const token = parseBearerToken(headerValue);
  return token ? sessions.get(token) || null : null;
}

function requirePlayerSession(ctx, expectedPlayerId) {
  const session = getSessionFromAuthorization(ctx.get("authorization"));
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

The exact implementation can avoid `ctx.get()` in unit tests by using a small `getAuthorizationHeader(ctx)` helper, as long as Koa routes read the real `Authorization` header.

Exports for tests:

- `sessions`
- `registerAuthSession`
- `parseBearerToken`
- `getSessionFromAuthorization`
- `requirePlayerSession`

## Server Route Behavior

`POST /auth/login`:

- Keeps the existing request/response shape.
- Creates or preserves the player record exactly as Stage 3-B does.
- Registers the returned `sessionToken` in the in-memory session store.
- Repeated login for the same deterministic identity refreshes the session `createdAt` but does not overwrite existing gameplay data.

`POST /player/:playerId`:

- Requires a valid bearer token.
- Rejects missing or unknown session with `401`.
- Rejects a token for another `playerId` with `403`.
- Keeps existing body validation and save merge behavior after ownership passes.
- Continues preserving server-owned ad metadata during normal saves.

`POST /ad/reward`:

- Requires `body.playerId` as today.
- Requires a valid bearer token for that same `playerId`.
- Rejects missing or unknown session with `401`.
- Rejects player mismatch with `403`.
- Keeps existing reward type validation and cooldown behavior after ownership passes.

`GET /player/:playerId`:

- If no token is supplied, preserve the current public read behavior for preview compatibility.
- If a token is supplied and invalid, return `401`.
- If a token is supplied for a different player, return `403`.
- If a token is valid for the requested player, return that player record.

`GET /leaderboard`:

- Remains public.
- No token required.

## Client Token Design

`StorageManager` should store the latest session token in memory:

```ts
private sessionToken = "";
```

Add methods:

```ts
setSessionToken(sessionToken: string): void
getSessionToken(): string
clearSessionToken(): void
```

`loginRemote(payload)` should:

- Call `/auth/login` as today.
- If the response contains `ok: true` and a non-empty `sessionToken`, store it.
- Return the auth response unchanged.
- Leave `sessionToken` empty when login fails or returns invalid data.

Authenticated request headers:

- Add a helper that merges existing headers with Authorization:

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

Use `withAuthHeaders()` for:

- `saveRemote(playerData)`
- `loadRemote(playerId)`
- `claimAdReward(payload)`

Do not require auth headers for:

- `loginRemote(payload)`
- `loadLeaderboard()`

Remote failure behavior stays unchanged: methods catch failures and return `false`, `null`, or fallback data as they do now.

## Light Local Migration Design

The selected account migration behavior is lightweight and local only.

Stage 3-B already reads the player-scoped key first and then the legacy key:

```ts
AI_GODDESS_MERGE_PLAYER_DATA_${playerId}
AI_GODDESS_MERGE_PLAYER_DATA
```

Stage 3-C should make the migration explicit and testable:

- When legacy local data is loaded for a selected authenticated `playerId`, normalize `data.playerId = playerId`.
- Mark or expose that the loaded data came from the legacy key so `GameManager` can save it under the player-scoped key during initialization.
- The simplest acceptable implementation is for `StorageManager.loadLocal(playerId)` to save the normalized data immediately to `AI_GODDESS_MERGE_PLAYER_DATA_${playerId}` when it falls back to the legacy key.
- Do not delete the legacy key in Stage 3-C. Keeping it avoids accidental data loss while testing platform identity.
- Do not merge two player-scoped local records. If a player-scoped record exists, it wins over legacy data.

This gives first login a natural migration path: existing browser preview progress appears under the authenticated account locally, and future saves use the authenticated key.

## Error Handling

Server:

- Missing or unknown session returns `401` with `{ ok: false, error: "session is required" }`.
- Player mismatch returns `403` with `{ ok: false, error: "session player mismatch" }`.
- Existing validation failures continue returning `400`.
- Unexpected errors continue through the existing error middleware.

Client:

- Auth failures still do not block local play.
- Unauthorized remote save, load, or ad reward validation failures are logged by existing catch paths and do not block local play.
- No UI error is added in this stage.

## Testing Plan

Server tests:

- `registerAuthSession()` stores a session record with token, player id, platform, openid, and timestamp.
- `parseBearerToken()` accepts case-insensitive `Bearer` headers and rejects malformed headers.
- `getSessionFromAuthorization()` returns the stored session or `null`.
- `requirePlayerSession()` returns the matching session, sets `401` for missing session, and sets `403` for player mismatch.
- `loginPlatformPlayer()` registers the session token it returns.
- Player save rejects missing session.
- Player save rejects a token for another player.
- Player save succeeds with a matching token.
- Ad reward claim rejects missing or mismatched session.
- Public leaderboard still does not require a token.

Client scaffold tests:

- `StorageManager` has `private sessionToken`.
- `StorageManager.loginRemote()` stores `response.sessionToken`.
- `StorageManager` exposes session token set/get/clear helpers.
- `saveRemote()`, `loadRemote()`, and `claimAdReward()` call `withAuthHeaders()`.
- `loginRemote()` does not attach Authorization to `/auth/login`.
- `loadLeaderboard()` remains unauthenticated.
- `loadLocal(playerId)` explicitly persists normalized legacy data to the player-scoped key, or exposes equivalent migration state.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

The final TypeScript command is expected to print no `assets/scripts` lines. Full unfiltered TypeScript output may still include existing Cocos engine declaration and Node test type environment errors.

## Acceptance Criteria

- `/auth/login` still returns deterministic mock identity and `sessionToken`.
- The server stores issued session tokens in memory.
- Player writes and ad reward claims require a matching bearer token.
- Mismatched player tokens cannot save or claim rewards for another account.
- Leaderboard reads remain public.
- Client remote player save, player load, and ad reward validation include Authorization after successful login.
- Login and leaderboard requests do not require Authorization.
- Browser preview and offline fallback remain usable when auth or remote calls fail.
- Legacy local data can be normalized and saved under the authenticated player key without a backend migration endpoint.
- Server and client tests pass.
