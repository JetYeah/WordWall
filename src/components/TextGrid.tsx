import React, { memo, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CELL_SIZE, generateCellStyle } from '../game/engine';
import type { CellStyle } from '../game/types';

/** 单个格子的 RN 文字样式（generateCellStyle → RN style 的映射） */
export type CellStyleEntry = {
  fontWeight: string;
  fontSize: number;
  opacity: number;
  color: string;
  transform: Array<{ rotate: string }>;
};
/** 整面文字墙的样式矩阵（按 grid 形状）—— 由 GameScreen 算一次共享给全部 TextGrid 层 */
export type CellStyleMatrix = CellStyleEntry[][];

/** CellStyle（纯数值）→ RN 文字样式条目（带 transform 旋转数组） */
function toEntry(cs: CellStyle): CellStyleEntry {
  return {
    fontWeight: cs.fontWeight,
    fontSize: cs.fontSize,
    opacity: cs.opacity,
    color: cs.color,
    transform: [{ rotate: `${cs.rotation}deg` }],
  };
}

/**
 * 为整面文字墙构建样式矩阵。
 * gen 默认 generateCellStyle（核心区：固定字号、小角度、偏暗，保证可读）；
 * 外围可传 generatePerimeterStyle（字号随机 16–22、旋转 ±8°、更亮），获得「字符微烁」丰富观感。
 * 由 GameScreen 各算一份分别传给核心层 / 外围层，避免每层各自重建（~11× 重复分配）。
 */
export function buildCellStyles(
  grid: string[][],
  seed: number,
  gen: (row: number, col: number, seed: number, cellSize: number) => CellStyle = generateCellStyle,
  cellSize: number = CELL_SIZE,
): CellStyleMatrix {
  return grid.map((row, r) => row.map((_, c) => toEntry(gen(r, c, seed, cellSize))));
}

interface Props {
  grid: string[][];
  seed: number;
  /** 行切片闭区间 [startRow, endRow]，默认全部行 */
  rowRange?: [number, number];
  /** 列切片闭区间 [startCol, endCol]，默认全部列 */
  colRange?: [number, number];
  /** 稀疏分组（外围「字符微烁」用）：仅渲染 groupHash(r,c)%groupCount===groupIndex 的字符。
   *  设了 groupCount 即切到「绝对定位稀疏」模式：逐字绝对定位、不占位，供多层叠加做交错明灭。 */
  groupIndex?: number;
  groupCount?: number;
  /** 稀疏模式下跳过此矩形区（核心解密区，由静态核心层单独渲染） */
  skipR0?: number; skipC0?: number; skipR1?: number; skipC1?: number;
  /** 外部预计算的样式矩阵（GameScreen 共享一份）；不传则内部按 [grid, seed] 自算 */
  cellStyles?: CellStyleMatrix;
  /** 格子像素大小（自适应：窄屏 20、桌面 28）。不传则用 CELL_SIZE */
  cellSize?: number;
}

const GridCell = memo(({ char, style, cellSize }: { char: string; style: any; cellSize: number }) => (
  <View style={[styles.cell, { width: cellSize, height: cellSize }]}>
    <Text style={[styles.charBase, style]} numberOfLines={1} selectable={false}>
      {char}
    </Text>
  </View>
));

// 空间哈希：把每个格子确定性地散到一个 twinkle 组（散布、不聚簇）。
function groupHash(r: number, c: number, seed: number): number {
  return ((Math.imul(r, 73856093) ^ Math.imul(c, 19349663) ^ Math.imul(seed + 1, 83492791)) >>> 0);
}

// React.memo：拖拽时 GameScreen 频繁 re-render，但 grid/seed/range 引用稳定，
// memo 后 TextGrid（含数百格 reconciliation）完全跳过。
// 两种渲染模式：
//   - 默认（核心区）：连续切片，flex 行布局。
//   - 稀疏分组（外围微烁）：仅本组字符，逐字绝对定位，多层叠加各自动画。
export const TextGrid = React.memo(function TextGrid({
  grid, seed, rowRange, colRange, groupIndex, groupCount, skipR0, skipC0, skipR1, skipC1, cellStyles: cellStylesProp, cellSize: cellSizeProp,
}: Props) {
  const cs = cellSizeProp ?? CELL_SIZE;
  let [r0, r1] = rowRange ?? [0, grid.length - 1];
  let [c0, c1] = colRange ?? [0, (grid[0]?.length ?? 1) - 1];
  // 钳到网格边界：任何越界的 rowRange/colRange 都安全回落，避免 grid[r][c]/cellStyles[r][c] 崩溃
  r0 = Math.max(0, r0);
  r1 = Math.min(grid.length - 1, r1);
  c0 = Math.max(0, c0);
  c1 = Math.min((grid[0]?.length ?? 1) - 1, c1);

  // 外部传入则共享（?? 短路：传了就不调 buildCellStyles），否则内部按 [grid, seed] 自算
  const cellStyles = useMemo<CellStyleMatrix>(
    () => cellStylesProp ?? buildCellStyles(grid, seed),
    [grid, seed, cellStylesProp],
  );

  // 切片范围保护：起 > 止时返回 null
  if (r0 > r1 || c0 > c1) return null;

  // —— 稀疏分组模式：仅本组、且不在核心区的字符，逐字绝对定位 ——
  if (groupCount && groupIndex != null) {
    const nodes: React.ReactNode[] = [];
    for (let r = r0; r <= r1; r++) {
      const rowInSkip = skipR0 != null && r >= skipR0 && (skipR1 == null || r <= skipR1);
      for (let c = c0; c <= c1; c++) {
        if (rowInSkip && skipC0 != null && c >= skipC0 && (skipC1 == null || c <= skipC1)) continue;
        if (groupHash(r, c, seed) % groupCount !== groupIndex) continue;
        nodes.push(
          <View key={`${r}-${c}`} style={[styles.cell, { position: 'absolute', left: c * cs, top: r * cs, width: cs, height: cs }]}>
            <Text style={[styles.charBase, cellStyles[r][c]]} numberOfLines={1} selectable={false}>
              {grid[r][c]}
            </Text>
          </View>,
        );
      }
    }
    return <View style={styles.container} pointerEvents="none">{nodes}</View>;
  }

  // —— 默认连续切片（核心区）——
  const rows: number[] = [];
  for (let r = r0; r <= r1; r++) rows.push(r);
  const cols: number[] = [];
  for (let c = c0; c <= c1; c++) cols.push(c);

  return (
    <View style={styles.container} pointerEvents="none">
      {rows.map((r) => (
        <View key={r} style={styles.row}>
          {cols.map((c) => (
            <GridCell key={c} char={grid[r][c]} style={cellStyles[r][c]} cellSize={cs} />
          ))}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    // pointerEvents="none" prevents touch events from reaching the grid
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  charBase: {
    // selectable={false} prevents text selection on mobile/web
  },
});
