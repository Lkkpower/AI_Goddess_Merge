import { _decorator, Component } from "cc";
import { eventManager, GameEvents } from "../core/EventManager";
import { platformManager } from "../platform/PlatformManager";
const { ccclass } = _decorator;

@ccclass("RewardAdView")
export class RewardAdView extends Component {
    showRewardAd(onSuccess: Function, onFail?: Function): void {
        RewardAdView.showRewardAd(onSuccess, onFail);
    }

    static async showRewardAd(onSuccess: Function, onFail?: Function): Promise<void> {
        try {
            const watched = await platformManager.showRewardAd();
            if (!watched) {
                eventManager.emit(GameEvents.AD_REWARD_FAILED);
                onFail?.();
                return;
            }
            onSuccess();
            eventManager.emit(GameEvents.AD_REWARD_SUCCESS);
        } catch (error) {
            console.warn("[RewardAdView] reward ad failed", error);
            eventManager.emit(GameEvents.AD_REWARD_FAILED, error);
            onFail?.(error);
        }
    }
}
