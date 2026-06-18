import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Easing,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerProgress, DifficultyLevel, Puzzle, PuzzleLayout, GameMode } from '../game/types';
import { DIFFICULTY_CONFIGS, MODE_TIME_LIMIT_SEC } from '../game/puzzleGenerator';
import { formatDuration } from '../game/stats';
import { achievementSummary } from '../game/achievements';
import { soundManager } from '../utils/soundManager';
import { CONFIG } from '../config';

type ModePuzzle = { puzzle: Puzzle; layout: PuzzleLayout } | null;

interface HomeScreenProps {
  onStartMode: (mode: GameMode) => void;
  modeData: { classic: ModePuzzle; blind: ModePuzzle; probe: ModePuzzle };
  onHistory: () => void;
  onSettings: () => void;
  onAchievements: () => void;
  /** 捉迷藏：进入出题页（双人·同设备轮流玩） */
  onStartHideSeek: () => void;
  progress: PlayerProgress;
  favoritesCount: number;
  /** 三种模式「今日已完成」状态：classic 走 completedDates，blind/probe 走附加题记录 */
  modeDone: { classic: boolean; blind: boolean; probe: boolean };
  devModeEnabled?: boolean;
  difficulty: DifficultyLevel;
  /** 当前是否开启音效（未开启时首页底部显示「打开声音体验更佳」呼吸提示） */
  soundEnabled?: boolean;
}

const tick = () => soundManager.playSound('button_click');

// 模式倒计时分钟数（由 MODE_TIME_LIMIT_SEC 派生，避免改限时后副标题文案再次失同步）
const MODE_MINUTES = MODE_TIME_LIMIT_SEC / 60;

