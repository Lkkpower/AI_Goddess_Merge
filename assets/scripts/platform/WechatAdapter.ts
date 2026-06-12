declare const wx: any;

const REWARDED_AD_UNIT_ID = "";

export class WechatAdapter {
    async login(): Promise<any> {
        if (typeof wx === "undefined") {
            return { mock: true, platform: "wechat" };
        }
        return new Promise((resolve, reject) => {
            wx.login({ success: resolve, fail: reject });
        });
    }

    async showRewardAd(): Promise<boolean> {
        if (typeof wx === "undefined" || !REWARDED_AD_UNIT_ID) {
            return true;
        }
        // Real integration path: wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID }).
        // Resolve true only from the close event when res.isEnded is true.
        wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        return true;
    }

    async share(title: string = "女神衣橱大合成", imageUrl: string = ""): Promise<boolean> {
        if (typeof wx === "undefined") {
            return true;
        }
        wx.shareAppMessage({ title, imageUrl });
        return true;
    }

    async getUserInfo(): Promise<any> {
        return { nickname: "微信游客" };
    }

    async submitScore(score: number): Promise<boolean> {
        console.log("[WechatAdapter] submitScore", score);
        return true;
    }
}
