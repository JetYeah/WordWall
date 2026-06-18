// 字垣 — 核心游戏引擎
// 纯函数，无副作用，无 React 依赖

import { CardHole, CellStyle } from './types';

// ─── 常量 ───────────────────────────────────────────

/** 每个网格单元的像素大小（也是自适应格子大小的上限 / 字号缩放基准） */
export const CELL_SIZE = 28;

/** 自适应格子大小下限：再小字就不可读了 */
export const MIN_CELL_SIZE = 20;
/** 目标列数：cellSize ≈ floor(screenW / 目标列数)，再夹到 [MIN_CELL_SIZE, CELL_SIZE] */
export const CELL_SIZE_TARGET_COLS = 18;

/**
 * 按屏幕宽度算格子像素大小：窄屏自动缩小（28→20），让一屏装下更多列/行。
 * 核心 cell 数随之变多，而卡片是固定 cell 数（cardSize²）→ 卡片占比下降、可放置组合翻倍，
 * 手机端也能体现难度（困难模式搜索空间不再被 cardSize+2 卡死）。桌面宽屏仍为 28。
 * 字号、坐标全部按 cellSize 等比缩放（generateCellStyle / generatePerimeterStyle / 像素换算）。
 */
export function computeCellSize(screenW: number): number {
  return Math.max(MIN_CELL_SIZE, Math.min(CELL_SIZE, Math.floor(screenW / CELL_SIZE_TARGET_COLS)));
}

/** 默认网格列数（会被屏幕实际宽度覆盖） */
export const DEFAULT_GRID_COLS = 16;

/** 默认网格行数（会被屏幕实际高度覆盖） */
export const DEFAULT_GRID_ROWS = 28;

/** 解密卡默认边长（网格单元） */
export const DEFAULT_CARD_SIZE = 9;

// ─── 旋转数学 ───────────────────────────────────────

/**
 * 90° 倍数旋转一个网格偏移量
 * 0→不变, 90→顺时针, 180→翻转, 270→逆时针
 */
export function rotateOffset(offset: CardHole, rotation: number): CardHole {
  switch (((rotation % 360) + 360) % 360) {
    case 0:   return { offsetX: offset.offsetX, offsetY: offset.offsetY };
    case 90:  return { offsetX: -offset.offsetY, offsetY: offset.offsetX };
    case 180: return { offsetX: -offset.offsetX, offsetY: -offset.offsetY };
    case 270: return { offsetX: offset.offsetY, offsetY: -offset.offsetX };
    default:  return offset;
  }
}

// ─── 网格坐标计算 ────────────────────────────────────

/**
 * 计算卡片在指定位置和旋转下，某个镂空对应的网格单元
 */
export function getGridCellAtHole(
  cardCenterCol: number,
  cardCenterRow: number,
  hole: CardHole,
  rotation: number,
): { col: number; row: number } {
  const rotated = rotateOffset(hole, rotation);
  return {
    col: cardCenterCol + rotated.offsetX,
    row: cardCenterRow + rotated.offsetY,
  };
}

/**
 * 像素坐标 → 网格坐标（四舍五入）。
 * 语义：当 cardCenter 落在 cell 中心（originX + col*CELL_SIZE + CELL_SIZE/2）时反推为 col。
 * originX/originY 为网格左上角在屏幕中的像素偏移（TextGrid 的 gridOffsetX / 0）。
 */
export function pixelToGrid(
  pixelX: number,
  pixelY: number,
  originX: number = 0,
  originY: number = 0,
  cellSize: number = CELL_SIZE,
): { col: number; row: number } {
  return {
    col: Math.round((pixelX - originX - cellSize / 2) / cellSize),
    row: Math.round((pixelY - originY - cellSize / 2) / cellSize),
  };
}

// ─── 读取网格字符 ────────────────────────────────────

/**
 * 获取卡片在当前位置+旋转下，所有镂空对应的网格字符
 */
export function getRevealedChars(
  grid: string[][],
  cardCenterCol: number,
  cardCenterRow: number,
  holes: CardHole[],
  rotation: number,
): string[] {
  return holes.map(hole => {
    const { col, row } = getGridCellAtHole(cardCenterCol, cardCenterRow, hole, rotation);
    if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
      return grid[row][col];
    }
    return '';
  });
}

/**
 * 检查哪些镂空位置匹配了正确的字符
 */
export function getHoleMatches(
  grid: string[][],
  cardCenterCol: number,
  cardCenterRow: number,
  holes: CardHole[],
  rotation: number,
  quote: string,
): boolean[] {
  const revealed = getRevealedChars(grid, cardCenterCol, cardCenterRow, holes, rotation);
  return revealed.map((char, i) => char === quote[i] && char !== '');
}

/**
 * 检查当前镂空揭示的字符是否匹配完整名言
 */
export function checkSolution(
  grid: string[][],
  cardCenterCol: number,
  cardCenterRow: number,
  holes: CardHole[],
  rotation: number,
  quote: string,
): boolean {
  const revealed = getRevealedChars(grid, cardCenterCol, cardCenterRow, holes, rotation);
  return revealed.join('') === quote;
}

// ─── 格子样式生成 ────────────────────────────────────

