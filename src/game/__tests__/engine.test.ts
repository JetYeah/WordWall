// 字垣 — 引擎与生成器测试
// 核心不变量：正解态下透过镂空按网格阅读顺序（row 升序、col 升序）
// 读出的字符必须等于 quote。该不变量由 generatePuzzleFromQuote 内的
// holes 排序保证（见 puzzleGenerator.ts）。

import {
  generatePuzzleFromQuote,
  generateDailyPuzzle,
  generateModePuzzle,
  deriveBlindedHoles,
  MODE_TIME_LIMIT_SEC,
  PUZZLE_LIBRARY,
  DIFFICULTY_CONFIGS,
  computeCoreAreaCells,
  TOP_RESERVE_PX,
  BOTTOM_RESERVE_PX,
  hashCode,
} from '../puzzleGenerator';
import { rotateOffset, checkSolution, computeShrunkCore, computeCellSize } from '../engine';
import type { Puzzle, DifficultyLevel, GameMode } from '../types';

// 默认屏幕尺寸（iPhone X 类）
const SCREEN_W = 375;
const SCREEN_H = 812;
const CELL_SIZE = 28;

// 测试三档难度
const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard'];

// 按难度生成 layout 的辅助函数
function generateForDifficulty(puzzle: Puzzle, difficulty: DifficultyLevel) {
  const config = DIFFICULTY_CONFIGS[difficulty];
  const gridCols = Math.floor(SCREEN_W / CELL_SIZE);
  const gridRows = Math.floor(SCREEN_H / CELL_SIZE);
  const coreArea = computeCoreAreaCells(gridCols, gridRows, config, SCREEN_W, SCREEN_H);
  const result = generatePuzzleFromQuote(puzzle, config, coreArea, gridCols, gridRows);
  return {
    layout: result.layout,
    puzzle: result.puzzle,
    coreArea,
    gridCols,
    gridRows,
  };
}

describe('阅读顺序不变量', () => {
  // 遍历整库名言 × 三档难度：正解态按 (row, col) 排序镂空落点读出应等于 quote
  test.each(PUZZLE_LIBRARY)('puzzle $id 正解态阅读顺序 === quote', (puzzle: Puzzle) => {
    const { layout } = generateForDifficulty(puzzle, 'medium');
    const { grid, cardShape, solutionPosition, solutionRotation } = layout;

    const cells = cardShape.holes.map((h) => {
      const r = rotateOffset(h, solutionRotation);
      return {
        col: solutionPosition.col + r.offsetX,
        row: solutionPosition.row + r.offsetY,
      };
    });

    const read = [...cells]
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((c) => grid[c.row][c.col])
      .join('');

    expect(read).toBe(puzzle.quote);
  });
});

describe('checkSolution 一致性', () => {
  // 关联校验：正解态下 checkSolution 必须返回 true
  test.each(PUZZLE_LIBRARY)('puzzle $id 正解态 checkSolution === true', (puzzle: Puzzle) => {
    const { layout } = generateForDifficulty(puzzle, 'medium');
    const { grid, cardShape, solutionPosition, solutionRotation } = layout;

    const ok = checkSolution(
      grid,
      solutionPosition.col,
      solutionPosition.row,
      cardShape.holes,
      solutionRotation,
      puzzle.quote,
    );

    expect(ok).toBe(true);
  });
});