// 三种模式卡片的元信息（图标 / 标题 / 副标题 / 强调色）
const MODE_META: Record<GameMode, { icon: string; title: string; sub: string; accent: string }> = {
  classic: { icon: 'scan-outline', title: '今日解密', sub: '移动并旋转解密卡，揭示那句名言', accent: CONFIG.colors.primary },
  blind: { icon: 'eye-off-outline', title: '盲人摸象', sub: `镂空不透字·仅凭位置感·${MODE_MINUTES} 分钟`, accent: '#9F7AEA' },
  probe: { icon: 'compass-outline', title: '投石问路', sub: `只见对数不见其字·${MODE_MINUTES} 分钟`, accent: '#4FB6C8' },
  hide: { icon: 'people-outline', title: '捉迷藏', sub: '出题给朋友 · 同设备轮流玩', accent: '#FFB347' },
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onStartMode,
  modeData,
  onHistory,
  onSettings,
  onAchievements,
  onStartHideSeek,
  progress,
  favoritesCount,
  modeDone,
  difficulty,
  soundEnabled = true,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  // 底部「打开声音体验更佳」呼吸不透明度（仅在声音关闭时显示 + 呼吸）
  const breathe = useRef(new Animated.Value(0.45)).current;
  const soundOff = soundEnabled === false;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    // 今日未完成时，开始按钮轻微呼吸吸引注意
    if (!modeDone.classic) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [fadeAnim, pulse, modeDone.classic]);

  // 声音关闭时，底部提示文字缓缓呼吸（opacity 0.45↔1，错相正弦）
  useEffect(() => {
    if (!soundOff) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0.45, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, soundOff]);

  const ach = achievementSummary(progress, { favoritesCount });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CONFIG.colors.background} />

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.header}>
          <Text style={styles.title}>字垣</Text>
          <Text style={styles.subtitle}>于万千文字中，邂逅成句之缘</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="flame" size={20} color={CONFIG.colors.primary} />
            <Text style={styles.statNum}>{progress.streak}</Text>
            <Text style={styles.statLabel}>连续天数</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trophy" size={20} color={CONFIG.colors.primary} />
            <Text style={styles.statNum}>{progress.totalCompleted}</Text>
            <Text style={styles.statLabel}>已完成</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="time" size={20} color={CONFIG.colors.primary} />
            <Text style={styles.statNum}>
              {progress.bestTime == null ? '--' : formatDuration(progress.bestTime)}
            </Text>
            <Text style={styles.statLabel}>最快用时</Text>
          </View>
        </View>

        {/* 模式入口：今日解密 / 盲人摸象 / 投石问路 */}
        <View style={styles.modeList}>
          {(['classic', 'blind', 'probe'] as const).map((m) => {
            const meta = MODE_META[m];
            const data = modeData[m];
            // 今日已完成（classic 或 附加题 blind/probe）→ 卡片标「已完成」+ 点击查看正解
            const done = modeDone[m];
            const isClassic = m === 'classic';
            return (
              <Animated.View key={m} style={{ transform: [{ scale: isClassic && !done ? glow : 1 }] }}>
                <TouchableOpacity
                  style={[styles.modeCard, done && styles.modeCardDone, { borderColor: meta.accent }]}
                  onPress={() => { if (data) { tick(); onStartMode(m); } }}
                  activeOpacity={0.82}
                  disabled={!data}
                >
                  <View style={[styles.modeIconWrap, { backgroundColor: `${meta.accent}22` }]}>
                    <Ionicons
                      name={(done ? 'checkmark-done-circle-outline' : meta.icon) as any}
                      size={26}
                      color={done ? CONFIG.colors.success : meta.accent}
                    />
                  </View>
                  <View style={styles.modeTextWrap}>
                    <View style={styles.modeTitleRow}>
                      <Text style={styles.modeTitle}>{done && isClassic ? '今日已解密' : meta.title}</Text>
                      {done ? (
                        <View style={[styles.diffChip, { backgroundColor: 'rgba(76,175,80,0.18)' }]}>
                          <Text style={[styles.diffChipText, { color: CONFIG.colors.success, fontWeight: '700' }]}>已完成</Text>
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.diffChip,
                            isClassic
                              ? (difficulty !== 'medium' && { backgroundColor: CONFIG.colors.primary })
                              : { backgroundColor: `${meta.accent}22` },
                          ]}
                        >
                          <Text
                            style={[
                              styles.diffChipText,
                              isClassic
                                ? (difficulty !== 'medium' && { color: CONFIG.colors.background, fontWeight: '700' })
                                : { color: meta.accent },
                            ]}
                          >
                            {DIFFICULTY_CONFIGS[isClassic ? difficulty : 'hard'].label}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modeSub} numberOfLines={1}>{done ? '已完成 · 点击查看正解' : meta.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={CONFIG.colors.textSecondary} />
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        {/* 捉迷藏：双人入口（独立卡，不复用 modeData/modeDone 三卡列） */}
        <TouchableOpacity
          style={styles.hideSeekCard}
          onPress={() => { tick(); onStartHideSeek(); }}
          activeOpacity={0.82}
        >
          <View style={[styles.modeIconWrap, { backgroundColor: '#FFB34722' }]}>
            <Ionicons name="people-outline" size={26} color="#FFB347" />
          </View>
          <View style={styles.modeTextWrap}>
            <View style={styles.modeTitleRow}>
              <Text style={styles.modeTitle}>捉迷藏</Text>
              <View style={[styles.diffChip, { backgroundColor: '#FFB34722' }]}>
                <Text style={[styles.diffChipText, { color: '#FFB347' }]}>双人</Text>
              </View>
            </View>
            <Text style={styles.modeSub} numberOfLines={1}>出题给朋友 · 同设备轮流玩</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={CONFIG.colors.textSecondary} />
        </TouchableOpacity>

        {/* Secondary buttons */}
        <View style={styles.secondaryRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => { tick(); onHistory(); }} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={22} color={CONFIG.colors.textSecondary} />
            <Text style={styles.secondaryText}>历史记录</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => { tick(); onAchievements(); }} activeOpacity={0.7}>
            <Ionicons name="medal-outline" size={22} color={CONFIG.colors.primary} />
            <Text style={styles.secondaryText}>成就 {ach.unlocked}/{ach.total}</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>

        {/* Settings */}
        <TouchableOpacity style={styles.settingsBtn} onPress={() => { tick(); onSettings(); }}>
          <Ionicons name="settings-outline" size={22} color={CONFIG.colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>

      {/* 声音关闭时：底部呼吸提示「打开声音体验更佳」+ 头戴式耳机图标 */}
      {soundOff && (
        <Animated.View pointerEvents="none" style={[styles.soundHint, { opacity: breathe }]}>
          <Ionicons name="headset-outline" size={16} color={CONFIG.colors.primary} />
          <Text style={styles.soundHintText}>打开声音体验更佳</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  header: {
    marginBottom: 36,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: CONFIG.colors.primary,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 15,
    color: CONFIG.colors.textSecondary,
    marginTop: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  statCard: {
    flex: 1,
    backgroundColor: CONFIG.colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '700',
    color: CONFIG.colors.text,
    marginTop: 6,
    flexShrink: 1,
    width: '100%',
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: CONFIG.colors.textSecondary,
    marginTop: 4,
  },
  modeList: {
    marginBottom: 16,
    gap: 12,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CONFIG.colors.surface,
    borderWidth: 2,
    borderColor: CONFIG.colors.primary,
    borderRadius: 18,
    padding: 16,
  },
  modeCardDone: {
    borderColor: CONFIG.colors.success,
    opacity: 0.72,
  },
  hideSeekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CONFIG.colors.surface,
    borderWidth: 2,
    borderColor: '#FFB347',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  modeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  modeTextWrap: {
    flex: 1,
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CONFIG.colors.text,
    marginBottom: 3,
  },
  diffChip: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 230, 200, 0.1)',
  },
  diffChipText: {
    fontSize: 11,
    color: CONFIG.colors.textSecondary,
    letterSpacing: 1,
  },
  modeSub: {
    fontSize: 12,
    color: CONFIG.colors.textSecondary,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CONFIG.colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  secondaryText: {
    fontSize: 15,
    color: CONFIG.colors.textSecondary,
    marginLeft: 10,
  },
  settingsBtn: {
    position: 'absolute',
    top: 48,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CONFIG.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  soundHint: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  soundHintText: {
    fontSize: 12,
    color: CONFIG.colors.textSecondary,
    letterSpacing: 2,
  },
});
