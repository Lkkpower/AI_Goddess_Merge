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

test('getRewardValue maps allowed ad reward types', () => {
  assert.equal(server.getRewardValue('clear_low_items'), 3);
  assert.equal(server.getRewardValue('double_coins'), 2);
  assert.equal(server.getRewardValue('free_item'), 1);
  assert.throws(() => server.getRewardValue('unknown'), /Invalid rewardType/);
});
