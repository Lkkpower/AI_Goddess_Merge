import { PlayerData } from "./PlayerData";

export interface DailyRewardResult {
    ok: boolean;
    rewardCoins: number;
    message: string;
}

export const DAILY_REWARD_COINS = 80;

function toTwoDigits(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
}

export function getDailyRewardTodayKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = toTwoDigits(date.getMonth() + 1);
    const day = toTwoDigits(date.getDate());
    return `${year}-${month}-${day}`;
}

export function canClaimDailyReward(data: PlayerData, todayKey: string = getDailyRewardTodayKey()): boolean {
    return data.lastDailyRewardDate !== todayKey;
}

export function claimDailyReward(data: PlayerData, todayKey: string = getDailyRewardTodayKey(), rewardCoins: number = DAILY_REWARD_COINS): DailyRewardResult {
    if (!canClaimDailyReward(data, todayKey)) {
        return {
            ok: false,
            rewardCoins: 0,
            message: "今日奖励已领取",
        };
    }

    data.coins += rewardCoins;
    data.lastDailyRewardDate = todayKey;
    data.dailyRewardClaimedCount = (data.dailyRewardClaimedCount ?? 0) + 1;
    return {
        ok: true,
        rewardCoins,
        message: `领取每日奖励 ${rewardCoins} 金币`,
    };
}
