import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardManager } from '../assets/scripts/gameplay/BoardManager';
import { getItemConfigById, getMaxItemLevel, getRandomLowLevelItem, isMaxLevelItem, itemConfigs } from '../assets/scripts/data/ItemConfig';
import { getSkinConfigByUnlockLevel, skinConfigs } from '../assets/scripts/data/SkinConfig';
import { createDefaultPlayerData } from '../assets/scripts/data/PlayerData';
import { claimDailyReward, canClaimDailyReward } from '../assets/scripts/data/DailyReward';
import { mergeSystem } from '../assets/scripts/gameplay/MergeSystem';
import { eventManager } from '../assets/scripts/core/EventManager';

test('item and skin configs cover the second-stage 20-level merge chain', () => {
  assert.equal(itemConfigs.length, 20);
  assert.equal(getMaxItemLevel(), 20);
  assert.equal(getItemConfigById(1)?.name, '基础T恤');
  assert.equal(getItemConfigById(12)?.nextId, 13);
  assert.equal(getItemConfigById(20)?.nextId, 0);
  assert.equal(isMaxLevelItem(20), true);
  assert.equal(skinConfigs.length, 7);
  assert.equal(getSkinConfigByUnlockLevel(4)?.name, '甜酷女孩');
  assert.equal(getSkinConfigByUnlockLevel(7)?.name, '国风女神');
  assert.equal(getSkinConfigByUnlockLevel(10)?.name, '高定名媛');
  assert.equal(getSkinConfigByUnlockLevel(12)?.name, '星光女神');
  assert.equal(getSkinConfigByUnlockLevel(15)?.name, '霓虹偶像');
  assert.equal(getSkinConfigByUnlockLevel(18)?.name, '梦境公主');
  assert.equal(getSkinConfigByUnlockLevel(20)?.name, '终章女神');
});

test('default player data includes daily reward tracking fields', () => {
  const data = createDefaultPlayerData('daily_player');

  assert.equal(data.lastDailyRewardDate, '');
  assert.equal(data.dailyRewardClaimedCount, 0);
});

test('daily reward can be claimed once per day and grants coins', () => {
  const data = createDefaultPlayerData('daily_player');

  assert.equal(canClaimDailyReward(data, '2026-06-09'), true);
  const first = claimDailyReward(data, '2026-06-09');
  assert.equal(first.ok, true);
  assert.equal(first.rewardCoins, 80);
  assert.equal(data.coins, 80);
  assert.equal(data.lastDailyRewardDate, '2026-06-09');
  assert.equal(data.dailyRewardClaimedCount, 1);

  const second = claimDailyReward(data, '2026-06-09');
  assert.equal(second.ok, false);
  assert.equal(data.coins, 80);

  assert.equal(canClaimDailyReward(data, '2026-06-10'), true);
});

test('random low level item only returns level 1 to 3 configs', () => {
  for (let i = 0; i < 100; i += 1) {
    const item = getRandomLowLevelItem();
    assert.ok(item.level >= 1 && item.level <= 3);
  }
});

test('merge system only merges same non-max item ids and returns next-item reward', () => {
  assert.equal(mergeSystem.canMerge(1, 1), true);
  assert.equal(mergeSystem.canMerge(1, 2), false);
  assert.equal(mergeSystem.canMerge(20, 20), false);
  assert.equal(mergeSystem.getNextItemId(3), 4);
  assert.equal(mergeSystem.getNextItemId(20), null);

  const reward = mergeSystem.getMergeReward(3);
  assert.equal(reward.score, getItemConfigById(4)?.score);
  assert.equal(reward.coin, getItemConfigById(4)?.coin);
  assert.equal(reward.unlockSkinId, 1);
});

test('board initializes 5x6, spawns six initial items, and serializes all cells', () => {
  eventManager.clear();
  const board = new BoardManager();
  board.initEmptyBoard();
  board.spawnInitialItems(6);

  assert.equal(board.rows, 5);
  assert.equal(board.cols, 6);
  assert.equal(board.getEmptyCells().length, 24);
  assert.equal(board.serializeBoard().length, 30);
});

