const Koa = require("koa");
const Router = require("@koa/router");
const bodyParser = require("koa-bodyparser");
const cors = require("@koa/cors");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "playerData.json");
const SESSION_DATA_FILE = path.join(DATA_DIR, "sessionData.json");
const ALLOWED_REWARD_TYPES = ["clear_low_items", "coin_bonus", "high_level_item"];
const ALLOWED_AUTH_PLATFORMS = ["wechat", "douyin", "web"];
const AD_REWARD_COOLDOWN_MS = 30 * 1000;
const DEFAULT_AUTH_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WECHAT_CODE_EXCHANGE_URL = "https://api.weixin.qq.com/sns/jscode2session";
const DEFAULT_DOUYIN_CODE_EXCHANGE_URL = "https://developer.toutiao.com/api/apps/v2/jscode2session";
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

function ensureSessionDataFile(filePath = SESSION_DATA_FILE) {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), "utf8");
  }
}

function readSessionStore(filePath = SESSION_DATA_FILE) {
  ensureSessionDataFile(filePath);
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn("[server] failed to read session store", error);
    return {};
  }
}

function writeSessionStore(store, filePath = SESSION_DATA_FILE) {
  ensureSessionDataFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
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

function getSessionTtlMs(env = process.env) {
  const raw = Number(env.AUTH_SESSION_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AUTH_SESSION_TTL_MS;
}

function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolvePlatformAuthConfig(env = process.env) {
  return {
    wechat: {
      appId: normalizeOptionalString(env.WECHAT_APP_ID),
      appSecret: normalizeOptionalString(env.WECHAT_APP_SECRET),
      exchangeUrl: normalizeOptionalString(env.WECHAT_CODE_EXCHANGE_URL) || DEFAULT_WECHAT_CODE_EXCHANGE_URL,
    },
    douyin: {
      appId: normalizeOptionalString(env.DOUYIN_APP_ID),
      appSecret: normalizeOptionalString(env.DOUYIN_APP_SECRET),
      exchangeUrl: normalizeOptionalString(env.DOUYIN_CODE_EXCHANGE_URL) || DEFAULT_DOUYIN_CODE_EXCHANGE_URL,
    },
    sessionTtlMs: getSessionTtlMs(env),
  };
}

function hasCompletePlatformAuthConfig(config, platform) {
  const platformConfig = config && config[platform];
  return Boolean(
    platformConfig
    && platformConfig.appId
    && platformConfig.appSecret
    && platformConfig.exchangeUrl
  );
}

function createMockPlatformIdentity(platform, code) {
  return {
    platform,
    openid: resolveMockPlatformOpenId(platform, code),
  };
}

function createAuthSessionFromIdentity(identity) {
  const platform = normalizeRequiredString(identity && identity.platform, "platform");
  const openid = normalizeRequiredString(identity && identity.openid, "openid");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  const playerId = `${platform}_${openid}`;
  return {
    ok: true,
    platform,
    openid,
    playerId,
    sessionToken: `mock_session_${playerId}`,
  };
}

function buildUrlWithQuery(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function parseWechatExchangeResponse(data) {
  if (!data || typeof data !== "object" || data.errcode || data.error || !data.openid) {
    throw new Error("platform auth exchange failed");
  }
  return {
    platform: "wechat",
    openid: String(data.openid),
    ...(data.unionid ? { unionid: String(data.unionid) } : {}),
  };
}

function parseDouyinExchangeResponse(data) {
  const body = data && typeof data === "object" && data.data && typeof data.data === "object"
    ? data.data
    : data;
  if (!body || typeof body !== "object" || body.err_code || body.errcode || body.error || !body.openid) {
    throw new Error("platform auth exchange failed");
  }
  return {
    platform: "douyin",
    openid: String(body.openid),
    ...(body.unionid ? { unionid: String(body.unionid) } : {}),
  };
}

async function fetchJson(url, fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("platform auth exchange failed");
  }
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new Error("platform auth exchange failed");
  }
  if (!response || response.ok === false) {
    throw new Error("platform auth exchange failed");
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error("platform auth exchange failed");
  }
}

async function exchangePlatformCode(payload, config = resolvePlatformAuthConfig(), fetchImpl = globalThis.fetch) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  if (platform === "web" || !hasCompletePlatformAuthConfig(config, platform)) {
    return createMockPlatformIdentity(platform, code);
  }

  const platformConfig = config[platform];
  if (platform === "wechat") {
    const url = buildUrlWithQuery(platformConfig.exchangeUrl, {
      appid: platformConfig.appId,
      secret: platformConfig.appSecret,
      js_code: code,
      grant_type: "authorization_code",
    });
    return parseWechatExchangeResponse(await fetchJson(url, fetchImpl));
  }

  if (platform === "douyin") {
    const url = buildUrlWithQuery(platformConfig.exchangeUrl, {
      appid: platformConfig.appId,
      secret: platformConfig.appSecret,
      code,
    });
    return parseDouyinExchangeResponse(await fetchJson(url, fetchImpl));
  }

  throw new Error("platform is not supported");
}

