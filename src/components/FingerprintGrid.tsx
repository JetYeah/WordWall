// 字垣 — 指纹方块渲染（书签 BookmarkCard / 历史日历 MiniFingerprint 共用同一份）
//
// v7：物理像素对齐（PixelRatio）—— 根治「四角大实心块细微毛刺」。
// 每个格子是绝对定位的实心 <View>。当某条边落在非整数「物理像素」上时，GPU 会对其做抗锯齿，
// 留下 ~1px 半透明毛边。四角的 2×2 定位符 / 徽章是最大、边最长的实心块，AA 毛边最长最显眼
// → 看上去像「四角毛刺」。inset / v6.x 各种 +1 调整都治不好——因为它不是溢出，是抗锯齿。
//
// 根治思路：把所有格边界对齐到「整数物理像素」。在物理像素空间把 [inset, size-inset] 均分给 N，
// 每条边界取整（physSpan / physOff 全为整数）→ 相邻格共享同一条整数物理边界：
//   无接缝（共享边界，不留亚像素缝）、无需 +1 重叠、边无抗锯齿。
// 再除以 dpr 换回布局像素交给 <View>。最长的大块同样边边对齐 → 锐利无毛刺。
// 仍保留 inset（物理 ≥1px）让格离盒边，overflow:hidden 仅作兜底。
// 透明（bg）单元不渲染，省 View 且透出底层面板。

import React from 'react';
import { View, StyleSheet, PixelRatio } from 'react-native';
import { FingerprintCellType } from '../game/fingerprint';

type FingerprintShape = { size: number; grid: FingerprintCellType[][] };

interface Props {
  fingerprint: FingerprintShape;
  /** 容器边长（布局 px）。N 格按物理像素对齐均分铺满。 */
  size: number;
  /** 每种单元的颜色；值为 'transparent' 的单元不渲染（透出底层面板）。 */
  colors: Record<FingerprintCellType, string>;
}

export const FingerprintGrid: React.FC<Props> = ({ fingerprint, size, colors }) => {
  const { grid, size: N } = fingerprint;

  // 在物理像素空间均分：所有边界对齐整数物理像素 → 边无抗锯齿、相邻格共享边界无接缝。
  const dpr = PixelRatio.get();
  const physSize = Math.round(size * dpr);                  // 盒子物理边长（整数）
  const insetPhys = Math.max(1, Math.round(dpr));           // 物理内缩 ≥1px（格离盒边，防裁剪处 AA）
  const innerPhys = Math.max(N, physSize - insetPhys * 2);  // 可铺物理区域（保底 ≥ N，极小尺寸不崩）
  const base = Math.max(1, Math.floor(innerPhys / N));
  const extra = innerPhys - base * N;
  const physSpan = (i: number) => base + (i < extra ? 1 : 0); // 第 i 行/列物理宽/高（整数）
  const physOff: number[] = [];                              // 第 i 行/列相对内缩区的物理偏移（整数）
  let acc = 0;
  for (let i = 0; i < N; i++) { physOff.push(acc); acc += physSpan(i); }
  // 物理坐标 → 布局坐标（交给 <View>）。相邻格共享 physOff[i+1] 这条整数物理边界 → 无缝无 AA。
  const lay = (phys: number) => phys / dpr;
  const left = (c: number) => lay(insetPhys + physOff[c]);
  const top = (r: number) => lay(insetPhys + physOff[r]);

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const color = colors[grid[r][c]];
      if (!color || color === 'transparent') continue; // bg 透明：不渲染，透出底层近黑面板
      cells.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: left(c),
            top: top(r),
            width: lay(physSpan(c)),
            height: lay(physSpan(r)),
            backgroundColor: color,
          }}
        />,
      );
    }
  }
  return <View style={[styles.box, { width: size, height: size }]}>{cells}</View>;
};

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden', // 兜底裁剪（v7 下格已内缩，正常不触发）
  },
});
