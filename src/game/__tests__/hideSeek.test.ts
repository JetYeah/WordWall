// 字垣 — 捉迷藏模式单测（校验规则 + 生成器 fixedHoles/fixedRotation 端到端可解性）
import { CardHole, Puzzle } from '../types';
import {
  validateHideSeekDraft,
  holesFromToggleGrid,
  HIDE_SEEK_LEN_MIN,
  HIDE_SEEK_LEN_MAX,
  hideSeekDifficulty,
  HideSeekDraft,
} from '../hideSeek';
import {
  generatePuzzleFromQuote,
  computeCoreAreaCells,
  DIFFICULTY_CONFIGS,
  PUZZLE_LIBRARY,
} from '../puzzleGenerator';
import { computeCellSize, checkSolution } from '../engine';
import { getWorkingLibrary } from '../library';

const LIB = getWorkingLibrary([]); // 内置题库（无自定义）

// ─── holesFromToggleGrid ───────────────────────────────
describe('holesFromToggleGrid', () => {
  it('把 tap 坐标转成相对中心的偏移', () => {
    expect(holesFromToggleGrid([{ row: 3, col: 3 }], 7)).toEqual([{ offsetX: 0, offsetY: 0 }]);
    // cardSize 7 → half 3；左上角 (0,0) → offset (-3,-3)
    expect(holesFromToggleGrid([{ row: 0, col: 0 }], 7)).toEqual([{ offsetX: -3, offsetY: -3 }]);
    // 右下角 (6,6) → offset (3,3)
    expect(holesFromToggleGrid([{ row: 6, col: 6 }], 7)).toEqual([{ offsetX: 3, offsetY: 3 }]);
  });
  it('重复 tap 去重', () => {
    const r = holesFromToggleGrid([{ row: 1, col: 2 }, { row: 1, col: 2 }, { row: 2, col: 1 }], 7);
    expect(r).toHaveLength(2);
  });
});

// ─── validateHideSeekDraft ─────────────────────────────
describe('validateHideSeekDraft', () => {
  const baseDraft = (over: Partial<HideSeekDraft>): HideSeekDraft => ({
    quote: '甲乙丙丁', tapped: [{ row: 3, col: 3 }, { row: 2, col: 3 }, { row: 4, col: 3 }, { row: 3, col: 4 }],
    rotation: 0, timeLimitSec: null, ...over,
  });

  it('长度下界：少 1 字失败', () => {
    const v = validateHideSeekDraft(baseDraft({ quote: '甲乙丙' }), LIB); // 3 字
    expect(v.ok).toBe(false);
    expect(v.error).toContain(`${HIDE_SEEK_LEN_MIN}`);
  });
  it('长度上界：超 100 字失败', () => {
    const v = validateHideSeekDraft(baseDraft({ quote: '甲'.repeat(101) }), LIB); // 101 字
    expect(v.ok).toBe(false);
    expect(v.error).toContain(`${HIDE_SEEK_LEN_MAX}`);
  });
  it('题库重复失败', () => {
    const dup = PUZZLE_LIBRARY[0].quote; // 内置第一句
    const v = validateHideSeekDraft(baseDraft({ quote: dup }), LIB);
    expect(v.ok).toBe(false);
    expect(v.error).toContain('已存在');
  });
  it('镂空数 ≠ 字数失败', () => {
    // 7 字句但只给 5 个镂空（cardSize 9 → half 4）
    const v = validateHideSeekDraft(
      baseDraft({ quote: '甲乙丙丁戊己庚', tapped: [{ row: 4, col: 4 }, { row: 3, col: 4 }, { row: 5, col: 4 }, { row: 4, col: 3 }, { row: 4, col: 5 }] }),
      LIB,
    );
    expect(v.ok).toBe(false);
    expect(v.error).toContain('镂空数');
  });
  it('镂空越界失败', () => {
    // 4 字句 → cardSize 7 (half 3)；给 4 个 tap，其中 col=7 越界（offset 4 > 3）
    const v = validateHideSeekDraft(
      baseDraft({ tapped: [{ row: 0, col: 3 }, { row: 1, col: 3 }, { row: 2, col: 3 }, { row: 3, col: 7 }] }),
      LIB,
    );
    expect(v.ok).toBe(false);
    expect(v.error).toContain('边界');
  });
  it('旋转角度非法失败', () => {
    const v = validateHideSeekDraft(baseDraft({ rotation: 45 as unknown as 0 }), LIB);
    expect(v.ok).toBe(false);
  });
});

// 干净的通过用例（字数与镂空数匹配）：
describe('validateHideSeekDraft 干净通过', () => {
  it('9 字 hard + 9 镂空 + 90° + 60s 通过', () => {
    const tapped = Array.from({ length: 9 }, (_, i) => ({ row: 5, col: 1 + i })); // 一行 9 格（cardSize 11）
    const v = validateHideSeekDraft(
      { quote: '甲乙丙丁戊己庚辛壬', tapped, rotation: 90, timeLimitSec: 60 },
      LIB,
    );
    expect(v.ok).toBe(true);
    expect(v.difficulty).toBe('hard');
    expect(v.cardSize).toBe(11);
    expect(v.holes).toHaveLength(9);
    expect(v.rotation).toBe(90);
    expect(v.timeLimitSec).toBe(60);
  });

  it('扩展：20 字 → cardSize 11（卡面不再变大）', () => {
    const tapped = Array.from({ length: 20 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 }));
    const v = validateHideSeekDraft({ quote: '甲'.repeat(20), tapped, rotation: 0, timeLimitSec: null }, LIB);
    expect(v.ok).toBe(true);
    expect(v.cardSize).toBe(11);
    expect(v.difficulty).toBe('hard');
    expect(v.holes).toHaveLength(20);
  });
});

