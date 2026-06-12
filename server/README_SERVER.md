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
  -d '{"playerId":"demo_player","rewardType":"clear_low_items"}'
```

## Data

Player data is stored in `server/data/playerData.json` for the demo.

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
  "lastSaveTime": 0
}
```

## Notes

- This JSON-file store is for local demo only.
- Use a database and login/session validation before production.
- Add server-side ad verification before enabling real rewards.
