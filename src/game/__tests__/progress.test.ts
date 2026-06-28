// 字垣 — 统计 / 成就 / 持久化迁移 测试
// 覆盖新增纯逻辑：applyCompletion（计数语义、连胜、bestTime null 安全）、
// addDaysIso / formatDuration、migrateProgress（Infinity→null 修复）、findNewlyUnlocked。

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  mergeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

import { PUZZLE_LIBRARY } from '../puzzleGenerator';
import { applyCompletion, addDaysIso, formatDuration, formatPlayTimeCn, nowLocalIsoDate, HISTORY_MAX } from '../stats';
import { makeDefaultProgress, migrateProgress } from '../../utils/storage';
import { ACHIEVEMENTS, findNewlyUnlocked, isAchievementUnlocked, achievementRatio } from '../achievements';
import { PlayerProgress, Puzzle, GameResult } from '../types';

const PUZZLE: Puzzle = PUZZLE_LIBRARY[0];
const mkResult = (over: Partial<GameResult> = {}): GameResult => ({
  timeSec: 50, powerupsUsed: 0, hintsUsed: 0, rotations: 3, pureSolve: true, ...over,
});

describe('addDaysIso', () => {
  test('跨月/跨年', () => {
    expect(addDaysIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-06-14', -1)).toBe('2026-06-13');
  });
  test('非法输入原样返回', () => {
    expect(addDaysIso('not-a-date', 1)).toBe('not-a-date');
    expect(addDaysIso('', 1)).toBe('');
  });
});

describe('nowLocalIsoDate', () => {
  test('按本地日期返回 YYYY-MM-DD（不使用 UTC）', () => {
    // new Date(2026, 5, 14, 1, 0) 在任何时区都代表「本地 2026-06-14 01:00」，
    // nowLocalIsoDate 用 getFullYear/Month/Date（本地），结果恒为 2026-06-14。
    expect(nowLocalIsoDate(new Date(2026, 5, 14, 1, 0, 0))).toBe('2026-06-14');
    expect(nowLocalIsoDate(new Date(2026, 5, 14, 23, 59, 0))).toBe('2026-06-14');
    expect(nowLocalIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('formatDuration / formatPlayTimeCn', () => {
  test('formatDuration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(-5)).toBe('0:00');
  });
  test('formatPlayTimeCn', () => {
    expect(formatPlayTimeCn(30)).toBe('30秒');
    expect(formatPlayTimeCn(90)).toBe('1分钟');
    expect(formatPlayTimeCn(3600)).toBe('1小时');
    expect(formatPlayTimeCn(5400)).toBe('1小时30分');
  });
});

describe('applyCompletion — 计数语义', () => {
  test('首次完成：连胜/最佳/计数/历史全部建立', () => {
    const prev = makeDefaultProgress();
    const next = applyCompletion(prev, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    expect(next.completedDates).toEqual(['2026-06-14']);
    expect(next.totalCompleted).toBe(1);
    expect(next.streak).toBe(1);
    expect(next.bestStreak).toBe(1);
    expect(next.lastPlayDate).toBe('2026-06-14');
    expect(next.bestTime).toBe(50);
    expect(next.bestTimeByDifficulty.medium).toBe(50);
    expect(next.completionsByDifficulty.medium).toBe(1);
    expect(next.completionsByCategory[PUZZLE.category]).toBe(1);
    expect(next.pureSolves).toBe(1);
    expect(next.uniqueQuotes).toEqual([PUZZLE.id]);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].puzzleId).toBe(PUZZLE.id);
  });

  test('bestTime null 安全：首条直接写入，之后取最小', () => {
    let s = makeDefaultProgress();
    expect(s.bestTime).toBeNull();
    s = applyCompletion(s, PUZZLE, mkResult({ timeSec: 80 }), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    expect(s.bestTime).toBe(80);
    s = applyCompletion(s, PUZZLE_LIBRARY[1], mkResult({ timeSec: 40 }), { date: '2026-06-15', difficulty: 'medium', now: 2 });
    expect(s.bestTime).toBe(40);
    expect(s.bestTimeByDifficulty.medium).toBe(40);
  });

  test('同日多次完成：不重复计天数、不重置连胜，但解题计数累加', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    s = applyCompletion(s, PUZZLE_LIBRARY[1], mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 2 });
    expect(s.completedDates).toEqual(['2026-06-14']);
    expect(s.totalCompleted).toBe(1); // 唯一天数
    expect(s.streak).toBe(1);
    expect(s.completionsByDifficulty.medium).toBe(2); // 总解题次数仍 +1
    expect(s.uniqueQuotes).toHaveLength(2);
  });

  test('连胜：连续天 +1，断档重置为 1，bestStreak 取历史最大', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    s = applyCompletion(s, PUZZLE_LIBRARY[1], mkResult(), { date: '2026-06-15', difficulty: 'medium', now: 2 });
    expect(s.streak).toBe(2);
    expect(s.bestStreak).toBe(2);
    // 跳一天 → 重置
    s = applyCompletion(s, PUZZLE_LIBRARY[2], mkResult(), { date: '2026-06-17', difficulty: 'medium', now: 3 });
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2); // 历史最大仍为 2
  });

  test('pureSolve=false 不计入 pureSolves；powerups/hints/rotations 累加', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult({ pureSolve: false, powerupsUsed: 2, hintsUsed: 1, rotations: 5 }), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    expect(s.pureSolves).toBe(0);
    expect(s.totalPowerupsUsed).toBe(2);
    expect(s.totalHintsUsed).toBe(1);
    expect(s.totalRotations).toBe(5);
  });

  test('history 倒序（最新在前）且超过上限截断', () => {
    let s = makeDefaultProgress();
    for (let i = 0; i < HISTORY_MAX + 5; i++) {
      const p = PUZZLE_LIBRARY[i % PUZZLE_LIBRARY.length];
      const day = addDaysIso('2026-01-01', i);
      s = applyCompletion(s, p, mkResult(), { date: day, difficulty: 'medium', now: i });
    }
    expect(s.history.length).toBe(HISTORY_MAX);
    // 最新一天应排在最前
    const lastDay = addDaysIso('2026-01-01', HISTORY_MAX + 4);
    expect(s.history[0].date).toBe(lastDay);
  });

  test('uniqueQuotes 去重', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-15', difficulty: 'medium', now: 2 });
    expect(s.uniqueQuotes).toEqual([PUZZLE.id]);
  });

  test('isDaily=false（历史复玩 / dev 题）：不污染每日进度，但记录解题统计', () => {
    const prev = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    // 用 isDaily=false 再「复玩」一道题（日期不同，模拟历史复玩）
    const replay = applyCompletion(prev, PUZZLE_LIBRARY[1], mkResult({ timeSec: 30 }), { date: '2026-06-20', difficulty: 'medium', now: 2, isDaily: false });
    // 每日进度不变：completedDates 仍只有 06-14，streak/totalCompleted/lastPlayDate 不变
    expect(replay.completedDates).toEqual(['2026-06-14']);
    expect(replay.totalCompleted).toBe(1);
    expect(replay.streak).toBe(prev.streak);
    expect(replay.lastPlayDate).toBe('2026-06-14');
    // 解题统计仍累加：medium 完成数 +1、历史 +1 条、bestTime 取更小
    expect(replay.completionsByDifficulty.medium).toBe(2);
    expect(replay.history).toHaveLength(2);
    expect(replay.history[0].date).toBe('2026-06-20'); // 记录真实结算日
    expect(replay.history[0].puzzleId).toBe(PUZZLE_LIBRARY[1].id);
    expect(replay.bestTime).toBe(30);
  });

  test('isDaily=false 不解锁依赖 completedDates 的里程碑（m_first 仍由 isDaily 完成触发）', () => {
    // 仅 isDaily=false 的复玩不应让 totalCompleted（=完成日数）增长，故 m_first 不解锁
    const replay = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1, isDaily: false });
    expect(replay.totalCompleted).toBe(0);
    expect(findNewlyUnlocked(replay).map((a) => a.id)).not.toContain('m_first');
  });
});

