declare const tt: any;

export class DouyinAdapter {
    async login(): Promise<any> {
        if (typeof tt === "undefined") {
            return { mock: true, platform: "douyin" };
        }
        // TODO: 接入 tt.login 并把 code 发送到后端换取登录态。
        return new Promise((resolve, reject) => {
            tt.login({ success: resolve, fail: reject });
        });
    }

    async showRewardAd(): Promise<boolean> {
        if (typeof tt === "undefined") {
            return true;
        }
        // TODO: 使用 tt.createRewardedVideoAd 接入真实激励视频广告。
        return true;
    }

    async share(title: string = "女神衣橱大合成", imageUrl: string = ""): Promise<boolean> {
        if (typeof tt === "undefined") {
            return true;
        }
        // TODO: 接入 tt.shareAppMessage。
        tt.shareAppMessage({ title, imageUrl });
        return true;
    }

    async getUserInfo(): Promise<any> {
        // TODO: 按抖音小游戏授权规范接入用户信息。
        return { nickname: "抖音游客" };
    }

    async submitScore(score: number): Promise<boolean> {
        console.log("[DouyinAdapter] submitScore", score);
        // TODO: 接入抖音排行榜或后端排行榜。
        return true;
    }
}
