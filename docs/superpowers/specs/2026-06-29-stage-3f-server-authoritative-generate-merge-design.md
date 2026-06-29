# Stage 3-F Server-Authoritative Generate And Merge Design

Date: 2026-06-29

## Status

Approved design for Stage 3-F planning. This document defines the first server-authoritative gameplay slice: initial board creation, random item generation, and item merge resolution.

## Goals

- Make the server authoritative for board creation, item generation, merge validation, and merge rewards when the client is running in a platform environment with an authenticated remote session.
- Keep browser and Cocos preview development usable by preserving the current local fallback path.
- Return complete updated `PlayerData` from authoritative actions so the client can refresh board and resource state without locally recalculating economic results.
- Keep the change focused on generation and merge. Do not disable the full player save endpoint in this stage.

## Non-Goals

- Do not migrate ad rewards, daily rewards, skins, or every economy action to server commands in this stage.
- Do not replace file-backed persistence with a production database in this stage.
- Do not remove local board logic. It remains necessary for rendering and preview fallback.
- Do not fully lock down `POST /player/:playerId`; that is a later compatibility and anti-tamper stage.

## Chosen Approach

Use new server-authoritative board action endpoints while preserving the existing full save endpoint as a transitional compatibility path.

The client will send intent-only requests for platform gameplay actions:

- ensure a remote board exists
- generate one item
- merge one source cell into one target cell

The server will load persisted player state, validate the action, calculate all changes, save the result, and return updated `PlayerData`.

This keeps Stage 3-F narrow while moving the most important board and reward mutation path away from client-authored state.

## Server API

### `POST /player/:playerId/board/ensure`

Ensures the remote player has a playable board.

Behavior:

- Requires the same authenticated player/session checks as existing player data endpoints.
- If the persisted board has no occupied cells, create an initial board with 6 low-level items.
- If the persisted board already has occupied cells, return it unchanged.
- Save only when a new board is created.
- Return updated `PlayerData`.

### `POST /player/:playerId/board/generate`

Generates one low-level item into a server-selected empty cell.

Behavior:

- Requires authenticated access for the target player.
- Validates that the board exists and has at least one empty cell.
- Chooses a random low-level item using the existing item range, item IDs 1 through 3.
- Chooses an empty cell using the same broad behavior as the current client path.
- Saves and returns updated `PlayerData`.

### `POST /player/:playerId/board/merge`

Merges two cells using server-side validation and reward calculation.

Request body:

```json
{
  "fromIndex": 1,
  "toIndex": 2
}
```

Behavior:

- Requires authenticated access for the target player.
- Validates both indexes are valid board positions.
- Validates the source cell is occupied.
- Validates the target cell is occupied.
- Validates both cells contain the same item ID.
- Validates the item can advance to a next item.
- Moves the merge result to `toIndex` and clears `fromIndex`.
- Adds score and coins from the resulting item config.
- Updates highest item ID.
- Adds any unlock skin ID from the resulting item config if not already unlocked.
- Saves and returns updated `PlayerData`.

## Error Handling

Server responses should use the existing JSON response style and HTTP status conventions.

Expected action error codes:

- `BOARD_FULL`: generation requested with no empty cells.
- `INVALID_CELL_INDEX`: a merge index is outside the board.
- `EMPTY_SOURCE_CELL`: merge source cell has no item.
- `EMPTY_TARGET_CELL`: merge target cell has no item.
- `ITEM_MISMATCH`: source and target item IDs differ.
- `ITEM_MAX_LEVEL`: the item cannot be advanced.
- `UNAUTHORIZED`: missing or invalid session.
- `PLAYER_NOT_FOUND`: target player data cannot be loaded.

Client behavior:

- Platform environment failures do not create local replacement results.
- Failed platform actions leave the current board state unchanged.
- Client UI may show a generic failure tip in this stage.
- Detailed error codes primarily support tests, diagnostics, and later UI copy.

## Client Data Flow

`StorageManager` gains remote action methods:

- `ensureRemoteBoard()`
- `generateRemoteItem()`
- `mergeRemoteItems(fromIndex, toIndex)`

`GameManager` coordinates authority mode:

- After successful remote login/load, call `ensureRemoteBoard()` and apply returned data.
- In platform authenticated mode, the generate button calls `generateRemoteItem()` and applies returned data.
- In platform authenticated mode, drag merge calls `mergeRemoteItems(fromIndex, toIndex)` and applies returned data.
- In browser, Cocos preview, or unauthenticated local play, generation and merge continue to use `BoardManager`.

`BoardManager` remains responsible for local board representation, rendering support, and preview fallback. Its local merge reward event path remains valid only for local preview behavior.

## Compatibility Boundary

- Existing `POST /player/:playerId` remains available.
- The platform generate and merge paths should stop using full-save submission for board, coins, score, highest item, and unlock changes caused by these actions.
- Existing player data normalization stays in place for loading and persistence.
- Existing local save behavior remains for preview and fallback play.
- Existing players are not reset. The ensure endpoint only creates the initial board when the remote board is empty.

## Testing Requirements

Server tests:

- `ensure` creates exactly 6 occupied cells for an empty board.
- `ensure` does not overwrite an existing board.
- `generate` writes one item to an empty cell and persists it.
- `generate` fails with `BOARD_FULL` when the board has no empty cells.
- `merge` succeeds for two equal non-max items and persists the merged result.
- `merge` adds result score, result coin reward, highest item, and unlock skin data.
- `merge` fails for invalid indexes, empty source, empty target, mismatched items, and max-level items.
- All board action endpoints require a valid authenticated session for the requested player.

Client tests:

- Platform generate calls the remote action and applies returned `PlayerData`.
- Platform merge calls the remote action and applies returned `PlayerData`.
- Platform remote failure does not apply a local mutation.
- Local preview generation and merge still use the existing `BoardManager` path.

Verification commands:

- `node --test tests\server.test.js tests\client-scaffold.test.js`
- `npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts tests\platform-adapter.test.ts`
- `npx.cmd --yes --package typescript@5.4.5 tsc --noEmit`

## Documentation Updates

- Update `server/README_SERVER.md` with the new board action endpoints.
- Update `docs/superpowers/CURRENT_CHECKPOINT.md` when implementation completes.

## Follow-Up Work

- Restrict or replace full player save for authoritative fields.
- Move the remaining economy actions to server commands.
- Add production-grade storage in place of local JSON persistence.
