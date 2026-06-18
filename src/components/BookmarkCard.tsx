// 字垣 — 书签卡片（完成 / 历史分享的可视化）
// 纯静态视图（截图用），不含动画。forwardRef 暴露根 View 给 captureRef。
//
// 设计：暗色「像素方块」美学（参考汉兜 / 词影）。
//   主体 = 一枚由【解密卡形状 + 用时占比 + 角度 + 是否用道具】共同生成的二维码式「指纹」；
//   下方以正解绿显示完整句子（与游戏内「正确答案」展示呼应）。
//   底部状态条：日期 · 难度 · 用时 · 纯解/道具。

import React, { forwardRef, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameRecord, DifficultyLevel, CardHole, GameMode } from '../game/types';
import { DIFFICULTY_CONFIGS, hashCode, MODE_TIME_LIMIT_SEC } from '../game/puzzleGenerator';
import { formatDuration } from '../game/stats';
import { buildFingerprint, synthesizeFingerprintInput, FingerprintCellType, FingerprintInput, Fingerprint } from '../game/fingerprint';
import { FingerprintGrid } from './FingerprintGrid';
import { CONFIG } from '../config';

export interface BookmarkData {
  quote: string;
  author: string;
  source: string;
  date: string;          // ISO
  difficulty: DifficultyLevel;
  timeSec: number;
  pureSolve: boolean;
  powerupsUsed: number;
  /** 本局旋转次数（状态条展示） */
  rotations?: number;
  /** 本局模式（classic/blind/probe）；影响用时占比分母与状态条标签 */
  mode?: GameMode;
  // —— 指纹四要素 ——
  cardHoles?: CardHole[];
  cardSize?: number;
  solutionRotation?: number;
}

// 模式中文名（状态条展示）
const MODE_LABELS: Record<GameMode, string> = {
  classic: '常规',
  blind: '盲人摸象',
  probe: '投石问路',
  hide: '捉迷藏',
};

/**
 * 由书签数据（或等价的 GameRecord 字段）构建指纹。
 * 纯函数：相同输入 → 相同指纹。把 timeLimit / seed / 兜底合成逻辑收口在此，
 * BookmarkCard 自身与历史日历的迷你指纹共用同一份，避免两处实现漂移。
 *
 * seed 取 quote|timeSec|solutionRotation|cardSize —— 这四者在「完成弹窗分享」与
 * 「历史分享 / 日历」路径上完全一致，故同一局恒渲染同一枚指纹。
 */
export function buildFingerprintFromData(data: BookmarkData): Fingerprint {
  const diff = DIFFICULTY_CONFIGS[data.difficulty];
  const mode: GameMode = data.mode ?? 'classic';
  const isModeChallenge = mode === 'blind' || mode === 'probe';
  // 盲人摸象 / 投石问路 用 MODE_TIME_LIMIT_SEC（3 分钟）倒计时作用时占比分母（而非 medium 的 240s），避免进度条提前拉满
  const timeLimit = isModeChallenge ? MODE_TIME_LIMIT_SEC : diff.timeLimitSec;
  const timeRatio = timeLimit > 0 ? Math.max(0, Math.min(1, data.timeSec / timeLimit)) : 0;
  const seed = Math.abs(hashCode(`${data.quote}|${data.timeSec}|${data.solutionRotation ?? 0}|${data.cardSize ?? 9}`));
  // 指纹输入：有真实镂空用真实；旧存档缺失则按难度/字数合成兜底
  const fpInput: FingerprintInput =
    data.cardHoles && data.cardHoles.length > 0 && data.cardSize
      ? { cardHoles: data.cardHoles, cardSize: data.cardSize, solutionRotation: data.solutionRotation ?? 0, timeRatio, pureSolve: data.pureSolve, seed }
      : synthesizeFingerprintInput(data.quote, data.difficulty, data.solutionRotation ?? 0, timeRatio, data.pureSolve, seed);
  return buildFingerprint(fpInput);
}

export function recordToBookmark(r: GameRecord): BookmarkData {
  return {
    quote: r.quote, author: r.author, source: r.source,
    date: r.date, difficulty: r.difficulty,
    timeSec: r.timeSec, pureSolve: r.pureSolve, powerupsUsed: r.powerupsUsed,
    rotations: r.rotations,
    mode: r.mode,
    cardHoles: r.cardHoles, cardSize: r.cardSize, solutionRotation: r.solutionRotation,
  };
}

