import { BoardCellData } from "../data/PlayerData";
import { GameEvents, eventManager } from "../core/EventManager";
import { getItemConfigById } from "../data/ItemConfig";
import { itemGenerator } from "./ItemGenerator";
import { mergeSystem } from "./MergeSystem";

export interface MergeResult {
    fromRow: number;
    fromCol: number;
    toRow: number;
    toCol: number;
    fromItemId: number;
    resultItemId: number;
    gainedScore: number;
    gainedCoins: number;
    unlockedSkinId?: number;
}

export class BoardManager {
    rows = 5;
    cols = 6;
    grid: (number | null)[][] = [];

    initEmptyBoard(): void {
        this.grid = [];
        for (let row = 0; row < this.rows; row += 1) {
            const line: (number | null)[] = [];
            for (let col = 0; col < this.cols; col += 1) {
                line.push(null);
            }
            this.grid.push(line);
        }
        eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
    }

    spawnInitialItems(count: number): void {
        for (let i = 0; i < count; i += 1) {
            if (!this.spawnRandomItem(false)) {
                break;
            }
        }
        eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
    }

    spawnRandomItem(emitChange: boolean = true): boolean {
        const emptyCells = this.getEmptyCells();
        if (emptyCells.length === 0) {
            eventManager.emit(GameEvents.BOARD_FULL);
            return false;
        }

        const target = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        this.grid[target.row][target.col] = itemGenerator.randomLowLevelItem();

        if (emitChange) {
            eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
            if (this.isFull()) {
                eventManager.emit(GameEvents.BOARD_FULL);
            }
        }
        return true;
    }


    spawnItem(itemId: number, emitChange: boolean = true): boolean {
        if (!getItemConfigById(itemId)) {
            return false;
        }

        const emptyCells = this.getEmptyCells();
        if (emptyCells.length === 0) {
            eventManager.emit(GameEvents.BOARD_FULL);
            return false;
        }

        const target = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        this.grid[target.row][target.col] = itemId;
        if (emitChange) {
            eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
            if (this.isFull()) {
                eventManager.emit(GameEvents.BOARD_FULL);
            }
        }
        return true;
    }
    getEmptyCells(): { row: number; col: number }[] {
        const cells: { row: number; col: number }[] = [];
        for (let row = 0; row < this.rows; row += 1) {
            for (let col = 0; col < this.cols; col += 1) {
                if (this.grid[row][col] === null) {
                    cells.push({ row, col });
                }
            }
        }
        return cells;
    }

    canMerge(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
        if (!this.isInside(fromRow, fromCol) || !this.isInside(toRow, toCol)) {
            return false;
        }
        if (fromRow === toRow && fromCol === toCol) {
            return false;
        }
        return mergeSystem.canMerge(this.grid[fromRow][fromCol], this.grid[toRow][toCol]);
    }

    merge(fromRow: number, fromCol: number, toRow: number, toCol: number): MergeResult | null {
        if (!this.canMerge(fromRow, fromCol, toRow, toCol)) {
            return null;
        }

        const fromItemId = this.grid[fromRow][fromCol];
        if (fromItemId === null) {
            return null;
        }

        const resultItemId = mergeSystem.getNextItemId(fromItemId);
        if (resultItemId === null) {
            return null;
        }

        const reward = mergeSystem.getMergeReward(fromItemId);
        this.grid[fromRow][fromCol] = null;
        this.grid[toRow][toCol] = resultItemId;

        const result: MergeResult = {
            fromRow,
            fromCol,
            toRow,
            toCol,
            fromItemId,
            resultItemId,
            gainedScore: reward.score,
            gainedCoins: reward.coin,
            unlockedSkinId: reward.unlockSkinId,
        };

        eventManager.emit(GameEvents.ITEM_MERGED, result);
        eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
        return result;
    }

    removeLowLevelItems(count: number): number {
        const occupied: { row: number; col: number; itemId: number; level: number }[] = [];
        for (let row = 0; row < this.rows; row += 1) {
            for (let col = 0; col < this.cols; col += 1) {
                const itemId = this.grid[row][col];
                if (itemId !== null) {
                    occupied.push({
                        row,
                        col,
                        itemId,
                        level: getItemConfigById(itemId)?.level ?? 0,
                    });
                }
            }
        }

        occupied.sort((a, b) => a.level - b.level);
        const targets = occupied.slice(0, Math.max(0, count));
        targets.forEach((cell) => {
            this.grid[cell.row][cell.col] = null;
        });

        if (targets.length > 0) {
            eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
        }
        return targets.length;
    }

    isFull(): boolean {
        return this.getEmptyCells().length === 0;
    }

    serializeBoard(): BoardCellData[] {
        const board: BoardCellData[] = [];
        for (let row = 0; row < this.rows; row += 1) {
            for (let col = 0; col < this.cols; col += 1) {
                board.push({ row, col, itemId: this.grid[row][col] });
            }
        }
        return board;
    }

    loadBoard(boardData: BoardCellData[]): void {
        this.initEmptyBoard();
        boardData.forEach((cell) => {
            if (this.isInside(cell.row, cell.col)) {
                this.grid[cell.row][cell.col] = cell.itemId;
            }
        });
        eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
    }

    getCell(row: number, col: number): number | null {
        if (!this.isInside(row, col)) {
            return null;
        }
        return this.grid[row][col];
    }

    setCell(row: number, col: number, itemId: number | null): void {
        if (!this.isInside(row, col)) {
            return;
        }
        this.grid[row][col] = itemId;
        eventManager.emit(GameEvents.BOARD_CHANGED, this.grid);
    }

    isInside(row: number, col: number): boolean {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }
}

