import { _decorator, Component } from "cc";
import { AdRewardType, getAdRewardConfig } from "../data/AdRewardConfig";
import { createLocalLeaderboard, LeaderboardRow, rankLeaderboardRows } from "../data/LeaderboardData";
import { createDefaultPlayerData, normalizePlayerData, PlayerData } from "../data/PlayerData";
import { BoardManager, MergeResult } from "../gameplay/BoardManager";
import { getItemConfigById } from "../data/ItemConfig";
import { claimDailyReward, DailyRewardResult } from "../data/DailyReward";
import { eventManager, GameEvents } from "./EventManager";
import { storageManager } from "./StorageManager";
import { platformManager } from "../platform/PlatformManager";
const { ccclass } = _decorator;

export interface AdRewardClaimResult {
    ok: boolean;
    rewardType: AdRewardType;
    message: string;
    value: number;
}

export interface MergeActionResult {
    ok: boolean;
    resultItemId: number;
}

@ccclass("GameManager")
export class GameManager extends Component {
    static instance: GameManager | null = null;

    readonly boardManager = new BoardManager();
    private playerData: PlayerData | null = null;
    private initialized = false;
    private readonly fallbackPlayerId = "demo_player";
    private remoteAuthoritative = false;

    onLoad(): void {
        GameManager.instance = this;
        this.registerEvents();
        this.initGameAsync().catch((error) => {
            console.warn("[GameManager] async init failed", error);
            this.initGame(this.fallbackPlayerId);
        });
    }

    onDestroy(): void {
        eventManager.off(GameEvents.ITEM_MERGED, this.onItemMerged, this);
        if (GameManager.instance === this) {
            GameManager.instance = null;
        }
    }

    private async initGameAsync(): Promise<void> {
        const login = await platformManager.login();
        const auth = await storageManager.loginRemote({
            platform: login.platform,
            code: login.code,
        });

        if (auth && auth.ok && auth.playerId) {
            if (auth.platform !== "web") {
                const remoteData = await storageManager.ensureRemoteBoard(auth.playerId);
                if (remoteData) {
                    this.remoteAuthoritative = true;
                    this.applyRemotePlayerData(remoteData);
                    this.initialized = true;
                    eventManager.emit(GameEvents.GAME_INIT, this.getPlayerData());
                    return;
                }
            }
            this.initGame(auth.playerId);
            return;
        }

        this.initGame(login.playerId || this.fallbackPlayerId);
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

    private async resolvePlayerId(): Promise<string> {
        try {
            const login = await platformManager.login();
            const auth = await storageManager.loginRemote({
                platform: login.platform,
                code: login.code,
            });
            if (auth && auth.ok && auth.playerId) {
                return auth.playerId;
            }
            return login.playerId || this.fallbackPlayerId;
        } catch (error) {
            console.warn("[GameManager] platform auth failed", error);
            return this.fallbackPlayerId;
        }
    }

    getPlayerData(): PlayerData {
        if (!this.playerData) {
            this.playerData = createDefaultPlayerData(this.fallbackPlayerId);
        }
        return this.playerData;
    }

    private applyRemotePlayerData(remoteData: PlayerData): void {
        this.playerData = normalizePlayerData(remoteData);
        this.boardManager.loadBoard(this.playerData.board);
        eventManager.emit(GameEvents.COINS_CHANGED, this.playerData.coins);
        eventManager.emit(GameEvents.SCORE_CHANGED, this.playerData.score);
    }

    private isPlatformAuthoritative(): boolean {
        return this.remoteAuthoritative
            && platformManager.detectPlatform() !== "web"
            && Boolean(storageManager.getSessionToken());
    }

    private toBoardIndex(row: number, col: number): number {
        return row * this.boardManager.cols + col;
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

    async generateItem(): Promise<boolean> {
        const data = this.getPlayerData();
        if (this.isPlatformAuthoritative()) {
            const remoteData = await storageManager.generateRemoteItem(data.playerId);
            if (!remoteData) {
                return false;
            }
            this.applyRemotePlayerData(remoteData);
            return true;
        }

        const ok = this.boardManager.spawnRandomItem();
        if (ok) {
            this.saveGame();
        }
        return ok;
    }

    async mergeItems(fromRow: number, fromCol: number, toRow: number, toCol: number): Promise<MergeActionResult> {
        const data = this.getPlayerData();
        if (this.isPlatformAuthoritative()) {
            const fromIndex = this.toBoardIndex(fromRow, fromCol);
            const toIndex = this.toBoardIndex(toRow, toCol);
            const remoteData = await storageManager.mergeRemoteItems(data.playerId, fromIndex, toIndex);
            if (!remoteData) {
                return { ok: false, resultItemId: 0 };
            }
            const resultCell = remoteData.board[toIndex];
            this.applyRemotePlayerData(remoteData);
            return { ok: true, resultItemId: resultCell?.itemId ?? 0 };
        }

        const result = this.boardManager.merge(fromRow, fromCol, toRow, toCol);
        return {
            ok: Boolean(result),
            resultItemId: result?.resultItemId ?? 0,
        };
    }

    async claimAdReward(rewardType: AdRewardType): Promise<AdRewardClaimResult> {
        const data = this.getPlayerData();
        const config = getAdRewardConfig(rewardType);
        if (!config) {
            return { ok: false, rewardType, message: "奖励类型不存在", value: 0 };
        }

        if (this.isPlatformAuthoritative()) {
            const remoteResult = await storageManager.claimRemoteAdReward(data.playerId, rewardType);
            if (!remoteResult) {
                return { ok: false, rewardType, message: "广告奖励领取失败", value: 0 };
            }
            this.applyRemotePlayerData(remoteResult.player);
            const result = {
                ok: remoteResult.ok,
                rewardType: remoteResult.rewardType,
                message: remoteResult.message,
                value: remoteResult.value,
            };
            eventManager.emit(GameEvents.AD_REWARD_CLAIMED, result);
            return result;
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

    async claimDailyReward(todayKey?: string): Promise<DailyRewardResult> {
        const data = this.getPlayerData();
        if (this.isPlatformAuthoritative()) {
            const remoteResult = await storageManager.claimRemoteDailyReward(data.playerId);
            if (!remoteResult) {
                return {
                    ok: false,
                    rewardCoins: 0,
                    message: "每日奖励领取失败",
                };
            }
            this.applyRemotePlayerData(remoteResult.player);
            const result = {
                ok: remoteResult.ok,
                rewardCoins: remoteResult.rewardCoins,
                message: remoteResult.message,
            };
            eventManager.emit(GameEvents.DAILY_REWARD_CLAIMED, result);
            return result;
        }

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

    loadGame(playerId: string = this.fallbackPlayerId): void {
        const localData = storageManager.loadLocal(playerId);
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
