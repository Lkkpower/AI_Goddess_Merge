# Stage 3-D Platform Code Exchange Design

## Goal

Stage 3-D replaces the purely deterministic platform-auth placeholder with a real platform code-exchange boundary while preserving local preview stability. The server should be able to exchange WeChat or Douyin login codes when production credentials are configured, but it should keep the existing mock identity path for browser preview, tests, and incomplete local configuration.

This stage also adds a small session-expiration boundary so the current in-memory sessions have a clearer contract. It does not introduce a database, account merge flow, or server-authoritative board mutation.

## Scope

In scope:

- Add a server-side platform auth provider boundary for `web`, `wechat`, and `douyin`.
- Keep `web` login deterministic and mock-only.
- Keep `wechat` and `douyin` mock fallback when real platform credentials are incomplete.
- Use real code exchange for `wechat` and `douyin` when the required environment variables are present.
- Keep `/auth/login` response shape compatible with Stage 3-B and Stage 3-C: `ok`, `platform`, `openid`, `playerId`, and `sessionToken`.
- Add `expiresAt` to successful `/auth/login` responses as a backward-compatible extra field.
- Keep player identity stable as `playerId = ${platform}_${openid}`.
- Add `expiresAt` to session records.
- Reject expired bearer sessions through the existing player-owned request guard.
- Keep local gameplay available when remote auth fails.
- Add tests for config detection, mock fallback, successful platform exchange, failed platform exchange, session expiration, and existing login compatibility.

Out of scope:

- Persistent session storage.
- Refresh tokens.
- Account linking or account merge.
- Real secret values in source control.
- Client-side storage of platform secrets.
- Server-authoritative generate, merge, board, coins, score, or reward mutation.
- Login status UI.
- Replacing the current local-save migration.

## Current Context

Stage 3-B added platform login and request wrappers, `POST /auth/login`, deterministic mock identity, and player-scoped local saves. Stage 3-C made issued session tokens server-recognized, required matching bearer sessions for player-owned writes, attached tokens from the client, and explicitly migrated legacy local saves under the authenticated player key.

Current server behavior:

- `createAuthSession(payload)` derives `openid`, `playerId`, and `sessionToken` deterministically from the submitted platform and code.
- `loginPlatformPlayer(store, payload, now)` registers an in-memory session and creates a default player when needed.
- Session records include `sessionToken`, `playerId`, `platform`, `openid`, and `createdAt`.
- Session records do not expire.
- `/auth/login` is synchronous and does not call real platform APIs.

Current client behavior:

- WeChat and Douyin adapters return platform login results with `platform`, `code`, and optional `playerId`.
- `GameManager` sends the platform login result to `StorageManager.loginRemote()`.
- `StorageManager.loginRemote()` stores a successful `sessionToken`.
- Player save, player load, and ad reward validation already send bearer auth after login succeeds.

## Auth Provider Design

Add a server-side auth provider boundary that turns a login payload into a normalized platform identity.

Normalized identity shape:

```js
{
  platform: "wechat",
  openid: "real-or-mock-openid",
  unionid: "optional-unionid"
}
```

Primary helpers:

- `resolvePlatformAuthConfig(env)` returns the real exchange configuration for each platform.
- `hasCompletePlatformAuthConfig(config, platform)` returns whether a platform can use real exchange.
- `exchangePlatformCode(payload, config, fetchImpl)` returns a normalized identity.
- `createAuthSessionFromIdentity(identity)` creates the existing auth session response fields from a normalized identity.

`exchangePlatformCode()` behavior:

- `web`: always return deterministic mock identity.
- `wechat`: if config is incomplete, return deterministic mock identity; if config is complete, call the WeChat code exchange endpoint.
- `douyin`: if config is incomplete, return deterministic mock identity; if config is complete, call the Douyin code exchange endpoint.
- Unsupported platforms still fail validation.
- Empty or non-string `code` still fails validation.

Mock fallback remains deterministic:

```js
openid = `${platform}_mock_${code}`
playerId = `${platform}_${openid}`
sessionToken = `mock_session_${playerId}`
```

The real exchange path should not expose raw platform responses to the rest of the server. It should map provider-specific response shapes into the normalized identity and reject missing `openid`.

## Configuration Design

Read platform credentials from environment variables. No credentials are committed to the repository.