function createAuthSession(payload) {
  const platform = normalizeRequiredString(payload && payload.platform, "platform");
  const code = normalizeRequiredString(payload && payload.code, "code");
  if (!ALLOWED_AUTH_PLATFORMS.includes(platform)) {
    throw new Error("platform is not supported");
  }
  return createAuthSessionFromIdentity(createMockPlatformIdentity(platform, code));
}

function registerAuthSession(session, now = Date.now(), ttlMs = DEFAULT_AUTH_SESSION_TTL_MS) {
  const record = {
    sessionToken: session.sessionToken,
    playerId: session.playerId,
    platform: session.platform,
    openid: session.openid,
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  sessions.set(session.sessionToken, record);
  return record;
}

function isSessionExpired(session, now = Date.now()) {
  return Boolean(session && Number.isFinite(Number(session.expiresAt)) && now >= Number(session.expiresAt));
}

function isValidSessionRecord(record) {
  return Boolean(
    record
    && typeof record === "object"
    && typeof record.sessionToken === "string"
    && record.sessionToken.trim()
    && typeof record.playerId === "string"
    && record.playerId.trim()
    && typeof record.platform === "string"
    && ALLOWED_AUTH_PLATFORMS.includes(record.platform)
    && typeof record.openid === "string"
    && record.openid.trim()
    && Number.isFinite(Number(record.createdAt))
    && Number.isFinite(Number(record.expiresAt))
  );
}

function serializeSessions(sessionMap = sessions, now = Date.now()) {
  const store = {};
  sessionMap.forEach((record, token) => {
    if (isValidSessionRecord(record) && token === record.sessionToken && !isSessionExpired(record, now)) {
      store[record.sessionToken] = record;
    }
  });
  return store;
}

function loadSessionsFromStore(store, now = Date.now()) {
  sessions.clear();
  Object.values(store && typeof store === "object" && !Array.isArray(store) ? store : {}).forEach((record) => {
    if (isValidSessionRecord(record) && !isSessionExpired(record, now)) {
      sessions.set(record.sessionToken, record);
    }
  });
  return sessions.size;
}

function persistSessionRecord(record, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const filePath = options.filePath || SESSION_DATA_FILE;
  if (!isValidSessionRecord(record) || isSessionExpired(record, now)) {
    return serializeSessions(sessions, now);
  }
  sessions.set(record.sessionToken, record);
  const store = {
    ...readSessionStore(filePath),
    [record.sessionToken]: record,
  };
  const prunedStore = {};
  Object.values(store).forEach((sessionRecord) => {
    if (isValidSessionRecord(sessionRecord) && !isSessionExpired(sessionRecord, now)) {
      prunedStore[sessionRecord.sessionToken] = sessionRecord;
    }
  });
  writeSessionStore(prunedStore, filePath);
  return prunedStore;
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

function getSessionFromAuthorization(headerValue, now = Date.now()) {
  const token = parseBearerToken(headerValue);
  if (!token) {
    return null;
  }
  const session = sessions.get(token) || null;
  if (!session || isSessionExpired(session, now)) {
    return null;
  }
  return session;
}

function requirePlayerSession(ctx, expectedPlayerId, now = Date.now()) {
  const token = parseBearerToken(getAuthorizationHeader(ctx));
  if (!token) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session is required" };
    return null;
  }

  const session = sessions.get(token) || null;
  if (!session) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session is required" };
    return null;
  }
  if (isSessionExpired(session, now)) {
    ctx.status = 401;
    ctx.body = { ok: false, error: "session expired" };
    return null;
  }
  if (session.playerId !== expectedPlayerId) {
    ctx.status = 403;
    ctx.body = { ok: false, error: "session player mismatch" };
    return null;
  }
  return session;
}