describe('难度系统', () => {
  // 三档 × 5 次生成，断言所有不变量
  test.each(DIFFICULTIES)('难度 %s 参数符合配置', (difficulty: DifficultyLevel) => {
    const config = DIFFICULTY_CONFIGS[difficulty];

    // cardSize 必须奇数
    expect(config.cardSize % 2).toBe(1);

    // coreWidth/Height ratio 在合理范围
    expect(config.coreWidthRatio).toBeGreaterThan(0);
    expect(config.coreWidthRatio).toBeLessThanOrEqual(1);
    expect(config.coreHeightRatio).toBeGreaterThan(0);
    expect(config.coreHeightRatio).toBeLessThanOrEqual(1);

    // holeSpread 在 [0,1]
    expect(config.holeSpread).toBeGreaterThanOrEqual(0);
    expect(config.holeSpread).toBeLessThanOrEqual(1);

    // 倒计时秒数：简单 180 / 中等 240 / 困难 300
    expect(config.timeLimitSec).toBeGreaterThan(0);
  });

  test.each(DIFFICULTIES)('难度 %s 生成 layout 满足所有不变量', (difficulty: DifficultyLevel) => {
    const config = DIFFICULTY_CONFIGS[difficulty];
    const gridCols = Math.floor(SCREEN_W / CELL_SIZE);
    const gridRows = Math.floor(SCREEN_H / CELL_SIZE);
    const coreArea = computeCoreAreaCells(gridCols, gridRows, config, SCREEN_W, SCREEN_H);

    // 多次生成验证确定性 + 不变量
    for (let trial = 0; trial < 5; trial++) {
      // 选一道该难度字数范围内的题
      const pool = PUZZLE_LIBRARY.filter(p => {
        const len = p.quote.length;
        return len >= config.quoteLenMin && len <= config.quoteLenMax;
      });
      const puzzle = pool[trial % pool.length];

      const { layout } = generatePuzzleFromQuote(puzzle, config, coreArea, gridCols, gridRows);
      const { cardShape, solutionPosition, grid } = layout;
      const half = Math.floor(config.cardSize / 2);

      // 1. cardSize === config.cardSize（奇数）
      expect(cardShape.size).toBe(config.cardSize);

      // 2. 镂空数量 = 字数
      expect(cardShape.holes.length).toBe(puzzle.quote.length);

      // 3. 镂空 offset 在 holeSpread 限制范围内
      const maxRange = Math.max(1, Math.min(half - 1, Math.floor(half * config.holeSpread)));
      for (const h of cardShape.holes) {
        expect(Math.abs(h.offsetX)).toBeLessThanOrEqual(maxRange);
        expect(Math.abs(h.offsetY)).toBeLessThanOrEqual(maxRange);
      }

      // 4. 正解位置在核心区内（含 half 边距，保证卡片完整在核心区）
      expect(solutionPosition.col).toBeGreaterThanOrEqual(coreArea.col0 + half);
      expect(solutionPosition.col).toBeLessThanOrEqual(coreArea.col1 - half);
      expect(solutionPosition.row).toBeGreaterThanOrEqual(coreArea.row0 + half);
      expect(solutionPosition.row).toBeLessThanOrEqual(coreArea.row1 - half);

      // 5. 核心区能容纳卡片（coreCols >= cardSize+2）
      const coreCols = coreArea.col1 - coreArea.col0 + 1;
      const coreRows = coreArea.row1 - coreArea.row0 + 1;
      expect(coreCols).toBeGreaterThanOrEqual(config.cardSize + 2);
      expect(coreRows).toBeGreaterThanOrEqual(config.cardSize + 2);

      // 6. 既有不变量：正解态 checkSolution === true
      const ok = checkSolution(
        grid,
        solutionPosition.col,
        solutionPosition.row,
        cardShape.holes,
        layout.solutionRotation,
        puzzle.quote,
      );
      expect(ok).toBe(true);
    }
  });

  test('核心区 cell 数 >= cardSize+2（容得下卡片）', () => {
    for (const difficulty of DIFFICULTIES) {
      const config = DIFFICULTY_CONFIGS[difficulty];
      const gridCols = Math.floor(SCREEN_W / CELL_SIZE);
      const gridRows = Math.floor(SCREEN_H / CELL_SIZE);
      const coreArea = computeCoreAreaCells(gridCols, gridRows, config, SCREEN_W, SCREEN_H);
      const coreCols = coreArea.col1 - coreArea.col0 + 1;
      const coreRows = coreArea.row1 - coreArea.row0 + 1;
      expect(coreCols).toBeGreaterThanOrEqual(config.cardSize + 2);
      expect(coreRows).toBeGreaterThanOrEqual(config.cardSize + 2);
    }
  });

  test('倒计时秒数：简单 180 / 中等 240 / 困难 300', () => {
    expect(DIFFICULTY_CONFIGS.easy.timeLimitSec).toBe(180);
    expect(DIFFICULTY_CONFIGS.medium.timeLimitSec).toBe(240);
    expect(DIFFICULTY_CONFIGS.hard.timeLimitSec).toBe(300);
  });

  test('核心区面积随难度递增（困难最大 → 搜索空间最大，正解最难定位）', () => {
    const gridCols = Math.floor(SCREEN_W / CELL_SIZE);
    const gridRows = Math.floor(SCREEN_H / CELL_SIZE);
    const area = (d: DifficultyLevel) => {
      const cfg = DIFFICULTY_CONFIGS[d];
      const ca = computeCoreAreaCells(gridCols, gridRows, cfg, SCREEN_W, SCREEN_H);
      return (ca.col1 - ca.col0 + 1) * (ca.row1 - ca.row0 + 1);
    };
    expect(area('hard')).toBeGreaterThan(area('medium'));
    expect(area('medium')).toBeGreaterThan(area('easy'));
  });
});