describe('migrateProgress — 存档兼容 / Infinity 修复', () => {
  test('旧版（只有 5 个字段）能补全为完整结构', () => {
    const legacy = {
      completedDates: ['2026-06-01'],
      streak: 3,
      lastPlayDate: '2026-06-01',
      bestTime: 42,
      totalCompleted: 1,
    };
    const m = migrateProgress(legacy);
    expect(m.completedDates).toEqual(['2026-06-01']);
    expect(m.streak).toBe(3);
    expect(m.bestStreak).toBe(3); // 旧版 bestStreak 缺失 → 取 streak
    expect(m.bestTime).toBe(42);
    expect(m.bestTimeByDifficulty).toEqual({ easy: null, medium: null, hard: null });
    expect(m.completionsByDifficulty).toEqual({ easy: 0, medium: 0, hard: 0 });
    expect(m.unlockedAchievements).toEqual([]);
    expect(m.history).toEqual([]);
    expect(m.schemaVersion).toBe(2);
  });

  test('bestTime=Infinity（旧 bug 哨兵）被规整为 null', () => {
    const m = migrateProgress({ bestTime: Infinity, bestTimeByDifficulty: { easy: Infinity, medium: 0, hard: -1 } });
    expect(m.bestTime).toBeNull();
    expect(m.bestTimeByDifficulty.easy).toBeNull();
    expect(m.bestTimeByDifficulty.medium).toBeNull(); // 0 非正数 → null
    expect(m.bestTimeByDifficulty.hard).toBeNull();   // 负数 → null
  });

  test('非法/空输入回退到默认', () => {
    expect(migrateProgress(null)).toEqual(makeDefaultProgress());
    expect(migrateProgress(undefined)).toEqual(makeDefaultProgress());
    expect(migrateProgress('garbage')).toEqual(makeDefaultProgress());
  });

  test('已完成的 completedDates.length 同步到 totalCompleted（兼容）', () => {
    const m = migrateProgress({ completedDates: ['2026-06-01', '2026-06-02'], totalCompleted: 0 });
    expect(m.totalCompleted).toBe(2);
  });

  test('JSON 往返：默认进度 serialize→parse 后结构等价（bestTime 仍为 null 而非丢失）', () => {
    const def = makeDefaultProgress();
    const round = migrateProgress(JSON.parse(JSON.stringify(def, (_k, v) => (typeof v === 'number' && !isFinite(v) ? null : v))));
    expect(round).toEqual(def);
  });
});

