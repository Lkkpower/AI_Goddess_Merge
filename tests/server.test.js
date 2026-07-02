const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const server = require('../server/server.js');
const gameplayConfig = require('../server/gameplayConfig.js');

test('createDefaultPlayer returns a complete player snapshot', () => {
  const player = server.createDefaultPlayer('demo_player', '游客');

  assert.equal(player.playerId, 'demo_player');
  assert.equal(player.nickname, '游客');
  assert.equal(player.coins, 0);
  assert.equal(player.score, 0);
  assert.equal(player.highestItemLevel, 0);
  assert.deepEqual(player.unlockedSkins, []);
  assert.deepEqual(player.board, []);
  assert.equal(player.adWatchCount, 0);
  assert.equal(typeof player.lastSaveTime, 'number');
});

test('validatePlayerData accepts valid player data and rejects malformed data', () => {
  const valid = server.createDefaultPlayer('valid_player');
  assert.doesNotThrow(() => server.validatePlayerData(valid));

  assert.throws(
    () => server.validatePlayerData({ ...valid, score: '200' }),
    /score must be a number/
  );

  assert.throws(
    () => server.validatePlayerData({ ...valid, unlockedSkins: {} }),
    /unlockedSkins must be an array/
  );
});

test('getLeaderboard sorts by score then highest item level and returns top 20', () => {
  const store = {};
  for (let i = 0; i < 25; i += 1) {
    store[`p${i}`] = {
      ...server.createDefaultPlayer(`p${i}`, `玩家${i}`),
      score: i === 3 ? 100 : i,
      highestItemLevel: i === 3 ? 4 : i % 12,
    };
  }
  store.tie_low = { ...server.createDefaultPlayer('tie_low'), score: 100, highestItemLevel: 2 };
  store.tie_high = { ...server.createDefaultPlayer('tie_high'), score: 100, highestItemLevel: 8 };

  const leaderboard = server.getLeaderboard(store);

  assert.equal(leaderboard.length, 20);
  assert.equal(leaderboard[0].playerId, 'tie_high');
  assert.equal(leaderboard[1].playerId, 'p3');
  assert.equal(leaderboard[2].playerId, 'tie_low');
  assert.deepEqual(Object.keys(leaderboard[0]), ['playerId', 'nickname', 'score', 'highestItemLevel']);
});

test('getRewardValue maps stage 3 client ad reward types', () => {
  assert.equal(server.getRewardValue('clear_low_items'), 3);
  assert.equal(server.getRewardValue('coin_bonus'), 120);
  assert.equal(server.getRewardValue('high_level_item'), 4);
  assert.throws(() => server.getRewardValue('double_coins'), /Invalid rewardType/);
  assert.throws(() => server.getRewardValue('free_item'), /Invalid rewardType/);
});

test('claimAdRewardForPlayer records accepted ad claim metadata', () => {
  const store = {};
  const now = 1781450000000;

  const result = server.claimAdRewardForPlayer(store, {
    playerId: 'ad_player',
    rewardType: 'coin_bonus',
    clientRewardValue: 120,
    clientCoins: 240,
    clientScore: 360,
    clientHighestItemLevel: 8,
  }, now);

  assert.equal(result.ok, true);
  assert.equal(result.rewardType, 'coin_bonus');
  assert.equal(result.rewardValue, 120);
  assert.equal(result.adWatchCount, 1);
  assert.equal(result.lastAdRewardTime, now);
  assert.equal(store.ad_player.adWatchCount, 1);
  assert.equal(store.ad_player.lastAdRewardTime, now);
  assert.equal(store.ad_player.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(store.ad_player.lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 240,
    clientScore: 360,
    clientHighestItemLevel: 8,
  });
});

test('claimAdRewardForPlayer rejects invalid reward types and rapid duplicate claims', () => {
  const store = {};
  const now = 1781450000000;

  assert.throws(
    () => server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'unknown' }, now),
    /rewardType is invalid/
  );

  server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'clear_low_items' }, now);

  assert.throws(
    () => server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'clear_low_items' }, now + 1000),
    /ad reward claim is too frequent/
  );
});

test('normal player saves do not advance server-owned adWatchCount before ad reward claims', () => {
  const store = {};
  const now = 1781450000000;
  const clientSaveAfterWatchingAd = {
    ...server.createDefaultPlayer('ad_player'),
    adWatchCount: 1,
  };

  store.ad_player = server.mergePlayerSaveData(undefined, clientSaveAfterWatchingAd, now);
  server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'coin_bonus' }, now + 1000);

  assert.equal(store.ad_player.adWatchCount, 1);
});

test('mergePlayerSaveData preserves ad cooldown metadata from stale player saves', () => {
  const store = {};
  const now = 1781450000000;

  server.claimAdRewardForPlayer(store, {
    playerId: 'ad_player',
    rewardType: 'coin_bonus',
    clientRewardValue: 120,
  }, now);

  const staleSaveData = {
    playerId: 'ad_player',
    nickname: 'Stale Save',
    coins: 10,
    score: 20,
    highestItemLevel: 3,
    unlockedSkins: [],
    board: [],
    adWatchCount: 0,
    lastSaveTime: now + 500,
  };

  store.ad_player = server.mergePlayerSaveData(store.ad_player, staleSaveData, now + 500);

  assert.equal(store.ad_player.lastAdRewardTime, now);
  assert.equal(store.ad_player.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(store.ad_player.lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 0,
    clientScore: 0,
    clientHighestItemLevel: 0,
  });

  assert.throws(
    () => server.claimAdRewardForPlayer(store, { playerId: 'ad_player', rewardType: 'coin_bonus' }, now + 1000),
    /ad reward claim is too frequent/
  );
});

test('mergePlayerSaveData prevents stale saves from rolling back adWatchCount', () => {
  const now = 1781450000000;
  const existing = {
    ...server.createDefaultPlayer('ad_player'),
    adWatchCount: 3,
  };
  const incoming = {
    ...server.createDefaultPlayer('ad_player'),
    adWatchCount: 1,
  };

  const merged = server.mergePlayerSaveData(existing, incoming, now);

  assert.equal(merged.adWatchCount, 3);
});

test('isPlatformFullSaveLocked locks only non-web platform sessions', () => {
  assert.equal(server.isPlatformFullSaveLocked({ platform: 'web' }), false);
  assert.equal(server.isPlatformFullSaveLocked({ platform: 'wechat' }), true);
  assert.equal(server.isPlatformFullSaveLocked({ platform: 'douyin' }), true);
});

test('mergePlatformLockedPlayerSaveData preserves server-owned fields and accepts compatibility fields', () => {
  const now = 1781450000000;
  const existing = {
    ...server.createDefaultPlayer('locked_player', 'Server Name'),
    board: fullBoard(null),
    coins: 320,
    score: 640,
    highestItemLevel: 8,
    unlockedSkins: [1, 3],
    adWatchCount: 4,
    lastAdRewardTime: now - 30000,
    lastAdRewardType: 'coin_bonus',
    lastAdRewardClientContext: {
      clientRewardValue: 120,
      clientCoins: 999,
      clientScore: 888,
      clientHighestItemLevel: 7,
    },
    lastDailyRewardDate: '2026-06-30',
    tutorialCompleted: false,
  };
  existing.board[0] = { row: 0, col: 0, itemId: 4 };
  const incoming = {
    ...server.createDefaultPlayer('locked_player', 'Client Name'),
    board: fullBoard(9),
    coins: 9999,
    score: 9999,
    highestItemLevel: 20,
    unlockedSkins: [7],
    adWatchCount: 99,
    lastAdRewardTime: now + 1,
    lastAdRewardType: 'high_level_item',
    lastAdRewardClientContext: {
      clientRewardValue: 4,
      clientCoins: 9999,
      clientScore: 9999,
      clientHighestItemLevel: 20,
    },
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };

  const merged = server.mergePlatformLockedPlayerSaveData(existing, incoming, now);

  assert.equal(merged.playerId, 'locked_player');
  assert.equal(merged.nickname, 'Client Name');
  assert.deepEqual(merged.board, existing.board);
  assert.equal(merged.coins, 320);
  assert.equal(merged.score, 640);
  assert.equal(merged.highestItemLevel, 8);
  assert.deepEqual(merged.unlockedSkins, [1, 3]);
  assert.equal(merged.adWatchCount, 4);
  assert.equal(merged.lastAdRewardTime, now - 30000);
  assert.equal(merged.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(merged.lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 999,
    clientScore: 888,
    clientHighestItemLevel: 7,
  });
  assert.equal(merged.lastDailyRewardDate, '2026-07-01');
  assert.equal(merged.tutorialCompleted, true);
  assert.equal(merged.lastSaveTime, now);
});

