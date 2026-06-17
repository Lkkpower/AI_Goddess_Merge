import { WechatAdapter } from "./WechatAdapter";
import { DouyinAdapter } from "./DouyinAdapter";

declare const wx: any;
declare const tt: any;

export type PlatformName = "wechat" | "douyin" | "web";

export interface PlatformLoginResult {
    platform: PlatformName;
    code: string;
    mock?: boolean;
    playerId?: string;
}

export interface PlatformRequestOptions {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
}

export interface PlatformResponse<T = any> {
    ok: boolean;
    status: number;
    data: T;
}

async function requestWithFetch(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
    if (typeof fetch !== "function") {
        throw new Error("fetch is not available in this runtime");
    }
    const response = await fetch(url, options as any);
    return {
        ok: response.ok,
        status: response.status,
        data: await response.json(),
    };
}

class WebAdapter {
    async login(): Promise<PlatformLoginResult> {
        return { platform: "web", code: "demo_player", mock: true, playerId: "web_demo_player" };
    }

    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        return requestWithFetch(url, options);
    }

    async showRewardAd(): Promise<boolean> {
        return true;
    }

    async share(): Promise<boolean> {
        return true;
    }

    async getUserInfo(): Promise<any> {
        return { nickname: "游客" };
    }

    async submitScore(score: number): Promise<boolean> {
        console.log("[WebAdapter] submitScore", score);
        return true;
    }
}

class PlatformManager {
    private adapter: any = null;

    detectPlatform(): PlatformName {
        if (typeof wx !== "undefined") {
            return "wechat";
        }
        if (typeof tt !== "undefined") {
            return "douyin";
        }
        return "web";
    }

    login(): Promise<PlatformLoginResult> {
        return this.getAdapter().login();
    }

    request(url: string, options?: PlatformRequestOptions): Promise<PlatformResponse> {
        return this.getAdapter().request(url, options);
    }

    async showRewardAd(): Promise<boolean> {
        return this.getAdapter().showRewardAd();
    }

    share(title?: string, imageUrl?: string): Promise<boolean> {
        return this.getAdapter().share(title, imageUrl);
    }

    getUserInfo(): Promise<any> {
        return this.getAdapter().getUserInfo();
    }

    submitScore(score: number): Promise<boolean> {
        return this.getAdapter().submitScore(score);
    }

    private getAdapter(): any {
        if (this.adapter) {
            return this.adapter;
        }

        const platform = this.detectPlatform();
        if (platform === "wechat") {
            this.adapter = new WechatAdapter();
        } else if (platform === "douyin") {
            this.adapter = new DouyinAdapter();
        } else {
            this.adapter = new WebAdapter();
        }
        return this.adapter;
    }
}

export const platformManager = new PlatformManager();
