# Stage 3-B Platform Auth and Request Adapter Design

## Goal

Stage 3-B adds a platform login and request integration skeleton for WeChat, Douyin, and browser preview. The goal is to stop treating every player as `demo_player`, route remote calls through platform-aware request adapters, and keep the current browser demo stable.

This stage does not implement real WeChat or Douyin `code` exchange with platform secrets. It creates the client and server seams needed for that later integration.

## Scope

In scope:

- Add a server `/auth/login` endpoint.
- Convert platform login results into a stable server `playerId`.
- Add platform request wrappers for `fetch`, `wx.request`, and `tt.request`.
- Route `StorageManager` remote calls through `PlatformManager.request()`.
- Initialize the game with the authenticated `playerId` when login succeeds.
- Keep local-save and remote-save fallback behavior non-blocking.
- Add tests for server auth behavior, platform request wrappers, and client integration scaffolding.

Out of scope:

- Real WeChat or Douyin app secret exchange.
- Server-authoritative board mutation.
- Payment, share-ticket, anti-cheat, or real session security.
- Full account migration between anonymous web preview and platform accounts.
- UI changes for login status.

## Current Context

The current client already has `PlatformManager`, `WechatAdapter`, `DouyinAdapter`, and a browser `WebAdapter`. The platform adapters support rewarded-video ad behavior and placeholder login methods. `StorageManager` owns remote persistence and currently calls `fetch` directly from its private `request()` method.

`GameManager.initGame()` defaults to `demo_player` and synchronously loads local data. Remote calls are already best-effort: failed remote saves and ad reward validation log warnings but do not block gameplay.

The server stores player records by `playerId` and has `/player/:playerId`, `/leaderboard`, and `/ad/reward`. It does not have a login endpoint yet.

## Server Design

Add `POST /auth/login`.

Request body:

```json
{
  "platform": "wechat",
  "code": "login-code",
  "nickname": "optional name"
}
```

Allowed `platform` values:

- `wechat`
- `douyin`
- `web`

Response body:

```json
{
  "ok": true,
  "platform": "wechat",
  "openid": "wechat_mock_login-code",
  "playerId": "wechat_wechat_mock_login-code",
  "sessionToken": "mock_session_wechat_wechat_mock_login-code"
}
```

Validation:

- Reject missing or non-string `platform`.
- Reject unsupported platform values.
- Reject missing or non-string `code`.
- Trim `platform`, `code`, and `nickname`.
- Use `nickname` only when creating a new default player record.

Mock identity resolver:

- `wechat` maps `code` to `wechat_mock_${code}`.
- `douyin` maps `code` to `douyin_mock_${code}`.
- `web` maps `code` to `web_mock_${code}`.

Player creation:

- Derive `playerId` as `${platform}_${openid}`.
- If the player does not exist, create it with `createDefaultPlayer(playerId, nickname || "游客")`.
- If the player already exists, do not overwrite existing gameplay data.

Session token:

- Return a deterministic placeholder token: `mock_session_${playerId}`.
- This is not a security boundary. It exists to stabilize the client/server contract for later real session validation.

Exports for tests:

- `ALLOWED_AUTH_PLATFORMS`
- `resolveMockPlatformOpenId`
- `createAuthSession`

## Client Platform Design

Define shared platform auth and request result shapes in `PlatformManager.ts`:

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
```

`PlatformManager.login()` should return `PlatformLoginResult` from the selected adapter.

Browser preview:

- `WebAdapter.login()` returns `{ platform: "web", code: "demo_player", mock: true, playerId: "web_demo_player" }`.
- Browser preview remains deterministic and does not require a platform SDK.

WeChat:

- If `wx` is unavailable, return a mock result with `platform: "wechat"` and `code: "mock_wechat_code"`.
- If `wx.login` succeeds, return `platform: "wechat"` and the returned `code`.
- If the SDK returns no usable `code`, reject or return a failure through the login promise.

Douyin:

- If `tt` is unavailable, return a mock result with `platform: "douyin"` and `code: "mock_douyin_code"`.
- If `tt.login` succeeds, return `platform: "douyin"` and the returned `code`.
- If the SDK returns no usable `code`, reject or return a failure through the login promise.

## Client Request Adapter Design

Add `request(url, options)` to each platform adapter and expose it through `PlatformManager.request(url, options)`.

Browser request behavior:

- Use `fetch`.
- Return `{ ok, status, data }`.
- Parse JSON response bodies.
- Throw if `fetch` is not available.

WeChat request behavior:

- If `wx.request` is unavailable, fall back to browser fetch behavior when available.
- If `wx.request` exists, call it with `url`, `method`, `header`, and `data`.
- Parse `options.body` as JSON when possible before passing it as `data`.
- Treat `statusCode` from 200 to 299 as `ok: true`.
- Reject on SDK `fail`.

Douyin request behavior:

- If `tt.request` is unavailable, fall back to browser fetch behavior when available.
- If `tt.request` exists, call it with `url`, `method`, `header`, and `data`.
- Parse `options.body` as JSON when possible before passing it as `data`.
- Treat `statusCode` from 200 to 299 as `ok: true`.
- Reject on SDK `fail`.

`StorageManager.request(path, options)` should call:

```ts
platformManager.request(`${this.remoteBaseUrl}${path}`, options)
```

Then it should preserve existing behavior:

- Throw when the response is not OK.
- Return response data when OK.
- Keep callers' fallback behavior unchanged.

## Client Auth Flow

Add an auth request method to `StorageManager`:

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

async loginRemote(payload: AuthLoginPayload): Promise<AuthLoginResponse | null>
```