test('mergePlatformLockedPlayerSaveData creates a locked default snapshot when no server data exists', () => {
  const now = 1781450000000;
  const incoming = {
    ...server.createDefaultPlayer('new_locked_player', 'New Client'),
    board: fullBoard(6),
    coins: 5000,
    score: 6000,
    highestItemLevel: 12,
    unlockedSkins: [1, 2, 3],
    adWatchCount: 7,
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };

  const merged = server.mergePlatformLockedPlayerSaveData(undefined, incoming, now);

  assert.equal(merged.playerId, 'new_locked_player');
  assert.equal(merged.nickname, 'New Client');
  assert.deepEqual(merged.board, []);
  assert.equal(merged.coins, 0);
  assert.equal(merged.score, 0);
  assert.equal(merged.highestItemLevel, 0);
  assert.deepEqual(merged.unlockedSkins, []);
  assert.equal(merged.adWatchCount, 0);
  assert.equal(merged.lastAdRewardTime, 0);
  assert.equal(merged.lastAdRewardType, '');
  assert.equal(merged.lastAdRewardClientContext, null);
  assert.equal(merged.lastDailyRewardDate, '2026-07-01');
  assert.equal(merged.tutorialCompleted, true);
  assert.equal(merged.lastSaveTime, now);
});

test('resolveMockPlatformOpenId maps supported platforms deterministically', () => {
  assert.equal(server.resolveMockPlatformOpenId('wechat', 'abc123'), 'wechat_mock_abc123');
  assert.equal(server.resolveMockPlatformOpenId('douyin', 'abc123'), 'douyin_mock_abc123');
  assert.equal(server.resolveMockPlatformOpenId('web', 'demo_player'), 'web_mock_demo_player');
  assert.throws(() => server.resolveMockPlatformOpenId('ios', 'abc123'), /platform is not supported/);
});

test('resolvePlatformAuthConfig reads platform credentials and session ttl', () => {
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
    DOUYIN_APP_ID: 'dy-app',
    DOUYIN_APP_SECRET: 'dy-secret',
    DOUYIN_CODE_EXCHANGE_URL: 'https://douyin.example/code',
    AUTH_SESSION_TTL_MS: '60000',
  });

  assert.equal(config.wechat.appId, 'wx-app');
  assert.equal(config.wechat.appSecret, 'wx-secret');
  assert.equal(config.wechat.exchangeUrl, 'https://wechat.example/code');
  assert.equal(config.douyin.appId, 'dy-app');
  assert.equal(config.douyin.appSecret, 'dy-secret');
  assert.equal(config.douyin.exchangeUrl, 'https://douyin.example/code');
  assert.equal(config.sessionTtlMs, 60000);
});

test('getSessionTtlMs falls back for invalid values', () => {
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: '120000' }), 120000);
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: '0' }), server.DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: '-5' }), server.DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(server.getSessionTtlMs({ AUTH_SESSION_TTL_MS: 'abc' }), server.DEFAULT_AUTH_SESSION_TTL_MS);
  assert.equal(server.getSessionTtlMs({}), server.DEFAULT_AUTH_SESSION_TTL_MS);
});

function createTempSessionFilePath(name) {
  return path.join(__dirname, '..', 'server', 'data', name);
}

function cleanupTempFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

test('ensureSessionDataFile creates an empty session store file', () => {
  const filePath = createTempSessionFilePath('sessionData.ensure.test.json');
  cleanupTempFile(filePath);

  server.ensureSessionDataFile(filePath);

  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), {});
  cleanupTempFile(filePath);
});

test('readSessionStore reads valid session json and falls back for invalid content', () => {
  const filePath = createTempSessionFilePath('sessionData.read.test.json');
  cleanupTempFile(filePath);
  const sessionRecord = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  server.writeSessionStore({ token: sessionRecord }, filePath);

  assert.deepEqual(server.readSessionStore(filePath), { token: sessionRecord });

  fs.writeFileSync(filePath, '{bad json', 'utf8');
  assert.deepEqual(server.readSessionStore(filePath), {});

  fs.writeFileSync(filePath, '[]', 'utf8');
  assert.deepEqual(server.readSessionStore(filePath), {});
  cleanupTempFile(filePath);
});

test('writeSessionStore writes stable formatted session json', () => {
  const filePath = createTempSessionFilePath('sessionData.write.test.json');
  cleanupTempFile(filePath);
  const sessionRecord = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };

  server.writeSessionStore({ token: sessionRecord }, filePath);

  assert.equal(
    fs.readFileSync(filePath, 'utf8'),
    `${JSON.stringify({ token: sessionRecord }, null, 2)}\n`
  );
  cleanupTempFile(filePath);
});

test('hasCompletePlatformAuthConfig requires app id secret and exchange url', () => {
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });

  assert.equal(server.hasCompletePlatformAuthConfig(config, 'wechat'), true);
  assert.equal(server.hasCompletePlatformAuthConfig(config, 'douyin'), false);
  assert.equal(server.hasCompletePlatformAuthConfig(config, 'web'), false);
});

test('exchangePlatformCode returns deterministic mock identity for web and incomplete platform config', async () => {
  const config = server.resolvePlatformAuthConfig({});

  assert.deepEqual(
    await server.exchangePlatformCode({ platform: 'web', code: 'demo_player' }, config),
    { platform: 'web', openid: 'web_mock_demo_player' }
  );

  assert.deepEqual(
    await server.exchangePlatformCode({ platform: 'wechat', code: 'login-code' }, config),
    { platform: 'wechat', openid: 'wechat_mock_login-code' }
  );

  assert.deepEqual(
    await server.exchangePlatformCode({ platform: 'douyin', code: 'login-code' }, config),
    { platform: 'douyin', openid: 'douyin_mock_login-code' }
  );
});

function createJsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    },
  };
}

test('exchangePlatformCode calls WeChat exchange when config is complete', async () => {
  const requests = [];
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });
  const identity = await server.exchangePlatformCode(
    { platform: 'wechat', code: 'wx-code' },
    config,
    async (url) => {
      requests.push(url);
      return createJsonResponse({ openid: 'wx-openid', unionid: 'wx-union' });
    }
  );

  assert.deepEqual(identity, {
    platform: 'wechat',
    openid: 'wx-openid',
    unionid: 'wx-union',
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/wechat\.example\/code\?/);
  assert.match(requests[0], /appid=wx-app/);
  assert.match(requests[0], /secret=wx-secret/);
  assert.match(requests[0], /js_code=wx-code/);
  assert.match(requests[0], /grant_type=authorization_code/);
});

