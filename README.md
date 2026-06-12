# 女神衣橱大合成

AI 女神穿搭合成小游戏首版 Demo 项目。

## 技术栈

- 客户端：Cocos Creator 3.8.x + TypeScript
- 后端：Node.js + Koa + @koa/router
- 跨域：@koa/cors
- Body 解析：koa-bodyparser
- 存储：第一版使用本地 JSON 文件 playerData.json
- 平台：微信小游戏 / 抖音小游戏

## 目录结构

```text
AI_Goddess_Merge/
  assets/
    scripts/
      core/
      gameplay/
      ui/
      platform/
      data/
    resources/
      README_ASSETS.md
  server/
    server.js
    package.json
    data/playerData.json
    README_SERVER.md
  tests/
    server.test.js
  README.md
  README_CLIENT.md
```

## 玩法说明

- 棋盘为 5 行 x 6 列。
- 点击生成按钮，在空格随机生成 1-3 级服装。
- 拖动相同服装到一起可合成下一级。
- 合成成功后增加金币、分数和最高服装等级。
- 第 4、7、10、12、15、18、20 级分别解锁皮肤。
- 棋盘满时可使用 mock 激励广告，并从清理低级服装、金币奖励、生成高级服装中选择奖励；奖励会在平台广告成功后发放。
- 首次进入会显示分步骤新手引导，完成后写入本地存档。
- 合成、签到、皮肤解锁、广告奖励成功/失败会显示明确反馈。
- 排行榜优先读取后端数据，远程失败时显示本地兜底榜单。
- 本地存档优先，远程保存失败不会阻塞游戏。

## 客户端运行
快速预览方式：

1. 在 Cocos Creator 里新建空场景。
2. 确保场景有 `Canvas` 节点。
3. 给 `Canvas` 挂载 `assets/scripts/ui/SceneBootstrap.ts`。
4. 直接浏览器预览。脚本会自动创建首版 UI，不需要先做 Prefab 或图片资源。

1. 使用 Cocos Creator 3.8.x 打开本项目。
2. 按 `README_CLIENT.md` 创建场景节点和 Prefab。
3. 绑定 `MainView` 和 `MergeItemPrefab` 的 Inspector 属性。
4. 使用浏览器预览运行。

## 后端运行

```bash
cd server
npm install
npm start
```

打开：

```bash
curl http://localhost:3000/health
```

## Cocos 场景节点

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

`MainView` 节点挂载 `MainView.ts`。`MergeItemPrefab` 挂载 `MergeItem.ts`。


## 自动化测试

后端单元测试：

```bash
node --test tests\server.test.js
```

客户端脚手架测试：

```bash
node --test tests\client-scaffold.test.js
```

客户端核心玩法逻辑测试：

```bash
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
```

一次性运行 Node 侧测试：

```bash
node --test tests\server.test.js tests\client-scaffold.test.js
npx.cmd --yes --package tsx tsx --test tests\client-logic.test.ts
```

说明：`client-logic.test.ts` 直接运行 TypeScript 源码，覆盖物品配置、皮肤配置、合成规则、棋盘生成、合成、满格和清理低级物品。Cocos 编辑器预览仍需要按“客户端运行”挂载 `SceneBootstrap.ts`。
## 微信/抖音发布注意事项

- 真机环境必须使用 HTTPS 后端域名。
- `fetch` 不可用时需要替换为 `wx.request` 或 `tt.request`。
- 激励视频广告需要配置平台广告位 ID。
- 上线前需要接入平台登录、分享、排行榜和隐私协议。
- 服务端需要校验广告奖励和关键分数数据，避免刷奖励。

## 开发阶段规划

### 阶段 1：核心 Demo

目标：

- 5x6 棋盘
- 生成服装
- 拖拽合成
- 金币和分数
- 本地存档
- Koa 后端保存玩家数据
- Mock 广告清理低级物品

验收标准：

- 可以生成物品
- 相同物品可以合成
- 不同物品不能合成
- 最高级物品不能继续合成
- 合成后金币/分数增加
- 合成到指定等级后能解锁皮肤
- 棋盘满了可以清理低级物品
- 刷新后能恢复本地存档
- Koa 后端 `/health` 可访问
- Koa 后端 `/player/:playerId` 可读写
- Koa 后端 `/leaderboard` 可按分数排序

### 阶段 2：完整 MVP

阶段 2A 已完成：

- 扩展到 20 个合成等级
- 皮肤展示入口和皮肤列表
- 每日奖励
- 点击、合成、失败、解锁音效占位调用

阶段 2B-A 已完成：

- 首次进入新手引导
- 新手引导完成状态存档
- 排行榜入口和排行榜弹窗
- 后端排行榜读取失败时使用本地兜底榜单
- 广告奖励从单一清理扩展为三类：清理低级服装、金币奖励、生成高级服装

阶段 2B-B 已完成：

- 新手引导从静态说明升级为分步骤引导。
- 引导会高亮当前步骤对应的主要操作区域。
- 合成、签到、解锁皮肤、广告奖励成功/失败会显示更清晰的反馈。
- 激励广告奖励改为等待平台广告成功后再发放。
- 微信/抖音平台适配层保留真实激励广告接入点。

### 阶段 3：平台接入

- 微信小游戏构建
- 抖音小游戏构建
- 激励视频广告接入
- 分享功能
- 平台登录
- 排行榜提交
- `wx.request` / `tt.request` 替换 `fetch` 或做兼容封装

### 阶段 4：上线优化

- 包体优化
- 首屏加载优化
- 低端机性能优化
- 广告触发时机优化
- 数据埋点
- 审核材料准备
- 隐私协议与用户数据说明

## 下一步 TODO

- 在 Cocos 编辑器中创建并绑定场景节点。
- 给 `MergeItemPrefab` 增加背景色块或 Sprite。
- 增加客户端纯逻辑自动化测试方案。
- 替换正式美术、音效和平台 SDK。
- 后端从 JSON 文件迁移到数据库。





