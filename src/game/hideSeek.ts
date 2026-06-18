// 字垣 — 捉迷藏模式纯逻辑（无 React、无 AsyncStorage，可单测）
//
// 出题人 A 自定义：句子（4–100 字）/ 提示信息（可选）/ 镂空位置 / 正解旋转 / 每局时长。
// 实际 layout 生成由 generatePuzzleFromQuote(puzzle, config, coreArea, …, rng, fixedHoles, fixedRotation) 完成。
//
// 卡面规则（hideSeekCardSize）：4–6 字→卡 7 / 7–8 字→卡 9 / 9 字及以上→卡 11。
// 超过 11 字时**卡面不再变大**（恒 11×11），但允许放「等量字数」的镂空 ——
// 让玩家在 11×11 上画出更密的马赛克图案（最多 100 字 = 100 孔，11×11 共 121 格）。
//
// 校验判据用「null / 空串」而非 {ok:true|false} 判别联合 —— 本项目 tsconfig 未开 strict，
// 布尔判别联合无法可靠收窄（见 memory zhiyuan-tsconfig-strict-off / library.ts 注释）。

import { CardHole, DifficultyLevel, Puzzle } from './types';
import { isDuplicateQuote } from './library';

/** 句子字数下限 */
export const HIDE_SEEK_LEN_MIN = 4;
/**
 * 句子字数上限。≤11 字走标准卡面（7/9/11）；>11 字卡面恒 11×11、放等量镂空（马赛克）。
 * 上限 100：11×11 = 121 格，留 ≥21 格非镂空，保证仍可生成（generateGrid 需要填充字 + 唯一性）。
 */
export const HIDE_SEEK_LEN_MAX = 100;
/** 超过此字数后卡面恒为 11×11（不再按难度档变大） */
export const HIDE_SEEK_FULL_CARD_AT = 11;

/** A 可选的每局时长（秒）；null = 不限 */
export const HIDE_SEEK_TIME_OPTIONS = [null, 60, 120, 180, 300] as const;
export type HideSeekTimeOption = (typeof HIDE_SEEK_TIME_OPTIONS)[number];

/** 按字数定卡面大小：4–6→7 / 7–8→9 / 9+→11（>11 字恒 11，画马赛克） */
export function hideSeekCardSize(len: number): number {
  if (len <= 6) return 7;
  if (len <= 8) return 9;
  return 11;
}
/** 按字数定难度档（仅展示 / layout config 用）：4–6→easy / 7–8→medium / 9+→hard */
export function hideSeekDifficulty(len: number): DifficultyLevel {
  if (len <= 6) return 'easy';
  if (len <= 8) return 'medium';
  return 'hard';
}

/** 出题草稿（UI 实时状态） */
export interface HideSeekDraft {
  /** 原始输入（未 trim） */
  quote: string;
  /** 可选提示信息：写了则在游戏内「出处」位置显示（替代 author/source）；不写则用默认 */
  hint?: string;
  /** A 在 tap-grid 上点亮的格子（行列，0..cardSize-1） */
  tapped: Array<{ row: number; col: number }>;
  /** A 选的正解旋转（0/90/180/270）—— B 须找到的角度 */
  rotation: number;
  /** A 选的每局时长 */
  timeLimitSec: HideSeekTimeOption;
}

/** 校验结果：ok 时各字段为归一化后的合法值；失败时 ok=false、error 为可读错误 */
export interface HideSeekValidation {
  ok: boolean;
  error: string;
  // —— 归一化后的合法值（ok=true 时有效）——
  quote: string;
  hint: string;
  difficulty: DifficultyLevel;
  cardSize: number;
  holes: CardHole[];
  rotation: number;
  timeLimitSec: number | null;
}

const FAIL_DEFAULTS = { quote: '', hint: '', difficulty: 'medium' as DifficultyLevel, cardSize: 9, holes: [] as CardHole[], rotation: 0, timeLimitSec: null };

/** tap-grid 坐标 → CardHole 偏移（相对卡片中心）。重复格去重。 */
export function holesFromToggleGrid(
  tapped: Array<{ row: number; col: number }>,
  cardSize: number,
): CardHole[] {
  const half = Math.floor(cardSize / 2);
  const seen = new Set<string>();
  const holes: CardHole[] = [];
  for (const t of tapped) {
    const offsetX = t.col - half;
    const offsetY = t.row - half;
    const key = `${offsetX},${offsetY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holes.push({ offsetX, offsetY });
  }
  return holes;
}

/**
 * 校验出题草稿。顺序：长度 → 去重 → 镂空数=字数 → 镂空在界内 → 旋转合法 → 时长合法。
 * @param workingLibrary 用于查重的完整工作题库（内置 + 自定义）
 */
export function validateHideSeekDraft(
  draft: HideSeekDraft,
  workingLibrary: Puzzle[],
): HideSeekValidation {
  const fail = (error: string): HideSeekValidation => ({ ok: false, error, ...FAIL_DEFAULTS });

  const quote = draft.quote.trim();
  if (quote.length < HIDE_SEEK_LEN_MIN || quote.length > HIDE_SEEK_LEN_MAX) {
    return fail(`句子长度需在 ${HIDE_SEEK_LEN_MIN}–${HIDE_SEEK_LEN_MAX} 字之间`);
  }
  if (isDuplicateQuote(workingLibrary, quote)) {
    return fail('题库中已存在该句子，换一句吧');
  }

  const difficulty = hideSeekDifficulty(quote.length);
  const cardSize = hideSeekCardSize(quote.length);
  const half = Math.floor(cardSize / 2);
  const holes = holesFromToggleGrid(draft.tapped, cardSize);

  if (holes.length !== quote.length) {
    return fail(`镂空数需与字数一致（当前 ${holes.length} / ${quote.length}）`);
  }
  for (const h of holes) {
    if (Math.abs(h.offsetX) > half || Math.abs(h.offsetY) > half) {
      return fail('镂空不能超出卡片边界');
    }
  }
  if (![0, 90, 180, 270].includes(draft.rotation)) {
    return fail('旋转角度无效');
  }
  if (!(HIDE_SEEK_TIME_OPTIONS as readonly (number | null)[]).includes(draft.timeLimitSec)) {
    return fail('时长选项无效');
  }

  return {
    ok: true,
    error: '',
    quote,
    hint: (draft.hint || '').trim(),
    difficulty,
    cardSize,
    holes,
    rotation: draft.rotation,
    timeLimitSec: draft.timeLimitSec,
  };
}