test('exchangePlatformCode calls Douyin exchange when config is complete', async () => {
  const requests = [];
  const config = server.resolvePlatformAuthConfig({
    DOUYIN_APP_ID: 'dy-app',
    DOUYIN_APP_SECRET: 'dy-secret',
    DOUYIN_CODE_EXCHANGE_URL: 'https://douyin.example/code',
  });
  const identity = await server.exchangePlatformCode(
    { platform: 'douyin', code: 'dy-code' },
    config,
    async (url) => {
      requests.push(url);
      return createJsonResponse({ data: { openid: 'dy-openid', unionid: 'dy-union' } });
    }
  );

  assert.deepEqual(identity, {
    platform: 'douyin',
    openid: 'dy-openid',
    unionid: 'dy-union',
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/douyin\.example\/code\?/);
  assert.match(requests[0], /appid=dy-app/);
  assert.match(requests[0], /secret=dy-secret/);
  assert.match(requests[0], /code=dy-code/);
});

test('exchangePlatformCode rejects provider failure responses', async () => {
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'wechat', code: 'bad-code' },
      config,
      async () => createJsonResponse({ errcode: 40029, errmsg: 'invalid code' })
    ),
    /platform auth exchange failed/
  );
});

test('parseWechatExchangeResponse rejects provider error field even with openid', () => {
  assert.throws(
    () => server.parseWechatExchangeResponse({ openid: 'wx-openid', error: 'invalid code' }),
    /platform auth exchange failed/
  );
});

test('parseDouyinExchangeResponse rejects provider errcode field even with openid', () => {
  assert.throws(
    () => server.parseDouyinExchangeResponse({ openid: 'dy-openid', errcode: 40029 }),
    /platform auth exchange failed/
  );
});

test('exchangePlatformCode rejects missing openid rejected fetch and invalid json', async () => {
  const config = server.resolvePlatformAuthConfig({
    DOUYIN_APP_ID: 'dy-app',
    DOUYIN_APP_SECRET: 'dy-secret',
    DOUYIN_CODE_EXCHANGE_URL: 'https://douyin.example/code',
  });

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'douyin', code: 'missing-openid' },
      config,
      async () => createJsonResponse({ data: {} })
    ),
    /platform auth exchange failed/
  );

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'douyin', code: 'network-fail' },
      config,
      async () => {
        throw new Error('network failed');
      }
    ),
    /platform auth exchange failed/
  );

  await assert.rejects(
    () => server.exchangePlatformCode(
      { platform: 'douyin', code: 'bad-json' },
      config,
      async () => ({
        ok: true,
        status: 200,
        async json() {
          throw new Error('bad json');
        },
      })
    ),
    /platform auth exchange failed/
  );
});

test('createAuthSessionFromIdentity returns stable player identity and token', () => {
  const session = server.createAuthSessionFromIdentity({
    platform: 'wechat',
    openid: 'real-openid',
  });

  assert.deepEqual(session, {
    ok: true,
    platform: 'wechat',
    openid: 'real-openid',
    playerId: 'wechat_real-openid',
    sessionToken: 'mock_session_wechat_real-openid',
  });
});

test('createAuthSession returns deterministic player identity and token', () => {
  const session = server.createAuthSession({
    platform: 'wechat',
    code: 'login-code',
  });

  assert.deepEqual(session, {
    ok: true,
    platform: 'wechat',
    openid: 'wechat_mock_login-code',
    playerId: 'wechat_wechat_mock_login-code',
    sessionToken: 'mock_session_wechat_wechat_mock_login-code',
  });
});

test('createAuthSession trims auth input and rejects invalid payloads', () => {
  assert.equal(
    server.createAuthSession({ platform: ' douyin ', code: ' code-1 ' }).playerId,
    'douyin_douyin_mock_code-1'
  );
  assert.throws(() => server.createAuthSession({ platform: '', code: 'x' }), /platform is required/);
  assert.throws(() => server.createAuthSession({ platform: 'ios', code: 'x' }), /platform is not supported/);
  assert.throws(() => server.createAuthSession({ platform: 'web', code: '' }), /code is required/);
});

function createMockContext(body, headers = {}) {
  return {
    status: 200,
    request: {
      body,
      headers,
    },
    body: undefined,
    get(name) {
      return headers[String(name).toLowerCase()] || '';
    },
  };
}

test('registerAuthSession stores session records by token with expiry', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'wechat', code: 'session-code' });

  const record = server.registerAuthSession(session, 1781450000000, 60000);

  assert.deepEqual(record, {
    sessionToken: 'mock_session_wechat_wechat_mock_session-code',
    playerId: 'wechat_wechat_mock_session-code',
    platform: 'wechat',
    openid: 'wechat_mock_session-code',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  });
  assert.deepEqual(server.sessions.get(session.sessionToken), record);
});

test('isValidSessionRecord accepts complete session records only', () => {
  const record = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };

  assert.equal(server.isValidSessionRecord(record), true);
  assert.equal(server.isValidSessionRecord({ ...record, sessionToken: '' }), false);
  assert.equal(server.isValidSessionRecord({ ...record, platform: 'ios' }), false);
  assert.equal(server.isValidSessionRecord({ ...record, createdAt: 'now' }), false);
  assert.equal(server.isValidSessionRecord({ ...record, expiresAt: 'later' }), false);
});

