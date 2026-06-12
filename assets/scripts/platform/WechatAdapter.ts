declare const wx: any;

export class WechatAdapter {
    async login(): Promise<any> {
        if (typeof wx === "undefined") {
            return { mock: true, platform: "wechat" };
        }
        // TODO: 接入 wx.login 并把 code 发送到后端换取登录态。
        return new Promise((resolve, reject) => {
            wx.login({ success: resolve, fail: reject });
        });
    }

    async showRewardAd(): Promise<boolean> {
        if (typeof wx === "undefined") {
            return true;
        }
        // TODO: 使用 wx.createRewardedVideoAd 接入真实激励视频广告。
        return true;
    }

    async share(title: string = "女神衣橱大合成", imageUrl: string = ""): Promise<boolean> {
        if (typeof wx === "undefined") {
            return true;
        }
        // TODO: 接入 wx.shareAppMessage。
        wx.shareAppMessage({ title, imageUrl });
        return true;
    }

    async getUserInfo(): Promise<any> {
        // TODO: 按微信最新授权规范接入用户信息。
        return { nickname: "微信游客" };
    }

    async submitScore(score: number): Promise<boolean> {
        console.log("[WechatAdapter] submitScore", score);
        // TODO: 接入开放数据域排行榜。
        return true;
    }
}
