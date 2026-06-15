declare const tt: any;

const REWARDED_AD_UNIT_ID = "";

export class DouyinAdapter {
    constructor(private readonly rewardedAdUnitId: string = REWARDED_AD_UNIT_ID) {}

    async login(): Promise<any> {
        if (typeof tt === "undefined") {
            return { mock: true, platform: "douyin" };
        }
        return new Promise((resolve, reject) => {
            tt.login({ success: resolve, fail: reject });
        });
    }

    async showRewardAd(): Promise<boolean> {
        if (typeof tt === "undefined" || !this.rewardedAdUnitId) {
            return true;
        }
        if (typeof tt.createRewardedVideoAd !== "function") {
            return false;
        }

        const rewardedAd = tt.createRewardedVideoAd({ adUnitId: this.rewardedAdUnitId });
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
