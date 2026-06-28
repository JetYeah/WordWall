import type { PuzzleLayout } from './types';
import { generateFillerGrid, computeCubeFace } from './puzzleGenerator';

/**
 * 叠嶂（错落立方体堆）的 6 面字墙数据。
 *
 * 形态：cube layout 是「全屏矩形墙」（gridCols × gridRows）；立方体仍是 N×N×N 正方体（N = gridCols），
 * 其 N×N 字面 = 矩形墙居中一段连续行 [faceRow0, faceRow0+N-1]（computeCubeFace 算）。名言只盖印在字面行内
 * （generateModePuzzle 传 solRowRange 把名言行钳在字面内），矩形其余行是随机字 → 松手摊平后核心区呈
 * 「困难那样的高矩形」：立方体方阵内容居中、上下随机字补足（用户诉求「正方形扩展为矩形，不够处随机字补」）。
 *
 * - grids[solutionFace] === layout.grid（矩形墙；盖印了名言、有正解位姿，名言落在字面行内）。
 * - 其余 5 面是 generateFillerGrid 填充墙 —— 视觉上是正常字墙，但名言不会完整出现，故 checkSolution 恒假，
 *   玩家须转对那面才能解。
 *
 * 纯函数（无 React / AsyncStorage），便于 jest 测试。rng 由调用方传入（确定性：相同 seed → 相同面集与正解面）。
 * faceRow0/n 由 computeCubeFace 纯函数从 layout 算（生成期与渲染期同输入 → 同输出，零漂移）；GameScreen 据此
 * 把每面的 N×N 字面切出来喂 voxelHtml（其只寻址 [0,N)，3D 立方体恒为 N×N×N）。
 */
export interface VoxelFaces {
  /** 6 面矩形字墙（gridRows × gridCols）；索引 0..5 = front,back,right,left,top,bottom（与 voxelHtml 的面序一致） */
  grids: string[][][];
  /** 正解面索引 0..5（盖印了名言的那一面） */
  solutionFace: number;
  /** 立方体 N×N 字面在矩形墙里的起始行（grids[face].slice(faceRow0, faceRow0+n) 即字面 N×N） */
  faceRow0: number;
  /** 立方体边长（= gridCols）；字面 = n 行 × n 列 */
  n: number;
}

/**
 * 由单一正解字墙扩展成 6 面立方体墙（均为 gridRows × gridCols 矩形）。
 * @param layout  正解面的 PuzzleLayout（矩形网格；layout.grid 即正解面内容，名言在字面行内）
 * @param rng     PRNG（建议 mulberry32(|hashCode(puzzle.id + '|voxel')|)）
 */
export function generateVoxelFaces(layout: PuzzleLayout, rng: () => number): VoxelFaces {
  const { grid, gridRows, gridCols, coreArea } = layout;
  const { faceRow0, n } = computeCubeFace(gridCols, gridRows, coreArea);
  const solutionFace = Math.floor(rng() * 6);
  const grids: string[][][] = [];
  for (let i = 0; i < 6; i++) {
    // 正解面直接复用 layout.grid（矩形；只读共享，引擎/渲染均不 mutate），名言盖印在字面行内；
    // 其余 5 面填充（满随机矩形墙）——名言不会完整出现，checkSolution 恒假。
    grids.push(i === solutionFace ? grid : generateFillerGrid(gridRows, gridCols, rng));
  }
  return { grids, solutionFace, faceRow0, n };
}
