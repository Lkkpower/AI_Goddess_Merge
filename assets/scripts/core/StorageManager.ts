import { sys } from "cc";
import { AdRewardType } from "../data/AdRewardConfig";
import { RemoteLeaderboardRow } from "../data/LeaderboardData";
import { PlayerData, clonePlayerData } from "../data/PlayerData";

const LOCAL_SAVE_KEY = "AI_GODDESS_MERGE_PLAYER_DATA";

class StorageManager {
    remoteBaseUrl = "http://localhost:3000";

    saveLocal(playerData: PlayerData): void {
        try {
            const data = clonePlayerData(playerData);
            data.lastSaveTime = Date.now();
            sys.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(data));
        } catch (error) {
            console.warn("[StorageManager] saveLocal failed", error);
        }
    }

    loadLocal(): PlayerData | null {
        try {
            const raw = sys.localStorage.getItem(LOCAL_SAVE_KEY);
            if (!raw) {
                return null;
            }
            return JSON.parse(raw) as PlayerData;
        } catch (error) {
            console.warn("[StorageManager] loadLocal failed", error);
            return null;
        }
    }

    clearLocal(): void {
        try {
            sys.localStorage.removeItem(LOCAL_SAVE_KEY);
        } catch (error) {
            console.warn("[StorageManager] clearLocal failed", error);
        }
    }

    async saveRemote(playerData: PlayerData): Promise<boolean> {
        try {
            const response = await this.request(`/player/${playerData.playerId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(playerData),
            });
            return Boolean(response?.ok);
        } catch (error) {
            console.warn("[StorageManager] saveRemote failed", error);
            return false;
        }
    }

    async loadRemote(playerId: string): Promise<PlayerData | null> {
        try {
            const response = await this.request(`/player/${playerId}`, { method: "GET" });
            return response as PlayerData;
        } catch (error) {
            console.warn("[StorageManager] loadRemote failed", error);
            return null;
        }
    }

    async submitLeaderboard(playerData: PlayerData): Promise<boolean> {
        return this.saveRemote(playerData);
    }

    async loadLeaderboard(): Promise<RemoteLeaderboardRow[]> {
        const response = await this.request("/leaderboard", { method: "GET" });
        return Array.isArray(response) ? response as RemoteLeaderboardRow[] : [];
    }

    async claimAdReward(playerId: string, rewardType: AdRewardType): Promise<boolean> {
        try {
            const response = await this.request("/ad/reward", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ playerId, rewardType }),
            });
            return Boolean(response?.ok);
        } catch (error) {
            console.warn("[StorageManager] claimAdReward failed", error);
            return false;
        }
    }

    private async request(path: string, options: RequestInit): Promise<any> {
        // TODO: 微信/抖音小游戏环境如不支持 fetch，应在这里替换为 wx.request / tt.request。
        if (typeof fetch !== "function") {
            throw new Error("fetch is not available in this runtime");
        }

        const response = await fetch(`${this.remoteBaseUrl}${path}`, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }
}

export const storageManager = new StorageManager();