test('serializeSessions returns only valid non-expired records keyed by token', () => {
  const sessionMap = new Map();
  const active = {
    sessionToken: 'active-token',
    playerId: 'active-player',
    platform: 'web',
    openid: 'web_mock_active',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  const expired = {
    sessionToken: 'expired-token',
    playerId: 'expired-player',
    platform: 'wechat',
    openid: 'wechat_mock_expired',
    createdAt: 1781450000000,
    expiresAt: 1781450000500,
  };
  sessionMap.set(active.sessionToken, active);
  sessionMap.set(expired.sessionToken, expired);
  sessionMap.set('bad-token', { sessionToken: 'bad-token', playerId: '', platform: 'web' });

  assert.deepEqual(server.serializeSessions(sessionMap, 1781450001000), {
    'active-token': active,
  });
});

test('loadSessionsFromStore loads active records and skips expired or invalid records', () => {
  server.sessions.clear();
  const active = {
    sessionToken: 'active-token',
    playerId: 'active-player',
    platform: 'web',
    openid: 'web_mock_active',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  const expired = {
    sessionToken: 'expired-token',
    playerId: 'expired-player',
    platform: 'wechat',
    openid: 'wechat_mock_expired',
    createdAt: 1781450000000,
    expiresAt: 1781450000500,
  };

  const loaded = server.loadSessionsFromStore({
    [active.sessionToken]: active,
    [expired.sessionToken]: expired,
    invalid: { sessionToken: 'invalid', playerId: '', platform: 'web' },
  }, 1781450001000);

  assert.equal(loaded, 1);
  assert.deepEqual(server.sessions.get(active.sessionToken), active);
  assert.equal(server.sessions.has(expired.sessionToken), false);
  assert.equal(server.sessions.has('invalid'), false);
});

test('parseBearerToken accepts bearer headers and rejects malformed values', () => {
  assert.equal(server.parseBearerToken('Bearer token-1'), 'token-1');
  assert.equal(server.parseBearerToken('bearer token-2'), 'token-2');
  assert.equal(server.parseBearerToken('Bearer   token-3  '), 'token-3');
  assert.equal(server.parseBearerToken('Token token-1'), '');
  assert.equal(server.parseBearerToken(''), '');
  assert.equal(server.parseBearerToken(undefined), '');
});

test('getSessionFromAuthorization returns stored sessions or null', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'web', code: 'demo_player' });
  const record = server.registerAuthSession(session, 1781450000000);

  assert.deepEqual(server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`, 1781450000000), record);
  assert.equal(server.getSessionFromAuthorization('Bearer missing'), null);
  assert.equal(server.getSessionFromAuthorization(''), null);
});

test('isSessionExpired covers active boundary and expired sessions', () => {
  const session = {
    sessionToken: 'token',
    playerId: 'player',
    platform: 'web',
    openid: 'web_mock_player',
    createdAt: 1000,
    expiresAt: 2000,
  };

  assert.equal(server.isSessionExpired(session, 1999), false);
  assert.equal(server.isSessionExpired(session, 2000), true);
  assert.equal(server.isSessionExpired(session, 2001), true);
  assert.equal(server.isSessionExpired({ ...session, expiresAt: undefined }, 2001), false);
});

test('getSessionFromAuthorization returns null for expired sessions', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'web', code: 'demo_player' });
  server.registerAuthSession(session, 1781450000000, 1000);

  assert.equal(
    server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`, 1781450000500).playerId,
    session.playerId
  );
  assert.equal(server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`, 1781450001000), null);
});

test('requirePlayerSession writes a distinct error for expired sessions', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'douyin', code: 'expired-owner' });
  server.registerAuthSession(session, 1781450000000, 1000);

  const ctx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  assert.equal(server.requirePlayerSession(ctx, session.playerId, 1781450001000), null);
  assert.equal(ctx.status, 401);
  assert.deepEqual(ctx.body, { ok: false, error: 'session expired' });
});

test('requirePlayerSession returns session or writes auth errors', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'douyin', code: 'owner-code' });
  server.registerAuthSession(session, 1781450000000);

  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  const okSession = server.requirePlayerSession(okCtx, session.playerId, 1781450000000);
  assert.equal(okSession.playerId, session.playerId);
  assert.equal(okCtx.status, 200);

  const missingCtx = createMockContext({}, {});
  assert.equal(server.requirePlayerSession(missingCtx, session.playerId, 1781450000000), null);
  assert.equal(missingCtx.status, 401);
  assert.deepEqual(missingCtx.body, { ok: false, error: 'session is required' });

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  assert.equal(server.requirePlayerSession(mismatchCtx, 'wechat_other', 1781450000000), null);
  assert.equal(mismatchCtx.status, 403);
  assert.deepEqual(mismatchCtx.body, { ok: false, error: 'session player mismatch' });
});

test('loginPlatformPlayer registers the returned session token with expiry', async () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.register-login.test.json');
  cleanupTempFile(filePath);
  const store = {};

  const session = await server.loginPlatformPlayer(store, {
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  }, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  assert.equal(server.sessions.get(session.sessionToken).playerId, session.playerId);
  assert.equal(server.sessions.get(session.sessionToken).createdAt, 1781450000000);
  assert.equal(server.sessions.get(session.sessionToken).expiresAt, 1781450060000);
  assert.equal(session.expiresAt, 1781450060000);
  cleanupTempFile(filePath);
});

test('persistSessionRecord writes active sessions and prunes expired persisted records', () => {
  const filePath = createTempSessionFilePath('sessionData.persist.test.json');
  cleanupTempFile(filePath);
  const expired = {
    sessionToken: 'expired-token',
    playerId: 'expired-player',
    platform: 'web',
    openid: 'web_mock_expired',
    createdAt: 1781450000000,
    expiresAt: 1781450000500,
  };
  server.writeSessionStore({ [expired.sessionToken]: expired }, filePath);
  const active = {
    sessionToken: 'active-token',
    playerId: 'active-player',
    platform: 'web',
    openid: 'web_mock_active',
    createdAt: 1781450001000,
    expiresAt: 1781450061000,
  };

  server.persistSessionRecord(active, {
    now: 1781450001000,
    filePath,
  });

  assert.deepEqual(server.readSessionStore(filePath), {
    [active.sessionToken]: active,
  });
  assert.deepEqual(server.sessions.get(active.sessionToken), active);
  cleanupTempFile(filePath);
});

test('loginPlatformPlayer persists the returned session record when a session file is provided', async () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.login.test.json');
  cleanupTempFile(filePath);
  const store = {};

  const session = await server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'demo_player',
    nickname: 'Demo',
  }, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  assert.deepEqual(server.readSessionStore(filePath), {
    [session.sessionToken]: {
      sessionToken: session.sessionToken,
      playerId: session.playerId,
      platform: session.platform,
      openid: session.openid,
      createdAt: 1781450000000,
      expiresAt: 1781450060000,
    },
  });
  cleanupTempFile(filePath);
});

test('loginPlatformPlayer creates a default player record for a new auth session', async () => {
  const filePath = createTempSessionFilePath('sessionData.default-player-login.test.json');
  cleanupTempFile(filePath);
  const store = {};
  const ctx = createMockContext({
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  });

  const result = await server.loginPlatformPlayer(store, ctx.request.body, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  assert.equal(result.ok, true);
  assert.equal(result.platform, 'wechat');
  assert.equal(result.openid, 'wechat_mock_login-code');
  assert.equal(result.playerId, 'wechat_wechat_mock_login-code');
  assert.equal(result.sessionToken, 'mock_session_wechat_wechat_mock_login-code');
  assert.equal(result.expiresAt, 1781450060000);
  assert.equal(store['wechat_wechat_mock_login-code'].nickname, 'Auth Nick');
  assert.equal(store['wechat_wechat_mock_login-code'].lastSaveTime, 1781450000000);
  cleanupTempFile(filePath);
});

test('loginPlatformPlayer preserves existing gameplay data on repeat login', async () => {
  const filePath = createTempSessionFilePath('sessionData.repeat-login.test.json');
  cleanupTempFile(filePath);
  const store = {
    web_web_mock_demo_player: {
      ...server.createDefaultPlayer('web_web_mock_demo_player', 'Existing'),
      coins: 300,
      score: 900,
      highestItemLevel: 7,
    },
  };

  const result = await server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'demo_player',
    nickname: 'New Nick',
  }, {
    sessionFilePath: filePath,
  });

  assert.equal(result.playerId, 'web_web_mock_demo_player');
  assert.equal(store.web_web_mock_demo_player.nickname, 'Existing');
  assert.equal(store.web_web_mock_demo_player.coins, 300);
  assert.equal(store.web_web_mock_demo_player.score, 900);
  assert.equal(store.web_web_mock_demo_player.highestItemLevel, 7);
  cleanupTempFile(filePath);
});

test('handleAuthLogin writes auth result or bad request response', async () => {
  const filePath = createTempSessionFilePath('sessionData.handle-login.test.json');
  cleanupTempFile(filePath);
  const store = {};
  const okCtx = createMockContext({ platform: 'douyin', code: 'abc', nickname: 'Douyin' });

  await server.handleAuthLogin(okCtx, store, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.playerId, 'douyin_douyin_mock_abc');
  assert.equal(okCtx.body.expiresAt, 1781450060000);
  assert.equal(store.douyin_douyin_mock_abc.nickname, 'Douyin');

  const badCtx = createMockContext({ platform: 'ios', code: 'abc' });
  await server.handleAuthLogin(badCtx, store, {
    now: 1781450000000,
  });

  assert.equal(badCtx.status, 400);
  assert.deepEqual(badCtx.body, {
    ok: false,
    error: 'platform is not supported',
  });
  cleanupTempFile(filePath);
});

test('handleAuthLogin returns 502 when configured platform exchange fails', async () => {
  const store = {};
  const ctx = createMockContext({ platform: 'wechat', code: 'bad-code' });
  const config = server.resolvePlatformAuthConfig({
    WECHAT_APP_ID: 'wx-app',
    WECHAT_APP_SECRET: 'wx-secret',
    WECHAT_CODE_EXCHANGE_URL: 'https://wechat.example/code',
  });

  await server.handleAuthLogin(ctx, store, {
    now: 1781450000000,
    config,
    fetchImpl: async () => createJsonResponse({ errcode: 40029, errmsg: 'invalid code' }),
  });

  assert.equal(ctx.status, 502);
  assert.deepEqual(ctx.body, { ok: false, error: 'platform auth exchange failed' });
  assert.deepEqual(store, {});
});

function createAuthorizedSession(platform, code, now = 1781450000000) {
  const session = server.createAuthSession({ platform, code });
  server.registerAuthSession(session, now, server.DEFAULT_AUTH_SESSION_TTL_MS);
  return session;
}

function readFileSnapshot(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function restoreFileSnapshot(filePath, snapshot) {
  if (snapshot === null) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  fs.writeFileSync(filePath, snapshot, 'utf8');
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function postJson(url, { sessionToken, body = {} } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  if (typeof globalThis.fetch === 'function') {
    const response = await globalThis.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
    };
  }

  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method: 'POST',
      headers,
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        raw += chunk;
      });
      response.on('end', () => {
        try {
          resolve({
            status: response.statusCode,
            body: JSON.parse(raw),
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.write(JSON.stringify(body));
    request.end();
  });
}

test('handlePlayerSave rejects missing or mismatched sessions before saving', () => {
  server.sessions.clear();
  const store = {};
  const saveData = {
    ...server.createDefaultPlayer('wechat_wechat_mock_owner'),
    coins: 50,
  };

  const missingCtx = createMockContext(saveData);
  missingCtx.params = { playerId: saveData.playerId };
  server.handlePlayerSave(missingCtx, store, 1781450000000);
  assert.equal(missingCtx.status, 401);
  assert.equal(store[saveData.playerId], undefined);

  const otherSession = createAuthorizedSession('wechat', 'other');
  const mismatchCtx = createMockContext(saveData, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: saveData.playerId };
  server.handlePlayerSave(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);
  assert.equal(store[saveData.playerId], undefined);
});

test('handlePlayerSave keeps broad full-save compatibility for web sessions', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('web', 'owner');
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Web Owner'),
    board: fullBoard(2),
    coins: 88,
    score: 120,
    highestItemLevel: 4,
    unlockedSkins: [1],
  };
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, 1781450000000);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].coins, 88);
  assert.equal(store[session.playerId].score, 120);
  assert.equal(store[session.playerId].highestItemLevel, 4);
  assert.deepEqual(store[session.playerId].unlockedSkins, [1]);
  assert.deepEqual(store[session.playerId].board, saveData.board);
});

test('handlePlayerSave locks server-owned fields for platform sessions', () => {
  server.sessions.clear();
  const session = createAuthorizedSession('wechat', 'owner');
  const now = 1781450000000;
  const existingBoard = fullBoard(null);
  existingBoard[0] = { row: 0, col: 0, itemId: 5 };
  const store = {
    [session.playerId]: {
      ...server.createDefaultPlayer(session.playerId, 'Server Owner'),
      board: existingBoard,
      coins: 310,
      score: 620,
      highestItemLevel: 7,
      unlockedSkins: [1, 2],
      adWatchCount: 3,
      lastAdRewardTime: now - 30000,
      lastAdRewardType: 'coin_bonus',
      lastAdRewardClientContext: {
        clientRewardValue: 120,
        clientCoins: 310,
        clientScore: 620,
        clientHighestItemLevel: 7,
      },
      lastDailyRewardDate: '2026-06-30',
      tutorialCompleted: false,
    },
  };
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Client Owner'),
    board: fullBoard(9),
    coins: 9999,
    score: 9999,
    highestItemLevel: 20,
    unlockedSkins: [7],
    adWatchCount: 99,
    lastAdRewardTime: now + 1,
    lastAdRewardType: 'high_level_item',
    lastAdRewardClientContext: {
      clientRewardValue: 4,
      clientCoins: 9999,
      clientScore: 9999,
      clientHighestItemLevel: 20,
    },
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, now);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].nickname, 'Client Owner');
  assert.deepEqual(store[session.playerId].board, existingBoard);
  assert.equal(store[session.playerId].coins, 310);
  assert.equal(store[session.playerId].score, 620);
  assert.equal(store[session.playerId].highestItemLevel, 7);
  assert.deepEqual(store[session.playerId].unlockedSkins, [1, 2]);
  assert.equal(store[session.playerId].adWatchCount, 3);
  assert.equal(store[session.playerId].lastAdRewardTime, now - 30000);
  assert.equal(store[session.playerId].lastAdRewardType, 'coin_bonus');
  assert.deepEqual(store[session.playerId].lastAdRewardClientContext, {
    clientRewardValue: 120,
    clientCoins: 310,
    clientScore: 620,
    clientHighestItemLevel: 7,
  });
  assert.equal(store[session.playerId].lastDailyRewardDate, '2026-07-01');
  assert.equal(store[session.playerId].tutorialCompleted, true);
  assert.equal(store[session.playerId].lastSaveTime, now);
});

test('handlePlayerSave creates locked defaults for first platform full save', () => {
  server.sessions.clear();
  const session = createAuthorizedSession('douyin', 'fresh');
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Fresh Client'),
    board: fullBoard(8),
    coins: 8888,
    score: 7777,
    highestItemLevel: 18,
    unlockedSkins: [1, 2, 3, 4, 5, 6],
    adWatchCount: 6,
    lastDailyRewardDate: '2026-07-01',
    tutorialCompleted: true,
  };
  const store = {};
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, 1781450000000);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].nickname, 'Fresh Client');
  assert.deepEqual(store[session.playerId].board, []);
  assert.equal(store[session.playerId].coins, 0);
  assert.equal(store[session.playerId].score, 0);
  assert.equal(store[session.playerId].highestItemLevel, 0);
  assert.deepEqual(store[session.playerId].unlockedSkins, []);
  assert.equal(store[session.playerId].adWatchCount, 0);
  assert.equal(store[session.playerId].lastDailyRewardDate, '2026-07-01');
  assert.equal(store[session.playerId].tutorialCompleted, true);
});

test('claimDailyRewardForPlayer grants one server-owned daily reward per day', () => {
  const now = Date.UTC(2026, 6, 2, 1, 30, 0);
  const store = {
    daily_player: {
      ...server.createDefaultPlayer('daily_player', 'Daily'),
      coins: 20,
      lastDailyRewardDate: '',
      dailyRewardClaimedCount: 0,
    },
  };

  const result = server.claimDailyRewardForPlayer(store, 'daily_player', now);

  assert.equal(result.ok, true);
  assert.equal(result.rewardCoins, 80);
  assert.equal(result.message, '领取每日奖励 80 金币');
  assert.equal(result.player.coins, 100);
  assert.equal(result.player.lastDailyRewardDate, '2026-07-02');
  assert.equal(result.player.dailyRewardClaimedCount, 1);
  assert.equal(result.player.lastSaveTime, now);
  assert.equal(store.daily_player.coins, 100);
});

test('claimDailyRewardForPlayer rejects duplicate same-day claims', () => {
  const now = Date.UTC(2026, 6, 2, 1, 30, 0);
  const store = {
    daily_player: {
      ...server.createDefaultPlayer('daily_player', 'Daily'),
      lastDailyRewardDate: '2026-07-02',
      dailyRewardClaimedCount: 2,
    },
  };

  assert.throws(
    () => server.claimDailyRewardForPlayer(store, 'daily_player', now),
    /DAILY_REWARD_ALREADY_CLAIMED/
  );
});

test('daily reward handler requires matching player sessions and returns player data', () => {
  server.sessions.clear();
  const now = Date.UTC(2026, 6, 2, 1, 30, 0);
  const store = {};
  const session = createAuthorizedSession('wechat', 'daily-owner', now);
  const otherSession = createAuthorizedSession('wechat', 'daily-other', now);
  store[session.playerId] = {
    ...server.createDefaultPlayer(session.playerId, 'Daily Owner'),
    coins: 10,
    lastDailyRewardDate: '',
    dailyRewardClaimedCount: 0,
  };

  const missingCtx = createMockContext({});
  missingCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(missingCtx, store, now);
  assert.equal(missingCtx.status, 401);

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(mismatchCtx, store, now);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  okCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(okCtx, store, now);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.ok, true);
  assert.equal(okCtx.body.rewardCoins, 80);
  assert.equal(okCtx.body.player.playerId, session.playerId);
  assert.equal(okCtx.body.player.coins, 90);

  const duplicateCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  duplicateCtx.params = { playerId: session.playerId };
  server.handleDailyRewardClaim(duplicateCtx, store, now);
  assert.equal(duplicateCtx.status, 400);
  assert.deepEqual(duplicateCtx.body, { ok: false, error: 'DAILY_REWARD_ALREADY_CLAIMED' });
});

test('claimEconomyAdRewardForPlayer applies coin bonus server-side', () => {
  const now = 1781450000000;
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      coins: 30,
      board: fullBoard(null),
    },
  };

  const result = server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'coin_bonus', now);

  assert.equal(result.ok, true);
  assert.equal(result.rewardType, 'coin_bonus');
  assert.equal(result.value, 120);
  assert.equal(result.message, '获得 120 金币');
  assert.equal(result.player.coins, 150);
  assert.equal(result.player.adWatchCount, 1);
  assert.equal(result.player.lastAdRewardTime, now);
  assert.equal(result.player.lastAdRewardType, 'coin_bonus');
  assert.deepEqual(result.player.lastAdRewardClientContext, {
    serverRewardValue: 120,
  });
});

test('claimEconomyAdRewardForPlayer removes the lowest-level occupied cells', () => {
  const now = 1781450000000;
  const board = fullBoard(null);
  board[0] = { row: 0, col: 0, itemId: 4 };
  board[1] = { row: 0, col: 1, itemId: 1 };
  board[2] = { row: 0, col: 2, itemId: 3 };
  board[3] = { row: 0, col: 3, itemId: 2 };
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      board,
    },
  };

  const result = server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'clear_low_items', now);

  assert.equal(result.ok, true);
  assert.equal(result.value, 3);
  assert.equal(result.message, '已清理 3 件低级服装');
  assert.equal(result.player.board[0].itemId, 4);
  assert.equal(result.player.board[1].itemId, null);
  assert.equal(result.player.board[2].itemId, null);
  assert.equal(result.player.board[3].itemId, null);
});

test('claimEconomyAdRewardForPlayer spawns high-level item and rejects full board', () => {
  const now = 1781450000000;
  const board = fullBoard(null);
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      board,
    },
  };

  const result = server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'high_level_item', now, () => 0);

  assert.equal(result.ok, true);
  assert.equal(result.value, 4);
  assert.equal(result.message, '获得 1 件高级服装');
  assert.equal(result.player.board[0].itemId, 4);

  const fullStore = {
    full_ad_player: {
      ...server.createDefaultPlayer('full_ad_player', 'Full'),
      board: fullBoard(1),
    },
  };
  assert.throws(
    () => server.claimEconomyAdRewardForPlayer(fullStore, 'full_ad_player', 'high_level_item', now, () => 0),
    /BOARD_FULL/
  );
});

test('claimEconomyAdRewardForPlayer rejects rapid duplicate claims', () => {
  const now = 1781450000000;
  const store = {
    ad_player: {
      ...server.createDefaultPlayer('ad_player', 'Ad'),
      board: fullBoard(null),
    },
  };

  server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'coin_bonus', now);

  assert.throws(
    () => server.claimEconomyAdRewardForPlayer(store, 'ad_player', 'coin_bonus', now + 1000),
    /ad reward claim is too frequent/
  );
});

test('economy ad reward handler requires matching player sessions and returns player data', () => {
  server.sessions.clear();
  const now = 1781450000000;
  const store = {};
  const session = createAuthorizedSession('wechat', 'economy-ad-owner');
  const otherSession = createAuthorizedSession('wechat', 'economy-ad-other');
  store[session.playerId] = {
    ...server.createDefaultPlayer(session.playerId, 'Ad Owner'),
    board: fullBoard(null),
  };

  const missingCtx = createMockContext({ rewardType: 'coin_bonus' });
  missingCtx.params = { playerId: session.playerId };
  server.handleEconomyAdRewardClaim(missingCtx, store, now);
  assert.equal(missingCtx.status, 401);

  const mismatchCtx = createMockContext({ rewardType: 'coin_bonus' }, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: session.playerId };
  server.handleEconomyAdRewardClaim(mismatchCtx, store, now);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext({ rewardType: 'coin_bonus' }, { authorization: `Bearer ${session.sessionToken}` });
  okCtx.params = { playerId: session.playerId };
  server.handleEconomyAdRewardClaim(okCtx, store, now);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.ok, true);
  assert.equal(okCtx.body.rewardType, 'coin_bonus');
  assert.equal(okCtx.body.player.playerId, session.playerId);
  assert.equal(okCtx.body.player.coins, 120);
});

test('handlePlayerLoad remains public without token and rejects invalid token when supplied', () => {
  server.sessions.clear();
  const publicPlayer = server.createDefaultPlayer('public_player', 'Public');
  const store = { public_player: publicPlayer };

  const publicCtx = createMockContext({});
  publicCtx.params = { playerId: 'public_player' };
  server.handlePlayerLoad(publicCtx, store);
  assert.equal(publicCtx.status, 200);
  assert.equal(publicCtx.body.playerId, 'public_player');

  const invalidCtx = createMockContext({}, { authorization: 'Bearer missing' });
  invalidCtx.params = { playerId: 'public_player' };
  server.handlePlayerLoad(invalidCtx, store);
  assert.equal(invalidCtx.status, 401);
  assert.deepEqual(invalidCtx.body, { ok: false, error: 'session is required' });

  const otherSession = createAuthorizedSession('web', 'other');
  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: 'public_player' };
  server.handlePlayerLoad(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);
});

test('loadPersistedSessionsFromFile restores active sessions from disk', () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.restore.test.json');
  cleanupTempFile(filePath);
  const active = {
    sessionToken: 'restore-token',
    playerId: 'restore-player',
    platform: 'web',
    openid: 'web_mock_restore',
    createdAt: 1781450000000,
    expiresAt: 1781450060000,
  };
  server.writeSessionStore({ [active.sessionToken]: active }, filePath);

  const loaded = server.loadPersistedSessionsFromFile({
    now: 1781450001000,
    filePath,
  });

  assert.equal(loaded, 1);
  assert.deepEqual(server.sessions.get(active.sessionToken), active);
  cleanupTempFile(filePath);
});

test('persisted session authorizes player request after simulated restart', async () => {
  server.sessions.clear();
  const filePath = createTempSessionFilePath('sessionData.restart.test.json');
  cleanupTempFile(filePath);
  const store = {};
  const session = await server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'restart-player',
    nickname: 'Restart',
  }, {
    now: 1781450000000,
    config: server.resolvePlatformAuthConfig({ AUTH_SESSION_TTL_MS: '60000' }),
    sessionFilePath: filePath,
  });

  server.sessions.clear();
  server.loadPersistedSessionsFromFile({
    now: 1781450001000,
    filePath,
  });

  const ctx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };
  server.handlePlayerLoad(ctx, store, 1781450001000);

  assert.equal(ctx.status, 200);
  assert.equal(ctx.body.playerId, session.playerId);
  cleanupTempFile(filePath);
});

test('handleAdRewardClaim requires a matching player session', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('douyin', 'reward-owner');

  const missingCtx = createMockContext({ playerId: session.playerId, rewardType: 'coin_bonus' });
  server.handleAdRewardClaim(missingCtx, store, 1781450000000);
  assert.equal(missingCtx.status, 401);

  const otherSession = createAuthorizedSession('douyin', 'reward-other');
  const mismatchCtx = createMockContext(
    { playerId: session.playerId, rewardType: 'coin_bonus' },
    { authorization: `Bearer ${otherSession.sessionToken}` }
  );
  server.handleAdRewardClaim(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);

  const okCtx = createMockContext(
    { playerId: session.playerId, rewardType: 'coin_bonus' },
    { authorization: `Bearer ${session.sessionToken}` }
  );
  server.handleAdRewardClaim(okCtx, store, 1781450000000);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.ok, true);
  assert.equal(okCtx.body.rewardType, 'coin_bonus');
});

test('board action handlers require matching player sessions', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('wechat', 'board-owner');
  const otherSession = createAuthorizedSession('wechat', 'board-other');

  const missingCtx = createMockContext({});
  missingCtx.params = { playerId: session.playerId };
  server.handleBoardEnsure(missingCtx, store, 1781450000000);
  assert.equal(missingCtx.status, 401);

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${otherSession.sessionToken}` });
  mismatchCtx.params = { playerId: session.playerId };
  server.handleBoardGenerate(mismatchCtx, store, 1781450000000);
  assert.equal(mismatchCtx.status, 403);

  store[session.playerId] = server.createDefaultPlayer(session.playerId);
  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  okCtx.params = { playerId: session.playerId };
  server.handleBoardEnsure(okCtx, store, 1781450000000, () => 0);
  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.playerId, session.playerId);
  assert.equal(occupiedCells(okCtx.body.board).length, 6);
});

