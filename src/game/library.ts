// 字垣 — 题库管理纯逻辑（无 React、无 AsyncStorage，可单测）
//
// 题库分两层：
//  - 内置 PUZZLE_LIBRARY（puzzleGenerator.ts，不可变，驱动每日确定性选题）
//  - 自定义题（AsyncStorage 持久化，开发者增删改）
// 「工作题库」= 内置 + 自定义。去重以名言正文为准（trim 后完全相同即重复）。

import { Puzzle, PuzzleCategory, DifficultyLevel } from './types';
import { PUZZLE_LIBRARY, generateDailyPuzzle, hashCode } from './puzzleGenerator';

export const PUZZLE_CATEGORIES: PuzzleCategory[] = ['名人名言', '诗词歌赋', '书摘'];

/** 新增/编辑表单的草稿 */
export interface PuzzleDraft {
  quote: string;
  author: string;
  source: string;
  category: PuzzleCategory;
}

/**
 * 校验结果：成功时 puzzle 非 null、error 为空串；失败时 puzzle 为 null、error 为可读错误。
 *
 * 注意：本项目的 expo/tsconfig.base 未开启 strict（strictNullChecks 关闭），布尔字面量
 * 判别联合（{ ok: true } | { ok: false }）在该配置下无法可靠收窄。故用 puzzle 是否为 null
 * 作为「成功/失败」判据（null 收窄在任意配置下都稳），避免收窄陷阱。
 */
export interface ValidateResult {
  puzzle: Puzzle | null;
  error: string;
}

/** 内置 + 自定义 = 工作题库 */
export function getWorkingLibrary(custom: Puzzle[]): Puzzle[] {
  return [...PUZZLE_LIBRARY, ...custom];
}

/** 名言正文是否已在库中重复（trim 后比较；内置 + 自定义都查） */
export function isDuplicateQuote(library: Puzzle[], quote: string): boolean {
  const q = quote.trim();
  if (!q) return false;
  return library.some((p) => p.quote.trim() === q);
}

/**
 * 生成自定义题 id：'c' 前缀避免与内置 q/p/b 冲突；hash + 随机后缀降低碰撞。
 * 去重以正文为准（isDuplicateQuote），id 仅需在数组内唯一。
 */
function genCustomId(quote: string): string {
  // Math.random 仅用于 id 后缀；不影响每日确定性（每日题走内置库 + 种子，与此无关）
  const suffix = Math.random().toString(36).slice(2, 6);
  return `c${Math.abs(hashCode(quote)).toString(36)}${suffix}`;
}

/**
 * 校验草稿并构造合法 Puzzle。
 * @param library 用于查重的完整工作题库（新增传全部；编辑时排除自身）
 */
export function validatePuzzleDraft(draft: PuzzleDraft, library: Puzzle[]): ValidateResult {
  const quote = draft.quote.trim();
  if (quote.length < 2) return { puzzle: null, error: '名言至少 2 字' };
  if (quote.length > 20) return { puzzle: null, error: '名言不超过 20 字（谜题核心区适配）' };
  if (!draft.author.trim()) return { puzzle: null, error: '请填写作者' };
  if (!draft.source.trim()) return { puzzle: null, error: '请填写出处（书名 / 篇名）' };
  if (!PUZZLE_CATEGORIES.includes(draft.category)) return { puzzle: null, error: '分类无效' };
  if (isDuplicateQuote(library, quote)) return { puzzle: null, error: '题库中已存在该名言（不可重复）' };
  return {
    puzzle: {
      id: genCustomId(quote),
      quote,
      author: draft.author.trim(),
      source: draft.source.trim(),
      category: draft.category,
    },
    error: '',
  };
}

/**
 * CRUD 结果：始终带回操作后的 custom（成功=更新后；失败=原样回传，UI 无需分支即可刷新）。
 * 成功判据：error === ''（或 puzzle 非空）。避免 {ok:true}|{ok:false} 判别联合（见上）。
 */
export interface CrudOutcome {
  custom: Puzzle[];
  puzzle?: Puzzle;
  error: string; // '' = 成功
}

/** 纯数组层 CRUD（不落盘；落盘由 utils/libraryStore 负责） */
export function addPuzzlePure(custom: Puzzle[], draft: PuzzleDraft): CrudOutcome {
  const v = validatePuzzleDraft(draft, getWorkingLibrary(custom));
  if (v.puzzle) return { custom: [...custom, v.puzzle], puzzle: v.puzzle, error: '' };
  return { custom, error: v.error };
}

export function updatePuzzlePure(custom: Puzzle[], id: string, draft: PuzzleDraft): CrudOutcome {
  const idx = custom.findIndex((p) => p.id === id);
  if (idx < 0) return { custom, error: '仅可修改自定义题（内置题锁定）' };
  // 查重排除自身
  const forDedup = getWorkingLibrary(custom).filter((p) => p.id !== id);
  const v = validatePuzzleDraft(draft, forDedup);
  if (v.puzzle) {
    const next = [...custom];
    next[idx] = { ...v.puzzle, id }; // 保留原 id（书签 / 统计以 id 关联）
    return { custom: next, puzzle: { ...v.puzzle, id }, error: '' };
  }
  return { custom, error: v.error };
}

export function deletePuzzlePure(custom: Puzzle[], id: string): Puzzle[] {
  return custom.filter((p) => p.id !== id);
}

/**
 * 按日期查找：返回该日三档难度的每日题（确定性选题，仅依赖内置库 → 与普通玩家所见一致）。
 * 用于开发者预览「某一天会出哪道题」。screenW/H 仅影响 layout，不影响选题，故可省略。
 */
export function lookupDailyByDate(
  date: string,
  screenW?: number,
  screenH?: number,
): Record<DifficultyLevel, Puzzle> {
  return {
    easy: generateDailyPuzzle(date, 'easy', screenW, screenH).puzzle,
    medium: generateDailyPuzzle(date, 'medium', screenW, screenH).puzzle,
    hard: generateDailyPuzzle(date, 'hard', screenW, screenH).puzzle,
  };
}

/** 按 author / source / quote 子串筛选工作题库（大小写不敏感；中文直接子串匹配） */
export function filterLibrary(library: Puzzle[], query: string): Puzzle[] {
  const q = query.trim().toLowerCase();
  if (!q) return library;
  return library.filter((p) =>
    p.author.toLowerCase().includes(q) ||
    p.source.toLowerCase().includes(q) ||
    p.quote.toLowerCase().includes(q),
  );
}

/** 某题是否为内置题（不可删改；按 id 前缀判定——内置为 q/p/b，自定义为 c） */
export function isBuiltinPuzzle(p: Puzzle): boolean {
  return !p.id.startsWith('c');
}