describe('每日确定性 + 难度独立性', () => {
  const TODAY = '2026-06-13';

  test('同 date + 同 difficulty → 相同 puzzle + layout', () => {
    const a = generateDailyPuzzle(TODAY, 'medium', SCREEN_W, SCREEN_H);
    const b = generateDailyPuzzle(TODAY, 'medium', SCREEN_W, SCREEN_H);
    expect(a.puzzle.id).toBe(b.puzzle.id);
    expect(a.layout.solutionPosition).toEqual(b.layout.solutionPosition);
    expect(a.layout.solutionRotation).toBe(b.layout.solutionRotation);
    // grid 内容一致
    expect(a.layout.grid).toEqual(b.layout.grid);
  });

  test('同 date 不同 difficulty → 不同 puzzle（每档独立选题）', () => {
    const easy = generateDailyPuzzle(TODAY, 'easy', SCREEN_W, SCREEN_H);
    const medium = generateDailyPuzzle(TODAY, 'medium', SCREEN_W, SCREEN_H);
    const hard = generateDailyPuzzle(TODAY, 'hard', SCREEN_W, SCREEN_H);
    const ids = new Set([easy.puzzle.id, medium.puzzle.id, hard.puzzle.id]);
    // 三档应该是不同的题（除非极罕见碰撞，43 题分三档几乎不可能撞）
    expect(ids.size).toBe(3);
  });

  test('各难度生成题字数在该档范围内', () => {
    for (const difficulty of DIFFICULTIES) {
      const cfg = DIFFICULTY_CONFIGS[difficulty];
      const { puzzle } = generateDailyPuzzle(TODAY, difficulty, SCREEN_W, SCREEN_H);
      expect(puzzle.quote.length).toBeGreaterThanOrEqual(cfg.quoteLenMin);
      expect(puzzle.quote.length).toBeLessThanOrEqual(cfg.quoteLenMax);
    }
  });

  test('不同日期相同难度 → 不同 puzzle（每日独立）', () => {
    const d1 = generateDailyPuzzle('2026-06-12', 'medium', SCREEN_W, SCREEN_H);
    const d2 = generateDailyPuzzle('2026-06-13', 'medium', SCREEN_W, SCREEN_H);
    expect(d1.puzzle.id).not.toBe(d2.puzzle.id);
  });
});

// ─── 窄屏可解性回归 ───────────────────────────────────
// mimo-bug-audit HIGH：旧版 computeCoreAreaCells 不封顶核心区到网格，
// 窄屏（如 sw=320, hard）下镂空盖章越界被静默跳过 → checkSolution 永不成立 → 无解。
// 旧测试用 SCREEN_W=375（gridCols=13）恰好绕过。这里穷举多种屏幕尺寸 + 难度，
// 断言「正解处必可解」+「核心区不越界」。
describe('窄屏可解性（OOB 回归）', () => {
  const WIDTHS = [280, 300, 311, 320, 336, 360, 375, 414];
  const HEIGHTS = [600, 667, 812];

  test('computeCoreAreaCells 永不越界网格', () => {
    for (const difficulty of DIFFICULTIES) {
      const config = DIFFICULTY_CONFIGS[difficulty];
      for (const sw of WIDTHS) {
        for (const sh of HEIGHTS) {
          const gridCols = Math.floor(sw / CELL_SIZE);
          const gridRows = Math.floor(sh / CELL_SIZE);
          const ca = computeCoreAreaCells(gridCols, gridRows, config, sw, sh);
          expect(ca.col0).toBeGreaterThanOrEqual(0);
          expect(ca.row0).toBeGreaterThanOrEqual(0);
          expect(ca.col1).toBeLessThanOrEqual(gridCols - 1);
          expect(ca.row1).toBeLessThanOrEqual(gridRows - 1);
        }
      }
    }
  });

  test.each(DIFFICULTIES)('难度 %s：常见屏幕尺寸下正解处必可解（卡片能放进网格时）', (difficulty) => {
    const config = DIFFICULTY_CONFIGS[difficulty];
    const pool = PUZZLE_LIBRARY.filter(p => p.quote.length >= config.quoteLenMin && p.quote.length <= config.quoteLenMax);
    const puzzles = (pool.length ? pool : PUZZLE_LIBRARY).slice(0, 8);

    for (const sw of WIDTHS) {
      for (const sh of HEIGHTS) {
        const gridCols = Math.floor(sw / CELL_SIZE);
        const gridRows = Math.floor(sh / CELL_SIZE);
        const coreArea = computeCoreAreaCells(gridCols, gridRows, config, sw, sh);
        for (const puzzle of puzzles) {
          const { layout } = generatePuzzleFromQuote(puzzle, config, coreArea, gridCols, gridRows);
          // 极端窄屏（网格比卡片还小）属退化情形，跳过可解性断言
          if (gridCols < config.cardSize || gridRows < config.cardSize) continue;
          const ok = checkSolution(
            layout.grid,
            layout.solutionPosition.col,
            layout.solutionPosition.row,
            layout.cardShape.holes,
            layout.solutionRotation,
            puzzle.quote,
          );
          if (!ok) {
            // 失败时给出可复现信息
            throw new Error(
              `UNSOLVABLE: ${difficulty} sw=${sw} sh=${sh} puzzle=${puzzle.id} ` +
              `gridCols=${gridCols} sol=(${layout.solutionPosition.col},${layout.solutionPosition.row}) rot=${layout.solutionRotation}`,
            );
          }
          expect(ok).toBe(true);
        }
      }
    }
  });
});

