import type { PlatformLoginResult, PlatformRequestOptions, PlatformResponse } from "./PlatformManager";

declare const tt: any;

const REWARDED_AD_UNIT_ID = "";

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

function parseRequestBody(body?: string): any {
    if (!body) {
        return undefined;
    }
    try {
        return JSON.parse(body);
    } catch (error) {
        return body;
    }
}

export class DouyinAdapter {
    constructor(private readonly rewardedAdUnitId: string = REWARDED_AD_UNIT_ID) {}

    async login(): Promise<PlatformLoginResult> {
        if (typeof tt === "undefined" || typeof tt.login !== "function") {
            return { platform: "douyin", code: "mock_douyin_code", mock: true };
        }
        return new Promise((resolve, reject) => {
            tt.login({
                success: (result: { code?: string }) => {
                    if (result && typeof result.code === "string" && result.code.trim()) {
                        resolve({ platform: "douyin", code: result.code.trim() });
                    } else {
                        reject(new Error("douyin login code is missing"));
                    }
                },
                fail: reject,
            });
        });
    }

    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        if (typeof tt === "undefined" || typeof tt.request !== "function") {
            return requestWithFetch(url, options);
        }

        return new Promise((resolve, reject) => {
            tt.request({
                url,
                method: options.method || "GET",
                header: options.headers || {},
                data: parseRequestBody(options.body),
                success: (result: { statusCode?: number; data?: any }) => {
                    const status = Number(result.statusCode) || 0;
                    resolve({
                        ok: status >= 200 && status < 300,
                        status,
                        data: result.data,
                    });
                },
                fail: (error: any) => reject(new Error(error && error.errMsg ? error.errMsg : "douyin request failed")),
            });
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
