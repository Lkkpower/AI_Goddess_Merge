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
const ALLOWED_AUTH_PLATFORMS = ["wechat", "douyin", "web"];
const AD_REWARD_COOLDOWN_MS = 30 * 1000;
const sessions = new Map();

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

function mergePlayerSaveData(existingPlayer, incomingData, now = Date.now()) {
  const existingAdWatchCount = Number(existingPlayer && existingPlayer.adWatchCount);
  const adWatchCount = Number.isFinite(existingAdWatchCount) ? existingAdWatchCount : 0;
  const defaultPlayer = createDefaultPlayer(incomingData.playerId, incomingData.nickname);

  return {
    ...defaultPlayer,
    ...incomingData,
    adWatchCount,
    lastAdRewardTime: existingPlayer && existingPlayer.lastAdRewardTime !== undefined
      ? existingPlayer.lastAdRewardTime
      : incomingData.lastAdRewardTime ?? defaultPlayer.lastAdRewardTime,
    lastAdRewardType: existingPlayer && existingPlayer.lastAdRewardType !== undefined
      ? existingPlayer.lastAdRewardType
      : incomingData.lastAdRewardType ?? defaultPlayer.lastAdRewardType,
    lastAdRewardClientContext: existingPlayer && existingPlayer.lastAdRewardClientContext !== undefined
      ? existingPlayer.lastAdRewardClientContext
      : incomingData.lastAdRewardClientContext ?? defaultPlayer.lastAdRewardClientContext,
    lastSaveTime: now,
  };
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function resolveMockPlatformOpenId(platform, code) {
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  return `${platform}_mock_${code}`;
}

function createAuthSession(payload) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }

  const openid = resolveMockPlatformOpenId(platform, code);
  const playerId = `${platform}_${openid}`;
  return {
    ok: true,
    platform,
    openid,
    playerId,
    sessionToken: `mock_session_${playerId}`,
  };
}

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

function getAuthorizationHeader(ctx) {
  if (ctx && typeof ctx.get === "function") {
    return ctx.get("authorization");
  }
  return ctx && ctx.request && ctx.request.headers
    ? ctx.request.headers.authorization || ctx.request.headers.Authorization || ""
    : "";
}

function getSessionFromAuthorization(headerValue) {
  const token = parseBearerToken(headerValue);
  return token ? sessions.get(token) || null : null;
}

function requirePlayerSession(ctx, expectedPlayerId) {
  const session = getSessionFromAuthorization(getAuthorizationHeader(ctx));
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

function loginPlatformPlayer(store, payload, now = Date.now()) {
  const session = createAuthSession(payload);
  const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : "";

  if (!store[session.playerId]) {
    const player = createDefaultPlayer(session.playerId, nickname || "游客");
    player.lastSaveTime = now;
    store[session.playerId] = player;
  }

  registerAuthSession(session, now);
  return session;
}

function handleAuthLogin(ctx, store, now = Date.now()) {
  try {
    ctx.body = loginPlatformPlayer(store, ctx.request.body || {}, now);
  } catch (error) {
    sendBadRequest(ctx, error.message);
  }
}

function handlePlayerLoad(ctx, store) {
  const { playerId } = ctx.params;
  if (!playerId) {
    sendBadRequest(ctx, "playerId is required");
    return;
  }

  const authorization = getAuthorizationHeader(ctx);
  if (authorization) {
    const session = requirePlayerSession(ctx, playerId);
    if (!session) {
      return;
    }
  }

  ctx.body = store[playerId] || createDefaultPlayer(playerId);
}

function handlePlayerSave(ctx, store, now = Date.now()) {
  const { playerId } = ctx.params;
  if (!playerId) {
    sendBadRequest(ctx, "playerId is required");
    return;
  }
  const session = requirePlayerSession(ctx, playerId);
  if (!session) {
    return;
  }

  const body = ctx.request.body || {};
  const incomingData = {
    ...body,
    playerId: body.playerId || playerId,
    nickname: body.nickname || "游客",
    lastSaveTime: now,
  };

  if (incomingData.playerId !== playerId) {
    sendBadRequest(ctx, "body.playerId must match URL playerId");
    return;
  }

  try {
    validatePlayerData(incomingData);
  } catch (error) {
    sendBadRequest(ctx, error.message);
    return;
  }

  const data = mergePlayerSaveData(store[playerId], incomingData, now);
  store[playerId] = data;
  ctx.body = {
    ok: true,
    playerId,
  };
}

function handleAdRewardClaim(ctx, store, now = Date.now()) {
  const body = ctx.request.body || {};
  const playerId = body.playerId;
  if (!playerId || typeof playerId !== "string") {
    sendBadRequest(ctx, "playerId is required");
    return;
  }
  const session = requirePlayerSession(ctx, playerId);
  if (!session) {
    return;
  }

  try {
    ctx.body = claimAdRewardForPlayer(store, body, now);
  } catch (error) {
    sendBadRequest(ctx, error.message);
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

  router.post("/auth/login", (ctx) => {
    const store = readPlayerStore();
    handleAuthLogin(ctx, store);
    if (ctx.status !== 400) {
      writePlayerStore(store);
    }
  });

  router.get("/player/:playerId", (ctx) => {
    const store = readPlayerStore();
    handlePlayerLoad(ctx, store);
  });

  router.post("/player/:playerId", (ctx) => {
    const store = readPlayerStore();
    handlePlayerSave(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
    }
  });

  router.get("/leaderboard", (ctx) => {
    const store = readPlayerStore();
    ctx.body = getLeaderboard(store);
  });

  router.post("/ad/reward", (ctx) => {
    const store = readPlayerStore();
    handleAdRewardClaim(ctx, store);
    if (ctx.status < 400) {
      writePlayerStore(store);
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
  mergePlayerSaveData,
  getLeaderboard,
  getRewardValue,
  ALLOWED_REWARD_TYPES,
  ALLOWED_AUTH_PLATFORMS,
  AD_REWARD_COOLDOWN_MS,
  normalizeRequiredString,
  resolveMockPlatformOpenId,
  createAuthSession,
  sessions,
  registerAuthSession,
  parseBearerToken,
  getAuthorizationHeader,
  getSessionFromAuthorization,
  requirePlayerSession,
  loginPlatformPlayer,
  handleAuthLogin,
  handlePlayerLoad,
  handlePlayerSave,
  handleAdRewardClaim,
  normalizeAdRewardClientContext,
  claimAdRewardForPlayer,
  sendBadRequest,
  errorHandler,
};