test('board merges same item ids into target cell and clears source cell', () => {
  eventManager.clear();
  const board = new BoardManager();
  board.initEmptyBoard();
  board.setCell(0, 0, 3);
  board.setCell(0, 1, 3);

  const result = board.merge(0, 0, 0, 1);

  assert.ok(result);
  assert.equal(result?.fromItemId, 3);
  assert.equal(result?.resultItemId, 4);
  assert.equal(result?.unlockedSkinId, 1);
  assert.equal(board.getCell(0, 0), null);
  assert.equal(board.getCell(0, 1), 4);
});

test('board rejects different item ids and max-level merges', () => {
  eventManager.clear();
  const board = new BoardManager();
  board.initEmptyBoard();
  board.setCell(0, 0, 1);
  board.setCell(0, 1, 2);
  board.setCell(1, 0, 20);
  board.setCell(1, 1, 20);

  assert.equal(board.merge(0, 0, 0, 1), null);
  assert.equal(board.merge(1, 0, 1, 1), null);
  assert.equal(board.getCell(0, 0), 1);
  assert.equal(board.getCell(0, 1), 2);
  assert.equal(board.getCell(1, 0), 20);
  assert.equal(board.getCell(1, 1), 20);
});

test('removeLowLevelItems removes the lowest-level occupied cells first', () => {
  eventManager.clear();
  const board = new BoardManager();
  board.initEmptyBoard();
  board.setCell(0, 0, 5);
  board.setCell(0, 1, 1);
  board.setCell(0, 2, 3);
  board.setCell(0, 3, 2);

  const removed = board.removeLowLevelItems(2);

  assert.equal(removed, 2);
  assert.equal(board.getCell(0, 1), null);
  assert.equal(board.getCell(0, 3), null);
  assert.equal(board.getCell(0, 2), 3);
  assert.equal(board.getCell(0, 0), 5);
});

test('full board reports full and rejects new spawns', () => {
  eventManager.clear();
  const board = new BoardManager();
  board.initEmptyBoard();

  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      board.setCell(row, col, 1);
    }
  }

  assert.equal(board.isFull(), true);
  assert.equal(board.spawnRandomItem(), false);
});

test('default player data tracks whether tutorial has been completed', () => {
  const data = createDefaultPlayerData('tutorial_player');

  assert.equal(data.tutorialCompleted, false);
});

test('ad reward configs expose three concrete reward choices', async () => {
  const module = await import('../assets/scripts/data/AdRewardConfig');

  assert.equal(module.adRewardConfigs.length, 3);
  assert.deepEqual(module.adRewardConfigs.map((reward) => reward.type), ['clear_low_items', 'coin_bonus', 'high_level_item']);
  assert.equal(module.getAdRewardConfig('coin_bonus')?.coinAmount, 120);
  assert.equal(module.getAdRewardConfig('high_level_item')?.itemId, 4);
});

test('local leaderboard fallback includes current player and sorts by score then highest item level', async () => {
  const module = await import('../assets/scripts/data/LeaderboardData');
  const current = createDefaultPlayerData('current_player', '当前玩家');
  current.score = 500;
  current.highestItemLevel = 8;

  const rows = module.createLocalLeaderboard(current);

  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].score >= rows[1].score, true);
  assert.equal(rows.some((row) => row.playerId === 'current_player' && row.nickname === '当前玩家'), true);
});

test('board can spawn a specific item id into an empty cell for ad rewards', () => {
  eventManager.clear();
  const board = new BoardManager();
  board.initEmptyBoard();

  const ok = board.spawnItem(4);

  assert.equal(ok, true);
  assert.equal(board.serializeBoard().filter((cell) => cell.itemId === 4).length, 1);
});

test('tutorial step configs describe the stage 2B-B guided onboarding flow', async () => {
  const module = await import('../assets/scripts/data/TutorialStepConfig');

  assert.equal(module.tutorialStepConfigs.length, 4);
  assert.deepEqual(
    module.tutorialStepConfigs.map((step) => step.highlightTarget),
    ['generate_button', 'board', 'ad_button', 'skin_button']
  );
  assert.equal(module.getTutorialStep(0)?.title, '生成第一件服装');
  assert.match(module.getTutorialStep(1)?.body ?? '', /拖动相同服装/);
  assert.equal(module.getTutorialStep(99), null);
  assert.equal(module.clampTutorialStepIndex(-10), 0);
  assert.equal(module.clampTutorialStepIndex(99), 3);
});
