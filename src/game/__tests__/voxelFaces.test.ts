import { generateModePuzzle, mulberry32, computeCubeFace } from '../puzzleGenerator';
import { generateVoxelFaces } from '../voxelFaces';
import { checkSolution } from '../engine';

// 叠嶂 6 面字墙生成器：cube layout 为「全屏矩形墙」，立方体 N×N 字面是矩形墙居中一段行。
// 松手摊平后核心区呈「困难那样的高矩形」（方阵内容居中、上下随机字补足）。
describe('voxelFaces 叠嶂 6 面生成', () => {
  // cube 模式生成全屏矩形 layout（gridCols × gridRows）
  const { puzzle, layout } = generateModePuzzle('cube', '2026-06-22', 375, 812);
  const { grids, solutionFace, faceRow0, n } = generateVoxelFaces(layout, mulberry32(20260622));

  test('cube 模式 layout 是矩形（gridRows ≥ gridCols，全屏矩形墙非方阵）', () => {
    expect(layout.gridRows).toBeGreaterThanOrEqual(layout.gridCols);
    expect(layout.gridRows).toBeGreaterThan(0);
  });

  test('cube 核心区为高矩形（困难全带，coreRows > coreCols）—— 不是正方形', () => {
    const coreCols = layout.coreArea.col1 - layout.coreArea.col0 + 1;
    const coreRows = layout.coreArea.row1 - layout.coreArea.row0 + 1;
    expect(coreRows).toBeGreaterThan(coreCols);
  });

  test('立方体字面 N = gridCols，faceRow0/n 与 computeCubeFace 一致', () => {
    expect(n).toBe(layout.gridCols);
    const cf = computeCubeFace(layout.gridCols, layout.gridRows, layout.coreArea);
    expect(faceRow0).toBe(cf.faceRow0);
    expect(n).toBe(cf.n);
    // 字面行落在网格内
    expect(faceRow0).toBeGreaterThanOrEqual(0);
    expect(faceRow0 + n - 1).toBeLessThanOrEqual(layout.gridRows - 1);
  });

  test('6 面，每面 gridRows × gridCols，正解面 === layout.grid（引用相等）', () => {
    expect(grids).toHaveLength(6);
    expect(solutionFace).toBeGreaterThanOrEqual(0);
    expect(solutionFace).toBeLessThan(6);
    for (const g of grids) {
      expect(g).toHaveLength(layout.gridRows);
      for (const row of g) expect(row).toHaveLength(layout.gridCols);
    }
    expect(grids[solutionFace]).toBe(layout.grid);
  });

  test('名言正解位姿的行落在立方体字面行内（solRowRange 生效）', () => {
    const half = Math.floor(layout.cardShape.size / 2);
    expect(layout.solutionPosition.row).toBeGreaterThanOrEqual(faceRow0 + half);
    expect(layout.solutionPosition.row).toBeLessThanOrEqual(faceRow0 + n - 1 - half);
  });

  test('字面切片 N×N 自洽可解（faceRow0 无 off-by-one）', () => {
    // GameScreen 喂给 voxelHtml 的就是这段切片；它自身须可解，证明切行正确
    const face = grids[solutionFace].slice(faceRow0, faceRow0 + n);
    expect(face).toHaveLength(n);
    for (const row of face) expect(row).toHaveLength(n);
    const { col, row } = layout.solutionPosition;
    expect(
      checkSolution(face, col, row - faceRow0, layout.cardShape.holes, layout.solutionRotation, puzzle.quote),
    ).toBe(true);
  });

  test('正解面（整面矩形墙）在正解位姿可解', () => {
    const { col, row } = layout.solutionPosition;
    const { holes } = layout.cardShape;
    expect(checkSolution(grids[solutionFace], col, row, holes, layout.solutionRotation, puzzle.quote)).toBe(true);
  });

  test('其余 5 面在任意 90° 旋转的同一中心位姿都不可解', () => {
    const { col, row } = layout.solutionPosition;
    const { holes } = layout.cardShape;
    for (let i = 0; i < grids.length; i++) {
      if (i === solutionFace) continue;
      for (const rot of [0, 90, 180, 270]) {
        expect(checkSolution(grids[i], col, row, holes, rot, puzzle.quote)).toBe(false);
      }
    }
  });

  test('确定性：相同 seed 产生相同正解面 / 面集 / 字面位置', () => {
    const a = generateVoxelFaces(layout, mulberry32(777));
    const b = generateVoxelFaces(layout, mulberry32(777));
    expect(a.solutionFace).toBe(b.solutionFace);
    expect(a.grids).toEqual(b.grids);
    expect(a.faceRow0).toBe(b.faceRow0);
    expect(a.n).toBe(b.n);
  });
});
