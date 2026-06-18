// 字垣 — 成就系统（纯函数，无 React 依赖）
// 成就定义 + 解锁判定 + 进度展示。所有判定基于 PlayerProgress（收藏数经 ctx 传入）。

import { Achievement, AchievementCategory, AchievementTier, PlayerProgress, AchievementContext } from './types';
import { MODE_TIME_LIMIT_SEC } from './puzzleGenerator';

export type { AchievementContext };

const NO_CTX: AchievementContext = { favoritesCount: 0 };

// 模式速通阈值：固定为模式限时（MODE_TIME_LIMIT_SEC）的 2/3 向下取整。
// 用比例而非写死秒数，避免将来调整模式限时后阈值再次「不可达」（旧版写死 240s，
// 在模式限时从 300 降到 180 后，240s 永远不可达 → 速通成就沦为完成即解锁）。
const MODE_SPEED_THRESHOLD = Math.floor((MODE_TIME_LIMIT_SEC * 2) / 3);

// ─── 成就定义 ──────────────────────────────────────────
// 约定：progress(stats,ctx) 返回当前进度值；target 为解锁阈值；
// unlocked = customCheck ? customCheck(...) : progress >= target。
// 「越小越好」类（速度）用 customCheck 二值判定，displayValue 给出可读文案。