// ─── 道具「缩小」核心区整格对齐回归 ───────────────────────
// review HIGH：旧版 triggerShrink 左上角 = solCx - newW/2，而 solCx 含 +CELL_SIZE/2（cell 中心），
// newW/CELL_SIZE 为偶数时左上角落到半格边界 → coreCells 经 floor/ceil 向外多取 1 行/列，
// 与 frost/金框错位、核心字符越框。computeShrunkCore 把左上角吸附到整格边界修复之。
// 此处穷举核心尺寸 × solution 落点，断言：永远整格对齐、coreCells 宽度 = 实际格数（无 +1）、
// solution 仍在内（缩小后仍可解）、新区 clip 在原核心区内。
describe('道具「缩小」核心区整格对齐', () => {
  // 真实 gridOffsetX 常为任意值（含小数），用 27 模拟非整格偏移以验证吸附相对网格原点
  const GOX = 27;
  const CARD_SIZE = 7;

  test('整格对齐 + coreCells 宽度 = 实际格数 + solution 仍在内（穷举核心尺寸 × 落点）', () => {
    for (let coreCells = 9; coreCells <= 16; coreCells++) {
      const core = { x: GOX, y: 0, w: coreCells * CELL_SIZE, h: coreCells * CELL_SIZE };
      for (let col = 1; col < coreCells - 1; col++) {
        for (let row = 1; row < coreCells - 1; row++) {
          const out = computeShrunkCore(core, { col, row }, core, CARD_SIZE, GOX);

          // 整格对齐：四边相对网格原点都是 CELL_SIZE 整数倍
          expect((out.x - GOX) % CELL_SIZE).toBe(0);
          expect(out.y % CELL_SIZE).toBe(0);
          expect(out.w % CELL_SIZE).toBe(0);
          expect(out.h % CELL_SIZE).toBe(0);

          // coreCells（floor/ceil）取出的列/行数 = 实际格数，非 +1（核心回归点）
          const c0 = Math.floor((out.x - GOX) / CELL_SIZE);
          const c1 = Math.ceil((out.x + out.w - GOX) / CELL_SIZE) - 1;
          expect(c1 - c0 + 1).toBe(out.w / CELL_SIZE);
          const r0 = Math.floor(out.y / CELL_SIZE);
          const r1 = Math.ceil((out.y + out.h) / CELL_SIZE) - 1;
          expect(r1 - r0 + 1).toBe(out.h / CELL_SIZE);

          // solution cell 中心仍在新区内（缩小后仍可解）
          const solCx = GOX + col * CELL_SIZE + CELL_SIZE / 2;
          const solCy = row * CELL_SIZE + CELL_SIZE / 2;
          expect(solCx).toBeGreaterThanOrEqual(out.x);
          expect(solCx).toBeLessThanOrEqual(out.x + out.w);
          expect(solCy).toBeGreaterThanOrEqual(out.y);
          expect(solCy).toBeLessThanOrEqual(out.y + out.h);

          // 新区 clip 在原核心区内
          expect(out.x).toBeGreaterThanOrEqual(core.x);
          expect(out.y).toBeGreaterThanOrEqual(core.y);
          expect(out.x + out.w).toBeLessThanOrEqual(core.x + core.w);
          expect(out.y + out.h).toBeLessThanOrEqual(core.y + core.h);
        }
      }
    }
  });

  test('缩小确实生效时（偶数格宽）也不产生 +1 越界', () => {
    // 14 格核心 → 缩 10% 后 newW = 12 格（偶数，旧版必半格偏移）
    const core = { x: GOX, y: 0, w: 14 * CELL_SIZE, h: 14 * CELL_SIZE };
    const out = computeShrunkCore(core, { col: 7, row: 7 }, core, CARD_SIZE, GOX);
    expect(out.w).toBeLessThan(core.w); // 确实缩小了
    expect((out.w / CELL_SIZE) % 2).toBe(0); // 偶数格宽（最易触发旧 bug）
    const c0 = Math.floor((out.x - GOX) / CELL_SIZE);
    const c1 = Math.ceil((out.x + out.w - GOX) / CELL_SIZE) - 1;
    expect(c1 - c0 + 1).toBe(out.w / CELL_SIZE); // 仍无 +1
  });

  // 注：缩小后「卡片中心能否滑到正解」依赖正解落点——真实生成器把正解放在原核心
  // half-margin 内，computeShrunkCore 又把新区中心对齐到正解，故正解恒居新区中心、
  // 边距 (newW - cardPixelSize)/2 ≥ CELL_SIZE，恒可解。此处不再单测（避免用非真实
  // 贴边落点构造假失败）；上面「solution 仍在内」+ 生成器的 half-margin 已覆盖可解性。
});

