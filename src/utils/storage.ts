import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlayerProgress, GameSettings, FavoriteQuote, DifficultyLevel, PuzzleCategory, GameMode } from '../game/types';
import { CURRENT_SCHEMA_VERSION } from '../game/schema';

export { CURRENT_SCHEMA_VERSION };

const KEYS = {
  progress: 'decode_card_progress',
  settings: 'decode_card_settings',
  favorites: 'decode_card_favorites',
};

const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard'];
const CATEGORIES: PuzzleCategory[] = ['名人名言', '诗词歌赋', '书摘'];
const MODES: GameMode[] = ['classic', 'blind', 'probe', 'hide'];

/** 全新玩家的空白统计 */
export function makeDefaultProgress(): PlayerProgress {
  return {
    completedDates: [],
    streak: 0,
    bestStreak: 0,
    lastPlayDate: '',
    bestTime: null,
    bestTimeByDifficulty: { easy: null, medium: null, hard: null },
    totalCompleted: 0,
    completionsByDifficulty: { easy: 0, medium: 0, hard: 0 },
    completionsByCategory: { 名人名言: 0, 诗词歌赋: 0, 书摘: 0 },
    completionsByMode: { classic: 0, blind: 0, probe: 0, hide: 0 },
    bestTimeByMode: { classic: null, blind: null, probe: null, hide: null },
    bonusByDate: {},
    totalPlayTimeSec: 0,
    totalRotations: 0,
    totalPowerupsUsed: 0,
    totalHintsUsed: 0,
    pureSolves: 0,
    uniqueQuotes: [],
    history: [],
    unlockedAchievements: [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * 把任意来源（可能是旧版本 / 损坏）的存档合并为合法的 PlayerProgress。
 * - 缺字段补默认值
 * - bestTime / bestTimeByDifficulty 中的 Infinity / NaN / 负数 / 旧式 null → null
 *   （旧版用 Infinity 作"无记录"哨兵，存盘后变 null，这里统一收口）
 */
export function migrateProgress(raw: any): PlayerProgress {
  const base = makeDefaultProgress();
  if (!raw || typeof raw !== 'object') return base;

  const sanitizeTime = (v: any): number | null => {
    if (typeof v === 'number' && isFinite(v) && v > 0) return v;
    return null;
  };

  // 先解析 completedDates（去重保真），totalCompleted 一律由它派生 —— 避免两者持久化分叉
  const completedDates: string[] = Array.isArray(raw.completedDates)
    ? raw.completedDates.filter((d: unknown) => typeof d === 'string')
    : [];

  const mergeDiff = <K extends DifficultyLevel>(acc: Record<K, number | null>, src: any): Record<K, number | null> => {
    const out: any = { ...acc };
    if (src && typeof src === 'object') {
      for (const d of DIFFICULTIES) {
        if (d in src) out[d] = sanitizeTime(src[d]);
      }
    }
    return out;
  };
  const mergeDiffCount = (acc: Record<DifficultyLevel, number>, src: any): Record<DifficultyLevel, number> => {
    const out = { ...acc };
    if (src && typeof src === 'object') {
      for (const d of DIFFICULTIES) {
        if (typeof src[d] === 'number' && isFinite(src[d]) && src[d] >= 0) out[d] = src[d];
      }
    }
    return out;
  };
  const mergeCatCount = (acc: Record<PuzzleCategory, number>, src: any): Record<PuzzleCategory, number> => {
    const out = { ...acc };
    if (src && typeof src === 'object') {
      for (const c of CATEGORIES) {
        if (typeof src[c] === 'number' && isFinite(src[c]) && src[c] >= 0) out[c] = src[c];
      }
    }
    return out;
  };
  const mergeModeCount = (acc: Record<GameMode, number>, src: any): Record<GameMode, number> => {
    const out = { ...acc };
    if (src && typeof src === 'object') {
      for (const m of MODES) {
        if (typeof src[m] === 'number' && isFinite(src[m]) && src[m] >= 0) out[m] = src[m];
      }
    }
    return out;
  };
  const mergeModeBest = (acc: Record<GameMode, number | null>, src: any): Record<GameMode, number | null> => {
    const out: Record<GameMode, number | null> = { ...acc };
    if (src && typeof src === 'object') {
      for (const m of MODES) {
        if (m in src) out[m] = sanitizeTime(src[m]);
      }
    }
    return out;
  };
  // 附加题（盲人摸象 / 投石问路）按日完成标记：旧存档无此字段 → 默认 {}；
  // 结构损坏的条目丢弃，仅保留 { blind, probe } 布尔形态。
  const mergeBonusByDate = (src: any): Record<string, { blind: boolean; probe: boolean }> => {
    const out: Record<string, { blind: boolean; probe: boolean }> = {};
    if (src && typeof src === 'object') {
      for (const date of Object.keys(src)) {
        const v = src[date];
        if (v && typeof v === 'object') {
          out[date] = { blind: v.blind === true, probe: v.probe === true };
        }
      }
    }
    return out;
  };

  return {
    completedDates,
    streak: typeof raw.streak === 'number' && isFinite(raw.streak) && raw.streak >= 0 ? Math.floor(raw.streak) : 0,
    bestStreak: typeof raw.bestStreak === 'number' && isFinite(raw.bestStreak) && raw.bestStreak >= 0
      ? Math.max(Math.floor(raw.bestStreak), raw.streak || 0)
      : (typeof raw.streak === 'number' ? Math.floor(raw.streak) : 0),
    lastPlayDate: typeof raw.lastPlayDate === 'string' ? raw.lastPlayDate : '',
    bestTime: sanitizeTime(raw.bestTime),
    bestTimeByDifficulty: mergeDiff(base.bestTimeByDifficulty, raw.bestTimeByDifficulty),
    totalCompleted: completedDates.length,
    completionsByDifficulty: mergeDiffCount(base.completionsByDifficulty, raw.completionsByDifficulty),
    completionsByCategory: mergeCatCount(base.completionsByCategory, raw.completionsByCategory),
    completionsByMode: mergeModeCount(base.completionsByMode, raw.completionsByMode),
    bestTimeByMode: mergeModeBest(base.bestTimeByMode, raw.bestTimeByMode),
    bonusByDate: mergeBonusByDate(raw.bonusByDate),
    totalPlayTimeSec: typeof raw.totalPlayTimeSec === 'number' && isFinite(raw.totalPlayTimeSec) && raw.totalPlayTimeSec >= 0 ? raw.totalPlayTimeSec : 0,
    totalRotations: typeof raw.totalRotations === 'number' && isFinite(raw.totalRotations) && raw.totalRotations >= 0 ? raw.totalRotations : 0,
    totalPowerupsUsed: typeof raw.totalPowerupsUsed === 'number' && isFinite(raw.totalPowerupsUsed) && raw.totalPowerupsUsed >= 0 ? raw.totalPowerupsUsed : 0,
    totalHintsUsed: typeof raw.totalHintsUsed === 'number' && isFinite(raw.totalHintsUsed) && raw.totalHintsUsed >= 0 ? raw.totalHintsUsed : 0,
    pureSolves: typeof raw.pureSolves === 'number' && isFinite(raw.pureSolves) && raw.pureSolves >= 0 ? raw.pureSolves : 0,
    uniqueQuotes: Array.isArray(raw.uniqueQuotes) ? raw.uniqueQuotes.filter((q: unknown) => typeof q === 'string') : [],
    history: Array.isArray(raw.history) ? raw.history.filter((h: any) => h && typeof h === 'object' && typeof h.date === 'string') : [],
    unlockedAchievements: Array.isArray(raw.unlockedAchievements)
      ? raw.unlockedAchievements.filter((a: unknown) => typeof a === 'string')
      : [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  hapticEnabled: true,
  difficulty: 'medium',
};

export async function loadPlayerProgress(): Promise<PlayerProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.progress);
    if (!raw) return makeDefaultProgress();
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return makeDefaultProgress();
    }
    return migrateProgress(parsed);
  } catch {
    return makeDefaultProgress();
  }
}

export async function savePlayerProgress(progress: PlayerProgress): Promise<void> {
  try {
    // bestTime 字段已是 number|null，JSON 能正确序列化（null 合法）。
    // 即便意外混入 Infinity/NaN，这里再兜一层。
    const safe = JSON.stringify(progress, (_k, v) => (typeof v === 'number' && !isFinite(v) ? null : v));
    await AsyncStorage.setItem(KEYS.progress, safe);
  } catch (e) {
    console.error('savePlayerProgress:', e);
  }
}

export async function loadGameSettings(): Promise<GameSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.settings);
    if (!raw) return DEFAULT_SETTINGS;
    // 合并默认值以兼容老版本（缺字段时补全，例如 difficulty 是后加的）
    const parsed = JSON.parse(raw);
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      hapticEnabled: typeof parsed.hapticEnabled === 'boolean' ? parsed.hapticEnabled : DEFAULT_SETTINGS.hapticEnabled,
      difficulty: DIFFICULTIES.includes(parsed.difficulty) ? parsed.difficulty : DEFAULT_SETTINGS.difficulty,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveGameSettings(settings: GameSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
  } catch (e) {
    console.error('saveGameSettings:', e);
  }
}

export async function loadFavorites(): Promise<FavoriteQuote[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.favorites);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((f: any) => f && typeof f.id === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveFavorites(favorites: FavoriteQuote[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.favorites, JSON.stringify(favorites));
  } catch (e) {
    console.error('saveFavorites:', e);
  }
}
