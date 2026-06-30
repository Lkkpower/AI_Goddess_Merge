const BOARD_ROWS = 5;
const BOARD_COLS = 6;
const BOARD_CELL_COUNT = BOARD_ROWS * BOARD_COLS;

const itemConfigs = [
  { id: 1, name: "基础T恤", level: 1, nextId: 2, score: 5, coin: 2 },
  { id: 2, name: "高腰短裙", level: 2, nextId: 3, score: 12, coin: 5 },
  { id: 3, name: "清新连衣裙", level: 3, nextId: 4, score: 25, coin: 10 },
  { id: 4, name: "甜酷套装", level: 4, nextId: 5, score: 45, coin: 18, unlockSkinId: 1 },
  { id: 5, name: "职场套装", level: 5, nextId: 6, score: 75, coin: 30 },
  { id: 6, name: "校园风套装", level: 6, nextId: 7, score: 120, coin: 48 },
  { id: 7, name: "国风套装", level: 7, nextId: 8, score: 180, coin: 72, unlockSkinId: 2 },
  { id: 8, name: "晚礼服", level: 8, nextId: 9, score: 260, coin: 104 },
  { id: 9, name: "舞台造型", level: 9, nextId: 10, score: 360, coin: 144 },
  { id: 10, name: "高定礼服", level: 10, nextId: 11, score: 500, coin: 200, unlockSkinId: 3 },
  { id: 11, name: "女神限定装", level: 11, nextId: 12, score: 700, coin: 280 },
  { id: 12, name: "传说星光套装", level: 12, nextId: 13, score: 1000, coin: 400, unlockSkinId: 4 },
  { id: 13, name: "璀璨红毯礼服", level: 13, nextId: 14, score: 1350, coin: 540 },
  { id: 14, name: "未来感战衣", level: 14, nextId: 15, score: 1750, coin: 700 },
  { id: 15, name: "霓虹偶像套装", level: 15, nextId: 16, score: 2200, coin: 880, unlockSkinId: 5 },
  { id: 16, name: "皇家舞会礼裙", level: 16, nextId: 17, score: 2750, coin: 1100 },
  { id: 17, name: "幻境精灵套装", level: 17, nextId: 18, score: 3400, coin: 1360 },
  { id: 18, name: "梦境公主礼服", level: 18, nextId: 19, score: 4200, coin: 1680, unlockSkinId: 6 },
  { id: 19, name: "银河女王套装", level: 19, nextId: 20, score: 5200, coin: 2080 },
  { id: 20, name: "终章女神神装", level: 20, nextId: 0, score: 6600, coin: 2640, unlockSkinId: 7 },
];

function getItemConfigById(id) {
  return itemConfigs.find((item) => item.id === id) || null;
}

function getRandomLowLevelItemId(randomFn = Math.random) {
  const lowLevelItems = itemConfigs.filter((item) => item.level >= 1 && item.level <= 3);
  const index = Math.min(lowLevelItems.length - 1, Math.floor(randomFn() * lowLevelItems.length));
  return lowLevelItems[index].id;
}

module.exports = {
  BOARD_ROWS,
  BOARD_COLS,
  BOARD_CELL_COUNT,
  itemConfigs,
  getItemConfigById,
  getRandomLowLevelItemId,
};
