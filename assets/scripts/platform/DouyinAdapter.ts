declare const tt: any;

const REWARDED_AD_UNIT_ID = "";

export class DouyinAdapter {
    async login(): Promise<any> {
        if (typeof tt === "undefined") {
            return { mock: true, platform: "douyin" };
        }
        return new Promise((resolve, reject) => {
            tt.login({ success: resolve, fail: reject });
        });
    }

    async showRewardAd(): Promise<boolean> {
        if (typeof tt === "undefined" || !REWARDED_AD_UNIT_ID) {
            return true;
        }
        // Real integration path: tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID }).
        // Resolve true only from the close event when res.isEnded is true.
        tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        return true;
    }

    async share(title: string = "女神衣橱大合成", imageUrl: string = ""): Promise<boolean> {
        if (typeof tt === "undefined") {
            return true;
        }
        tt.shareAppMessage({ title, imageUrl });
        return true;
    }

    async getUserInfo(): Promise<any> {
        return { nickname: "抖音游客" };
    }

    async submitScore(score: number): Promise<boolean> {
        console.log("[DouyinAdapter] submitScore", score);
        return true;
    }
}