test('board action handlers return stable bad request error codes', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('web', 'board-errors');
  store[session.playerId] = {
    ...server.createDefaultPlayer(session.playerId),
    board: fullBoard(1),
  };

  const generateCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  generateCtx.params = { playerId: session.playerId };
  server.handleBoardGenerate(generateCtx, store, 1781450000000, () => 0);
  assert.equal(generateCtx.status, 400);
  assert.deepEqual(generateCtx.body, { ok: false, error: 'BOARD_FULL' });

  const missingPlayerCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  missingPlayerCtx.params = { playerId: session.playerId };
  server.handleBoardEnsure(missingPlayerCtx, {}, 1781450000000, () => 0);
  assert.equal(missingPlayerCtx.status, 400);
  assert.deepEqual(missingPlayerCtx.body, { ok: false, error: 'PLAYER_NOT_FOUND' });

  const mergeCtx = createMockContext({ fromIndex: 0, toIndex: 99 }, { authorization: `Bearer ${session.sessionToken}` });
  mergeCtx.params = { playerId: session.playerId };
  server.handleBoardMerge(mergeCtx, store, 1781450000000);
  assert.equal(mergeCtx.status, 400);
  assert.deepEqual(mergeCtx.body, { ok: false, error: 'INVALID_CELL_INDEX' });
});

