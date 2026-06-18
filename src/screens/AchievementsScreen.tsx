// 字垣 — 成就 / 统计页

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  ScrollView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlayerProgress } from '../game/types';
import {
  ACHIEVEMENTS, CATEGORY_META, TIER_META,
  isAchievementUnlocked, achievementRatio, achievementProgressText,
  achievementSummary, AchievementContext,
} from '../game/achievements';
import { DIFFICULTY_CONFIGS } from '../game/puzzleGenerator';
import { formatDuration, formatPlayTimeCn } from '../game/stats';
import { CONFIG } from '../config';

interface Props {
  progress: PlayerProgress;
  favoritesCount: number;
  onBack: () => void;
}

const ACHIEVEMENT_CATEGORIES_ORDER = ['milestone', 'streak', 'speed', 'purity', 'collection', 'mastery', 'special'] as const;

export const AchievementsScreen: React.FC<Props> = ({ progress, favoritesCount, onBack }) => {
  const ctx: AchievementContext = useMemo(() => ({ favoritesCount }), [favoritesCount]);
  const summary = useMemo(() => achievementSummary(progress, ctx), [progress, ctx]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CONFIG.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={CONFIG.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>成就 · 统计</Text>
        <Text style={styles.headerCount}>{summary.unlocked}/{summary.total}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* 统计概览 */}
        <View style={styles.statsGrid}>
          <StatTile icon="trophy-outline" value={`${progress.totalCompleted}`} label="已完成" />
          <StatTile icon="flame-outline" value={`${progress.streak}`} label={`连续 · 史上${progress.bestStreak}`} />
          <StatTile
            icon="time-outline"
            value={progress.bestTime == null ? '--' : formatDuration(progress.bestTime)}
            label="最快用时"
          />
          <StatTile icon="hourglass-outline" value={formatPlayTimeCn(progress.totalPlayTimeSec)} label="累计时长" />
        </View>

        {/* 各难度细分 */}
        <View style={styles.diffRow}>
          {(['easy', 'medium', 'hard'] as const).map((d) => {
            const cfg = DIFFICULTY_CONFIGS[d];
            const cnt = progress.completionsByDifficulty[d];
            const best = progress.bestTimeByDifficulty[d];
            return (
              <View key={d} style={styles.diffTile}>
                <Text style={styles.diffLabel}>{cfg.label}</Text>
                <Text style={styles.diffCount}>{cnt}</Text>
                <Text style={styles.diffBest}>{best == null ? '—' : formatDuration(best)}</Text>
              </View>
            );
          })}
        </View>

        {/* 进度总览条 */}
        <View style={styles.overallBar}>
          <View style={styles.overallBarLabelRow}>
            <Text style={styles.overallBarText}>成就解锁进度</Text>
            <Text style={styles.overallBarCount}>{summary.unlocked} / {summary.total}</Text>
          </View>
          <View style={styles.overallBarTrack}>
            <View style={[styles.overallBarFill, { width: `${summary.total ? (summary.unlocked / summary.total) * 100 : 0}%` }]} />
          </View>
        </View>

        {/* 按分类展示成就 */}
        {ACHIEVEMENT_CATEGORIES_ORDER.map((cat) => {
          const items = ACHIEVEMENTS.filter((a) => a.category === cat);
          if (!items.length) return null;
          const meta = CATEGORY_META[cat];
          return (
            <View key={cat} style={styles.catSection}>
              <View style={styles.catHeader}>
                <View style={[styles.catDot, { backgroundColor: meta.color }]} />
                <Text style={[styles.catTitle, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <View style={styles.catGrid}>
                {items.map((a) => {
                  const unlocked = isAchievementUnlocked(a, progress, ctx);
                  const ratio = achievementRatio(a, progress, ctx);
                  const tier = TIER_META[a.tier];
                  return (
                    <View key={a.id} style={[styles.achCard, unlocked && { borderColor: tier.color, borderWidth: 1.2 }]}>
                      <View style={[styles.achIconWrap, { backgroundColor: unlocked ? `${tier.color}22` : 'rgba(245,230,200,0.05)' }]}>
                        <Ionicons name={a.icon as any} size={22} color={unlocked ? tier.color : CONFIG.colors.textSecondary} />
                      </View>
                      <View style={styles.achInfo}>
                        <View style={styles.achTitleRow}>
                          <Text style={[styles.achName, !unlocked && styles.locked]} numberOfLines={1}>{a.name}</Text>
                          <View style={[styles.tierChip, { borderColor: tier.color }]}>
                            <Text style={[styles.tierChipText, { color: tier.color }]}>{tier.label}</Text>
                          </View>
                        </View>
                        <Text style={styles.achDesc} numberOfLines={2}>{a.desc}</Text>
                        <View style={styles.progRow}>
                          <View style={styles.progTrack}>
                            <View style={[styles.progFill, { width: `${ratio * 100}%`, backgroundColor: unlocked ? tier.color : CONFIG.colors.textSecondary }]} />
                          </View>
                          <Text style={[styles.progText, unlocked && { color: tier.color }]}>{achievementProgressText(a, progress, ctx)}</Text>
                        </View>
                      </View>
                      {unlocked && (
                        <Ionicons name="checkmark-circle" size={18} color={tier.color} style={styles.checkMark} />
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={styles.footerNote}>
          <Text style={styles.footerText}>每日解出题目，逐步点亮全部成就</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const StatTile: React.FC<{ icon: string; value: string; label: string }> = ({ icon, value, label }) => (
  <View style={styles.statTile}>
    <Ionicons name={icon as any} size={18} color={CONFIG.colors.primary} />
    <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
  </View>
);

const screenW = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CONFIG.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: CONFIG.colors.text },
  headerCount: { fontSize: 14, color: CONFIG.colors.primary, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingBottom: 48, paddingTop: 4 },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14,
  },
  statTile: {
    width: (screenW - 32 - 10) / 2,
    backgroundColor: CONFIG.colors.surface, borderRadius: 14, padding: 14,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: CONFIG.colors.text, marginTop: 6 },
  statLabel: { fontSize: 11, color: CONFIG.colors.textSecondary, marginTop: 3 },

  diffRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  diffTile: {
    flex: 1, backgroundColor: CONFIG.colors.surface, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  diffLabel: { fontSize: 12, color: CONFIG.colors.textSecondary },
  diffCount: { fontSize: 22, fontWeight: '700', color: CONFIG.colors.text, marginTop: 4 },
  diffBest: { fontSize: 12, color: CONFIG.colors.primary, marginTop: 2 },

  overallBar: {
    backgroundColor: CONFIG.colors.surface, borderRadius: 14, padding: 16, marginBottom: 22,
  },
  overallBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  overallBarText: { fontSize: 13, color: CONFIG.colors.textSecondary },
  overallBarCount: { fontSize: 13, color: CONFIG.colors.primary, fontWeight: '700' },
  overallBarTrack: { height: 8, backgroundColor: 'rgba(245,230,200,0.08)', borderRadius: 4, overflow: 'hidden' },
  overallBarFill: { height: 8, backgroundColor: CONFIG.colors.primary, borderRadius: 4 },

  catSection: { marginBottom: 22 },
  catHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  catDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  catTitle: { fontSize: 15, fontWeight: '600' },

  catGrid: { gap: 10 },
  achCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CONFIG.colors.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: 'rgba(245,230,200,0.06)',
  },
  achIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  achInfo: { flex: 1 },
  achTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  achName: { fontSize: 14, fontWeight: '600', color: CONFIG.colors.text, flexShrink: 1 },
  locked: { color: CONFIG.colors.textSecondary },
  tierChip: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 0.8,
  },
  tierChipText: { fontSize: 10, fontWeight: '600' },
  achDesc: { fontSize: 11, color: CONFIG.colors.textSecondary, marginTop: 3, lineHeight: 15 },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  progTrack: { flex: 1, height: 5, backgroundColor: 'rgba(245,230,200,0.08)', borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 5, borderRadius: 3 },
  progText: { fontSize: 10, color: CONFIG.colors.textSecondary, fontVariant: ['tabular-nums'] },
  checkMark: { marginLeft: 8 },

  footerNote: { alignItems: 'center', marginTop: 8 },
  footerText: { fontSize: 12, color: CONFIG.colors.textSecondary },
});
