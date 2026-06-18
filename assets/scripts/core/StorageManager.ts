import { sys } from "cc";
import { AdRewardType } from "../data/AdRewardConfig";
import { RemoteLeaderboardRow } from "../data/LeaderboardData";
import { PlayerData, clonePlayerData } from "../data/PlayerData";
import { platformManager, PlatformName, PlatformRequestOptions } from "../platform/PlatformManager";

const LEGACY_LOCAL_SAVE_KEY = "AI_GODDESS_MERGE_PLAYER_DATA";

export interface AdRewardClaimPayload {
    playerId: string;
    rewardType: AdRewardType;
    clientRewardValue?: number;
    clientCoins?: number;
    clientScore?: number;
    clientHighestItemLevel?: number;
}

export interface AuthLoginPayload {
    platform: PlatformName;
    code: string;
    nickname?: string;
}

export interface AuthLoginResponse {
    ok: boolean;
    platform: PlatformName;
    openid: string;
    playerId: string;
    sessionToken: string;
}

class StorageManager {
    remoteBaseUrl = "http://localhost:3000";
    private sessionToken = "";

    setSessionToken(sessionToken: string): void {
        this.sessionToken = sessionToken.trim();
    }

    getSessionToken(): string {
        return this.sessionToken;
    }

    clearSessionToken(): void {
        this.sessionToken = "";
    }

    saveLocal(playerData: PlayerData): void {
        try {
            const data = clonePlayerData(playerData);
            data.lastSaveTime = Date.now();
            sys.localStorage.setItem(this.getLocalSaveKey(data.playerId), JSON.stringify(data));
        } catch (error) {
            console.warn("[StorageManager] saveLocal failed", error);
        }
    }

    loadLocal(playerId: string): PlayerData | null {
        try {
            const scopedRaw = sys.localStorage.getItem(this.getLocalSaveKey(playerId));
            if (scopedRaw) {
                return JSON.parse(scopedRaw) as PlayerData;
            }

            const legacyRaw = sys.localStorage.getItem(LEGACY_LOCAL_SAVE_KEY);
            if (!legacyRaw) {
                return null;
            }
            const data = JSON.parse(legacyRaw) as PlayerData;
            data.playerId = playerId;
            sys.localStorage.setItem(this.getLocalSaveKey(playerId), JSON.stringify(data));
            return data;
        } catch (error) {
            console.warn("[StorageManager] loadLocal failed", error);
            return null;
        }
    }

    clearLocal(playerId: string): void {
        try {
            sys.localStorage.removeItem(this.getLocalSaveKey(playerId));
        } catch (error) {
            console.warn("[StorageManager] clearLocal failed", error);
        }
    }

    private getLocalSaveKey(playerId: string): string {
        return `AI_GODDESS_MERGE_PLAYER_DATA_${playerId}`;
    }

    async loginRemote(payload: AuthLoginPayload): Promise<AuthLoginResponse | null> {
        try {
            const response = await this.request("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (response && response.ok && response.sessionToken) {
                this.setSessionToken(response.sessionToken);
            }
            return response as AuthLoginResponse;
        } catch (error) {
            console.warn("[StorageManager] loginRemote failed", error);
            return null;
        }
    }

    async saveRemote(playerData: PlayerData): Promise<boolean> {
        try {
            const response = await this.request(`/player/${playerData.playerId}`, {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
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
            const response = await this.request(`/player/${playerId}`, {
                method: "GET",
                headers: this.withAuthHeaders(),
            });
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

    async claimAdReward(payload: AdRewardClaimPayload): Promise<boolean> {
        try {
            const response = await this.request("/ad/reward", {
                method: "POST",
                headers: this.withAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload),
            });
            return Boolean(response?.ok);
        } catch (error) {
            console.warn("[StorageManager] claimAdReward failed", error);
            return false;
        }
    }

    private withAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
        if (!this.sessionToken) {
            return headers;
        }
        return {
            ...headers,
            Authorization: `Bearer ${this.sessionToken}`,
        };
    }

    private async request(path: string, options: PlatformRequestOptions): Promise<any> {
        const response = await platformManager.request(`${this.remoteBaseUrl}${path}`, options);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.data;
    }
}

export const storageManager = new StorageManager();
