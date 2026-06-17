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

function createMockContext(body) {
  return {
    status: 200,
    request: { body },
    body: undefined,
  };
}

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