describe('achievements — 解锁判定', () => {
  test('成就 id 唯一、非空', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(15);
  });

  test('全新玩家无任何解锁', () => {
    expect(findNewlyUnlocked(makeDefaultProgress())).toEqual([]);
  });

  test('完成 1 题 → 初窥门径解锁（且仅此一条新解锁，速度/连胜等未达）', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult({ timeSec: 120 }), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    const newly = findNewlyUnlocked(s);
    expect(newly.map((a) => a.id)).toContain('m_first');
    // 速度成就不应解锁（medium 120s > 90s）
    expect(newly.map((a) => a.id)).not.toContain('spd_med');
  });

  test('中等 60s → 极速解密解锁', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult({ timeSec: 60 }), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    const newly = findNewlyUnlocked(s);
    expect(newly.map((a) => a.id)).toContain('spd_med');
  });

  test('幂等：把已解锁 id 合并后再次判定，无新解锁', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult({ timeSec: 60 }), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    const newly = findNewlyUnlocked(s);
    const merged: PlayerProgress = { ...s, unlockedAchievements: [...s.unlockedAchievements, ...newly.map((a) => a.id)] };
    expect(findNewlyUnlocked(merged)).toEqual([]);
  });

  test('纯解成就按 pureSolves 计数解锁', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult({ pureSolve: true }), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    expect(isAchievementUnlocked(ACHIEVEMENTS.find((a) => a.id === 'p_1')!, s)).toBe(true);
  });

  test('收藏成就使用 ctx.favoritesCount', () => {
    const s = makeDefaultProgress();
    const fav5 = ACHIEVEMENTS.find((a) => a.id === 'c_fav5')!;
    expect(isAchievementUnlocked(fav5, s, { favoritesCount: 4 })).toBe(false);
    expect(isAchievementUnlocked(fav5, s, { favoritesCount: 5 })).toBe(true);
    expect(achievementRatio(fav5, s, { favoritesCount: 3 })).toBe(0.6);
  });
});