test('board action routes persist successful ensure generate and merge actions', async () => {
  const playerDataPath = path.join(__dirname, '..', 'server', 'data', 'playerData.json');
  const sessionDataPath = server.SESSION_DATA_FILE;
  const originalPlayerData = readFileSnapshot(playerDataPath);
  const originalSessionData = readFileSnapshot(sessionDataPath);
  let listener;

  server.sessions.clear();

  try {
    writeJsonFile(sessionDataPath, {});

    const app = server.createApp();
    listener = app.listen(0);
    const port = listener.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const session = createAuthorizedSession('web', 'board-route-owner', Date.now());

    server.writePlayerStore({
      [session.playerId]: server.createDefaultPlayer(session.playerId, 'Route Owner'),
    });

    const ensureResponse = await postJson(`${baseUrl}/player/${session.playerId}/board/ensure`, {
      sessionToken: session.sessionToken,
    });
    assert.equal(ensureResponse.status, 200);
    assert.equal(occupiedCells(ensureResponse.body.board).length, 6);

    const persistedAfterEnsure = server.readPlayerStore();
    assert.equal(occupiedCells(persistedAfterEnsure[session.playerId].board).length, 6);

    const generateResponse = await postJson(`${baseUrl}/player/${session.playerId}/board/generate`, {
      sessionToken: session.sessionToken,
    });
    assert.equal(generateResponse.status, 200);
    assert.equal(occupiedCells(generateResponse.body.board).length, 7);

    const persistedAfterGenerate = server.readPlayerStore();
    assert.equal(occupiedCells(persistedAfterGenerate[session.playerId].board).length, 7);

    const mergeBoard = fullBoard(null);
    mergeBoard[0] = { row: 0, col: 0, itemId: 3 };
    mergeBoard[1] = { row: 0, col: 1, itemId: 3 };
    server.writePlayerStore({
      [session.playerId]: {
        ...persistedAfterGenerate[session.playerId],
        coins: 10,
        score: 20,
        highestItemLevel: 2,
        unlockedSkins: [],
        board: mergeBoard,
      },
    });

    const mergeResponse = await postJson(`${baseUrl}/player/${session.playerId}/board/merge`, {
      sessionToken: session.sessionToken,
      body: { fromIndex: 0, toIndex: 1 },
    });
    assert.equal(mergeResponse.status, 200);
    assert.equal(mergeResponse.body.board[0].itemId, null);
    assert.equal(mergeResponse.body.board[1].itemId, 4);

    const persistedAfterMerge = server.readPlayerStore()[session.playerId];
    const mergedItem = gameplayConfig.getItemConfigById(4);
    assert.equal(persistedAfterMerge.board[0].itemId, null);
    assert.equal(persistedAfterMerge.board[1].itemId, 4);
    assert.equal(persistedAfterMerge.coins, 10 + mergedItem.coin);
    assert.equal(persistedAfterMerge.score, 20 + mergedItem.score);
    assert.equal(persistedAfterMerge.highestItemLevel, 4);
    assert.deepEqual(persistedAfterMerge.unlockedSkins, [1]);
  } finally {
    server.sessions.clear();
    if (listener) {
      await new Promise((resolve) => listener.close(resolve));
    }
    restoreFileSnapshot(playerDataPath, originalPlayerData);
    restoreFileSnapshot(sessionDataPath, originalSessionData);
  }
});