export const ACHIEVEMENTS: Achievement[] = [
  // — 里程碑（完成题数）—
  { id: 'm_first', name: '初窥门径', desc: '完成第 1 道谜题', category: 'milestone', tier: 'bronze', icon: 'flag-outline', progress: (s) => s.totalCompleted, target: 1 },
  { id: 'm_10', name: '渐入佳境', desc: '累计完成 10 道谜题', category: 'milestone', tier: 'bronze', icon: 'ribbon-outline', progress: (s) => s.totalCompleted, target: 10 },
  { id: 'm_25', name: '积字成垣', desc: '累计完成 25 道谜题', category: 'milestone', tier: 'silver', icon: 'medal-outline', progress: (s) => s.totalCompleted, target: 25 },
  { id: 'm_50', name: '字垣初成', desc: '累计完成 50 道谜题', category: 'milestone', tier: 'gold', icon: 'trophy-outline', progress: (s) => s.totalCompleted, target: 50 },
  { id: 'm_100', name: '万字成垣', desc: '累计完成 100 道谜题', category: 'milestone', tier: 'platinum', icon: 'diamond-outline', progress: (s) => s.totalCompleted, target: 100 },

  // — 连续天数 —
  { id: 's_3', name: '三日不辍', desc: '连续 3 天完成', category: 'streak', tier: 'bronze', icon: 'flame-outline', progress: (s) => s.bestStreak, target: 3 },
  { id: 's_7', name: '一周不辍', desc: '连续 7 天完成', category: 'streak', tier: 'silver', icon: 'flame-outline', progress: (s) => s.bestStreak, target: 7 },
  { id: 's_15', name: '半月坚持', desc: '连续 15 天完成', category: 'streak', tier: 'gold', icon: 'flame', progress: (s) => s.bestStreak, target: 15 },
  { id: 's_30', name: '满月成就', desc: '连续 30 天完成', category: 'streak', tier: 'platinum', icon: 'flame', progress: (s) => s.bestStreak, target: 30 },

  // — 速度（各难度最佳用时 ≤ 阈值）—
  {
    id: 'spd_easy', name: '闪电手', desc: '简单难度 60 秒内完成', category: 'speed', tier: 'bronze', icon: 'flash-outline',
    progress: (_s) => 0, target: 1,
    customCheck: (s) => s.bestTimeByDifficulty.easy != null && s.bestTimeByDifficulty.easy <= 60,
    displayValue: (s) => s.bestTimeByDifficulty.easy != null ? `最佳 ${s.bestTimeByDifficulty.easy}s / ≤60s` : '尚无简单记录',
  },
  {
    id: 'spd_med', name: '极速解密', desc: '中等难度 90 秒内完成', category: 'speed', tier: 'silver', icon: 'flash',
    progress: (_s) => 0, target: 1,
    customCheck: (s) => s.bestTimeByDifficulty.medium != null && s.bestTimeByDifficulty.medium <= 90,
    displayValue: (s) => s.bestTimeByDifficulty.medium != null ? `最佳 ${s.bestTimeByDifficulty.medium}s / ≤90s` : '尚无中等记录',
  },
  {
    id: 'spd_hard', name: '电光火石', desc: '困难难度 120 秒内完成', category: 'speed', tier: 'gold', icon: 'bolt',
    progress: (_s) => 0, target: 1,
    customCheck: (s) => s.bestTimeByDifficulty.hard != null && s.bestTimeByDifficulty.hard <= 120,
    displayValue: (s) => s.bestTimeByDifficulty.hard != null ? `最佳 ${s.bestTimeByDifficulty.hard}s / ≤120s` : '尚无困难记录',
  },

  // — 纯解（零道具）—
  { id: 'p_1', name: '纯粹初心', desc: '不使用任何道具完成 1 题', category: 'purity', tier: 'bronze', icon: 'leaf-outline', progress: (s) => s.pureSolves, target: 1 },
  { id: 'p_5', name: '至简之道', desc: '不使用任何道具完成 5 题', category: 'purity', tier: 'silver', icon: 'leaf', progress: (s) => s.pureSolves, target: 5 },
  { id: 'p_15', name: '返璞归真', desc: '不使用任何道具完成 15 题', category: 'purity', tier: 'gold', icon: 'leaf', progress: (s) => s.pureSolves, target: 15 },

  // — 收集 —
  { id: 'c_quote', name: '名言集', desc: '完成 5 道名人名言', category: 'collection', tier: 'bronze', icon: 'chatbubbles-outline', progress: (s) => s.completionsByCategory['名人名言'], target: 5 },
  { id: 'c_poem', name: '诗词汇', desc: '完成 5 道诗词歌赋', category: 'collection', tier: 'silver', icon: 'book-outline', progress: (s) => s.completionsByCategory['诗词歌赋'], target: 5 },
  { id: 'c_book', name: '书海拾贝', desc: '完成 5 道书摘', category: 'collection', tier: 'bronze', icon: 'library-outline', progress: (s) => s.completionsByCategory['书摘'], target: 5 },
  { id: 'c_unique20', name: '文海泛舟', desc: '解锁 20 道不同谜题', category: 'collection', tier: 'silver', icon: 'compass-outline', progress: (s) => s.uniqueQuotes.length, target: 20 },
  { id: 'c_fav5', name: '珍藏家', desc: '收藏 5 条名言', category: 'collection', tier: 'bronze', icon: 'heart-outline', progress: (_s, ctx) => ctx.favoritesCount, target: 5 },
  { id: 'c_fav20', name: '藏书阁', desc: '收藏 20 条名言', category: 'collection', tier: 'silver', icon: 'heart', progress: (_s, ctx) => ctx.favoritesCount, target: 20 },

  // — 精通 —
  { id: 'y_hard1', name: '困难征服者', desc: '完成 1 次困难难度', category: 'mastery', tier: 'bronze', icon: 'shield-outline', progress: (s) => s.completionsByDifficulty.hard, target: 1 },
  { id: 'y_hard10', name: '知难而进', desc: '完成 10 次困难难度', category: 'mastery', tier: 'gold', icon: 'shield', progress: (s) => s.completionsByDifficulty.hard, target: 10 },
  { id: 'y_all3', name: '三栖达人', desc: '三档难度各完成 3 次', category: 'mastery', tier: 'gold', icon: 'git-branch-outline',
    progress: (s) => Math.min(s.completionsByDifficulty.easy, s.completionsByDifficulty.medium, s.completionsByDifficulty.hard), target: 3 },
  { id: 'y_time1h', name: '初识乐趣', desc: '累计游玩满 1 小时', category: 'mastery', tier: 'bronze', icon: 'hourglass-outline', progress: (s) => s.totalPlayTimeSec, target: 3600 },
  { id: 'y_time10h', name: '字缘痴客', desc: '累计游玩满 10 小时', category: 'mastery', tier: 'gold', icon: 'hourglass', progress: (s) => s.totalPlayTimeSec, target: 36000 },

  // — 模式（盲人摸象 / 投石问路）—
  // 新两种挑战模式的完成数 / 双模 / 速通。completionsByMode / bestTimeByMode 由 applyCompletion 累加。
  { id: 'mod_blind_1', name: '初探盲象', desc: '完成 1 局盲人摸象', category: 'special', tier: 'bronze', icon: 'eye-off-outline', progress: (s) => s.completionsByMode.blind, target: 1 },
  { id: 'mod_blind_5', name: '盲中识象', desc: '完成 5 局盲人摸象', category: 'special', tier: 'silver', icon: 'eye-off-outline', progress: (s) => s.completionsByMode.blind, target: 5 },
  { id: 'mod_blind_10', name: '盲心通明', desc: '完成 10 局盲人摸象', category: 'special', tier: 'gold', icon: 'eye-off', progress: (s) => s.completionsByMode.blind, target: 10 },
  { id: 'mod_probe_1', name: '初投问路', desc: '完成 1 局投石问路', category: 'special', tier: 'bronze', icon: 'compass-outline', progress: (s) => s.completionsByMode.probe, target: 1 },
  { id: 'mod_probe_5', name: '问路成竹', desc: '完成 5 局投石问路', category: 'special', tier: 'silver', icon: 'compass-outline', progress: (s) => s.completionsByMode.probe, target: 5 },
  { id: 'mod_probe_10', name: '投石如神', desc: '完成 10 局投石问路', category: 'special', tier: 'gold', icon: 'compass', progress: (s) => s.completionsByMode.probe, target: 10 },
  { id: 'mod_dual', name: '双模通玄', desc: '盲人摸象与投石问路各完成 3 局', category: 'special', tier: 'platinum', icon: 'git-merge-outline', progress: (s) => Math.min(s.completionsByMode.blind, s.completionsByMode.probe), target: 3 },
  {
    id: 'mod_blind_speed', name: '盲速', desc: `盲人摸象 ${MODE_SPEED_THRESHOLD} 秒内完成`, category: 'special', tier: 'gold', icon: 'flash-outline',
    progress: (_s) => 0, target: 1,
    customCheck: (s) => s.bestTimeByMode.blind != null && s.bestTimeByMode.blind <= MODE_SPEED_THRESHOLD,
    displayValue: (s) => s.bestTimeByMode.blind != null ? `最佳 ${s.bestTimeByMode.blind}s / ≤${MODE_SPEED_THRESHOLD}s` : '尚无盲人摸象记录',
  },
  {
    id: 'mod_probe_speed', name: '探速', desc: `投石问路 ${MODE_SPEED_THRESHOLD} 秒内完成`, category: 'special', tier: 'gold', icon: 'flash',
    progress: (_s) => 0, target: 1,
    customCheck: (s) => s.bestTimeByMode.probe != null && s.bestTimeByMode.probe <= MODE_SPEED_THRESHOLD,
    displayValue: (s) => s.bestTimeByMode.probe != null ? `最佳 ${s.bestTimeByMode.probe}s / ≤${MODE_SPEED_THRESHOLD}s` : '尚无投石问路记录',
  },
];