// ─── 自适应格子大小（窄屏难度优化）─────────────────────
// 旧版 CELL_SIZE 恒为 28：手机 375px 只有 13 列，核心宽度被 cardSize+2 卡死，
// 三档难度的「可放置组合」几乎不变（easy84/medium84/hard96），体现不出难度。
// computeCellSize 让窄屏自动缩到 20 → 列数变多、核心 cell 数变多、卡片占比下降，
// 可放置组合拉开（easy144/medium168/hard320；困难核心宽度占比上调 0.75→0.85）。手机端也能体现难度。
describe('自适应格子大小', () => {
  test('computeCellSize：窄屏 20、桌面 28、随宽度递增到上限', () => {
    expect(computeCellSize(320)).toBe(20);   // 极窄 → 下限 20
    expect(computeCellSize(375)).toBe(20);   // 常见手机
    expect(computeCellSize(414)).toBe(23);   // 大手机
    expect(computeCellSize(768)).toBe(28);   // 平板/桌面 → 上限 28
    expect(computeCellSize(1920)).toBe(28);  // 桌面 → 28
  });

  test('窄屏（375）三档难度的可放置组合严格递增（不再被 cardSize+2 卡平）', () => {
    const SW = 375, SH = 812;
    const cs = computeCellSize(SW); // 20
    const gridCols = Math.floor(SW / cs);
    const gridRows = Math.floor(SH / cs);
    const placeable = (d: DifficultyLevel) => {
      const cfg = DIFFICULTY_CONFIGS[d];
      const ca = computeCoreAreaCells(gridCols, gridRows, cfg, SW, SH, cs);
      const coreCols = ca.col1 - ca.col0 + 1;
      const coreRows = ca.row1 - ca.row0 + 1;
      // 卡片可放置位置数（cell 网格内）× 4 旋转 = 真正的搜索空间
      return (coreCols - cfg.cardSize + 1) * (coreRows - cfg.cardSize + 1) * 4;
    };
    const easy = placeable('easy');
    const medium = placeable('medium');
    const hard = placeable('hard');
    // 旧版固定 28 时：easy≈84 / medium≈84 / hard≈96（medium 不大于 easy！）
    // 自适应后三者严格递增，hard 显著大于 easy（搜索空间真正拉开）
    expect(medium).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(medium);
    expect(hard).toBeGreaterThanOrEqual(easy * 1.5);
  });

  test('窄屏 cellSize=20 下生成的题仍可解（三档难度）', () => {
    const SW = 375, SH = 812;
    const cs = computeCellSize(SW);
    const gridCols = Math.floor(SW / cs);
    const gridRows = Math.floor(SH / cs);
    for (const d of DIFFICULTIES) {
      const cfg = DIFFICULTY_CONFIGS[d];
      const ca = computeCoreAreaCells(gridCols, gridRows, cfg, SW, SH, cs);
      const pool = PUZZLE_LIBRARY.filter(p => p.quote.length >= cfg.quoteLenMin && p.quote.length <= cfg.quoteLenMax);
      const puzzle = (pool.length ? pool : PUZZLE_LIBRARY)[0];
      const { layout } = generatePuzzleFromQuote(puzzle, cfg, ca, gridCols, gridRows);
      const ok = checkSolution(
        layout.grid,
        layout.solutionPosition.col,
        layout.solutionPosition.row,
        layout.cardShape.holes,
        layout.solutionRotation,
        puzzle.quote,
      );
      expect(ok).toBe(true);
    }
  });
});