Suggested variables:

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_CODE_EXCHANGE_URL`
- `DOUYIN_APP_ID`
- `DOUYIN_APP_SECRET`
- `DOUYIN_CODE_EXCHANGE_URL`
- `AUTH_SESSION_TTL_MS`

Default exchange URLs can be provided by code, but tests should not depend on live network calls. Production can override the URL through environment variables if a gateway or proxy is used.

`AUTH_SESSION_TTL_MS` defaults to a conservative development-friendly value such as seven days. Invalid or non-positive values fall back to the default.

Configuration policy:

- Missing app id, secret, or exchange URL means mock fallback for that platform.
- Complete configuration means real exchange is attempted.
- Complete configuration plus exchange failure means `/auth/login` fails instead of silently falling back to mock. This prevents production misconfiguration from creating fake identities.

## Server Route Behavior

`POST /auth/login` remains the only login endpoint.

Successful login:

- Validate `platform` and `code`.
- Resolve normalized identity through the auth provider boundary.
- Create or preserve the player record.
- Register a session with `createdAt` and `expiresAt`.
- Return the existing auth response shape plus `expiresAt`.

Failed login:

- Invalid request payload returns `400`.
- Real exchange provider errors return `502` with a concise error such as `{ ok: false, error: "platform auth exchange failed" }`.
- Real exchange responses missing `openid` return `502`.
- The client already treats failed remote login as non-blocking and continues local play.

No other route needs a new client contract in this stage.

## Session Expiration Design

Extend session records:

```js
{
  sessionToken: "mock_session_wechat_wechat_mock_login-code",
  playerId: "wechat_wechat_mock_login-code",
  platform: "wechat",
  openid: "wechat_mock_login-code",
  createdAt: 1781450000000,
  expiresAt: 1782054800000
}
```

Add helpers:

- `getSessionTtlMs(env)` reads and validates `AUTH_SESSION_TTL_MS`.
- `isSessionExpired(session, now)` returns whether `now >= session.expiresAt`.
- `registerAuthSession(session, now, ttlMs)` stores `expiresAt`.
- `getSessionFromAuthorization(headerValue, now)` returns the stored active session or `null` for missing, unknown, or expired sessions.

For player-owned guards:

- Missing or unknown token keeps returning `401`.
- Expired token returns `401` with `{ ok: false, error: "session expired" }`.
- Player mismatch keeps returning `403`.

Expired sessions may remain in the map until a later cleanup pass. A cleanup job is out of scope.

## Client Design

Client changes should stay minimal.

No platform secret is added to client code. WeChat and Douyin adapters continue to call the platform SDK login API and return a code. `StorageManager.loginRemote()` continues sending `{ platform, code, nickname }` to `/auth/login`.

- The server returns `expiresAt`, and the client may ignore it in this stage.
- `StorageManager` only needs to keep the `sessionToken` behavior from Stage 3-C.

Remote auth failures remain non-blocking. `GameManager` should continue falling back to `login.playerId || "demo_player"` when remote auth fails.

## Error Handling

Server:

- Payload validation errors return `400`.
- Incomplete platform config uses mock fallback.
- Complete platform config with network failure, non-OK provider response, invalid JSON, provider error fields, or missing `openid` returns `502`.
- Expired bearer sessions return `401`.
- Existing validation failures for player save and ad reward remain unchanged.

Client:

- Login failure logs through existing catch paths.
- Local play remains available.
- No new UI message is added in this stage.

## Testing Plan

Server unit tests:

- `resolvePlatformAuthConfig()` reads WeChat, Douyin, and TTL environment variables.
- `hasCompletePlatformAuthConfig()` only returns true when required values are present.
- `exchangePlatformCode()` returns deterministic mock identity for `web`.
- `exchangePlatformCode()` returns deterministic mock identity for WeChat or Douyin when config is incomplete.
- `exchangePlatformCode()` calls injected fake fetch when config is complete.
- WeChat successful fake exchange maps response `openid` into `playerId`.
- Douyin successful fake exchange maps response `openid` into `playerId`.
- Provider failure, missing `openid`, rejected fetch, and invalid JSON surface as auth exchange failures.
- `registerAuthSession()` stores `expiresAt`.
- `isSessionExpired()` covers before, at, and after expiry.
- Player-owned write guards reject expired bearer sessions.
- Existing Stage 3-C session ownership tests still pass.

Client scaffold tests:

- WeChat and Douyin adapters still expose login code contracts.
- `StorageManager.loginRemote()` continues calling `/auth/login`.
- `StorageManager` still stores `sessionToken`.
- No client code contains platform secret variable names such as app secret literals.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

The final TypeScript command is expected to print no `assets/scripts` lines. Full unfiltered TypeScript output may still include existing Cocos engine declaration and Node test type environment errors.

## Acceptance Criteria

- Browser preview and local automated tests work without real platform credentials.
- `/auth/login` still supports deterministic `web` login.
- WeChat and Douyin mock fallback remains deterministic when config is incomplete.
- WeChat and Douyin real exchange is attempted when config is complete.
- Complete config with exchange failure does not silently create mock identities.
- Server sessions include `expiresAt`.
- Expired sessions cannot authorize player saves or ad reward claims.
- Existing Stage 3-C authenticated request behavior remains compatible.
- No platform secret is committed to source control.
- Server and client tests pass.
