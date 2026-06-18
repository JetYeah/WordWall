// 字垣 — 书签「指纹」生成（纯函数，无 React 依赖）
//
// 每局解谜生成一枚类似二维码的方形「指纹」图案块，由四要素共同决定：
//   1. 解密卡形状 —— 镂空（holes）按正解角度旋转后落在网格里（绿色，正解透字位）
//   2. 用时占比   —— 外圈方框按 timeRatio 顺时针点亮（沙漏意象：用时越多，框越满）
//   3. 角度       —— 内层「卡身 + 镂空」整体旋转 solutionRotation 度；
//                    同时道具徽章按角度顺时针落位 TL(0°)→TR(90°)→BR(180°)→BL(270°)，使角度一目了然
//   4. 是否用道具 —— 道具徽章的颜色：纯解=绿，用过道具=琥珀（徽章位置由角度决定，见上）
//
// 四角放置二维码式「定位符」(finder)，其中与正解角度对应的角放道具徽章（位置=角度，颜色=纯解/道具），
// 其余三角为 gold 定位符。镂空用正解绿（CONFIG.colors.success），与「正确答案」展示呼应。
//
// 纯确定性：相同输入 → 相同指纹；不依赖 Math.random / Date。

import { CardHole } from './types';

/** 指纹网格单元类型 */
export type FingerprintCellType =
  | 'bg'         // 背景（暗）
  | 'body'       // 卡身（卡轮廓实体）
  | 'hole'       // 镂空（正解透字位 —— 绿）
  | 'finder'     // 定位符（二维码角标 —— 琥珀）
  | 'frame'      // 计时框（用时点亮 —— 琥珀）
  | 'badgePure'  // 右下徽章：纯解 —— 绿
  | 'badgeUsed'; // 右下徽章：用道具 —— 琥珀

/** 构建指纹所需的输入 */
export interface FingerprintInput {
  /** 解密卡镂空（相对卡片中心，网格单元） */
  cardHoles: CardHole[];
  /** 卡片边长（网格单元，奇数） */
  cardSize: number;
  /** 正解旋转角度（0/90/180/270） */
  solutionRotation: number;
  /** 用时占比 0..1（timeSec / timeLimitSec，函数内会夹取） */
  timeRatio: number;
  /** 是否纯解（决定右下徽章颜色） */
  pureSolve: boolean;
  /** 稳定种子（同一条记录恒定，决定卡身轮廓的随机裁剪） */
  seed: number;
}

/** 指纹：N×N 单元类型网格 */
export interface Fingerprint {
  /** 边长（= cardSize + 2，外圈一圈留给定位符/计时框） */
  size: number;
  /** grid[row][col] = 单元类型 */
  grid: FingerprintCellType[][];
}

/**
 * 把方阵顺时针旋转 90° 的整数倍（0/90/180/270）。非方阵也正确。
 * 方向与 engine.rotateOffset 一致（屏幕坐标 Y 向下：右→下 为顺时针），
 * 使指纹内层卡面与「正解时卡片真实朝向」一致。
 */
export function rotateMatrix<T>(m: T[][], rotation: number): T[][] {
  const times = (((Math.floor(rotation / 90) % 4) + 4) % 4);
  let out = m;
  for (let t = 0; t < times; t++) {
    const rows = out.length;
    if (rows === 0) break;
    const cols = out[0].length;
    const next: T[][] = [];
    for (let c = 0; c < cols; c++) {
      const row: T[] = [];
      for (let r = 0; r < rows; r++) row.push(out[rows - 1 - r][c]);
      next.push(row);
    }
    out = next;
  }
  return out;
}

/** 稳定的逐格哈希（0..999），决定卡身边缘裁剪，无需存储 RNG 状态 */
function cellHash(seed: number, r: number, c: number): number {
  const x = (Math.imul(seed | 0, 374761393)
    ^ Math.imul(r + 1, 2654435761)
    ^ Math.imul(c + 1, 2246822519)) >>> 0;
  return x % 1000;
}

/**
 * 构建指纹网格。
 *
 * 步骤：
 *  1. 在 cardSize×cardSize 的「本地卡面」上：默认全为卡身；镂空位标记为 hole；
 *     边缘/四角按 seed 决定性裁剪出不规则轮廓（呼应真实解密卡的不规则外形）。
 *  2. 把本地卡面整体旋转 solutionRotation 度（角度要素 → 旋转即指纹）。
 *  3. 嵌入 (cardSize+2)×(cardSize+2) 大网格，外圈留给定位符 / 计时框。
 *  4. 三角放 2×2 定位符（finder），右下角放道具徽章（badgePure/badgeUsed）。
 *  5. 沿外圈顺时针点亮 round(timeRatio × 周长) 个计时格（用时要素）。
 */