test('board action routes reject unauthorized requests without persisting changes', async () => {
  const playerDataPath = path.join(__dirname, '..', 'server', 'data', 'playerData.json');
  const sessionDataPath = server.SESSION_DATA_FILE;
  const originalPlayerData = readFileSnapshot(playerDataPath);
  const originalSessionData = readFileSnapshot(sessionDataPath);
  let listener;

  server.sessions.clear();

  try {
    writeJsonFile(sessionDataPath, {});
    const playerId = 'web_web_mock_unauthorized-board-route';
    const seededPlayer = server.createDefaultPlayer(playerId, 'Unauthorized');
    server.writePlayerStore({ [playerId]: seededPlayer });

    const app = server.createApp();
    listener = app.listen(0);
    const port = listener.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const response = await postJson(`${baseUrl}/player/${playerId}/board/generate`);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { ok: false, error: 'session is required' });

    const persistedStore = server.readPlayerStore();
    assert.deepEqual(persistedStore[playerId], seededPlayer);
  } finally {
    server.sessions.clear();
    if (listener) {
      await new Promise((resolve) => listener.close(resolve));
    }
    restoreFileSnapshot(playerDataPath, originalPlayerData);
    restoreFileSnapshot(sessionDataPath, originalSessionData);
  }
});

function occupiedCells(board) {
  return board.filter((cell) => cell.itemId !== null);
}