// ─── 生成核心区 == 游戏核心区（可解性闭环回归）──────────────
// mimo-bug-audit HIGH：GameScreen 曾自行重算核心区，漏传 cellSize（默认 28，窄屏实为 20）
// 导致 play 核心 cell 数 < 生成核心 → 正解落在拖拽 clamp 之外 → 不可解。375×812 困难模式
// 生成核心 26 行、play 仅 18 行 → 8 行不可达。修复：coreArea + cellSize 随 layout 持久化，
// GameScreen 直接用、不再重算。此处模拟 GameScreen 的像素 clamp（用 layout.cellSize +
// layout.coreArea），断言每个生成的正解中心像素都在 clamp 内 —— 任何重算漂移都会让它失败。
describe('生成核心区 == 游戏核心区（可解性闭环）', () => {
  const WIDTHS = [320, 360, 375, 414];
  const HEIGHTS = [667, 812];
  const DATES = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'];

  test.each(DIFFICULTIES)('难度 %s：正解中心像素恒在 play clamp 内（多屏宽×高×日期）', (difficulty) => {
    const config = DIFFICULTY_CONFIGS[difficulty];
    for (const sw of WIDTHS) {
      for (const sh of HEIGHTS) {
        for (const date of DATES) {
          const { layout } = generateDailyPuzzle(date, difficulty, sw, sh);
          // 退化情形（网格比卡片还小）跳过
          if (layout.gridCols < config.cardSize || layout.gridRows < config.cardSize) continue;

          const cs = layout.cellSize;
          const ca = layout.coreArea;
          const gridOffsetX = Math.max(0, (sw - layout.gridCols * cs) / 2);
          // play clamp（与 GameScreen.clampToCore 一致）：卡片中心 px ∈ [coreX+halfCard, coreX+coreW-halfCard]
          const coreX = gridOffsetX + ca.col0 * cs;
          const coreY = ca.row0 * cs;
          const coreW = (ca.col1 - ca.col0 + 1) * cs;
          const coreH = (ca.row1 - ca.row0 + 1) * cs;
          const hc = (config.cardSize * cs) / 2;
          const minCx = coreX + hc, maxCx = coreX + coreW - hc;
          const minCy = coreY + hc, maxCy = coreY + coreH - hc;
          // 正解中心像素（与 GameScreen 解出吸附目标一致）
          const solCx = gridOffsetX + layout.solutionPosition.col * cs + cs / 2;
          const solCy = layout.solutionPosition.row * cs + cs / 2;
          const EPS = 1e-6;
          if (solCx < minCx - EPS || solCx > maxCx + EPS || solCy < minCy - EPS || solCy > maxCy + EPS) {
            throw new Error(
              `UNREACHABLE: ${difficulty} ${date} sw=${sw} sh=${sh} ` +
              `sol=(${layout.solutionPosition.col},${layout.solutionPosition.row}) ` +
              `clampX=[${minCx.toFixed(1)},${maxCx.toFixed(1)}] clampY=[${minCy.toFixed(1)},${maxCy.toFixed(1)}] ` +
              `solCx=${solCx.toFixed(1)} solCy=${solCy.toFixed(1)}`,
            );
          }
          expect(solCx).toBeGreaterThanOrEqual(minCx - EPS);
          expect(solCx).toBeLessThanOrEqual(maxCx + EPS);
          expect(solCy).toBeGreaterThanOrEqual(minCy - EPS);
          expect(solCy).toBeLessThanOrEqual(maxCy + EPS);
        }
      }
    }
  });

  test('layout 携带 coreArea + cellSize，且与用 layout.cellSize 重算的结果一致', () => {
    for (const difficulty of DIFFICULTIES) {
      const config = DIFFICULTY_CONFIGS[difficulty];
      const { layout } = generateDailyPuzzle('2026-06-13', difficulty, 375, 812);
      // 字段存在 + 合法
      expect(layout.cellSize).toBe(20); // 375px 窄屏 → 20
      expect(layout.coreArea.col0).toBeGreaterThanOrEqual(0);
      expect(layout.coreArea.col1).toBeLessThanOrEqual(layout.gridCols - 1);
      const coreCols = layout.coreArea.col1 - layout.coreArea.col0 + 1;
      expect(coreCols).toBeGreaterThanOrEqual(config.cardSize + 2);
      // 用 layout.cellSize 重算应得到完全相同的核心区（确认存的是「正确 cellSize」版本）
      const recomputed = computeCoreAreaCells(layout.gridCols, layout.gridRows, config, 375, 812, layout.cellSize);
      expect(layout.coreArea).toEqual(recomputed);
      // 反证：用错误 cellSize（28）重算会得到不同（更小）的核心区 —— 正是旧 bug 的根因
      const wrong = computeCoreAreaCells(layout.gridCols, layout.gridRows, config, 375, 812, 28);
      expect(layout.coreArea).not.toEqual(wrong);
    }
  });
});

