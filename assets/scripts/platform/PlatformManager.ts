import { WechatAdapter } from "./WechatAdapter";
import { DouyinAdapter } from "./DouyinAdapter";

declare const wx: any;
declare const tt: any;

type PlatformName = "wechat" | "douyin" | "web";

class WebAdapter {
    async login(): Promise<any> {
        return { mock: true, platform: "web", playerId: "demo_player" };
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

    login(): Promise<any> {
        return this.getAdapter().login();
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
