import type { PlatformLoginResult, PlatformRequestOptions, PlatformResponse } from "./PlatformManager";

declare const wx: any;

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

export class WechatAdapter {
    constructor(private readonly rewardedAdUnitId: string = REWARDED_AD_UNIT_ID) {}

    async login(): Promise<PlatformLoginResult> {
        if (typeof wx === "undefined" || typeof wx.login !== "function") {
            return { platform: "wechat", code: "mock_wechat_code", mock: true };
        }
        return new Promise((resolve, reject) => {
            wx.login({
                success: (result: { code?: string }) => {
                    if (result && typeof result.code === "string" && result.code.trim()) {
                        resolve({ platform: "wechat", code: result.code.trim() });
                    } else {
                        reject(new Error("wechat login code is missing"));
                    }
                },
                fail: reject,
            });
        });
    }

    request(url: string, options: PlatformRequestOptions = {}): Promise<PlatformResponse> {
        if (typeof wx === "undefined" || typeof wx.request !== "function") {
            return requestWithFetch(url, options);
        }

        return new Promise((resolve, reject) => {
            wx.request({
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
                fail: (error: any) => reject(new Error(error && error.errMsg ? error.errMsg : "wechat request failed")),
            });
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