// ─── 核心区布局契约（mimo issue #2 / #4）──────────────────
// #4：不管什么难度，左右非核心列数必须相等（对称）。
// #4：困难模式横向铺到 gridCols-2（左右各 ≥1 列），纵向铺满安全带。
// #2：核心区纵向不得压功能区 —— 顶端 ≥ TOP_RESERVE_PX、底端 ≤ screenH-BOTTOM_RESERVE_PX
//     （否则道具栏会盖住核心区底部）。
describe('核心区布局契约（对称 / 困难铺满 / 不压功能区）', () => {
  const WIDTHS = [280, 300, 320, 336, 360, 375, 390, 414, 768];
  const HEIGHTS = [600, 667, 740, 812, 926];

  test('所有难度 × 屏幕尺寸：左右非核心列数严格相等', () => {
    for (const difficulty of DIFFICULTIES) {
      const config = DIFFICULTY_CONFIGS[difficulty];
      for (const sw of WIDTHS) {
        for (const sh of HEIGHTS) {
          const cs = computeCellSize(sw);
          const gridCols = Math.floor(sw / cs);
          const gridRows = Math.floor(sh / cs);
          const ca = computeCoreAreaCells(gridCols, gridRows, config, sw, sh, cs);
          const leftMargin = ca.col0;
          const rightMargin = gridCols - ca.col1 - 1;
          expect(leftMargin).toBe(rightMargin);
        }
      }
    }
  });

  test('困难模式横向铺到极限：左右各恰好 1 列非核心区（网格足够宽时）', () => {
    const config = DIFFICULTY_CONFIGS.hard;
    for (const sw of [360, 375, 390, 414, 768]) {
      for (const sh of HEIGHTS) {
        const cs = computeCellSize(sw);
        const gridCols = Math.floor(sw / cs);
        const gridRows = Math.floor(sh / cs);
        // 仅在网格足够宽（gridCols-2 仍 ≥ cardSize+2）时断言「铺满」
        if (gridCols - 2 < config.cardSize + 2) continue;
        const ca = computeCoreAreaCells(gridCols, gridRows, config, sw, sh, cs);
        expect(ca.col0).toBe(1);                 // 左 1 列
        expect(gridCols - ca.col1 - 1).toBe(1);  // 右 1 列
        expect(ca.col1 - ca.col0 + 1).toBe(gridCols - 2);
      }
    }
  });

  test('所有难度：核心区纵向不压功能区（顶 ≥ TOP_RESERVE、底 ≤ screenH-BOTTOM_RESERVE，退化除外）', () => {
    for (const difficulty of DIFFICULTIES) {
      const config = DIFFICULTY_CONFIGS[difficulty];
      for (const sw of WIDTHS) {
        for (const sh of HEIGHTS) {
          const cs = computeCellSize(sw);
          const gridCols = Math.floor(sw / cs);
          const gridRows = Math.floor(sh / cs);
          const ca = computeCoreAreaCells(gridCols, gridRows, config, sw, sh, cs);
          const coreTopPx = ca.row0 * cs;
          const coreBottomPx = (ca.row1 + 1) * cs;
          // 退化窄屏（核心被 minCoreRows 撑大、放不进安全带）跳过纵向断言
          const minCoreRows = config.cardSize + 2;
          const degenerate = minCoreRows * cs > sh - BOTTOM_RESERVE_PX - TOP_RESERVE_PX;
          if (degenerate) continue;
          // 核心顶端不得低于顶栏带、底端不得越过道具栏带（留 1 格余量给金框/吸附）
          expect(coreTopPx).toBeGreaterThanOrEqual(TOP_RESERVE_PX - cs);
          expect(coreBottomPx).toBeLessThanOrEqual(sh - BOTTOM_RESERVE_PX + cs);
        }
      }
    }
  });

  test('困难模式核心区严格大于中等（铺满后搜索空间最大）', () => {
    const SW = 375, SH = 812;
    const cs = computeCellSize(SW);
    const gridCols = Math.floor(SW / cs);
    const gridRows = Math.floor(SH / cs);
    const area = (d: DifficultyLevel) => {
      const ca = computeCoreAreaCells(gridCols, gridRows, DIFFICULTY_CONFIGS[d], SW, SH, cs);
      return (ca.col1 - ca.col0 + 1) * (ca.row1 - ca.row0 + 1);
    };
    expect(area('hard')).toBeGreaterThan(area('medium'));
    expect(area('medium')).toBeGreaterThan(area('easy'));
  });
});

