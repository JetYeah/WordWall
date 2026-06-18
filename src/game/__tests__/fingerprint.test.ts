// 字垣 — 书签指纹生成测试
// 覆盖 buildFingerprint 的确定性、四要素各自生效、结构与边界；rotateMatrix；synthesize 兜底。

import {
  buildFingerprint,
  rotateMatrix,
  synthesizeFingerprintInput,
  FingerprintInput,
  FingerprintCellType,
} from '../fingerprint';
import { CardHole } from '../types';

const baseInput = (over: Partial<FingerprintInput> = {}): FingerprintInput => ({
  cardHoles: [{ offsetX: 2, offsetY: 0 }, { offsetX: -1, offsetY: 1 }, { offsetX: 0, offsetY: -2 }, { offsetX: 1, offsetY: 2 }],
  cardSize: 9,
  solutionRotation: 0,
  timeRatio: 0.4,
  pureSolve: true,
  seed: 12345,
  ...over,
});

const countType = (grid: FingerprintCellType[][], type: FingerprintCellType): number =>
  grid.flat().filter((c) => c === type).length;

const serialize = (grid: FingerprintCellType[][]): string =>
  grid.map((row) => row.join(',')).join('|');

describe('buildFingerprint — 结构', () => {
  test('边长 = cardSize + 2', () => {
    for (const cardSize of [7, 9, 11]) {
      const fp = buildFingerprint(baseInput({ cardSize }));
      expect(fp.size).toBe(cardSize + 2);
      expect(fp.grid.length).toBe(cardSize + 2);
      expect(fp.grid[0].length).toBe(cardSize + 2);
    }
  });

  test('cardSize 过小被夹取为 ≥3', () => {
    const fp = buildFingerprint(baseInput({ cardSize: 1 }));
    expect(fp.size).toBeGreaterThanOrEqual(5); // 3 + 2
  });

  test('镂空数 = cardHoles 数（且落在内部卡面区，不在外圈）', () => {
    const holes: CardHole[] = [{ offsetX: 2, offsetY: 0 }, { offsetX: -2, offsetY: -2 }, { offsetX: 0, offsetY: 0 }];
    const fp = buildFingerprint(baseInput({ cardHoles: holes }));
    expect(countType(fp.grid, 'hole')).toBe(holes.length);
    const N = fp.size;
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        if (fp.grid[r][c] === 'hole') {
          // 内部卡面区：rows/cols 1..N-2
          expect(r).toBeGreaterThanOrEqual(1);
          expect(r).toBeLessThanOrEqual(N - 2);
          expect(c).toBeGreaterThanOrEqual(1);
          expect(c).toBeLessThanOrEqual(N - 2);
        }
      }
  });

  test('四角分配：徽章按正解角度顺时针落位 TL→TR→BR→BL，其余三角为定位符', () => {
    const N = buildFingerprint(baseInput()).size;
    const order = ['TL', 'TR', 'BR', 'BL'] as const;
    const cornerOf = { TL: [0, 0], TR: [0, N - 2], BR: [N - 2, N - 2], BL: [N - 2, 0] } as const;
    for (let k = 0; k < 4; k++) {
      const rot = k * 90;
      const fp = buildFingerprint(baseInput({ solutionRotation: rot, pureSolve: true }));
      // 徽章在该角度对应的角（2×2 全为 badgePure）
      const [br, bc] = cornerOf[order[k]];
      expect(fp.grid[br][bc]).toBe('badgePure');
      expect(fp.grid[br + 1][bc + 1]).toBe('badgePure');
      // 其余三个角为 finder（2×2 全为 finder）
      for (let j = 0; j < 4; j++) {
        if (j === k) continue;
        const [fr, fc] = cornerOf[order[j]];
        expect(fp.grid[fr][fc]).toBe('finder');
        expect(fp.grid[fr + 1][fc + 1]).toBe('finder');
      }
    }
  });
});

