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
        if (typeof tt.createRewardedVideoAd !== "function") {
            return false;
        }

        const rewardedAd = tt.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
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