`GameManager` should add an async initialization path:

1. Start from a fallback player id:
   - `web_demo_player` for browser preview when available.
   - `demo_player` only as the final fallback.
2. Call `platformManager.login()`.
3. Call `storageManager.loginRemote()` with the platform login result.
4. If `/auth/login` succeeds, use `auth.playerId`.
5. If any login or remote auth step fails, use the fallback player id and continue.
6. Load local data using the selected player id.
7. Continue existing board initialization and `GAME_INIT` emission.

The implementation must avoid blocking core gameplay on remote auth failure. A player should still be able to preview, generate, merge, claim daily rewards, and use mock ad rewards when the server is offline.

## Local Save Boundary

The current local save key is global. This means switching from `demo_player` to a platform player id could load old local data with the wrong `playerId`.

Stage 3-B should make local save player-aware:

- Store local data under `AI_GODDESS_MERGE_PLAYER_DATA_${playerId}`.
- Keep a one-time fallback read from the legacy key for compatibility.
- When legacy data is loaded for an authenticated player, normalize its `playerId` to the selected player id before saving.

This avoids one platform account accidentally continuing another account's local snapshot.

## Error Handling

Server:

- Auth validation failures return `400` and `{ ok: false, error }`.
- Unexpected errors continue to use the existing error middleware.

Client:

- Platform login errors are caught by `GameManager` and fall back to local play.
- Request adapter SDK failures reject the promise.
- `StorageManager` methods keep their existing catch-and-fallback behavior.
- No login error is shown in the UI during this stage.

## Testing Plan

Server tests:

- `POST /auth/login` returns deterministic player identity for `wechat`.
- `POST /auth/login` creates a default player record when one does not exist.
- Existing player data is not overwritten by a repeat login.
- Invalid platform and missing code return `400`.
- `resolveMockPlatformOpenId` maps `wechat`, `douyin`, and `web` deterministically.

Client scaffold tests:

- `PlatformManager` exports `PlatformLoginResult`, `PlatformRequestOptions`, and `PlatformResponse`.
- `StorageManager` defines `loginRemote()` and calls `/auth/login`.
- `StorageManager.request()` routes through `platformManager.request()` instead of direct `fetch`.
- `GameManager` attempts platform login and remote auth before selecting the player id.
- Local save keys include the selected player id and include a legacy fallback path.

Platform adapter tests:

- Web request uses `fetch` and returns parsed JSON.
- WeChat request uses `wx.request` when available.
- Douyin request uses `tt.request` when available.
- WeChat and Douyin request wrappers reject on SDK failure.
- WeChat and Douyin login wrappers return a standard `PlatformLoginResult`.

Verification commands:

```powershell
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts
npx.cmd --yes --package typescript@5.4.5 tsc --noEmit 2>&1 | Select-String -Pattern 'assets/scripts'
```

The final TypeScript command is expected to print no `assets/scripts` lines. Full unfiltered TypeScript output may still include existing Cocos engine declaration and Node test type environment errors.

## Acceptance Criteria

- Browser preview can start without a platform SDK.
- WeChat and Douyin login wrappers return standardized login payloads.
- `/auth/login` returns a deterministic `playerId` and placeholder session token.
- Remote save, remote load, leaderboard, and ad reward validation all use the platform-aware request path.
- Core gameplay remains available when auth or remote requests fail.
- Local save data is scoped by player id with legacy fallback.
- Server and client tests pass.

