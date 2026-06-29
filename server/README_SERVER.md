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

### Leaderboard

```bash
curl http://localhost:3000/leaderboard
```

### Ad Reward

```bash
curl -X POST http://localhost:3000/ad/reward \
  -H "Content-Type: application/json" \
  -d '{"playerId":"demo_player","rewardType":"clear_low_items","clientRewardValue":3,"clientCoins":100,"clientScore":200,"clientHighestItemLevel":3}'
```

Optional client context fields: `clientRewardValue`, `clientCoins`, `clientScore`, `clientHighestItemLevel`.

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