function fullBoard(itemId = 1) {
  const cells = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      cells.push({ row, col, itemId });
    }
  }
  return cells;
}

function readClientItemConfigFields() {
  const clientConfigPath = path.join(__dirname, '..', 'assets', 'scripts', 'data', 'ItemConfig.ts');
  const source = fs.readFileSync(clientConfigPath, 'utf8');
  const objectPattern = /\{\s*id:\s*(\d+),[\s\S]*?name:\s*["']([^"']+)["'],[\s\S]*?level:\s*(\d+),[\s\S]*?nextId:\s*(\d+),[\s\S]*?score:\s*(\d+),[\s\S]*?coin:\s*(\d+)(?:,[\s\S]*?unlockSkinId:\s*(\d+))?[\s\S]*?\}/g;
  const configs = new Map();
  let match = objectPattern.exec(source);

  while (match) {
    configs.set(Number(match[1]), {
      id: Number(match[1]),
      name: match[2],
      level: Number(match[3]),
      nextId: Number(match[4]),
      score: Number(match[5]),
      coin: Number(match[6]),
      unlockSkinId: match[7] === undefined ? undefined : Number(match[7]),
    });
    match = objectPattern.exec(source);
  }

  return configs;
}

test('normalizeBoardCells preserves item positions by row and col coordinates', () => {
  const board = [
    { row: 4, col: 5, itemId: 9 },
    { row: 0, col: 0, itemId: 2 },
    { row: 99, col: 99, itemId: 20 },
    { row: 1, col: 2, itemId: 'bad' },
  ];

  const normalized = server.normalizeBoardCells(board);

  assert.equal(normalized.length, 30);
  assert.deepEqual(normalized[0], { row: 0, col: 0, itemId: 2 });
  assert.deepEqual(normalized[1 * 6 + 2], { row: 1, col: 2, itemId: null });
  assert.deepEqual(normalized[29], { row: 4, col: 5, itemId: 9 });
  assert.equal(normalized.filter((cell) => cell.itemId !== null).length, 2);
});

test('pickRandomCell selects a deterministic cell from candidates', () => {
  const cells = [
    { row: 0, col: 0, itemId: null },
    { row: 0, col: 1, itemId: null },
    { row: 0, col: 2, itemId: null },
  ];

  assert.deepEqual(server.pickRandomCell(cells, () => 0.7), cells[2]);
});

test('server gameplay item config stays in parity with client item config fields', () => {
  const clientConfigs = readClientItemConfigFields();

  assert.equal(clientConfigs.size, gameplayConfig.itemConfigs.length);

  for (const serverItem of gameplayConfig.itemConfigs) {
    assert.deepEqual(clientConfigs.get(serverItem.id), {
      id: serverItem.id,
      name: serverItem.name,
      level: serverItem.level,
      nextId: serverItem.nextId,
      score: serverItem.score,
      coin: serverItem.coin,
      unlockSkinId: serverItem.unlockSkinId,
    });
  }
});

test('ensureBoardForPlayer creates exactly six occupied cells for an empty board', () => {
  const now = 1781450000000;
  const store = {
    board_owner: server.createDefaultPlayer('board_owner', 'Board Owner'),
  };

  const player = server.ensureBoardForPlayer(store, 'board_owner', now, () => 0);

  assert.equal(player.playerId, 'board_owner');
  assert.equal(player.board.length, 30);
  assert.equal(occupiedCells(player.board).length, 6);
  assert.equal(occupiedCells(player.board).every((cell) => cell.itemId === 1), true);
  assert.equal(player.lastSaveTime, now);
});

test('ensureBoardForPlayer preserves an existing occupied board', () => {
  const now = 1781450000000;
  const existingBoard = fullBoard(null);
  existingBoard[7] = { row: 1, col: 1, itemId: 4 };
  const store = {
    board_owner: {
      ...server.createDefaultPlayer('board_owner'),
      board: existingBoard,
      lastSaveTime: 123,
    },
  };

  const player = server.ensureBoardForPlayer(store, 'board_owner', now, () => 0);

  assert.equal(occupiedCells(player.board).length, 1);
  assert.equal(player.board[7].itemId, 4);
  assert.equal(player.lastSaveTime, 123);
});

test('generateBoardItemForPlayer writes one low-level item into an empty cell', () => {
  const now = 1781450000000;
  const store = {
    generator: {
      ...server.createDefaultPlayer('generator'),
      board: fullBoard(null),
    },
  };

  const player = server.generateBoardItemForPlayer(store, 'generator', now, () => 0);

  assert.equal(player.board.length, 30);
  assert.equal(occupiedCells(player.board).length, 1);
  assert.equal(occupiedCells(player.board)[0].itemId, 1);
  assert.equal(player.lastSaveTime, now);
});

test('generateBoardItemForPlayer fails with BOARD_FULL when no cell is empty', () => {
  const store = {
    full_player: {
      ...server.createDefaultPlayer('full_player'),
      board: fullBoard(1),
    },
  };

  assert.throws(
    () => server.generateBoardItemForPlayer(store, 'full_player', 1781450000000, () => 0),
    /BOARD_FULL/
  );
});

test('mergeBoardItemsForPlayer resolves merge rewards and skin unlocks', () => {
  const now = 1781450000000;
  const board = fullBoard(null);
  board[0] = { row: 0, col: 0, itemId: 3 };
  board[1] = { row: 0, col: 1, itemId: 3 };
  const store = {
    merge_player: {
      ...server.createDefaultPlayer('merge_player'),
      coins: 10,
      score: 20,
      highestItemLevel: 2,
      board,
    },
  };

  const player = server.mergeBoardItemsForPlayer(store, 'merge_player', {
    fromIndex: 0,
    toIndex: 1,
  }, now);

  assert.equal(player.board[0].itemId, null);
  assert.equal(player.board[1].itemId, 4);
  assert.equal(player.coins, 28);
  assert.equal(player.score, 65);
  assert.equal(player.highestItemLevel, 4);
  assert.deepEqual(player.unlockedSkins, [1]);
  assert.equal(player.lastSaveTime, now);
});

test('mergeBoardItemsForPlayer rejects invalid merge requests with stable codes', () => {
  const board = fullBoard(null);
  board[0] = { row: 0, col: 0, itemId: 1 };
  board[1] = { row: 0, col: 1, itemId: 2 };
  board[2] = { row: 0, col: 2, itemId: 20 };
  board[3] = { row: 0, col: 3, itemId: 20 };
  const store = {
    merge_player: {
      ...server.createDefaultPlayer('merge_player'),
      board,
    },
  };

  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: -1, toIndex: 1 }), /INVALID_CELL_INDEX/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 4, toIndex: 1 }), /EMPTY_SOURCE_CELL/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 0, toIndex: 4 }), /EMPTY_TARGET_CELL/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 0, toIndex: 1 }), /ITEM_MISMATCH/);
  assert.throws(() => server.mergeBoardItemsForPlayer(store, 'merge_player', { fromIndex: 2, toIndex: 3 }), /ITEM_MAX_LEVEL/);
  assert.throws(() => server.ensureBoardForPlayer({}, 'missing_player'), /PLAYER_NOT_FOUND/);
});