// ─── 端到端：fixedHoles + fixedRotation → 可解 ─────────
// 验证 generatePuzzleFromQuote 用 A 指定的镂空/旋转生成的 layout：
//   ① 正解态 checkSolution === true（字按阅读序读出名言）
//   ② layout.solutionRotation === 指定旋转
//   ③ layout.cardShape.holes 与指定镂空集合一致（排序后）
function buildHideLayout(quote: string, holes: CardHole[], rotation: number, screenW = 390, screenH = 844) {
  const difficulty = hideSeekDifficulty(quote.length); // 与 hideSeekCardSize 对齐：9+ → hard/11
  const config = DIFFICULTY_CONFIGS[difficulty];
  const cellSize = computeCellSize(screenW);
  const gridCols = Math.floor(screenW / cellSize);
  const gridRows = Math.floor(screenH / cellSize);
  const coreArea = computeCoreAreaCells(gridCols, gridRows, config, screenW, screenH, cellSize);
  const puzzle: Puzzle = { id: 'test-hide', quote, author: '测试', source: '测试', category: '名人名言' };
  return generatePuzzleFromQuote(puzzle, config, coreArea, gridCols, gridRows, cellSize, undefined, holes, rotation);
}

const CASES: Array<{ name: string; quote: string; holes: CardHole[] }> = [
  { name: 'easy 4字', quote: '甲乙丙丁', holes: [{ offsetX: 0, offsetY: 0 }, { offsetX: 1, offsetY: 0 }, { offsetX: -1, offsetY: 1 }, { offsetX: 0, offsetY: -1 }] },
  { name: 'medium 7字', quote: '甲乙丙丁戊己庚', holes: [{ offsetX: 0, offsetY: 0 }, { offsetX: 1, offsetY: 0 }, { offsetX: -1, offsetY: 0 }, { offsetX: 0, offsetY: 1 }, { offsetX: 0, offsetY: -1 }, { offsetX: 2, offsetY: 1 }, { offsetX: -2, offsetY: -1 }] },
  { name: 'hard 9字', quote: '甲乙丙丁戊己庚辛壬', holes: [{ offsetX: 0, offsetY: 0 }, { offsetX: 1, offsetY: 0 }, { offsetX: -1, offsetY: 0 }, { offsetX: 0, offsetY: 1 }, { offsetX: 0, offsetY: -1 }, { offsetX: 2, offsetY: 0 }, { offsetX: -2, offsetY: 0 }, { offsetX: 0, offsetY: 2 }, { offsetX: 0, offsetY: -2 }] },
];

describe('捉迷藏 builder fixedHoles/fixedRotation 端到端可解性', () => {
  for (const c of CASES) {
    for (const rot of [0, 90, 180, 270]) {
      it(`${c.name} × ${rot}°：正解态读出名言`, () => {
        const { layout } = buildHideLayout(c.quote, c.holes, rot);
        // ② 正解旋转透传
        expect(layout.solutionRotation).toBe(rot);
        // ③ 镂空集合一致（排序后比较 offset 集合）
        const key = (h: CardHole) => `${h.offsetX},${h.offsetY}`;
        const want = new Set(c.holes.map(key));
        const got = new Set(layout.cardShape.holes.map(key));
        expect(got).toEqual(want);
        expect(layout.cardShape.holes).toHaveLength(c.holes.length);
        // ① 正解态 checkSolution
        const ok = checkSolution(layout.grid, layout.solutionPosition.col, layout.solutionPosition.row, layout.cardShape.holes, layout.solutionRotation, c.quote);
        expect(ok).toBe(true);
      });
    }
  }

  it('旋转对称孔型：走深度兜底仍可解（不崩溃）', () => {
    // 一个高度对称的 4 孔型（中心十字），可能触发 generateGrid 唯一性重 roll
    const sym: CardHole[] = [{ offsetX: 0, offsetY: -1 }, { offsetX: 0, offsetY: 1 }, { offsetX: -1, offsetY: 0 }, { offsetX: 1, offsetY: 0 }];
    const { layout } = buildHideLayout('甲乙丙丁', sym, 0);
    const ok = checkSolution(layout.grid, layout.solutionPosition.col, layout.solutionPosition.row, layout.cardShape.holes, layout.solutionRotation, '甲乙丙丁');
    expect(ok).toBe(true);
  });

  it('扩展：15 字 → 卡 11×11 + 15 镂空，正解可解', () => {
    const holes15: CardHole[] = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) holes15.push({ offsetX: dx, offsetY: dy });
    const quote15 = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰';
    const { layout } = buildHideLayout(quote15, holes15, 0);
    expect(layout.cardShape.size).toBe(11);
    expect(layout.cardShape.holes).toHaveLength(15);
    const ok = checkSolution(layout.grid, layout.solutionPosition.col, layout.solutionPosition.row, layout.cardShape.holes, layout.solutionRotation, quote15);
    expect(ok).toBe(true);
  });
});
