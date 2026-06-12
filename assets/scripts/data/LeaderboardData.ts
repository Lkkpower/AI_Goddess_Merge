import { PlayerData } from "./PlayerData";

export interface LeaderboardRow {
    rank: number;
    playerId: string;
    nickname: string;
    score: number;
    highestItemLevel: number;
}

export type RemoteLeaderboardRow = Omit<LeaderboardRow, "rank"> & { rank?: number };

const mockRows: RemoteLeaderboardRow[] = [
    { playerId: "mock_queen", nickname: "衣橱女王", score: 1880, highestItemLevel: 15 },
    { playerId: "mock_star", nickname: "星光玩家", score: 1260, highestItemLevel: 12 },
    { playerId: "mock_new", nickname: "合成新星", score: 360, highestItemLevel: 6 },
];

export function rankLeaderboardRows(rows: RemoteLeaderboardRow[]): LeaderboardRow[] {
    return [...rows]
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return b.highestItemLevel - a.highestItemLevel;
        })
        .slice(0, 20)
        .map((row, index) => ({
            rank: index + 1,
            playerId: row.playerId,
            nickname: row.nickname || "游客",
            score: Number(row.score) || 0,
            highestItemLevel: Number(row.highestItemLevel) || 0,
        }));
}

export function createLocalLeaderboard(currentPlayer: PlayerData): LeaderboardRow[] {
    return rankLeaderboardRows([
        ...mockRows,
        {
            playerId: currentPlayer.playerId,
            nickname: currentPlayer.nickname,
            score: currentPlayer.score,
            highestItemLevel: currentPlayer.highestItemLevel,
        },
    ]);
}
