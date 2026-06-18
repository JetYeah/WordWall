// 字垣 — 统计 / 记录逻辑（纯函数，无副作用，无 React 依赖）
// 所有计数器的更新都集中在这里，便于单测。

import { PlayerProgress, Puzzle, GameResult, GameRecord, DifficultyLevel, GameMode } from './types';
import { CURRENT_SCHEMA_VERSION, HISTORY_MAX } from './schema';

export { HISTORY_MAX };

/** ISO 日期字符串加减天数（基于 UTC 午夜，避免本地时区/DST 偏移） */
export function addDaysIso(iso: string, deltaDays: number): string {
  // 仅信任 YYYY-MM-DD 形态；否则原样返回
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().split('T')[0];
}

/**
 * 当前本地日期的 ISO 字符串（YYYY-MM-DD），按设备时区。
 * 关键修复：`new Date().toISOString()` 返回的是 UTC 时间，对中国（UTC+8）用户在
 * 凌晨 0–8 点会得到「昨天」，导致每日题选题错位、连胜/完成日计算错误。
 * 全项目统一用本函数取「今天」。
 */
export function nowLocalIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 把一局结算结果并入玩家统计，返回新的 PlayerProgress。
 *
 * 计数语义：
 * - completedDates / totalCompleted / streak：仅「今日首次完成」推进（同日多次完成不重复计天数，也不重置连胜）
 * - completionsByDifficulty / bestTimeByDifficulty：仅 classic 计入（盲人摸象 / 投石问路 走 completionsByMode / bestTimeByMode，
 *   不污染 classic 难度桶 / 不误触发 classic 难度成就）
 * - category / playTime / rotations / powerups / hints / pureSolves / history：每完成一局都累加（统计的是「总解题次数」，复玩也计入）
 * - uniqueQuotes：去重 puzzle.id
 *
 * 不在此处修改 unlockedAchievements —— 由调用方在 applyCompletion 后跑 evaluateAchievements 决定。
 */
