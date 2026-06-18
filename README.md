<div align="center">

# 字垣 · WordWall

**文字筑墙，邂逅一句之缘**

一款每日文字解谜游戏 —— 万千文字筑成一堵墙，你拖动并旋转一张镂空的解密卡，在字墙中找到唯一正确的位置与角度，让那句话透过镂空浮现。

*Words build a wall; meet the one sentence meant for you.*

</div>

---

## ✨ 这是什么

字垣（zì-yuán）取自「字缘」的谐音 —— 文字筑墙，邂逅一句之缘。

整个屏幕是一堵用汉字「砌」成的墙（填充字随机做视觉噪声，每个字的字重、透明度、微旋转都不同）。你手里有一张**不规则镂空的解密卡**，卡片上有若干孔洞，名言的每一个字被分散在墙上某个孔洞会落到的位置。你需要**拖动卡片、并以 90° 步进旋转它**，直到每一个孔洞同时落在正确的字上 —— 这时整句名言就会透过孔洞读出来。

- 🧩 **核心机制**：拖拽 + 90° 旋转，让所有孔洞同时对齐到正解
- 📅 **每日一题**：同一日期全球同一题（纯本地确定，无需服务器）
- 🎴 **书签**：通关后生成一张「指纹」书签 —— 用解码卡的形状、用时、角度、道具用量编码，可分享
- 🗓️ **历史日历**：过往每一天的指纹汇成一张日历
- 🏆 **35 项成就**、🎚️ **三档难度**、🎮 **四种模式**、🛠️ **题库管理 + 离线 AI 出题**

> 灵感来自《探险小虎队》式的「解码卡」谜题，以及汉兜 / 词影式的暗色文学美学。

## 🎮 怎么玩

1. 屏幕上是一整面汉字墙，名言的每一个字都藏在墙里。
2. 你有一张带孔洞的解密卡：**拖动**它移动位置，点底部的 **2×2 角度盘**以 90° 旋转。
3. 当某个孔洞落在「正确」的字上，该孔会变绿；当大部分孔洞都对齐（≥60%），卡片边框会变金（「你很接近了」）。
4. 当**所有**孔洞同时对齐到名言的正确顺序，谜题完成 —— 全句透过孔洞浮现。

> 没有部分通关 /「发现一个词」的中间态：通关的唯一判据是整句名言按阅读顺序正确对齐。

## 🕹️ 游戏模式

| 模式 | 说明 | 时限 | 难度 |
|---|---|---|---|
| **今日解密** (classic) | 每日一题，使用你选择的难度 | 难度对应 | 自选（简/中/困） |
| **盲人摸象** (blind) | 所有孔洞都是不透明棕色，**完全看不到字**，纯靠位置感 | 3 分钟 | 困难核心区 |
| **投石问路** (probe) | 字可见，但**不显示单个孔洞是否正确**，只给「对上数量」徽章 | 3 分钟 | 困难核心区 |
| **捉迷藏** (hide) | 双人同设备轮流玩：A 自定义句子与镂空出题，B 来解 | 可设不限/60–300s | 按字数自适应 |

盲人摸象 / 投石问路是固定「困难级核心区 + 中级卡片」的附加挑战，每日各一题，独立记录完成状态；捉迷藏是一次性的双人局。

## 🎚️ 难度（今日解密）

| 难度 | 名言字数 | 解密卡 | 核心区 | 倒计时 |
|---|---|---|---|---|
| 简单 | 4–6 字 | 7×7 | 占屏比小 | 3 分钟 |
| 中等 | 7–8 字 | 9×9 | 中等 | 4 分钟 |
| 困难 | 9–11 字 | 11×11 | 铺满安全带（搜索空间最大） | 5 分钟 |

> 「核心区」是名言字所在的可搜索区域 —— 困难模式把它铺到极限，让正解更难定位。

## 🧰 道具（仅今日解密）

- **收缩核心**：临时缩小搜索区域，缩小范围
- **揭示**：高亮一个正确位置
- **排除角度**：在 2×2 角度盘中灰掉一个错误角度（永远不会排掉正解角度）

盲人摸象 / 投石问路模式下道具全部禁用 —— 它们是纯解。

## 🛠️ 技术栈