export function buildFingerprint(input: FingerprintInput): Fingerprint {
  const cardHoles = input.cardHoles;
  const cardSize = Math.max(3, input.cardSize);
  const half = Math.floor(cardSize / 2);
  const seed = input.seed | 0;
  const timeRatio = Math.max(0, Math.min(1, input.timeRatio));

  // —— 1) 本地卡面：body / hole / empty ——
  type Local = 'body' | 'hole' | 'empty';
  const holeSet = new Set(cardHoles.map(h => `${h.offsetX},${h.offsetY}`));
  const local: Local[][] = [];
  for (let r = 0; r < cardSize; r++) {
    const row: Local[] = [];
    for (let c = 0; c < cardSize; c++) {
      const dx = c - half;
      const dy = r - half;
      const isCorner = Math.abs(dx) === half && Math.abs(dy) === half;
      const isEdge = Math.abs(dx) === half || Math.abs(dy) === half;
      const h = cellHash(seed, r, c) / 1000;
      if (holeSet.has(`${dx},${dy}`)) {
        row.push('hole');
      } else if (isCorner) {
        row.push(h > 0.5 ? 'body' : 'empty');
      } else if (isEdge) {
        row.push(h > 0.15 ? 'body' : 'empty');
      } else {
        row.push('body');
      }
    }
    local.push(row);
  }

  // —— 2) 旋转本地卡面（角度要素）——
  const rotated = rotateMatrix(local, input.solutionRotation);

  // —— 3) 嵌入大网格 ——
  const N = cardSize + 2;
  const grid: FingerprintCellType[][] = [];
  for (let r = 0; r < N; r++) {
    const row: FingerprintCellType[] = [];
    for (let c = 0; c < N; c++) {
      if (r >= 1 && r <= cardSize && c >= 1 && c <= cardSize) {
        const v = rotated[r - 1][c - 1];
        row.push(v === 'hole' ? 'hole' : v === 'body' ? 'body' : 'bg');
      } else {
        row.push('bg');
      }
    }
    grid.push(row);
  }

  // —— 4) 四角：道具徽章按正解角度落位（角度要素），其余三角放定位符 ——
  // 顺时针 TL(0°) → TR(90°) → BR(180°) → BL(270°)：徽章落在与正解角度对应的角，
  // 使角度一目了然；徽章颜色仍表纯解(绿)/道具(琥珀)。三角 gold 定位符维持二维码观感。
  const place2x2 = (r0: number, c0: number, type: FingerprintCellType) => {
    for (let dr = 0; dr < 2; dr++)
      for (let dc = 0; dc < 2; dc++) grid[r0 + dr][c0 + dc] = type;
  };
  const corners: Array<[number, number]> = [
    [0, 0],         // TL
    [0, N - 2],     // TR
    [N - 2, N - 2], // BR
    [N - 2, 0],     // BL
  ];
  const badgeIdx = (((Math.floor(input.solutionRotation / 90) % 4) + 4) % 4);
  const badgeType: FingerprintCellType = input.pureSolve ? 'badgePure' : 'badgeUsed';
  for (let i = 0; i < 4; i++) {
    const [r0, c0] = corners[i];
    place2x2(r0, c0, i === badgeIdx ? badgeType : 'finder');
  }

  // —— 5) 计时框：顺时针点亮（用时要素）——
  // 外圈一圈，跳过被定位符/徽章占据的角部各 2 格，共 4 段、每段 (N-4) 格。
  const ring: Array<[number, number]> = [];
  for (let c = 2; c <= N - 3; c++) ring.push([0, c]);          // 上：L→R
  for (let r = 2; r <= N - 3; r++) ring.push([r, N - 1]);      // 右：T→B
  for (let c = N - 3; c >= 2; c--) ring.push([N - 1, c]);      // 下：R→L
  for (let r = N - 3; r >= 2; r--) ring.push([r, 0]);          // 左：B→T
  const lit = Math.round(timeRatio * ring.length);
  for (let i = 0; i < lit && i < ring.length; i++) {
    const [r, c] = ring[i];
    grid[r][c] = 'frame';
  }

  return { size: N, grid };
}

/**
 * 为缺失真实镂空数据的旧记录合成一组兜底输入（使老存档也能生成指纹）。
 * 用名言长度推算卡片大小、用 seed 决定性散布镂空 —— 仅作回退，非真实卡面。
 */
export function synthesizeFingerprintInput(
  quote: string,
  difficulty: 'easy' | 'medium' | 'hard',
  solutionRotation: number,
  timeRatio: number,
  pureSolve: boolean,
  seed: number,
): FingerprintInput {
  // 难度 → 卡片大小（与 DIFFICULTY_CONFIGS 保持一致）
  const cardSizeByDiff = { easy: 7, medium: 9, hard: 11 } as const;
  const cardSize = cardSizeByDiff[difficulty];
  const half = Math.floor(cardSize / 2);
  const range = Math.max(1, half - 1);

  // 用 seed 决定性散布 quote.length 个镂空（不重叠）
  const holes: CardHole[] = [];
  const used = new Set<string>();
  let s = (seed | 0) || 1;
  const rng = () => {
    // 简易确定性 PRNG（mulberry32 风格），不引入 puzzleGenerator 的依赖
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const count = Math.min(quote.length || 4, range * range * 2);
  let guard = 0;
  while (holes.length < count && guard < 500) {
    guard++;
    const offsetX = Math.floor(rng() * (2 * range + 1)) - range;
    const offsetY = Math.floor(rng() * (2 * range + 1)) - range;
    const key = `${offsetX},${offsetY}`;
    if (!used.has(key)) { used.add(key); holes.push({ offsetX, offsetY }); }
  }
  return { cardHoles: holes, cardSize, solutionRotation, timeRatio, pureSolve, seed };
}
