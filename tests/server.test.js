const test = require('node:test');
const assert = require('node:assert/strict');

const server = require('../server/server.js');

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

test('registerAuthSession stores session records by token', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'wechat', code: 'session-code' });

  const record = server.registerAuthSession(session, 1781450000000);

  assert.deepEqual(record, {
    sessionToken: 'mock_session_wechat_wechat_mock_session-code',
    playerId: 'wechat_wechat_mock_session-code',
    platform: 'wechat',
    openid: 'wechat_mock_session-code',
    createdAt: 1781450000000,
  });
  assert.deepEqual(server.sessions.get(session.sessionToken), record);
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

  assert.deepEqual(server.getSessionFromAuthorization(`Bearer ${session.sessionToken}`), record);
  assert.equal(server.getSessionFromAuthorization('Bearer missing'), null);
  assert.equal(server.getSessionFromAuthorization(''), null);
});

test('requirePlayerSession returns session or writes auth errors', () => {
  server.sessions.clear();
  const session = server.createAuthSession({ platform: 'douyin', code: 'owner-code' });
  server.registerAuthSession(session, 1781450000000);

  const okCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  const okSession = server.requirePlayerSession(okCtx, session.playerId);
  assert.equal(okSession.playerId, session.playerId);
  assert.equal(okCtx.status, 200);

  const missingCtx = createMockContext({}, {});
  assert.equal(server.requirePlayerSession(missingCtx, session.playerId), null);
  assert.equal(missingCtx.status, 401);
  assert.deepEqual(missingCtx.body, { ok: false, error: 'session is required' });

  const mismatchCtx = createMockContext({}, { authorization: `Bearer ${session.sessionToken}` });
  assert.equal(server.requirePlayerSession(mismatchCtx, 'wechat_other'), null);
  assert.equal(mismatchCtx.status, 403);
  assert.deepEqual(mismatchCtx.body, { ok: false, error: 'session player mismatch' });
});

test('loginPlatformPlayer registers the returned session token', () => {
  server.sessions.clear();
  const store = {};

  const session = server.loginPlatformPlayer(store, {
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  }, 1781450000000);

  assert.equal(server.sessions.get(session.sessionToken).playerId, session.playerId);
  assert.equal(server.sessions.get(session.sessionToken).createdAt, 1781450000000);
});

test('loginPlatformPlayer creates a default player record for a new auth session', () => {
  const store = {};
  const ctx = createMockContext({
    platform: 'wechat',
    code: 'login-code',
    nickname: 'Auth Nick',
  });

  const result = server.loginPlatformPlayer(store, ctx.request.body, 1781450000000);

  assert.equal(result.ok, true);
  assert.equal(result.platform, 'wechat');
  assert.equal(result.openid, 'wechat_mock_login-code');
  assert.equal(result.playerId, 'wechat_wechat_mock_login-code');
  assert.equal(result.sessionToken, 'mock_session_wechat_wechat_mock_login-code');
  assert.equal(store['wechat_wechat_mock_login-code'].nickname, 'Auth Nick');
  assert.equal(store['wechat_wechat_mock_login-code'].lastSaveTime, 1781450000000);
});

test('loginPlatformPlayer preserves existing gameplay data on repeat login', () => {
  const store = {
    web_web_mock_demo_player: {
      ...server.createDefaultPlayer('web_web_mock_demo_player', 'Existing'),
      coins: 300,
      score: 900,
      highestItemLevel: 7,
    },
  };

  const result = server.loginPlatformPlayer(store, {
    platform: 'web',
    code: 'demo_player',
    nickname: 'New Nick',
  });

  assert.equal(result.playerId, 'web_web_mock_demo_player');
  assert.equal(store.web_web_mock_demo_player.nickname, 'Existing');
  assert.equal(store.web_web_mock_demo_player.coins, 300);
  assert.equal(store.web_web_mock_demo_player.score, 900);
  assert.equal(store.web_web_mock_demo_player.highestItemLevel, 7);
});

test('handleAuthLogin writes auth result or bad request response', () => {
  const store = {};
  const okCtx = createMockContext({ platform: 'douyin', code: 'abc', nickname: 'Douyin' });

  server.handleAuthLogin(okCtx, store, 1781450000000);

  assert.equal(okCtx.status, 200);
  assert.equal(okCtx.body.playerId, 'douyin_douyin_mock_abc');
  assert.equal(store.douyin_douyin_mock_abc.nickname, 'Douyin');

  const badCtx = createMockContext({ platform: 'ios', code: 'abc' });
  server.handleAuthLogin(badCtx, store, 1781450000000);

  assert.equal(badCtx.status, 400);
  assert.deepEqual(badCtx.body, {
    ok: false,
    error: 'platform is not supported',
  });
});

function createAuthorizedSession(platform, code, now = 1781450000000) {
  const session = server.createAuthSession({ platform, code });
  server.registerAuthSession(session, now);
  return session;
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

test('handlePlayerSave writes player data with a matching session', () => {
  server.sessions.clear();
  const store = {};
  const session = createAuthorizedSession('wechat', 'owner');
  const saveData = {
    ...server.createDefaultPlayer(session.playerId, 'Owner'),
    coins: 88,
    score: 120,
  };
  const ctx = createMockContext(saveData, { authorization: `Bearer ${session.sessionToken}` });
  ctx.params = { playerId: session.playerId };

  server.handlePlayerSave(ctx, store, 1781450000000);

  assert.equal(ctx.status, 200);
  assert.deepEqual(ctx.body, { ok: true, playerId: session.playerId });
  assert.equal(store[session.playerId].coins, 88);
  assert.equal(store[session.playerId].score, 120);
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
  server.handlePlayerLoad(mismatchCtx, store);
  assert.equal(mismatchCtx.status, 403);
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