- **[Expo SDK 56](https://expo.dev)** · **React Native 0.85** · **React 19** · **TypeScript 6**
- 导航：`@react-navigation/native-stack`
- 音频：`expo-audio`（8 种音效）· 触感：`expo-haptics`（含移动逐字振动）
- 持久化：`@react-native-async-storage/async-storage`（纯本地，**无后端、无网络**）
- 截图分享：`react-native-view-shot` + `expo-sharing`
- 出题：内置 43 条名言库 + ~75 条公版古典语料的离线匹配生成器

## 🚀 快速开始

```bash
npm install        # .npmrc 已配置 npmmirror 镜像 + legacy-peer-deps
npm start          # 启动 Metro（扫码用 Expo Go 体验）
npm run android    # Android
npm run ios        # iOS
npm run web        # Web
```

> 自定义图标 / 启动图仅在真实构建（prebuild / EAS / 本机 run）后显示；Expo Go 显示其自带图标。

## 🧪 测试与类型检查

```bash
npm test           # jest —— 6 个测试套件、230+ 用例（引擎 / 生成器 / 统计 / 题库 / AI / 指纹 / 捉迷藏）
npx tsc --noEmit   # 唯一的类型检查（Metro 不做类型检查）
```

引擎 / 生成器 / 统计层均为**纯逻辑**（无 React、无原生模块），保证测试可在 node 下离线运行。

## 📦 构建 APK（最小体积）

使用 [EAS Build](https://docs.expo.dev/build/introduction/) 的 `production` 配置产出发布版 APK：

```bash
eas login
eas build --platform android --profile production --non-interactive
```

`app.json` 通过 `expo-build-properties` 已启用体积优化：

| 优化 | 效果 |
|---|---|
| `production` 配置（非 `preview` 内测包） | 去除开发工具、正式签名 |
| `enableMinifyInReleaseBuilds` | R8 代码压缩 |
| `enableShrinkResourcesInReleaseBuilds` | 移除未用资源 |
| `enableBundleCompression` | 压缩 JS bundle |
| `buildArchs: ["arm64-v8a"]` | **单架构**，去掉 3/4 原生库（体积最大的一项） |
| Hermes 引擎 | 紧凑字节码 |

> ⚠️ **架构限制**：当前 APK 仅含 `arm64-v8a`，**不能**在 x86/x86_64 模拟器或 32 位 ARM 设备上安装（覆盖近 5+ 年绝大多数真机）。需要通用包时，把 `app.json` 里 `buildArchs` 改回 `["armeabi-v7a","arm64-v8a","x86","x86_64"]`（或删掉该项）重新构建即可。

## 📁 项目结构

```
字垣/
├── App.tsx                        # 应用入口 · 全局状态 · 导航
├── app.json                       # Expo 配置（含 build-properties 体积优化）
├── eas.json                       # EAS 构建配置（production → APK）
├── index.js / metro.config.js
├── assets/                        # 图标 · 启动图 · 自适应图标
├── scripts/gen-brand-assets.js    # 零依赖生成品牌 PNG（指纹图样）
├── docs/
└── src/
    ├── config.ts                  # 主题配色 · 动画时长 · 存储键
    ├── components/
    │   ├── TextGrid.tsx           # 文字墙（核心区 + 外围「字符微烁」层）
    │   ├── Celebration.tsx        # 完成粒子庆祝
    │   ├── BookmarkCard.tsx       # 可分享书签（指纹方块）
    │   ├── BookmarkModal.tsx      # 书签分享弹窗
    │   ├── FingerprintGrid.tsx    # 无缝指纹网格渲染器（物理像素对齐）
    │   └── DevConsole.tsx         # 开发者控制台
    ├── screens/
    │   ├── HomeScreen.tsx         # 首页（四模式入口）
    │   ├── GameScreen.tsx         # 游戏主界面（拖拽 / 旋转 / 计时 / 道具）
    │   ├── HistoryScreen.tsx      # 指纹日历历史
    │   ├── AchievementsScreen.tsx # 成就
    │   ├── SettingsScreen.tsx     # 设置
    │   ├── LibraryManagerScreen.tsx   # 题库管理 + 离线 AI 出题
    │   └── HideSeekBuilderScreen.tsx  # 捉迷藏出题
    ├── game/
    │   ├── types.ts               # 全部类型定义
    │   ├── engine.ts              # 纯逻辑引擎（坐标 / 匹配 / 校验 / 单元样式）
    │   ├── puzzleGenerator.ts     # 名言库 · PRNG · 网格 · 卡片 · 难度
    │   ├── stats.ts               # 进度统计 reducer
    │   ├── achievements.ts        # 35 项成就定义
    │   ├── fingerprint.ts         # 书签指纹生成（纯函数）
    │   ├── library.ts             # 题库纯逻辑（CRUD / 去重）
    │   ├── aiGenerator.ts         # 本地语料出题（离线）
    │   ├── quoteCorpus.ts         # ~75 条公版古典语料
    │   ├── hideSeek.ts            # 捉迷藏出题校验（纯逻辑）
    │   ├── schema.ts              # 存储版本常量
    │   └── __tests__/             # 6 个测试套件 · 230+ 用例
    ├── utils/
    │   ├── storage.ts             # AsyncStorage 持久化 + 旧数据迁移
    │   ├── soundManager.ts        # 音效 / 触感（expo-audio）
    │   ├── libraryStore.ts        # 自定义题库存储
    │   └── shareBookmark.ts       # 截图分享
    └── navigation/
        ├── createAppStack.ts          # Web 导航
        └── createAppStack.native.ts   # 原生导航
```

## 🔒 隐私

**完全没有后端、没有网络请求、没有账号。** 所有进度、设置、收藏、自定义题库都存在你设备的 AsyncStorage 里。每日题目由日期哈希在本地确定性地生成，删掉 App 即清空一切。

## 📄 License

MIT License

<div align="center">

> 「文字筑墙，邂逅一句之缘」—— 在每日的字墙里，寻得那句与你结缘的话。

</div>
