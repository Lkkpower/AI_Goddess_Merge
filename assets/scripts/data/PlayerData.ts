export interface BoardCellData {
    row: number;
    col: number;
    itemId: number | null;
}

export interface PlayerData {
    playerId: string;
    nickname: string;
    coins: number;
    score: number;
    highestItemLevel: number;
    unlockedSkins: number[];
    board: BoardCellData[];
    adWatchCount: number;
    lastDailyRewardDate: string;
    dailyRewardClaimedCount: number;
    tutorialCompleted: boolean;
    lastSaveTime: number;
}

export function createDefaultPlayerData(playerId: string, nickname: string = "游客"): PlayerData {
    return {
        playerId,
        nickname,
        coins: 0,
        score: 0,
        highestItemLevel: 0,
        unlockedSkins: [],
        board: [],
        adWatchCount: 0,
        lastDailyRewardDate: "",
        dailyRewardClaimedCount: 0,
        tutorialCompleted: false,
        lastSaveTime: Date.now(),
    };
}

export function clonePlayerData(data: PlayerData): PlayerData {
    return {
        ...data,
        lastDailyRewardDate: data.lastDailyRewardDate ?? "",
        dailyRewardClaimedCount: data.dailyRewardClaimedCount ?? 0,
        tutorialCompleted: data.tutorialCompleted ?? false,
        unlockedSkins: [...data.unlockedSkins],
        board: data.board.map((cell) => ({ ...cell })),
    };
}

export function normalizePlayerData(data: PlayerData): PlayerData {
    return {
        ...data,
        lastDailyRewardDate: data.lastDailyRewardDate ?? "",
        dailyRewardClaimedCount: data.dailyRewardClaimedCount ?? 0,
        tutorialCompleted: data.tutorialCompleted ?? false,
    };
}

export function isValidBoardCellData(cell: BoardCellData): boolean {
    return Number.isInteger(cell.row)
        && Number.isInteger(cell.col)
        && (cell.itemId === null || Number.isInteger(cell.itemId));
}