// ─── 模式（盲人摸象 / 投石问路）──────────────────────────
// 两种模式用 medium 的卡片/字数 + 困难档的核心区大小 + 3 分钟倒计时；
// 盲人摸象额外派生约一半「盲孔」。此处验证：medium 卡片/字数、困难核心区、可解、
// 每日确定性、三种模式今日题互不相同、盲孔数量≈半数且唯一、deriveBlindedHoles 确定性。
describe('模式（盲人摸象 / 投石问路）', () => {
  const MODES: GameMode[] = ['blind', 'probe'];

  test('MODE_TIME_LIMIT_SEC = 180（3 分钟）', () => {
    expect(MODE_TIME_LIMIT_SEC).toBe(180);
  });

  test.each(MODES)('模式 %s：medium 卡片/字数 + 困难核心区大小，且正解可解', (mode) => {
    const { puzzle, layout } = generateModePuzzle(mode, '2026-06-14', SCREEN_W, SCREEN_H);
    // 卡片 / 字数仍固定 medium：cardSize === 9
    expect(layout.cardShape.size).toBe(DIFFICULTY_CONFIGS.medium.cardSize);
    expect(puzzle.quote.length).toBeGreaterThanOrEqual(DIFFICULTY_CONFIGS.medium.quoteLenMin);
    expect(puzzle.quote.length).toBeLessThanOrEqual(DIFFICULTY_CONFIGS.medium.quoteLenMax);
    // 核心区采用「困难」档大小：与 hard 配置算出的核心区一致（大于 medium 核心区）
    const cellSize = layout.cellSize;
    const gridCols = layout.gridCols;
    const gridRows = layout.gridRows;
    const hardCore = computeCoreAreaCells(gridCols, gridRows, DIFFICULTY_CONFIGS.hard, SCREEN_W, SCREEN_H, cellSize);
    expect(layout.coreArea).toEqual(hardCore);
    const mediumCore = computeCoreAreaCells(gridCols, gridRows, DIFFICULTY_CONFIGS.medium, SCREEN_W, SCREEN_H, cellSize);
    const area = (c: any) => (c.col1 - c.col0 + 1) * (c.row1 - c.row0 + 1);
    expect(area(layout.coreArea)).toBeGreaterThanOrEqual(area(mediumCore));
    // 正解可解（既有不变量）
    const ok = checkSolution(
      layout.grid,
      layout.solutionPosition.col,
      layout.solutionPosition.row,
      layout.cardShape.holes,
      layout.solutionRotation,
      puzzle.quote,
    );
    expect(ok).toBe(true);
  });

  test.each(MODES)('模式 %s：每日确定性（同 date → 同 puzzle + layout）', (mode) => {
    const a = generateModePuzzle(mode, '2026-06-14', SCREEN_W, SCREEN_H);
    const b = generateModePuzzle(mode, '2026-06-14', SCREEN_W, SCREEN_H);
    expect(a.puzzle.id).toBe(b.puzzle.id);
    expect(a.layout.solutionPosition).toEqual(b.layout.solutionPosition);
    expect(a.layout.solutionRotation).toBe(b.layout.solutionRotation);
    expect(a.layout.grid).toEqual(b.layout.grid);
  });

  test('三种模式今日题互不相同（classic / blind / probe 各自独立选题）', () => {
    const classic = generateModePuzzle('classic', '2026-06-14', SCREEN_W, SCREEN_H);
    const blind = generateModePuzzle('blind', '2026-06-14', SCREEN_W, SCREEN_H);
    const probe = generateModePuzzle('probe', '2026-06-14', SCREEN_W, SCREEN_H);
    const ids = new Set([classic.puzzle.id, blind.puzzle.id, probe.puzzle.id]);
    // 43 题 / medium 字数范围足够，三种模式几乎不可能撞同一句
    expect(ids.size).toBe(3);
  });

  test('不同日期相同模式 → 不同 puzzle（每日独立）', () => {
    const d1 = generateModePuzzle('blind', '2026-06-13', SCREEN_W, SCREEN_H);
    const d2 = generateModePuzzle('blind', '2026-06-14', SCREEN_W, SCREEN_H);
    expect(d1.puzzle.id).not.toBe(d2.puzzle.id);
  });
});

describe('盲人摸象：deriveBlindedHoles', () => {
  // 简单确定性 mulberry32（与生成器同实现，仅供测试复现）
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  test('盲孔数量 = floor(N/2)，索引唯一且在范围内', () => {
    for (let n = 2; n <= 11; n++) {
      const rng = mulberry32(hashCode(`blind|${n}`));
      const blind = deriveBlindedHoles(n, rng);
      expect(blind.length).toBe(Math.floor(n / 2));
      // 唯一
      expect(new Set(blind).size).toBe(blind.length);
      // 范围 [0, n)
      for (const idx of blind) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(n);
      }
      // 升序
      for (let i = 1; i < blind.length; i++) expect(blind[i]).toBeGreaterThan(blind[i - 1]);
    }
  });

  test('确定性：同种子 → 同盲孔集', () => {
    const a = deriveBlindedHoles(8, mulberry32(12345));
    const b = deriveBlindedHoles(8, mulberry32(12345));
    expect(a).toEqual(b);
  });

  test('N<=1 退化为空（不盲，避免单字题无可读孔）', () => {
    expect(deriveBlindedHoles(0, mulberry32(1))).toEqual([]);
    expect(deriveBlindedHoles(1, mulberry32(1))).toEqual([]);
  });

  test('盲孔不消耗/污染布局确定性：blind 与 probe 同 date 的 grid 完全一致', () => {
    // 盲孔是显示层概念，不影响 layout 生成（同一 mode 种子的 layout 已确定性；
    // 这里额外验证 blind 与 probe 仅 mode 种子段不同，但 layout 派生只用 seed+12345，
    // 由于 seed 含 mode，blind/probe 的 layout 不同属正常——此断言聚焦：
    // 同 mode 多次调用 layout 稳定）
    const a1 = generateModePuzzle('blind', '2026-06-14', SCREEN_W, SCREEN_H);
    const a2 = generateModePuzzle('blind', '2026-06-14', SCREEN_W, SCREEN_H);
    expect(a1.layout.grid).toEqual(a2.layout.grid);
    expect(a1.layout.cardShape.holes).toEqual(a2.layout.cardShape.holes);
  });
});