async function loginPlatformPlayer(store, payload, options = {}) {
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const config = options.config || resolvePlatformAuthConfig();
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const identity = await exchangePlatformCode(payload, config, fetchImpl);
  const session = createAuthSessionFromIdentity(identity);
  const nickname = typeof payload.nickname === "string" ? payload.nickname.trim() : "";

  if (!store[session.playerId]) {
    const player = createDefaultPlayer(session.playerId, nickname || "游客");
    player.lastSaveTime = now;
    store[session.playerId] = player;
  }

  const record = registerAuthSession(session, now, config.sessionTtlMs);
  persistSessionRecord(record, {
    now,
    filePath: options.sessionFilePath,
  });
  return {
    ...session,
    expiresAt: record.expiresAt,
  };
}

async function handleAuthLogin(ctx, store, options = {}) {
  try {
    ctx.body = await loginPlatformPlayer(store, ctx.request.body || {}, options);
  } catch (error) {
    if (error && error.message === "platform auth exchange failed") {
      sendAuthExchangeError(ctx);
      return;
    }
    sendBadRequest(ctx, error.message);
  }
}

function handlePlayerLoad(ctx, store, now = Date.now()) {
  const { playerId } = ctx.params;
  if (!playerId) {
    sendBadRequest(ctx, "playerId is required");
    return;
  }

  const authorization = getAuthorizationHeader(ctx);
  if (authorization) {
    const session = requirePlayerSession(ctx, playerId, now);
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
  const session = requirePlayerSession(ctx, playerId, now);
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
  const session = requirePlayerSession(ctx, playerId, now);
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

function sendAuthExchangeError(ctx) {
  ctx.status = 502;
  ctx.body = {
    ok: false,
    error: "platform auth exchange failed",
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

  router.post("/auth/login", async (ctx) => {
    const store = readPlayerStore();
    await handleAuthLogin(ctx, store);
    if (ctx.status < 400) {
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
  SESSION_DATA_FILE,
  ensureSessionDataFile,
  readPlayerStore,
  writePlayerStore,
  readSessionStore,
  writeSessionStore,
  createDefaultPlayer,
  validatePlayerData,
  mergePlayerSaveData,
  getLeaderboard,
  getRewardValue,
  ALLOWED_REWARD_TYPES,
  ALLOWED_AUTH_PLATFORMS,
  AD_REWARD_COOLDOWN_MS,
  DEFAULT_AUTH_SESSION_TTL_MS,
  DEFAULT_WECHAT_CODE_EXCHANGE_URL,
  DEFAULT_DOUYIN_CODE_EXCHANGE_URL,
  normalizeRequiredString,
  resolveMockPlatformOpenId,
  getSessionTtlMs,
  normalizeOptionalString,
  resolvePlatformAuthConfig,
  hasCompletePlatformAuthConfig,
  createMockPlatformIdentity,
  buildUrlWithQuery,
  parseWechatExchangeResponse,
  parseDouyinExchangeResponse,
  fetchJson,
  exchangePlatformCode,
  createAuthSessionFromIdentity,
  createAuthSession,
  sessions,
  registerAuthSession,
  isSessionExpired,
  isValidSessionRecord,
  serializeSessions,
  loadSessionsFromStore,
  persistSessionRecord,
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
  sendAuthExchangeError,
  errorHandler,
};
