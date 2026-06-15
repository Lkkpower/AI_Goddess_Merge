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
        if (typeof wx.createRewardedVideoAd !== "function") {
            return false;
        }

        const rewardedAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
        if (!rewardedAd) {
            return false;
        }
        if (typeof rewardedAd.show !== "function") {
            return false;
        }

        return new Promise((resolve) => {
            let settled = false;

            function cleanup(): void {
                rewardedAd.offClose?.(handleClose);
                rewardedAd.offError?.(handleError);
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

            rewardedAd.onClose?.(handleClose);
            rewardedAd.onError?.(handleError);

            const showResult = rewardedAd.show();
            Promise.resolve(showResult).catch(() => {
                if (typeof rewardedAd.load !== "function") {
                    settle(false);
                    return;
                }
                const loadResult = rewardedAd.load();
                Promise.resolve(loadResult)
                    .then(() => rewardedAd.show())
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
