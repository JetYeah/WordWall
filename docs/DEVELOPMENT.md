# 开发指南

## 快速开始

### 1. 环境准备

确保你的系统已安装：
- Node.js 16+ 
- npm 或 yarn
- Expo CLI (`npm install -g expo-cli`)
- Expo Go 应用（手机端）

### 2. 安装依赖

```bash
cd prj1
npm install
```

### 3. 启动开发服务器

```bash
npm start
```

或者使用启动脚本：
```bash
./start.sh
```

### 4. 在设备上运行

1. 在手机上安装 **Expo Go** 应用
2. 扫描终端中显示的二维码
3. 等待应用加载

## 项目结构

```
src/
├── components/           # 可复用的UI组件
│   ├── Card.tsx         # 游戏卡片（可拖动、旋转）
│   ├── TextGrid.tsx     # 文字网格（显示谜题）
│   ├── Timer.tsx        # 倒计时器
│   └── JuicyEffects.tsx # 特效系统
├── screens/             # 页面组件
│   ├── HomeScreen.tsx   # 主菜单
│   ├── GameScreen.tsx   # 游戏主界面
│   ├── HistoryScreen.tsx # 历史关卡
│   └── SettingsScreen.tsx # 设置页面
├── game/                # 游戏逻辑
│   ├── types.ts         # TypeScript 类型定义
│   ├── engine.ts        # 核心游戏引擎
│   └── puzzleGenerator.ts # 谜题生成器
├── utils/               # 工具函数
│   ├── storage.ts       # 本地存储管理
│   └── soundManager.ts  # 音效管理
├── assets/              # 资源文件
│   ├── sounds/          # 音效文件
│   └── images/          # 图片资源
└── config.ts            # 配置文件
```

## 核心功能

### 1. 谜题生成系统

谜题从预置的题库中生成，包含：
- 经典书摘
- 电影台词
- 名人名言
- 温暖话语

### 2. 卡片系统

卡片具有以下特性：
- 可拖动（PanResponder）
- 可旋转（90度步进）
- 镂空区域检测

### 3. Juicy Effects 系统

在关键节点提供丰富的反馈：
- 发现单词：粒子爆发 + 音效 + 震动
- 完成谜题：彩纸爆炸 + 胜利音乐
- 连击系统：递增的满足感
- 接近失败：抖动效果 + 警告音

### 4. 音效系统

支持7种不同类型的音效：
- word_discovered
- puzzle_complete
- near_miss
- card_place
- time_warning
- button_click
- combo

## 添加音效

1. 准备 MP3 格式的音效文件
2. 放入 `src/assets/sounds/` 目录
3. 文件名需要与代码中的类型匹配

推荐的音效来源：
- https://freesound.org
- https://www.soundjay.com
- https://mixkit.co

## 自定义配置

编辑 `src/config.ts` 可以调整：

```typescript
export const CONFIG = {
  GAME: {
    TIMER_DURATION: 180, // 修改时间限制
    GRID_SIZE: 12,       // 修改网格大小
    // ...
  },
  COLORS: {
    PRIMARY: '#4A90E2',  // 修改主色调
    // ...
  },
};
```

## 调试技巧

### 1. 使用 React Native Debugger

```bash
npm run android -- --debug
npm run ios -- --debug
```

### 2. 查看日志

```bash
npx expo logs
```

### 3. 性能分析

在开发者菜单中选择 "Performance Monitor"

## 常见问题

### Q: 音效不播放？

A: 确保：
1. 音效文件存在于 `src/assets/sounds/` 目录
2. 设置中音效已开启
3. 设备未静音

### Q: 卡片拖动不流畅？

A: 尝试：
1. 在设置中关闭特效动画
2. 减少同时显示的粒子效果

### Q: 谜题太难/太简单？

A: 在设置中调整难度：
- 简单：较少的单词，更多的提示
- 中等：平衡的难度
- 困难：更多的单词，更少的提示

## 部署

### iOS

```bash
expo build:ios
```

### Android

```bash
expo build:android
```

### Web

```bash
expo build:web
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## License

MIT License