describe('buildFingerprint — 四要素各自生效', () => {
  test('确定性：相同输入 → 完全相同输出', () => {
    const a = buildFingerprint(baseInput());
    const b = buildFingerprint(baseInput());
    expect(serialize(a.grid)).toBe(serialize(b.grid));
  });

  test('角度要素：非对称镂空下，不同 solutionRotation 产生不同图案', () => {
    const r0 = serialize(buildFingerprint(baseInput({ solutionRotation: 0 })).grid);
    const r90 = serialize(buildFingerprint(baseInput({ solutionRotation: 90 })).grid);
    const r180 = serialize(buildFingerprint(baseInput({ solutionRotation: 180 })).grid);
    const r270 = serialize(buildFingerprint(baseInput({ solutionRotation: 270 })).grid);
    expect(new Set([r0, r90, r180, r270]).size).toBe(4);
  });

  test('用时要素：timeRatio=0 无计时格；ratio=1 计时格满；中间单调递增', () => {
    const none = buildFingerprint(baseInput({ timeRatio: 0 }));
    expect(countType(none.grid, 'frame')).toBe(0);
    const full = buildFingerprint(baseInput({ timeRatio: 1 }));
    const N = full.size;
    const perimeter = 4 * (N - 4); // 外圈周长（跳过四角各 2 格）
    expect(countType(full.grid, 'frame')).toBe(perimeter);
    const mid = buildFingerprint(baseInput({ timeRatio: 0.5 }));
    expect(countType(mid.grid, 'frame')).toBeGreaterThan(0);
    expect(countType(mid.grid, 'frame')).toBeLessThan(perimeter);
  });

  test('timeRatio 越界被夹取到 [0,1]', () => {
    const over = buildFingerprint(baseInput({ timeRatio: 99 }));
    const full = buildFingerprint(baseInput({ timeRatio: 1 }));
    expect(countType(over.grid, 'frame')).toBe(countType(full.grid, 'frame'));
    const under = buildFingerprint(baseInput({ timeRatio: -5 }));
    expect(countType(under.grid, 'frame')).toBe(0);
  });

  test('道具要素：徽章颜色 纯解=绿 / 道具=琥珀（位置由角度决定）', () => {
    // rotation 0 → 徽章在 TL
    const pure = buildFingerprint(baseInput({ pureSolve: true, solutionRotation: 0 }));
    const used = buildFingerprint(baseInput({ pureSolve: false, solutionRotation: 0 }));
    expect(pure.grid[0][0]).toBe('badgePure');
    expect(used.grid[0][0]).toBe('badgeUsed');
    // rotation 180 → 徽章在 BR（颜色仍正确）
    const pureBR = buildFingerprint(baseInput({ pureSolve: true, solutionRotation: 180 }));
    const usedBR = buildFingerprint(baseInput({ pureSolve: false, solutionRotation: 180 }));
    const N = pureBR.size;
    expect(pureBR.grid[N - 1][N - 1]).toBe('badgePure');
    expect(usedBR.grid[N - 1][N - 1]).toBe('badgeUsed');
  });

  test('卡片形状要素：不同 seed（卡身轮廓裁剪）可产生不同图案', () => {
    // 仅边缘裁剪受 seed 影响；中心镂空/定位符不变。统计 body 数量在不同 seed 下应有差异的概率。
    // 用多组 seed，至少存在两组产生不同图案。
    const patterns = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      patterns.add(serialize(buildFingerprint(baseInput({ seed })).grid));
    }
    expect(patterns.size).toBeGreaterThan(1);
  });
});

describe('rotateMatrix — 顺时针 90° 倍数', () => {
  test('0° 不变', () => {
    const m = [[1, 2], [3, 4]];
    expect(rotateMatrix(m, 0)).toEqual(m);
  });

  test('90° 顺时针：[[1,2],[3,4]] → [[3,1],[4,2]]', () => {
    const m = [[1, 2], [3, 4]];
    expect(rotateMatrix(m, 90)).toEqual([[3, 1], [4, 2]]);
  });

  test('180° = 旋转两次 90°', () => {
    const m = [[1, 2, 3], [4, 5, 6]];
    expect(rotateMatrix(m, 180)).toEqual(rotateMatrix(rotateMatrix(m, 90), 90));
  });

  test('270° = 逆向 90°（等价于 -90 顺时针 = 90 逆时针）', () => {
    const m = [[1, 2], [3, 4]];
    // 270 顺时针 = 90 逆时针：[[1,2],[3,4]] → [[2,4],[1,3]]
    expect(rotateMatrix(m, 270)).toEqual([[2, 4], [1, 3]]);
  });

  test('360° 归一为 0°（不依赖输入被 mutate）', () => {
    const m = [[1, 2], [3, 4]];
    expect(rotateMatrix(m, 360)).toEqual(m);
  });

  test('负角度 / 非法值被归一', () => {
    const m = [[1, 2], [3, 4]];
    expect(rotateMatrix(m, -90)).toEqual(rotateMatrix(m, 270));
    expect(rotateMatrix(m, 450)).toEqual(rotateMatrix(m, 90));
  });
});

describe('synthesizeFingerprintInput — 老存档兜底', () => {
  test('按难度给出正确 cardSize，镂空不重叠且数量受字数约束', () => {
    const input = synthesizeFingerprintInput('千里之行始于足下', 'medium', 90, 0.5, true, 42);
    expect(input.cardSize).toBe(9);
    expect(input.cardHoles.length).toBeGreaterThan(0);
    expect(input.cardHoles.length).toBeLessThanOrEqual(8); // 8 字
    const keys = new Set(input.cardHoles.map((h) => `${h.offsetX},${h.offsetY}`));
    expect(keys.size).toBe(input.cardHoles.length); // 不重叠
    const half = Math.floor(input.cardSize / 2);
    for (const h of input.cardHoles) {
      expect(Math.abs(h.offsetX)).toBeLessThanOrEqual(half - 1);
      expect(Math.abs(h.offsetY)).toBeLessThanOrEqual(half - 1);
    }
  });

  test('合成结果可直接喂给 buildFingerprint 且稳定', () => {
    const input = synthesizeFingerprintInput('上善若水', 'easy', 0, 0.3, false, 7);
    const fp = buildFingerprint(input);
    expect(fp.size).toBe(input.cardSize + 2);
    expect(countType(fp.grid, 'hole')).toBe(input.cardHoles.length);
  });
});
