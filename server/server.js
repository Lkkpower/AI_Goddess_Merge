const Koa = require("koa");
const Router = require("@koa/router");
const bodyParser = require("koa-bodyparser");
const cors = require("@koa/cors");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "playerData.json");
const ALLOWED_REWARD_TYPES = ["clear_low_items", "coin_bonus", "high_level_item"];
const AD_REWARD_COOLDOWN_MS = 30 * 1000;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

function readPlayerStore() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("[server] failed to read player store", error);
    return {};
  }
}

function writePlayerStore(store) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function createDefaultPlayer(playerId, nickname = "游客") {
  return {
    playerId,
    nickname,
    coins: 0,
    score: 0,
    highestItemLevel: 0,
    unlockedSkins: [],
    board: [],
    adWatchCount: 0,
    lastAdRewardTime: 0,
    lastAdRewardType: "",
    lastAdRewardClientContext: null,
    lastSaveTime: Date.now(),
  };
}

function validatePlayerData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("player data must be an object");
  }
  if (!data.playerId || typeof data.playerId !== "string") {
    throw new Error("playerId must be a string");
  }
  if (typeof data.coins !== "number") {
    throw new Error("coins must be a number");
  }
  if (typeof data.score !== "number") {
    throw new Error("score must be a number");
  }
  if (typeof data.highestItemLevel !== "number") {
    throw new Error("highestItemLevel must be a number");
  }
  if (!Array.isArray(data.unlockedSkins)) {
    throw new Error("unlockedSkins must be an array");
  }
  if (!Array.isArray(data.board)) {
    throw new Error("board must be an array");
  }
}

function getLeaderboard(store) {
  return Object.values(store)
    .map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname || "游客",
      score: Number(player.score) || 0,
      highestItemLevel: Number(player.highestItemLevel) || 0,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.highestItemLevel - a.highestItemLevel;
    })
    .slice(0, 20);
}

function getRewardValue(rewardType) {
  if (rewardType === "clear_low_items") {
    return 3;
  }
  if (rewardType === "coin_bonus") {
    return 120;
  }
  if (rewardType === "high_level_item") {
    return 4;
  }
  throw new Error("Invalid rewardType");
}

function normalizeAdRewardClientContext(body) {
  return {
    clientRewardValue: Number(body.clientRewardValue) || 0,
    clientCoins: Number(body.clientCoins) || 0,
    clientScore: Number(body.clientScore) || 0,
    clientHighestItemLevel: Number(body.clientHighestItemLevel) || 0,
  };
}

function claimAdRewardForPlayer(store, body, now = Date.now()) {
  const { playerId, rewardType } = body || {};
  if (!playerId || typeof playerId !== "string") {
    throw new Error("playerId is required");
  }
  if (!ALLOWED_REWARD_TYPES.includes(rewardType)) {
    throw new Error("rewardType is invalid");
  }

  const player = store[playerId] || createDefaultPlayer(playerId);
  const lastAdRewardTime = Number(player.lastAdRewardTime) || 0;
  if (lastAdRewardTime > 0 && now - lastAdRewardTime < AD_REWARD_COOLDOWN_MS) {
    throw new Error("ad reward claim is too frequent");
  }

  player.adWatchCount = (Number(player.adWatchCount) || 0) + 1;
  player.lastAdRewardTime = now;
  player.lastAdRewardType = rewardType;
  player.lastAdRewardClientContext = normalizeAdRewardClientContext(body);
  player.lastSaveTime = now;
  store[playerId] = player;

  return {
    ok: true,
    rewardType,
    rewardValue: getRewardValue(rewardType),
    adWatchCount: player.adWatchCount,
    lastAdRewardTime: player.lastAdRewardTime,
  };
}

function sendBadRequest(ctx, message) {
  ctx.status = 400;
  ctx.body = {
    ok: false,
    error: message,
  };
}

async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (error) {
    console.error("[server] internal error", error);
    ctx.status = 500;
    ctx.body = {
      ok: false,
      error: "Internal Server Error",
    };
  }
}

function createApp() {
  ensureDataFile();

  const app = new Koa();
  const router = new Router();

  app.use(errorHandler);
  app.use(cors());
  app.use(bodyParser());

  router.get("/health", (ctx) => {
    ctx.body = {
      ok: true,
      message: "AI Goddess Merge server is running",
    };
  });

  router.get("/player/:playerId", (ctx) => {
    const { playerId } = ctx.params;
    if (!playerId) {
      sendBadRequest(ctx, "playerId is required");
      return;
    }

    const store = readPlayerStore();
    ctx.body = store[playerId] || createDefaultPlayer(playerId);
  });

  router.post("/player/:playerId", (ctx) => {
    const { playerId } = ctx.params;
    if (!playerId) {
      sendBadRequest(ctx, "playerId is required");
      return;
    }

    const body = ctx.request.body || {};
    const data = {
      ...body,
      playerId: body.playerId || playerId,
      nickname: body.nickname || "游客",
      lastSaveTime: Date.now(),
    };

    if (data.playerId !== playerId) {
      sendBadRequest(ctx, "body.playerId must match URL playerId");
      return;
    }

    try {
      validatePlayerData(data);
    } catch (error) {
      sendBadRequest(ctx, error.message);
      return;
    }

    const store = readPlayerStore();
    store[playerId] = data;
    writePlayerStore(store);
    ctx.body = {
      ok: true,
      playerId,
    };
  });

  router.get("/leaderboard", (ctx) => {
    const store = readPlayerStore();
    ctx.body = getLeaderboard(store);
  });

  router.post("/ad/reward", (ctx) => {
    const store = readPlayerStore();
    try {
      const result = claimAdRewardForPlayer(store, ctx.request.body || {});
      writePlayerStore(store);
      ctx.body = result;
    } catch (error) {
      sendBadRequest(ctx, error.message);
    }
  });

  app.use(router.routes());
  app.use(router.allowedMethods());
  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`AI Goddess Merge server is running at http://localhost:${PORT}`);
  });
}

module.exports = {
  createApp,
  ensureDataFile,
  readPlayerStore,
  writePlayerStore,
  createDefaultPlayer,
  validatePlayerData,
  getLeaderboard,
  getRewardValue,
  ALLOWED_REWARD_TYPES,
  AD_REWARD_COOLDOWN_MS,
  normalizeAdRewardClientContext,
  claimAdRewardForPlayer,
  sendBadRequest,
  errorHandler,
};
