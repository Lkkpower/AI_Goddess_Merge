# AI Goddess Merge Server

Node.js + Koa backend for the first playable demo.

## Install

```bash
cd server
npm install
```

## Start

```bash
npm start
```

The service listens on `http://localhost:3000` by default.

## API

### Health

```bash
curl http://localhost:3000/health
```

### Read Player

```bash
curl http://localhost:3000/player/demo_player
```

### Save Player

```bash
curl -X POST http://localhost:3000/player/demo_player \
  -H "Content-Type: application/json" \
  -d '{"playerId":"demo_player","nickname":"游客","coins":100,"score":200,"highestItemLevel":3,"unlockedSkins":[],"board":[],"adWatchCount":0}'
```

Save compatibility boundary:

- Web sessions keep broad full-player save compatibility for browser and Cocos preview.
- WeChat and Douyin sessions may still call this endpoint, but server-owned gameplay fields are preserved from the stored player record.
- Locked platform full saves cannot overwrite `board`, `coins`, `score`, `highestItemLevel`, `unlockedSkins`, `adWatchCount`, `lastAdRewardTime`, `lastAdRewardType`, or `lastAdRewardClientContext`.
- Platform board creation, generation, and merge results must go through the board command endpoints below.
- Platform ad reward effects and daily rewards must go through the economy command endpoints below.

### Board Ensure

Creates the initial remote board only when the authenticated player's persisted board has no occupied cells.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/board/ensure \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json"
```

### Board Generate

Generates one server-selected low-level item into an empty board cell.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/board/generate \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json"
```

### Board Merge

Merges two occupied cells when both item IDs match and the item is not max level.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/board/merge \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json" \
  -d '{"fromIndex":0,"toIndex":1}'
```

Board action errors return `{ "ok": false, "error": "<CODE>" }`. Current codes are `BOARD_FULL`, `INVALID_CELL_INDEX`, `EMPTY_SOURCE_CELL`, `EMPTY_TARGET_CELL`, `ITEM_MISMATCH`, `ITEM_MAX_LEVEL`, and `PLAYER_NOT_FOUND`.

### Daily Reward Command

Claims the authenticated player's daily reward server-side and returns the updated player data.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/economy/daily-reward \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json"
```

Duplicate same-day claims return `{ "ok": false, "error": "DAILY_REWARD_ALREADY_CLAIMED" }`.

### Ad Reward Command

Applies the authenticated player's rewarded-ad effect server-side and returns the updated player data.

```bash
curl -X POST http://localhost:3000/player/web_web_mock_demo_player/economy/ad-reward \
  -H "Authorization: Bearer mock_session_web_web_mock_demo_player" \
  -H "Content-Type: application/json" \
  -d '{"rewardType":"coin_bonus"}'
```

Supported `rewardType` values are `clear_low_items`, `coin_bonus`, and `high_level_item`. Rapid duplicate claims are rejected with `{ "ok": false, "error": "ad reward claim is too frequent" }`; spawning a high-level item on a full board returns `BOARD_FULL`.

### Leaderboard

```bash
curl http://localhost:3000/leaderboard
```

### Ad Reward Validation Compatibility

```bash
curl -X POST http://localhost:3000/ad/reward \
  -H "Content-Type: application/json" \
  -d '{"playerId":"demo_player","rewardType":"clear_low_items","clientRewardValue":3,"clientCoins":100,"clientScore":200,"clientHighestItemLevel":3}'
```

Optional client context fields: `clientRewardValue`, `clientCoins`, `clientScore`, `clientHighestItemLevel`.

This compatibility endpoint records ad claim metadata and does not apply economy effects. Platform clients should use `POST /player/:playerId/economy/ad-reward` for reward effects.

## Data

Player data is stored in `server/data/playerData.json` for the demo.
Auth sessions are stored in `server/data/sessionData.json` so active bearer tokens can survive a local server restart.

```json
{
  "playerId": "demo_player",
  "nickname": "游客",
  "coins": 0,
  "score": 0,
  "highestItemLevel": 0,
  "unlockedSkins": [],
  "board": [],
  "adWatchCount": 0,
  "lastAdRewardTime": 0,
  "lastAdRewardType": "",
  "lastAdRewardClientContext": null,
  "lastSaveTime": 0
}
```

After an accepted ad reward, `lastAdRewardClientContext` stores the optional client context fields from the `/ad/reward` request.
After an accepted economy ad reward command, `lastAdRewardClientContext.serverRewardValue` stores the server-applied reward value.

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

## Notes

- This JSON-file store is for local demo only.
- Use a database or managed session store before production traffic.
- Add server-side ad verification before enabling real rewards.