describe('applyCompletion — 模式（盲人摸象 / 投石问路）', () => {
  test('mode=blind 累加 completionsByMode.blind + bestTimeByMode.blind，记录 mode', () => {
    const s = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult({ timeSec: 200 }), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'blind' });
    expect(s.completionsByMode.blind).toBe(1);
    expect(s.completionsByMode.classic).toBe(0);
    expect(s.bestTimeByMode.blind).toBe(200);
    expect(s.history[0].mode).toBe('blind');
  });

  test('mode 缺省回退 classic（旧记录兼容）', () => {
    const s = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    expect(s.completionsByMode.classic).toBe(1);
    expect(s.history[0].mode).toBe('classic');
  });

  test('result.mode 作为 opts.mode 缺省的回退', () => {
    const s = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult({ mode: 'probe' } as any), { date: '2026-06-14', difficulty: 'medium', now: 1 });
    expect(s.completionsByMode.probe).toBe(1);
  });

  test('各模式独立计数互不干扰', () => {
    let s = makeDefaultProgress();
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'blind' });
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 2, mode: 'probe' });
    s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 3, mode: 'classic' });
    expect(s.completionsByMode).toEqual({ classic: 1, blind: 1, probe: 1, hide: 0, cube: 0 });
  });

  test('bestTimeByMode null 安全（首条写入、之后取最小）', () => {
    let s = makeDefaultProgress();
    expect(s.bestTimeByMode.probe).toBeNull();
    s = applyCompletion(s, PUZZLE, mkResult({ timeSec: 300 }), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'probe' });
    s = applyCompletion(s, PUZZLE, mkResult({ timeSec: 180 }), { date: '2026-06-14', difficulty: 'medium', now: 2, mode: 'probe' });
    expect(s.bestTimeByMode.probe).toBe(180);
  });

  test('模式题不写入任何 classic 难度桶（仅记 completionsByMode），避免误触发 classic 难度成就', () => {
    // 盲人摸象 / 投石问路 是独立挑战轴：不写入 easy/medium/hard 任一 classic 难度桶，
    // 否则会误触发 y_hard1 / spd_hard / y_all3 等 classic 难度成就、污染成就页「难度细分」。
    // 统计走 completionsByMode / bestTimeByMode；difficulty 仍原样存入历史记录（书签展示用，
    // 不影响指纹——真实 cardHoles 走 buildFingerprintFromData 专有分支）。
    // 注：App 传入的 difficulty='hard' 是「展示档」，不决定 classic 难度桶。
    const s = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'hard', now: 1, mode: 'blind' });
    expect(s.completionsByDifficulty.medium).toBe(0);
    expect(s.completionsByDifficulty.hard).toBe(0);
    expect(s.completionsByDifficulty.easy).toBe(0);
    expect(s.completionsByMode.blind).toBe(1);
    expect(s.history[0].difficulty).toBe('hard');
    expect(s.history[0].mode).toBe('blind');
  });
});

describe('成就 — 模式（盲人摸象 / 投石问路）', () => {
  test('完成 1 局盲人摸象 → 初探盲象 解锁', () => {
    const s = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'blind' });
    expect(findNewlyUnlocked(s).map((a) => a.id)).toContain('mod_blind_1');
  });

  test('完成 1 局投石问路 → 初投问路 解锁', () => {
    const s = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'probe' });
    expect(findNewlyUnlocked(s).map((a) => a.id)).toContain('mod_probe_1');
  });

  test('盲人摸象 ≤模式限时2/3（120s）完成 → 盲速 解锁；超时不解锁', () => {
    // MODE_TIME_LIMIT_SEC=180 → 速通阈值 = floor(180*2/3)=120s
    const fast = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult({ timeSec: 110 }), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'blind' });
    expect(findNewlyUnlocked(fast).map((a) => a.id)).toContain('mod_blind_speed');
    const slow = applyCompletion(makeDefaultProgress(), PUZZLE, mkResult({ timeSec: 130 }), { date: '2026-06-14', difficulty: 'medium', now: 1, mode: 'blind' });
    expect(findNewlyUnlocked(slow).map((a) => a.id)).not.toContain('mod_blind_speed');
  });

  test('两种模式各完成 3 局 → 双模通玄 解锁', () => {
    let s = makeDefaultProgress();
    for (let i = 0; i < 3; i++) {
      s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: i, mode: 'blind' });
      s = applyCompletion(s, PUZZLE, mkResult(), { date: '2026-06-14', difficulty: 'medium', now: i + 10, mode: 'probe' });
    }
    const a = ACHIEVEMENTS.find((x) => x.id === 'mod_dual')!;
    expect(isAchievementUnlocked(a, s)).toBe(true);
  });

  test('migrateProgress 默认补全 completionsByMode / bestTimeByMode', () => {
    const m = migrateProgress({ completedDates: ['2026-06-01'] });
    expect(m.completionsByMode).toEqual({ classic: 0, blind: 0, probe: 0, hide: 0, cube: 0 });
    expect(m.bestTimeByMode).toEqual({ classic: null, blind: null, probe: null, hide: null, cube: null });
  });

  test('migrateProgress 保留旧版的模式计数', () => {
    const m = migrateProgress({ completionsByMode: { classic: 5, blind: 2, probe: 1 }, bestTimeByMode: { classic: 60, blind: null, probe: 300 } });
    expect(m.completionsByMode).toEqual({ classic: 5, blind: 2, probe: 1, hide: 0, cube: 0 });
    expect(m.bestTimeByMode).toEqual({ classic: 60, blind: null, probe: 300, hide: null, cube: null });
  });
});
