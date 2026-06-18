// 字垣 — 音效 & 触感管理器
//
// 关键修复：旧版基于 expo-av（已在 Expo SDK 55+ 移除，本项目 SDK 56 不可用），
// 且从未被任何地方 initialize / 调用 —— 这是「音效一直没生效」的根因。
// 现改为 expo-audio（SDK 56 官方模块），并对外保持与旧 API 一致的调用面，
// 便于在 GameScreen / 各界面统一接入。

import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type SoundType =
  | 'word_discovered'
  | 'puzzle_complete'
  | 'near_miss'
  | 'card_place'
  | 'time_warning'
  | 'button_click'
  | 'combo'
  | 'achievement';

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

// require 在编译期解析为 asset id；expo-audio 的 AudioSource 接受 number。
const SOUND_FILES: Record<SoundType, ReturnType<typeof require>> = {
  word_discovered: require('../assets/sounds/word_discovered.wav'),
  puzzle_complete: require('../assets/sounds/puzzle_complete.wav'),
  near_miss: require('../assets/sounds/near_miss.wav'),
  card_place: require('../assets/sounds/card_place.wav'),
  time_warning: require('../assets/sounds/time_warning.wav'),
  button_click: require('../assets/sounds/button_click.wav'),
  combo: require('../assets/sounds/combo.wav'),
  achievement: require('../assets/sounds/puzzle_complete.wav'), // 复用完成音
};

class SoundManager {
  private players = new Map<SoundType, AudioPlayer>();
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private soundEnabled = true;
  private hapticEnabled = true;

  /**
   * 加载全部音效并配置音频会话。幂等：并发调用复用同一次初始化。
   * 必须在用户首次交互后才会真正发声（浏览器自动播放策略 / iOS 音频会话），
   * 因此 App 在挂载时调用一次、并在首次点击时再调用一次以解锁。
   */
  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.initializing = this.doInitialize().catch((e) => {
      // 初始化失败不应阻塞游戏；后续 playSound 会安全跳过。
      console.warn('[sound] init failed:', e);
    }).finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  }

  private async doInitialize(): Promise<void> {
    // 配置音频会话：允许与其它 App 混音、静音模式也播放（游戏 SFX 常规做法）。
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        allowsRecording: false,
      });
    } catch (e) {
      // web 上部分字段不支持，忽略；继续创建播放器。
      if (Platform.OS !== 'web') console.warn('[sound] setAudioModeAsync:', e);
    }

    for (const [type, file] of Object.entries(SOUND_FILES)) {
      try {
        const player = createAudioPlayer(file);
        player.volume = 0.9;
        this.players.set(type as SoundType, player);
      } catch (e) {
        console.warn(`[sound] create player ${type} failed:`, e);
      }
    }
    this.initialized = true;
  }

  setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
  }

  setHapticEnabled(enabled: boolean): void {
    this.hapticEnabled = enabled;
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  /** 播放一次音效。未初始化时会触发初始化（本次可能不发声，下次起生效）。 */
  playSound(type: SoundType, volume: number = 0.9): void {
    if (!this.soundEnabled) return;
    if (!this.initialized) {
      // 触发懒加载；当前这次大概率不响（资源未就绪），但解锁后续播放。
      this.initialize();
      return;
    }
    const player = this.players.get(type);
    if (!player) return;
    try {
      if (volume !== player.volume) player.volume = Math.max(0, Math.min(1, volume));
      // 重置到开头再播放，使短促 SFX 可重复触发。
      // seekTo 已知在「极高频连调」下有问题（expo #39915），但用户操作触发的 SFX 间隔足够，安全。
      try { void player.seekTo(0); } catch { /* ignore */ }
      player.play();
    } catch (e) {
      // 单次播放失败不影响游戏，静默吞掉。
    }
  }

  async playHaptic(type: HapticType): Promise<void> {
    if (!this.hapticEnabled) return;
    try {
      switch (type) {
        case 'light': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
        case 'medium': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
        case 'heavy': await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
        case 'success': await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
        case 'warning': await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); break;
        case 'error': await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
        // selection：最轻量的「选择」触感，专为连击/滑动逐项反馈设计
        // （解密卡中心滑过字墙时逐格触发，模拟指尖擦过真实字块的触感）。
        case 'selection': await Haptics.selectionAsync(); break;
      }
    } catch {
      /* haptics 不可用时静默 */
    }
  }

  /** 音效 + 触感同时触发（互不阻塞） */
  playJuicyEffect(sound: SoundType, haptic: HapticType): void {
    this.playSound(sound);
    void this.playHaptic(haptic);
  }

  /** 释放全部播放器（App 卸载时调用，Expo Go 场景一般无需手动调） */
  cleanup(): void {
    for (const player of this.players.values()) {
      try { player.pause(); } catch { /* ignore */ }
      try { player.remove(); } catch { /* ignore */ }
    }
    this.players.clear();
    this.initialized = false;
  }
}

export const soundManager = new SoundManager();
