import { _decorator, Component } from "cc";
import { AdRewardType, getAdRewardConfig } from "../data/AdRewardConfig";
import { createLocalLeaderboard, LeaderboardRow, rankLeaderboardRows } from "../data/LeaderboardData";
import { createDefaultPlayerData, normalizePlayerData, PlayerData } from "../data/PlayerData";
import { BoardManager, MergeResult } from "../gameplay/BoardManager";
import { getItemConfigById } from "../data/ItemConfig";
import { claimDailyReward, DailyRewardResult } from "../data/DailyReward";
import { eventManager, GameEvents } from "./EventManager";
import { storageManager } from "./StorageManager";
const { ccclass } = _decorator;

export interface AdRewardClaimResult {
    ok: boolean;
    rewardType: AdRewardType;
    message: string;
    value: number;
}

@ccclass("GameManager")
export class GameManager extends Component {
    static instance: GameManager | null = null;

    readonly boardManager = new BoardManager();
    private playerData: PlayerData | null = null;
    private initialized = false;

    onLoad(): void {
        GameManager.instance = this;
        this.registerEvents();
        this.initGame();
    }

    onDestroy(): void {
        eventManager.off(GameEvents.ITEM_MERGED, this.onItemMerged, this);
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    }

    initGame(playerId: string = "demo_player"): void {
        if (this.initialized) {
            return;
        }

        this.loadGame(playerId);
        const data = this.getPlayerData();
        if (data.board.length > 0) {
            this.boardManager.loadBoard(data.board);
        } else {
            this.boardManager.initEmptyBoard();
            this.boardManager.spawnInitialItems(6);
            data.board = this.boardManager.serializeBoard();
            this.saveGame();
        }

        this.initialized = true;
        eventManager.emit(GameEvents.GAME_INIT, data);
    }

    getPlayerData(): PlayerData {
        if (!this.playerData) {
            this.playerData = createDefaultPlayerData("demo_player");
        }
        return this.playerData;
    }

    addCoins(amount: number): void {
        const data = this.getPlayerData();
        data.coins += amount;
        eventManager.emit(GameEvents.COINS_CHANGED, data.coins);
    }

    addScore(amount: number): void {
        const data = this.getPlayerData();
        data.score += amount;
        eventManager.emit(GameEvents.SCORE_CHANGED, data.score);
    }

    unlockSkin(skinId: number): void {
        const data = this.getPlayerData();
        if (data.unlockedSkins.indexOf(skinId) !== -1) {
            return;
        }
        data.unlockedSkins.push(skinId);
        eventManager.emit(GameEvents.SKIN_UNLOCKED, skinId);
    }

    completeTutorial(): void {
        const data = this.getPlayerData();
        if (data.tutorialCompleted) {
            return;
        }
        data.tutorialCompleted = true;
        eventManager.emit(GameEvents.TUTORIAL_COMPLETED);
        this.saveGame();
    }

    async getLeaderboard(): Promise<LeaderboardRow[]> {
        const data = this.getPlayerData();
        try {
            const rows = await storageManager.loadLeaderboard();
            return rankLeaderboardRows(rows.length > 0 ? rows : createLocalLeaderboard(data));
        } catch (error) {
            console.warn("[GameManager] load leaderboard failed", error);
            return createLocalLeaderboard(data);
        }
    }

    claimAdReward(rewardType: AdRewardType): AdRewardClaimResult {
        const data = this.getPlayerData();
        const config = getAdRewardConfig(rewardType);
        if (!config) {
            return { ok: false, rewardType, message: "奖励类型不存在", value: 0 };
        }

        let value = 0;
        let message = "广告奖励已领取";
        if (rewardType === "clear_low_items") {
            value = this.boardManager.removeLowLevelItems(config.clearCount ?? 3);
            message = `已清理 ${value} 件低级服装`;
        }
        if (rewardType === "coin_bonus") {
            value = config.coinAmount ?? 0;
            this.addCoins(value);
            message = `获得 ${value} 金币`;
        }
        if (rewardType === "high_level_item") {
            const ok = this.boardManager.spawnItem(config.itemId ?? 4);
            if (!ok) {
                eventManager.emit(GameEvents.BOARD_FULL);
                return { ok: false, rewardType, message: "衣橱已满，无法生成高级服装", value: 0 };
            }
            value = config.itemId ?? 4;
            message = "获得 1 件高级服装";
        }

        data.adWatchCount += 1;
        const result = { ok: true, rewardType, message, value };
        eventManager.emit(GameEvents.AD_REWARD_CLAIMED, result);
        this.saveGame();
        storageManager.claimAdReward({
            playerId: data.playerId,
            rewardType,
            clientRewardValue: result.value,
            clientCoins: data.coins,
            clientScore: data.score,
            clientHighestItemLevel: data.highestItemLevel,
        }).catch((error) => {
            console.warn("[GameManager] remote ad reward failed", error);
        });
        return result;
    }

    claimDailyReward(todayKey?: string): DailyRewardResult {
        const data = this.getPlayerData();
        const result = claimDailyReward(data, todayKey);
        if (result.ok) {
            eventManager.emit(GameEvents.COINS_CHANGED, data.coins);
            eventManager.emit(GameEvents.DAILY_REWARD_CLAIMED, result);
            this.saveGame();
        }
        return result;
    }

    saveGame(): void {
        const data = this.getPlayerData();
        data.board = this.boardManager.serializeBoard();
        data.lastSaveTime = Date.now();
        storageManager.saveLocal(data);
        storageManager.saveRemote(data).catch((error) => {
            console.warn("[GameManager] remote save failed", error);
        });
    }

    loadGame(playerId: string = "demo_player"): void {
        const localData = storageManager.loadLocal();
        this.playerData = localData ? normalizePlayerData(localData) : createDefaultPlayerData(playerId);
    }

    private registerEvents(): void {
        eventManager.on(GameEvents.ITEM_MERGED, this.onItemMerged, this);
    }

    private onItemMerged(result: MergeResult): void {
        const data = this.getPlayerData();
        this.addCoins(result.gainedCoins);
        this.addScore(result.gainedScore);

        const resultConfig = getItemConfigById(result.resultItemId);
        if (resultConfig) {
            data.highestItemLevel = Math.max(data.highestItemLevel, resultConfig.level);
        }

        if (result.unlockedSkinId) {
            this.unlockSkin(result.unlockedSkinId);
        }
        this.saveGame();
    }
}