const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** 单项成就是否已解锁 */
export function isAchievementUnlocked(a: Achievement, stats: PlayerProgress, ctx: AchievementContext = NO_CTX): boolean {
  if (a.customCheck) return a.customCheck(stats, ctx);
  return a.progress(stats, ctx) >= a.target;
}

/** 进度比 0..1（用于进度条） */
export function achievementRatio(a: Achievement, stats: PlayerProgress, ctx: AchievementContext = NO_CTX): number {
  if (a.customCheck) return a.customCheck(stats, ctx) ? 1 : 0;
  return Math.max(0, Math.min(1, a.progress(stats, ctx) / a.target));
}

/** 进度文案（如 "7/10"），有 displayValue 的用 displayValue */
export function achievementProgressText(a: Achievement, stats: PlayerProgress, ctx: AchievementContext = NO_CTX): string {
  if (a.displayValue) return a.displayValue(stats, ctx);
  const cur = a.progress(stats, ctx);
  return `${Math.min(cur, a.target)}/${a.target}`;
}

/**
 * 返回当前已解锁但尚未记入 stats.unlockedAchievements 的成就（即「刚刚解锁」的一批）。
 * 调用方应把这些 id 合并进 stats.unlockedAchievements，并向用户展示解锁动效。
 */
export function findNewlyUnlocked(stats: PlayerProgress, ctx: AchievementContext = NO_CTX): Achievement[] {
  const known = new Set(stats.unlockedAchievements);
  return ACHIEVEMENTS.filter((a) => !known.has(a.id) && isAchievementUnlocked(a, stats, ctx));
}

/** 按 id 取成就定义（可能 undefined） */
export function getAchievement(id: string): Achievement | undefined {
  return ACH_BY_ID.get(id);
}

/** 已解锁数量 / 总数 */
export function achievementSummary(stats: PlayerProgress, ctx: AchievementContext = NO_CTX): { unlocked: number; total: number } {
  let unlocked = 0;
  for (const a of ACHIEVEMENTS) if (isAchievementUnlocked(a, stats, ctx)) unlocked++;
  return { unlocked, total: ACHIEVEMENTS.length };
}

// ─── 分类元数据（UI 用）──────────────────────────────────
export const CATEGORY_META: Record<AchievementCategory, { label: string; color: string }> = {
  milestone: { label: '里程碑', color: '#C8A96E' },
  streak: { label: '连续', color: '#E07856' },
  speed: { label: '速度', color: '#6FB3D2' },
  purity: { label: '纯解', color: '#7FB07F' },
  collection: { label: '收集', color: '#B58FC7' },
  mastery: { label: '精通', color: '#D9A441' },
  special: { label: '特殊', color: '#A89878' },
};

export const TIER_META: Record<AchievementTier, { label: string; color: string }> = {
  bronze: { label: '铜', color: '#C0855E' },
  silver: { label: '银', color: '#C0C0C8' },
  gold: { label: '金', color: '#E0B341' },
  platinum: { label: '铂', color: '#9FDCE3' },
};