/** 文字墙配色（棕褐色调） */
const WALL_COLORS = [
  '#2C1810', '#3D2B1F', '#4A3728', '#5C4033',
  '#6B4423', '#7B3F00', '#8B4513', '#654321',
];

/**
 * 为文字墙的每个格子生成确定性随机视觉样式
 */
export function generateCellStyle(
  row: number,
  col: number,
  seed: number,
  cellSize: number = CELL_SIZE,
): CellStyle {
  const hash = ((row * 2654435761 + col * 2246822519 + seed * 374761393) >>> 0) % 1000;
  const weights: CellStyle['fontWeight'][] = ['300', 'normal', '500', '700'];

  return {
    fontWeight: weights[hash % weights.length],
    fontSize: Math.round((20 * cellSize) / CELL_SIZE),
    opacity: 0.18 + ((hash >> 4) % 35) / 100,
    rotation: ((hash >> 8) % 7) - 3,
    color: WALL_COLORS[(hash >> 12) % WALL_COLORS.length],
  };
}

/**
 * 外围（非核心区）文字墙的视觉样式 —— 比 generateCellStyle 更「放」：
 * 字号随机 16–22、旋转 ±8°、不透明度 0.50–0.89（更亮，穿过磨砂仍可见）。
 *
 * 为何与核心区分开：核心区那些字要透过镂空被读出来（谜题本体），必须保守（固定字号、
 * 小角度、偏暗）以保证可读；外围纯属装饰性「噪声字」，可以放开做大小/角度各异，
 * 贴近 perimeter-anim-preview.html 的观感。两套样式都由 buildCellStyles 在 GameScreen
 * 各算一份、分别传给核心层与外围「字符微烁」层。
 *
 * 仍确定性（同 row/col/seed → 同输出），只用于视觉噪声，不影响谜题逻辑/可解性。
 */
export function generatePerimeterStyle(row: number, col: number, seed: number, cellSize: number = CELL_SIZE): CellStyle {
  const hash = ((row * 2654435761 + col * 2246822519 + seed * 374761393) >>> 0);
  const weights: CellStyle['fontWeight'][] = ['300', 'normal', '500', '700'];
  return {
    fontWeight: weights[hash % weights.length],
    fontSize: Math.round((16 + (hash % 7)) * cellSize / CELL_SIZE),  // 16..22 按格子等比缩放 → 大小各异
    opacity: 0.5 + (((hash >> 4) % 40) / 100),      // 0.50..0.89（更亮）
    rotation: ((hash >> 10) % 17) - 8,               // ±8°（角度各异）
    color: WALL_COLORS[(hash >> 14) % WALL_COLORS.length],
  };
}

// ─── 道具「缩小」核心区计算 ──────────────────────────

/** 屏幕像素矩形 */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 计算道具「缩小」后的新核心区（整格对齐，且仍含 solutionPosition）。
 *
 * 纯函数（无 React 依赖，便于 jest 回归）。
 *
 * 关键：左上角必须落在整格边界。旧版直接用 `solCx - newW/2`，而 solCx 含
 * `+CELL_SIZE/2`（cell 中心），当 newW/CELL_SIZE 为偶数时左上角便落在半格边界，
 * 导致 GameScreen.coreCells 经 floor/ceil 向外多取 1 行/列 → skipRect/frost/金框
 * 三者错位、核心字符越出金框。这里在中心对齐后把左上角吸附到最近整格边界修复之。
 *
 * 安全性：吸附位移 ≤ CELL_SIZE/2（半格），而新核心区对正解的边距 ≥
 * (newW - cardPixelSize)/2 ≥ CELL_SIZE（因 newW ≥ minSize = (cardSize+2)*CELL_SIZE），
 * 故吸附后正解 cell 仍在可达范围内，缩小后仍可解。
 */
export function computeShrunkCore(
  cur: PixelRect,
  solution: { col: number; row: number },
  core: PixelRect,
  cardSize: number,
  gridOffsetX: number,
  cellSize: number = CELL_SIZE,
): PixelRect {
  const minSize = (cardSize + 2) * cellSize;
  // 宽高 floor 到整格
  const newW = Math.max(minSize, Math.floor((cur.w * 0.9) / cellSize) * cellSize);
  const newH = Math.max(minSize, Math.floor((cur.h * 0.9) / cellSize) * cellSize);
  // 中心对齐到 solution cell 中心
  const solCx = gridOffsetX + solution.col * cellSize + cellSize / 2;
  const solCy = solution.row * cellSize + cellSize / 2;
  let newX = solCx - newW / 2;
  let newY = solCy - newH / 2;
  // 吸附到整格边界（消除半格偏移）
  newX = Math.round((newX - gridOffsetX) / cellSize) * cellSize + gridOffsetX;
  newY = Math.round(newY / cellSize) * cellSize;
  // clip 到原核心区内（边界均整格对齐，吸附后仍保持对齐）
  newX = Math.max(core.x, Math.min(core.x + core.w - newW, newX));
  newY = Math.max(core.y, Math.min(core.y + core.h - newH, newY));
  return { x: newX, y: newY, w: newW, h: newH };
}
