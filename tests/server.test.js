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
