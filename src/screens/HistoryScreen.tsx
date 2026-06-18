import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Puzzle, GameRecord } from '../game/types';
import { recordToBookmark, buildFingerprintFromData, BookmarkData } from '../components/BookmarkCard';
import { FingerprintGrid } from '../components/FingerprintGrid';
import { FingerprintCellType } from '../game/fingerprint';
import { soundManager } from '../utils/soundManager';
import { nowLocalIsoDate } from '../game/stats';
import { CONFIG } from '../config';

// 附加题角点配色（与首页模式卡片强调色一致：盲人摸象紫、投石问路青）
const BLIND_COLOR = '#9F7AEA';
const PROBE_COLOR = '#4FB6C8';

interface HistoryScreenProps {
  puzzles: Array<{ puzzle: Puzzle; date: string }>;
  records: GameRecord[];
  completedDates: string[];
  /** 每日附加题完成标记：date → { blind, probe }（供日历角点） */
  bonusByDate: Record<string, { blind: boolean; probe: boolean }>;
  onSelectPuzzle: (puzzle: Puzzle, date: string) => void;
  onShareRecord: (data: BookmarkData) => void;
  onBack: () => void;
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']; // 周一起始

/** 指纹单元 → 颜色（迷你版与 BookmarkCard 同源色板，只是尺寸缩小） */
const FP_COLOR: Record<FingerprintCellType, string> = {
  hole: CONFIG.colors.success,
  finder: '#C8A96E',
  frame: '#C8A96E',
  badgePure: CONFIG.colors.success,
  badgeUsed: '#C8824E',
  body: '#3D2B1F',
  bg: 'transparent',
};

/**
 * 把当天的完成记录渲染成迷你指纹块（同一条记录恒定 → 用 React.memo 避免重渲染重算）。
 * 渲染交给共享组件 FingerprintGrid（绝对定位整数像素 + 1px 重叠，杜绝亚像素接缝）。
 */
const MiniFingerprint = React.memo(({ record, size }: { record: GameRecord; size: number }) => {
  const fp = useMemo(() => buildFingerprintFromData(recordToBookmark(record)), [record]);
  return <FingerprintGrid fingerprint={fp} size={size} colors={FP_COLOR} />;
});

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  puzzles,
  records,
  completedDates,
  bonusByDate,
  onSelectPuzzle,
  onShareRecord,
  onBack,
}) => {
  const screenW = Dimensions.get('window').width;
  const today = nowLocalIsoDate();

  // 日历格宽：容器 paddingHorizontal 16 + 单元间 gap 5 × 6
  const cellW = Math.floor((screenW - 32 - 30) / 7);

  // date → puzzle / record / 完成态 的查找表
  const puzzleByDate = useMemo(() => {
    const map = new Map<string, Puzzle>();
    for (const p of puzzles) map.set(p.date, p.puzzle);
    return map;
  }, [puzzles]);
  const recordByDate = useMemo(() => {
    const map = new Map<string, GameRecord>();
    // 只索引常规模式（classic）记录：blind/probe 不进日历指纹。
    // 用「排除 blind/probe」而非「要求 classic」—— 旧记录早于 mode 字段（undefined），
    // types.ts 注释「缺省=classic」，必须保留，否则升级前的历史会丢全部指纹。
    // history 最新在前 → 保留该日最近一次 classic 记录；长按分享也跟着用 classic 书签。
    for (const r of records) {
      if (r.mode === 'blind' || r.mode === 'probe') continue;
      if (!map.has(r.date)) map.set(r.date, r);
    }
    return map;
  }, [records]);

  // 出现过的月份（年-月），最近在前 —— 每月渲染一个完整月历块
  const months = useMemo(() => {
    const map = new Map<string, { year: number; month: number }>();
    for (const p of puzzles) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date);
      if (!m) continue;
      const key = `${m[1]}-${m[2]}`;
      if (!map.has(key)) map.set(key, { year: +m[1], month: +m[2] });
    }
    return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
  }, [puzzles]);

  const pad2 = (n: number) => String(n).padStart(2, '0');

  // 某月的日历单元：null = 月初前置空格 / 月末补齐；number = 当月几号
  const cellsForMonth = (year: number, month: number) => {
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 周一起始：0=周一
    const dim = new Date(year, month, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  };

  const renderCell = (day: number | null, year: number, month: number, index: number) => {
    // 空白格（月初前置 / 月末补齐）：用 index 作 key（day 为 null，否则全部撞 'bnull'）；
    // 给定与真实格等高的占位高度，保证每周行高一致（含全空尾周不塌陷）。
    if (day === null) return <View key={`b${index}`} style={{ width: cellW, height: cellW + 17 }} />;
    const iso = `${year}-${pad2(month)}-${pad2(day)}`;
    const isFuture = iso > today;
    const isCompleted = completedDates.includes(iso);
    const puzzle = puzzleByDate.get(iso);
    const record = recordByDate.get(iso);
    const bonus = bonusByDate[iso] ?? { blind: false, probe: false };
    const hasPuzzle = !!puzzle;
    const canTap = hasPuzzle && !isFuture;
    const rectSize = cellW;
    const fpSize = Math.max(8, rectSize - 4);

    return (
      <TouchableOpacity
        key={iso}
        style={{ width: cellW, alignItems: 'center' }}
        disabled={!canTap}
        activeOpacity={0.7}
        onPress={() => {
          if (!puzzle) return;
          soundManager.playSound('button_click');
          onSelectPuzzle(puzzle, iso);
        }}
        onLongPress={() => {
          if (isCompleted && record) {
            soundManager.playSound('button_click');
            onShareRecord(recordToBookmark(record));
          }
        }}
      >
        {/* 日期行：左右两个固定宽度的槽位夹住日期数字。
            附加题完成球放槽位内（左=盲人摸象 / 右=投石问路），故永不压住下方指纹色块；
            槽位恒定宽度，缺球时日期仍居中，列内对齐不漂移。 */}
        <View style={styles.dayRow}>
          <View style={styles.daySlot}>
            {bonus.blind && <View style={[styles.bonusDot, { backgroundColor: BLIND_COLOR }]} />}
          </View>
          <Text
            style={[styles.dayNum, isFuture && styles.dayNumFaint, isCompleted && styles.dayNumDone]}
            numberOfLines={1}
          >
            {day}
          </Text>
          <View style={styles.daySlot}>
            {bonus.probe && <View style={[styles.bonusDot, { backgroundColor: PROBE_COLOR }]} />}
          </View>
        </View>
        <View style={{ width: rectSize, height: rectSize }}>
          {isCompleted && record ? (
            <View style={styles.fingerprintCell}>
              <MiniFingerprint record={record} size={fpSize} />
            </View>
          ) : hasPuzzle && !isFuture ? (
            // 有题但未完成（当日可玩未玩 / 错过）→ 灰色矩形块
            <View style={styles.grayCell} />
          ) : (
            // 未来日 / 超出 30 天数据窗口 → 空白（仅显示淡日期）
            <View style={styles.emptyCell} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CONFIG.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => { soundManager.playSound('button_click'); onBack(); }} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={CONFIG.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>历史日历</Text>
        <Text style={styles.headerCount}>
          {completedDates.length}/{puzzles.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 图例：附加题角点 + 长按分享提示 */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BLIND_COLOR }]} />
            <Text style={styles.legendText}>盲人摸象</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: PROBE_COLOR }]} />
            <Text style={styles.legendText}>投石问路</Text>
          </View>
          <Text style={styles.legendHint}>长按已完成日 · 分享书签</Text>
        </View>

        {months.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={CONFIG.colors.textSecondary} />
            <Text style={styles.emptyStateText}>还没有历史记录</Text>
            <Text style={styles.emptyStateSub}>完成每日解密后，这里会出现指纹日历</Text>
          </View>
        ) : (
          months.map(({ year, month }) => {
            const cells = cellsForMonth(year, month);
            return (
              <View key={`${year}-${month}`} style={styles.monthBlock}>
                <Text style={styles.monthLabel}>{year}年{month}月</Text>
                <View style={styles.weekdayRow}>
                  {WEEKDAY_LABELS.map((d, i) => (
                    <Text key={i} style={[styles.weekdayText, { width: cellW }]}>{d}</Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {cells.map((day, i) => renderCell(day, year, month, i))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: CONFIG.colors.text,
  },
  headerCount: {
    fontSize: 14,
    color: CONFIG.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: CONFIG.colors.textSecondary,
  },
  legendHint: {
    fontSize: 11,
    color: CONFIG.colors.textSecondary,
    opacity: 0.7,
  },
  monthBlock: {
    marginBottom: 24,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: CONFIG.colors.primary,
    marginBottom: 10,
    letterSpacing: 1,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: 5, // 与 grid 的 gap:5 对齐，否则周几标签会逐列左偏（grid 每行 7 格间有 5px gap，header 无 gap 会窄 30px）
    marginBottom: 6,
  },
  weekdayText: {
    fontSize: 11,
    color: CONFIG.colors.textSecondary,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 14,        // 固定行高，与空格占位格（cellW+17）对齐：行高14 + 行底3 + 方块cellW = cellW+17
    marginBottom: 3,
    gap: 2,
  },
  daySlot: {
    width: 9,          // 恒宽：有/无完成球都占同等宽度，日期数字始终居中、列内不漂移
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize: 11,
    color: CONFIG.colors.text,
    fontVariant: ['tabular-nums'],
  },
  dayNumFaint: {
    color: CONFIG.colors.textSecondary,
    opacity: 0.4,
  },
  dayNumDone: {
    color: CONFIG.colors.success,
    fontWeight: '700',
  },
  fingerprintCell: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#0A0906',
    borderWidth: 0.8,
    borderColor: 'rgba(200,169,110,0.30)',
    overflow: 'hidden',
    padding: 2,
  },
  grayCell: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#2A2117',
    borderWidth: 1,
    borderColor: 'rgba(245,230,200,0.06)',
  },
  emptyCell: {
    width: '100%',
    height: '100%',
    borderRadius: 5,
    backgroundColor: 'rgba(245,230,200,0.025)',
  },
  bonusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    fontSize: 16,
    color: CONFIG.colors.text,
    marginTop: 16,
  },
  emptyStateSub: {
    fontSize: 13,
    color: CONFIG.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
});
