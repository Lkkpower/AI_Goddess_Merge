declare const wx: any;

const REWARDED_AD_UNIT_ID = "";

export class WechatAdapter {
    constructor(private readonly rewardedAdUnitId: string = REWARDED_AD_UNIT_ID) {}

    async login(): Promise<any> {
        if (typeof wx === "undefined") {
            return { mock: true, platform: "wechat" };
        }
        return new Promise((resolve, reject) => {
            wx.login({ success: resolve, fail: reject });
        });
    }

    async showRewardAd(): Promise<boolean> {
        if (typeof wx === "undefined" || !this.rewardedAdUnitId) {
            return true;
        }
        if (typeof wx.createRewardedVideoAd !== "function") {
            return false;
        }

        const rewardedAd = wx.createRewardedVideoAd({ adUnitId: this.rewardedAdUnitId });
        if (!rewardedAd) {
            return false;
        }
        if (
            typeof rewardedAd.show !== "function"
            || typeof rewardedAd.onClose !== "function"
            || typeof rewardedAd.onError !== "function"
        ) {
            return false;
        }

        return new Promise((resolve) => {
            let settled = false;

            function cleanup(): void {
                if (typeof rewardedAd.offClose === "function") {
                    rewardedAd.offClose(handleClose);
                }
                if (typeof rewardedAd.offError === "function") {
                    rewardedAd.offError(handleError);
                }
            }

            function settle(value: boolean): void {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(value);
            }

            function handleClose(result: { isEnded?: boolean }): void {
                settle(Boolean(result && result.isEnded));
            }

            function handleError(): void {
                settle(false);
            }

            rewardedAd.onClose(handleClose);
            rewardedAd.onError(handleError);

            Promise.resolve().then(() => rewardedAd.show()).catch(() => {
                if (typeof rewardedAd.load !== "function") {
                    settle(false);
                    return;
                }

                Promise.resolve()
                    .then(() => rewardedAd.load())
                    .then(() => Promise.resolve().then(() => rewardedAd.show()))
                    .catch(() => settle(false));
            });
        });
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
