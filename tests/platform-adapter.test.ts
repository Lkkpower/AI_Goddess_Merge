import test, { before } from "node:test";
import assert from "node:assert/strict";

type CloseHandler = (result: { isEnded?: boolean }) => void;
type ErrorHandler = () => void;
type AdAction = () => unknown;

interface FakeRewardedAdOptions {
    load?: AdAction;
    onClose?: (handler: CloseHandler) => void;
    onError?: (handler: ErrorHandler) => void;
    offClose?: (handler: CloseHandler) => void;
    offError?: (handler: ErrorHandler) => void;
    showActions?: AdAction[];
}

class FakeRewardedAd {
    closeHandler: CloseHandler | null = null;
    errorHandler: ErrorHandler | null = null;
    closeOffCount = 0;
    errorOffCount = 0;
    showCount = 0;
    loadCount = 0;
    private readonly showActions: AdAction[];
    readonly load?: AdAction;
    readonly onClose?: (handler: CloseHandler) => void;
    readonly onError?: (handler: ErrorHandler) => void;
    readonly offClose?: (handler: CloseHandler) => void;
    readonly offError?: (handler: ErrorHandler) => void;

    constructor(options: FakeRewardedAdOptions = {}) {
        this.showActions = options.showActions ?? [() => undefined];
        this.load = options.load
            ? () => {
                this.loadCount += 1;
                return options.load?.();
            }
            : undefined;
        this.onClose = options.onClose ?? ((handler) => {
            this.closeHandler = handler;
        });
        this.onError = options.onError ?? ((handler) => {
            this.errorHandler = handler;
        });
        this.offClose = options.offClose ?? ((handler) => {
            if (this.closeHandler === handler) {
                this.closeHandler = null;
            }
            this.closeOffCount += 1;
        });
        this.offError = options.offError ?? ((handler) => {
            if (this.errorHandler === handler) {
                this.errorHandler = null;
            }
            this.errorOffCount += 1;
        });
    }

    show(): unknown {
        const action = this.showActions[Math.min(this.showCount, this.showActions.length - 1)];
        this.showCount += 1;
        return action();
    }

    close(isEnded: boolean): void {
        this.closeHandler?.({ isEnded });
    }

    error(): void {
        this.errorHandler?.();
    }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 50);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

let WechatAdapter: typeof import("../assets/scripts/platform/WechatAdapter").WechatAdapter;
let DouyinAdapter: typeof import("../assets/scripts/platform/DouyinAdapter").DouyinAdapter;

before(async () => {
    ({ WechatAdapter } = await import("../assets/scripts/platform/WechatAdapter"));
    ({ DouyinAdapter } = await import("../assets/scripts/platform/DouyinAdapter"));
});

const platformCases = [
    {
        name: "WechatAdapter",
        globalName: "wx",
        expectedAdUnitId: "wechat-test-ad-unit",
        createAdapter: () => new WechatAdapter("wechat-test-ad-unit"),
    },
    {
        name: "DouyinAdapter",
        globalName: "tt",
        expectedAdUnitId: "douyin-test-ad-unit",
        createAdapter: () => new DouyinAdapter("douyin-test-ad-unit"),
    },
];

const previewFallbackCases = [
    {
        name: "WechatAdapter",
        globalName: "wx",
        createDefaultAdapter: () => new WechatAdapter(),
        createEmptyAdapter: () => new WechatAdapter(""),
        createConfiguredAdapter: () => new WechatAdapter("wechat-test-ad-unit"),
    },
    {
        name: "DouyinAdapter",
        globalName: "tt",
        createDefaultAdapter: () => new DouyinAdapter(),
        createEmptyAdapter: () => new DouyinAdapter(""),
        createConfiguredAdapter: () => new DouyinAdapter("douyin-test-ad-unit"),
    },
];

for (const platform of previewFallbackCases) {
    test(`${platform.name} returns true for default and empty ad unit IDs without SDK global`, async () => {
        delete (globalThis as any)[platform.globalName];

        assert.equal(await platform.createDefaultAdapter().showRewardAd(), true);
        assert.equal(await platform.createEmptyAdapter().showRewardAd(), true);
    });

    test(`${platform.name} returns true for configured ad unit ID when SDK global is missing`, async () => {
        delete (globalThis as any)[platform.globalName];

        assert.equal(await platform.createConfiguredAdapter().showRewardAd(), true);
    });
}