// 名言越长字号越小，避免溢出
function quoteFontSize(len: number): number {
  if (len <= 6) return 32;
  if (len <= 9) return 28;
  if (len <= 12) return 24;
  return 20;
}

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[1]} · ${m[2]} · ${m[3]}`;
}

interface Props {
  data: BookmarkData;
}

export const BookmarkCard = forwardRef<View, Props>(({ data }, ref) => {
  const diff = DIFFICULTY_CONFIGS[data.difficulty];
  const mode: GameMode = data.mode ?? 'classic';
  const isModeChallenge = mode === 'blind' || mode === 'probe';
  const fs = quoteFontSize(data.quote.length);

  // 指纹由 buildFingerprintFromData 统一构建（与历史日历迷你指纹共用同一实现）
  const fp = useMemo(() => buildFingerprintFromData(data), [data]);

  return (
    <View ref={ref} style={styles.card}>
      {/* 外层金边 + 内层细边 */}
      <View style={styles.outerFrame} />
      <View style={styles.innerFrame} />

      <View style={styles.inner}>
        {/* 顶部品牌 */}
        <View style={styles.header}>
          <View style={styles.seal}>
            <Ionicons name="cube-outline" size={15} color={COLORS.gold} />
          </View>
          <Text style={styles.brand}>字 垣</Text>
          <Text style={styles.tagline}>万字为垣 · 一句结缘</Text>
        </View>

        {/* 指纹方块（主体） */}
        <View style={styles.fingerprintWrap}>
          <FingerprintBlock fingerprint={fp} />
        </View>

        {/* 句子（正解绿，呼应「正确答案」展示） */}
        <View style={styles.quoteWrap}>
          <Text style={[styles.quote, { fontSize: fs }]}>{data.quote}</Text>
        </View>

        {/* 出处 */}
        <View style={styles.metaRow}>
          <Text style={styles.author}>—— {data.author}</Text>
          <Text style={styles.source}>《{data.source}》</Text>
        </View>

        {/* 底部状态条（汉兜式：日期 · 难度 · 用时 · 纯解/道具） */}
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{prettyDate(data.date)}</Text>
          <Text style={styles.statusDot}>·</Text>
          <Text style={styles.statusText}>{isModeChallenge ? MODE_LABELS[mode] : diff.label}</Text>
          <Text style={styles.statusDot}>·</Text>
          <Text style={styles.statusText}>{formatDuration(data.timeSec)}</Text>
          <Text style={styles.statusDot}>·</Text>
          <Text style={[styles.statusText, data.pureSolve ? styles.statusGreen : styles.statusCopper]}>
            {data.pureSolve ? '纯解' : `道具×${data.powerupsUsed}`}
          </Text>
        </View>
      </View>
    </View>
  );
});
BookmarkCard.displayName = 'BookmarkCard';

// ─── 指纹方块渲染 ──────────────────────────────────────
// 渲染逻辑抽到共享组件 FingerprintGrid（书签 / 历史日历迷你图共用），用绝对定位整数像素
// + 1px 重叠杜绝亚像素接缝（见 FingerprintGrid 注释）。此处只保留面板/静区外框。
// 色板 BOOKMARK_FP_COLORS 定义在下方 COLORS 之后（它 eager 求值 COLORS，须在其后声明）。
const FingerprintBlock: React.FC<{ fingerprint: Fingerprint }> = ({ fingerprint }) => {
  return (
    <View style={styles.fingerprintPanel}>
      <View style={styles.fingerprintQuietZone}>
        <FingerprintGrid fingerprint={fingerprint} size={FINGERPRINT_PX} colors={BOOKMARK_FP_COLORS} />
      </View>
    </View>
  );
};

// ─── 色板 ──────────────────────────────────────────────
const COLORS = {
  cardBg: '#14110A',
  panel: '#0A0906',
  gold: '#C8A96E',
  goldSoft: 'rgba(200,169,110,0.55)',
  green: CONFIG.colors.success,  // 正解绿（与游戏内「正确答案」展示同一来源，保持同步）
  copper: '#C8824E',     // 用过道具
  body: '#2E2517',       // 卡身（像素块实体）
  ink: '#F3E8D2',        // 主文字（暖白）
  inkSoft: '#9C8B66',    // 次文字
  inkFaint: '#6B5E42',   // 极淡
};

// 指纹单元 → 颜色（表驱动，供 FingerprintGrid 共用；须在 COLORS 之后声明）
const BOOKMARK_FP_COLORS: Record<FingerprintCellType, string> = {
  hole: COLORS.green,
  finder: COLORS.gold,
  frame: COLORS.gold,
  badgePure: COLORS.green,
  badgeUsed: COLORS.copper,
  body: COLORS.body,
  bg: 'transparent',
};

const CARD_W = 320;
const CARD_H = Math.round(CARD_W * 1.5);
const FINGERPRINT_PX = 208;

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    // minHeight（非固定 height）：短句仍撑满整张卡，长句可自然增高，避免内容被裁剪
    minHeight: CARD_H,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  outerFrame: {
    position: 'absolute',
    top: 9, left: 9, right: 9, bottom: 9,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderRadius: 11,
  },
  innerFrame: {
    position: 'absolute',
    top: 14, left: 14, right: 14, bottom: 14,
    borderWidth: 0.7,
    borderColor: COLORS.goldSoft,
    borderRadius: 7,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 30,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  seal: {
    width: 30, height: 30,
    borderRadius: 15,
    borderWidth: 1.2,
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(200,169,110,0.10)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 10,
  },
  tagline: {
    fontSize: 10,
    color: COLORS.inkSoft,
    marginTop: 6,
    letterSpacing: 3,
  },
  fingerprintWrap: {
    marginVertical: 6,
  },
  fingerprintPanel: {
    backgroundColor: COLORS.panel,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(200,169,110,0.30)',
    overflow: 'hidden',
  },
  fingerprintQuietZone: {
    // QR 静区：方块四周留白
    padding: 3,
  },
  quoteWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    marginTop: 10,
  },
  quote: {
    color: COLORS.green,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 42,
    letterSpacing: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  author: {
    fontSize: 13,
    color: COLORS.inkSoft,
    marginRight: 4,
  },
  source: {
    fontSize: 13,
    color: COLORS.inkSoft,
    fontStyle: 'italic',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 0.6,
    borderTopColor: 'rgba(200,169,110,0.20)',
  },
  statusText: {
    fontSize: 11,
    color: COLORS.inkSoft, // 提至 inkSoft：inkFaint 在暗底上对比度不足 WCAG AA
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  statusDot: {
    fontSize: 11,
    color: COLORS.inkFaint,
  },
  statusGreen: {
    color: COLORS.green,
    fontWeight: '700',
  },
  statusCopper: {
    color: COLORS.copper,
    fontWeight: '700',
  },
});