export function applyCompletion(
  prev: PlayerProgress,
  puzzle: Puzzle,
  result: GameResult,
  opts: { date: string; difficulty: DifficultyLevel; now: number; isDaily?: boolean; mode?: GameMode },
): PlayerProgress {
  const today = opts.date;
  const difficulty = opts.difficulty;
  const category = puzzle.category;
  // 模式：opts 权威（App 知道入口模式），缺省回退 result.mode → classic（旧记录兼容）
  const mode: GameMode = opts.mode ?? result.mode ?? 'classic';
  // isDaily=false（历史复玩 / 开发者换题）：不计入「每日进度」
  // （completedDates / streak / bestStreak / lastPlayDate / totalCompleted），但解题统计仍记录。
  const isDaily = opts.isDaily !== false;
  const alreadyToday = prev.completedDates.includes(today);

  // — 日期 / 连胜（仅每日题推进）—
  const completedDates = isDaily && !alreadyToday ? [...prev.completedDates, today] : prev.completedDates;
  let streak = prev.streak;
  if (isDaily && !alreadyToday) {
    const yesterday = addDaysIso(today, -1);
    if (prev.lastPlayDate === yesterday) {
      streak = prev.streak + 1;
    } else if (prev.lastPlayDate === today) {
      // 理论上 alreadyToday 已挡住；保险起见保持原连胜
      streak = prev.streak;
    } else {
      streak = 1;
    }
  }
  const bestStreak = Math.max(prev.bestStreak, streak);

  // — bestTime（null 安全）—
  const bestTime = prev.bestTime == null ? result.timeSec : Math.min(prev.bestTime, result.timeSec);
  // classic 难度桶（bestTimeByDifficulty / completionsByDifficulty）：仅 classic 计入。
  // 盲人摸象 / 投石问路 是独立挑战轴，有专属 completionsByMode / bestTimeByMode，
  // 不写入 classic 难度桶——否则会误触发 y_hard1 / spd_hard 等 classic 难度成就、污染成就页「难度细分」。
  const prevDiffBest = prev.bestTimeByDifficulty[difficulty];
  const bestTimeByDifficulty: PlayerProgress['bestTimeByDifficulty'] =
    mode === 'classic'
      ? { ...prev.bestTimeByDifficulty, [difficulty]: prevDiffBest == null ? result.timeSec : Math.min(prevDiffBest, result.timeSec) }
      : prev.bestTimeByDifficulty;

  // — 分类 / 难度计数 —
  // completionsByDifficulty 仅 classic（见上）；completionsByCategory 对所有模式累加（分类正交于难度/模式）。
  const completionsByDifficulty: PlayerProgress['completionsByDifficulty'] =
    mode === 'classic'
      ? { ...prev.completionsByDifficulty, [difficulty]: prev.completionsByDifficulty[difficulty] + 1 }
      : prev.completionsByDifficulty;
  const completionsByCategory: PlayerProgress['completionsByCategory'] = {
    ...prev.completionsByCategory,
    [category]: prev.completionsByCategory[category] + 1,
  };

  // — 模式计数 + 模式最佳用时（盲人摸象 / 投石问路 成就用）—
  const completionsByMode: PlayerProgress['completionsByMode'] = {
    ...prev.completionsByMode,
    [mode]: prev.completionsByMode[mode] + 1,
  };
  const prevModeBest = prev.bestTimeByMode[mode];
  const bestTimeByMode: PlayerProgress['bestTimeByMode'] = {
    ...prev.bestTimeByMode,
    [mode]: prevModeBest == null ? result.timeSec : Math.min(prevModeBest, result.timeSec),
  };

  // — 附加题（盲人摸象 / 投石问路）按结算日记录完成标记 —
  // classic 每日完成走 completedDates；blind / probe 作为独立附加题，完成后按结算日
  // 在此标记，供日历角点 / 首页「已完成」/ 再次进入查看正解使用。仅 blind / probe 记录。
  const bonusByDate: PlayerProgress['bonusByDate'] = { ...prev.bonusByDate };
  if (mode === 'blind' || mode === 'probe') {
    const cur = bonusByDate[today] ?? { blind: false, probe: false };
    bonusByDate[today] = { ...cur, [mode]: true };
  }

  // — 去重题库 —
  const uniqueQuotes = prev.uniqueQuotes.includes(puzzle.id) ? prev.uniqueQuotes : [...prev.uniqueQuotes, puzzle.id];

  // — 历史档案 —
  const record: GameRecord = {
    date: today,
    puzzleId: puzzle.id,
    quote: puzzle.quote,
    author: puzzle.author,
    source: puzzle.source,
    category,
    difficulty,
    mode,
    timeSec: result.timeSec,
    powerupsUsed: result.powerupsUsed,
    hintsUsed: result.hintsUsed,
    rotations: result.rotations,
    pureSolve: result.pureSolve,
    completedAt: opts.now,
    // 书签指纹用：正解卡面信息（GameScreen 带来；缺失则书签走兜底合成）
    cardHoles: result.cardHoles,
    cardSize: result.cardSize,
    solutionRotation: result.solutionRotation,
  };
  const history = [record, ...prev.history].slice(0, HISTORY_MAX);

  return {
    ...prev,
    completedDates,
    streak,
    bestStreak,
    lastPlayDate: isDaily && !alreadyToday ? today : prev.lastPlayDate,
    bestTime,
    bestTimeByDifficulty,
    totalCompleted: completedDates.length,
    completionsByDifficulty,
    completionsByCategory,
    completionsByMode,
    bestTimeByMode,
    bonusByDate,
    totalPlayTimeSec: prev.totalPlayTimeSec + result.timeSec,
    totalRotations: prev.totalRotations + result.rotations,
    totalPowerupsUsed: prev.totalPowerupsUsed + result.powerupsUsed,
    totalHintsUsed: prev.totalHintsUsed + result.hintsUsed,
    pureSolves: prev.pureSolves + (result.pureSolve ? 1 : 0),
    uniqueQuotes,
    history,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/** 格式化秒数为 mm:ss 或 h:mm:ss */
export function formatDuration(totalSec: number): string {
  if (!isFinite(totalSec) || totalSec < 0) totalSec = 0;
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** 把秒数格式化为「X小时Y分」之类的中文短描述 */
export function formatPlayTimeCn(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}小时${m}分`;
  if (h > 0) return `${h}小时`;
  if (m > 0) return `${m}分钟`;
  return `${s}秒`;
}