for (const platform of platformCases) {
    test(`${platform.name} resolves true when rewarded ad close reports ended`, async () => {
        const ad = new FakeRewardedAd();
        let createdWith: unknown = null;
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd(options: unknown) {
                createdWith = options;
                return ad;
            },
        };

        const result = platform.createAdapter().showRewardAd();
        await flushMicrotasks();
        ad.close(true);

        assert.deepEqual(createdWith, { adUnitId: platform.expectedAdUnitId });
        assert.equal(await withTimeout(result, "close true did not settle"), true);
    });

    test(`${platform.name} resolves false when rewarded ad close reports not ended`, async () => {
        const ad = new FakeRewardedAd();
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd() {
                return ad;
            },
        };

        const result = platform.createAdapter().showRewardAd();
        await flushMicrotasks();
        ad.close(false);

        assert.equal(await withTimeout(result, "close false did not settle"), false);
    });

    test(`${platform.name} retries show after load when initial show rejects`, async () => {
        const ad = new FakeRewardedAd({
            showActions: [
                () => Promise.reject(new Error("show failed")),
                () => undefined,
            ],
            load: () => Promise.resolve(),
        });
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd() {
                return ad;
            },
        };

        const result = platform.createAdapter().showRewardAd();
        await flushMicrotasks();
        await flushMicrotasks();
        ad.close(true);

        assert.equal(await withTimeout(result, "retry show did not settle"), true);
        assert.equal(ad.loadCount, 1);
        assert.equal(ad.showCount, 2);
    });

    test(`${platform.name} resolves false and cleans up when rewarded ad load throws`, async () => {
        const ad = new FakeRewardedAd({
            showActions: [() => Promise.reject(new Error("show failed"))],
            load: () => {
                throw new Error("load failed");
            },
        });
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd() {
                return ad;
            },
        };

        const result = platform.createAdapter().showRewardAd();

        assert.equal(await withTimeout(result, "load throw did not settle"), false);
        assert.equal(ad.closeOffCount, 1);
        assert.equal(ad.errorOffCount, 1);
    });

    test(`${platform.name} handles synchronous show throw through the load retry path`, async () => {
        const ad = new FakeRewardedAd({
            showActions: [
                () => {
                    throw new Error("show threw");
                },
                () => undefined,
            ],
            load: () => undefined,
        });
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd() {
                return ad;
            },
        };

        const result = platform.createAdapter().showRewardAd();
        await flushMicrotasks();
        await flushMicrotasks();
        ad.close(true);

        assert.equal(await withTimeout(result, "sync show throw retry did not settle"), true);
        assert.equal(ad.loadCount, 1);
        assert.equal(ad.showCount, 2);
    });

    test(`${platform.name} returns false immediately when onClose is missing`, async () => {
        const ad = new FakeRewardedAd({ onClose: undefined });
        delete (ad as any).onClose;
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd() {
                return ad;
            },
        };

        const result = await withTimeout(platform.createAdapter().showRewardAd(), "missing onClose did not settle");

        assert.equal(result, false);
        assert.equal(ad.showCount, 0);
    });

    test(`${platform.name} settles once and cleans up duplicate close and error events`, async () => {
        const ad = new FakeRewardedAd();
        (globalThis as any)[platform.globalName] = {
            createRewardedVideoAd() {
                return ad;
            },
        };

        const result = platform.createAdapter().showRewardAd();
        await flushMicrotasks();
        const closeHandler = ad.closeHandler;
        const errorHandler = ad.errorHandler;
        assert.ok(closeHandler);
        assert.ok(errorHandler);

        closeHandler({ isEnded: true });
        closeHandler({ isEnded: false });
        errorHandler();

        assert.equal(await withTimeout(result, "duplicate events did not settle"), true);
        assert.equal(ad.closeOffCount, 1);
        assert.equal(ad.errorOffCount, 1);
        assert.equal(ad.closeHandler, null);
        assert.equal(ad.errorHandler, null);
    });
}

test('WechatAdapter returns a standard mock login when SDK is unavailable', async () => {
    delete (globalThis as any).wx;

    const login = await new WechatAdapter().login();

    assert.deepEqual(login, {
        platform: "wechat",
        code: "mock_wechat_code",
        mock: true,
    });
});

test('DouyinAdapter returns a standard mock login when SDK is unavailable', async () => {
    delete (globalThis as any).tt;

    const login = await new DouyinAdapter().login();

    assert.deepEqual(login, {
        platform: "douyin",
        code: "mock_douyin_code",
        mock: true,
    });
});

test('WechatAdapter wraps wx.request responses', async () => {
    let requestOptions: any = null;
    (globalThis as any).wx = {
        request(options: any) {
            requestOptions = options;
            options.success({
                statusCode: 201,
                data: { ok: true },
            });
        },
    };

    const response = await new WechatAdapter().request("http://example.test/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "wechat" }),
    });

    assert.equal(response.ok, true);
    assert.equal(response.status, 201);
    assert.deepEqual(response.data, { ok: true });
    assert.equal(requestOptions.url, "http://example.test/auth/login");
    assert.equal(requestOptions.method, "POST");
    assert.deepEqual(requestOptions.header, { "Content-Type": "application/json" });
    assert.deepEqual(requestOptions.data, { platform: "wechat" });
});

test('DouyinAdapter wraps tt.request failures as rejected promises', async () => {
    (globalThis as any).tt = {
        request(options: any) {
            options.fail({ errMsg: "network failed" });
        },
    };

    await assert.rejects(
        () => new DouyinAdapter().request("http://example.test/player/demo", { method: "GET" }),
        /network failed/
    );
});
