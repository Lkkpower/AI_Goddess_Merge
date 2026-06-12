# Client Setup

This Cocos Creator project targets Cocos Creator 3.8.x and is currently created with 3.8.8.


## Fast Preview Setup

For the first playable demo, you can avoid manual node wiring:

1. Open the project in Cocos Creator 3.8.x.
2. Create a new empty scene.
3. Ensure the scene has a `Canvas` node.
4. Mount `assets/scripts/ui/SceneBootstrap.ts` on the `Canvas` node.
5. Preview in browser.

`SceneBootstrap` creates `MainView`, `BoardRoot`, labels, buttons, tutorial, leaderboard, rewarded-ad choice panel, and placeholder merge item nodes at runtime. This path does not need `MergeItemPrefab` or image assets.
## Script Mounting

Create this scene structure:

```text
Canvas
  MainView
    BoardRoot
    TopBar
      CoinLabel
      ScoreLabel
    Buttons
      GenerateButton
      ClearButton
    TipLabel

Prefab:
  MergeItemPrefab
    NameLabel
    LevelLabel
```

Mount `assets/scripts/ui/MainView.ts` on the `MainView` node.

Mount `assets/scripts/gameplay/MergeItem.ts` on `MergeItemPrefab`.

Bind these properties on `MainView`:

- `boardRoot` -> `BoardRoot`
- `itemPrefab` -> `MergeItemPrefab`
- `coinLabel` -> `CoinLabel`
- `scoreLabel` -> `ScoreLabel`
- `tipLabel` -> `TipLabel`
- `generateButton` -> `GenerateButton`
- `clearButton` -> `ClearButton`

Bind these properties on `MergeItemPrefab`:

- `nameLabel` -> `NameLabel`
- `levelLabel` -> `LevelLabel`

## Testing Core Gameplay

1. Open the project in Cocos Creator 3.8.x.
2. Build the scene structure above.
3. Assign all script properties in the Inspector.
4. Preview in browser.
5. Confirm six initial clothing items appear.
6. Click Generate to add clothing.
7. Drag one clothing item onto another same-level item to merge.
8. Fill the board and click Clear to test mock rewarded ads.
9. Click Daily Reward to test one reward per day.
10. Click Skin Gallery to view locked and unlocked skins.

## Stage 2B-B Preview Checklist

- 首次进入会显示分步骤新手引导。
- 点击下一步/上一步会切换引导文案和高亮区域。
- 最后一步点击完成或开始游戏后，引导完成状态会写入存档。
- 合成成功、每日奖励、皮肤解锁、广告奖励成功都会显示反馈。
- 广告未完成时不会发放奖励，并会保留奖励选择弹窗。

## Replacing Placeholder Assets

First version uses labels as placeholders. Later, place PNG files under `assets/resources`:

- `item_001` to `item_020` for clothing icons
- `skin_001` to `skin_007` for skin previews

Use 512x512 PNG images with consistent character style, clothing style, lighting, and framing.

## Backend Address

The default backend is `http://localhost:3000` in `assets/scripts/core/StorageManager.ts`.

For mobile mini-game builds, replace this with an HTTPS domain and adapt requests through `wx.request` or `tt.request` when `fetch` is unavailable.

## Platform Adapters

- `WechatAdapter.ts` keeps TODO points for `wx.login`, `wx.shareAppMessage`, `wx.createRewardedVideoAd`, and open-data leaderboard.
- `DouyinAdapter.ts` keeps TODO points for `tt.login`, `tt.shareAppMessage`, and `tt.createRewardedVideoAd`.



