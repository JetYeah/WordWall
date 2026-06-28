import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildVoxelHtml, VoxelColors } from '../game/voxelHtml';
import type { CellStyleEntry } from './TextGrid';
import { CONFIG } from '../config';

// 叠嶂品牌色与墙面色取自 CONFIG（常量 → 颜色对象引用稳定）
const COLORS: VoxelColors = {
  wallBg: CONFIG.colors.wallBg,
  wallText: CONFIG.colors.wallText,
  stageBg: CONFIG.colors.background,
  accent: '#4A90D9',
};

/** 「返回旋转」经此 ref 触发（注入 JS 调 HTML 内的 window.__unflatten） */
export interface VoxelPileViewHandle {
  unflatten: () => void;
}

interface Props {
  /** 6 面 N×N 字墙（generateVoxelFaces 产出） */
  grids: string[][][];
  /** 边长 N（格） */
  n: number;
  /** 单格 CSS 像素（== RN cellSize） */
  cell: number;
  /** 起始正面索引（≠ solutionFace） */
  startFace: number;
  /** 正解面索引（面指示器高亮用） */
  solutionFace: number;
  /** 缺块密度（0.5） */
  dens: number;
  /** 共享逐格样式矩阵（buildCellStyles(layout.grid)） */
  styles: CellStyleEntry[][];
  /** 吸附 + 摊平落定 → RN 淡入该面的 2D 字墙 + 解密卡 */
  onFlat: (face: number) => void;
}

/**
 * 叠嶂真 3D（three.js in WebView）：错落立方体堆，360° 旋转、吸附后逐块摊平成墙。
 * - 旋转 / 摊平全在 WebView 内部（WebGL，移动端 1 draw call）；仅在「摊平落定」离散事件回报 RN。
 * - RN 据此淡入 2D 字墙 + 解密卡（平墙解题、对齐零风险）；点「返回旋转」→ unflatten() 淡回 3D。
 * html 仅在 grids/几何/startFace/dens/styles 变化时重算（局内稳定 → 不 reload）。
 */
export const VoxelPileView = forwardRef<VoxelPileViewHandle, Props>(function VoxelPileView(
  { grids, n, cell, startFace, solutionFace, dens, styles, onFlat },
  ref,
) {
  const webRef = useRef<React.ComponentRef<typeof WebView>>(null);

  const html = useMemo(
    () => buildVoxelHtml({ grids, n, cell, startFace, solutionFace, dens, styles, colors: COLORS }),
    [grids, n, cell, startFace, solutionFace, dens, styles],
  );
  const source = useMemo(() => ({ html }), [html]);

  useImperativeHandle(
    ref,
    () => ({
      unflatten: () => {
        webRef.current?.injectJavaScript('window.__unflatten&&window.__unflatten();true;');
      },
    }),
    [],
  );

  return (
    <WebView
      ref={webRef}
      source={source}
      onMessage={(e) => {
        try {
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg.type === 'flat') onFlat(Number(msg.face));
        } catch {
          /* 忽略非 JSON 回报 */
        }
      }}
      originWhitelist={['*']}
      style={{ ...StyleSheet.absoluteFill, backgroundColor: COLORS.stageBg }}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      overScrollMode="never"
      nestedScrollEnabled={false}
      pointerEvents="auto"
    />
  );
});
