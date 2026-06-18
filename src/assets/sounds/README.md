# 音效文件说明

## 已生成的音效

项目已包含以下7个音效文件（WAV格式）：

| 文件名 | 类型 | 时长 | 用途 |
|--------|------|------|------|
| `word_discovered.wav` | 上升音阶 | 0.3s | 发现单词时的清脆音效 |
| `puzzle_complete.wav` | 胜利和弦 | 1.5s | 完成谜题时的庆祝音效 |
| `near_miss.wav` | 低频警告 | 0.2s | 接近失败时的提示音 |
| `card_place.wav` | 短促点击 | 0.1s | 放置卡片时的轻微音效 |
| `time_warning.wav` | 警告蜂鸣 | 0.5s | 时间紧张时的紧急提示 |
| `button_click.wav` | 轻微点击 | 0.05s | 按钮点击时的反馈音 |
| `combo.wav` | 上升琶音 | 0.8s | 连击时的特殊音效 |

## 音效特点

- **格式**：WAV (16-bit PCM)
- **采样率**：44100 Hz
- **声道**：单声道
- **风格**：简洁、现代、科技感

## 如何使用

音效文件已集成到 `soundManager.ts` 中，游戏会自动加载和播放。

## 自定义音效

如需替换音效：
1. 准备新的 WAV 文件（推荐 44100Hz, 16-bit, 单声道）
2. 替换 `src/assets/sounds/` 目录中的对应文件
3. 重启应用即可生效

## 音效来源

当前音效使用 Python 脚本 `generate_sounds.py` 生成，基于正弦波合成。
如需更高质量的音效，推荐以下来源：
- https://freesound.org
- https://www.soundjay.com
- https://mixkit.co