import { _decorator, Component } from "cc";
import { eventManager, GameEvents } from "../core/EventManager";
const { ccclass } = _decorator;

@ccclass("RewardAdView")
export class RewardAdView extends Component {
    showRewardAd(onSuccess: Function, onFail?: Function): void {
        RewardAdView.showRewardAd(onSuccess, onFail);
    }

    static showRewardAd(onSuccess: Function, onFail?: Function): void {
        // TODO: 后续接入 PlatformManager.showRewardAd。
        // 微信使用 wx.createRewardedVideoAd，抖音使用 tt.createRewardedVideoAd。
        setTimeout(() => {
            try {
                onSuccess();
                eventManager.emit(GameEvents.AD_REWARD_SUCCESS);
            } catch (error) {
                console.warn("[RewardAdView] reward callback failed", error);
                onFail?.(error);
            }
        }, 500);
    }
}
