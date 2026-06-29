// 字垣 — 谜题生成器
// 名言库、PRNG、网格生成、卡片形状生成、难度配置

import { Puzzle, CardHole, CardShape, PuzzleLayout, DifficultyLevel, DifficultyConfig, CoreAreaCells, GameMode } from './types';
import { DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, CELL_SIZE, rotateOffset, computeCellSize } from './engine';
import { nowLocalIsoDate } from './stats';

// ─── 难度配置 ─────────────────────────────────────────

/**
 * 三档难度参数表。
 * 三维度同时拉开差距：
 *  - 字数（题库筛选）
 *  - 核心区占屏比（简单小、困难大 → 搜索空间越大，正解越难定位）
 *  - cardSize + holeSpread（卡片视觉解析难度）
 *
 * cardSize 必须奇数，否则镂空渲染与 getGridCellAtHole 会错位半格。
 */
export const DIFFICULTY_CONFIGS: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    level: 'easy', label: '简单',
    quoteLenMin: 4, quoteLenMax: 6,
    coreWidthRatio: 0.5, coreHeightRatio: 0.45,
    cardSize: 7, holeSpread: 0.55,
    timeLimitSec: 180,
  },
  medium: {
    level: 'medium', label: '中等',
    quoteLenMin: 7, quoteLenMax: 8,
    coreWidthRatio: 0.6, coreHeightRatio: 0.55,
    cardSize: 9, holeSpread: 0.8,
    timeLimitSec: 240,
  },
  hard: {
    level: 'hard', label: '困难',
    quoteLenMin: 9, quoteLenMax: 11,
    // 困难模式用 maximizeCore 把核心区铺到极限（横向 gridCols-2，纵向铺满安全带），
    // 不再依赖 ratio。coreWidthRatio/coreHeightRatio 仅作退化/排序参考。
    // 外围左右始终 ≥1 列、上下不压顶栏/道具栏（见 computeCoreAreaCells 的安全带）。
    coreWidthRatio: 0.85, coreHeightRatio: 0.65,
    cardSize: 11, holeSpread: 1.0,
    timeLimitSec: 300,
    maximizeCore: true,
  },
};

/**
 * 按名言字数选最贴近的难度档（自定义题试玩 / 捉迷藏出题用；字数落在某档范围内即用该档，否则 medium）。
 * 放此处（而非 App.tsx）以便纯逻辑层 hideSeek.ts 复用，避免 App ↔ hideSeek 循环依赖。
 */
export function pickDifficultyForQuote(len: number): DifficultyLevel {
  for (const d of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
    const cfg = DIFFICULTY_CONFIGS[d];
    if (len >= cfg.quoteLenMin && len <= cfg.quoteLenMax) return d;
  }
  return 'medium';
}

/**
 * 顶部 / 底部功能区域预留像素。核心区纵向不得侵入这两条带：
 *  - 顶部：安全区 + 顶栏（返回 / 计时 / 匹配徽章）
 *  - 底部：道具栏（60）+ 间隙 + 底栏（~76）+ 安全区
 * 否则困难模式核心区会向下顶到道具栏、被道具栏压住（mimo issue #2），或向上顶到顶栏按钮。
 */
export const TOP_RESERVE_PX = 108;
export const BOTTOM_RESERVE_PX = 198;

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 计算核心解密区在 grid 中的 cell 范围。三条硬约束（mimo issue #2 / #4）：
 *
 *  1. 左右对称：左/右非核心列数必须相等 → coreCols 与 gridCols 同奇偶。
 *     （coreCols 调整为同奇偶：优先缩 1 贴近 ratio，缩不到 minCoreCols 才放 1。）
 *  2. 困难模式（maximizeCore）铺满：横向取 gridCols-2（左右各 ≥1 列非核心区），
 *     纵向铺满安全带 [TOP_RESERVE, screenH-BOTTOM_RESERVE]。其它档位按 ratio 收敛，
 *     但同样受「左右对称」+「不压功能区」约束。
 *  3. 不越界：coreCols/coreRows 永不超过网格本身。极窄屏（gridCols < cardSize+4）下
 *     cardSize+2 的下限会让「≥1 列边距」几何上不可能——此时退回满宽/最小核心（仍对称、
     仍可解），是受限下的最优解。
 */
export function computeCoreAreaCells(
  gridCols: number,
  gridRows: number,
  config: DifficultyConfig,
  screenW: number,
  screenH: number,
  cellSize: number = CELL_SIZE,
): CoreAreaCells {
  const minCoreCols = config.cardSize + 2;
  const minCoreRows = config.cardSize + 2;
  const maximize = !!config.maximizeCore;

  // ── 横向列数 ──
  const marginCap = gridCols - 2; // 左右各留 ≥1 列的上限（与 gridCols 同奇偶 → 天然对称）
  const ratioCols = Math.floor((screenW * config.coreWidthRatio) / cellSize);
  let coreCols = maximize
    ? Math.max(minCoreCols, marginCap)
    : Math.max(minCoreCols, ratioCols);
  coreCols = Math.min(coreCols, gridCols); // 不越界
  // 左右对称：coreCols 与 gridCols 同奇偶
  if (((gridCols - coreCols) % 2 + 2) % 2 !== 0) {
    const dec = coreCols - 1;
    coreCols = dec >= minCoreCols && dec <= gridCols ? dec : Math.min(gridCols, coreCols + 1);
  }

  // ── 纵向行数（安全带：不压顶栏 / 道具栏+底栏）──
  const bandTopRow = clampInt(Math.ceil(TOP_RESERVE_PX / cellSize), 0, gridRows - 1);
  const bandBottomRow = clampInt(Math.floor((screenH - BOTTOM_RESERVE_PX) / cellSize), bandTopRow, gridRows - 1);
  const bandRows = bandBottomRow - bandTopRow + 1;
  const ratioRows = Math.floor((screenH * config.coreHeightRatio) / cellSize);
  let coreRows = maximize
    ? Math.max(minCoreRows, bandRows)
    : Math.max(minCoreRows, Math.min(bandRows, ratioRows));
  coreRows = Math.min(coreRows, gridRows); // 不越界

  // ── 居中：横向在整网格、纵向在安全带内（退化时夹回网格）──
  const col0 = Math.max(0, Math.floor((gridCols - coreCols) / 2));
  const row0 = clampInt(bandTopRow + Math.floor((bandRows - coreRows) / 2), 0, gridRows - coreRows);
  return { col0, row0, col1: col0 + coreCols - 1, row1: row0 + coreRows - 1 };
}

/**
 * 叠嶂（cube）立方体字面在矩形墙里的位置。
 *
 * cube 的 layout 是「全屏矩形网格」（gridCols × gridRows），立方体仍是 N×N×N 正方体（N = gridCols，
 * 纵向取居中一段）。立方体的 N×N 字面 = 矩形墙里居中的一段连续行 [faceRow0, faceRow0+N-1]；名言只在此
 * 字面行内盖印（见 generatePuzzleFromQuote 的 solRowRange），矩形其余行是 generateGrid 预填的随机字 →
 * 松手摊平后核心区呈「困难档那样的高矩形」：立方体方阵内容居中、上下用随机字补足成高矩形（用户诉求）。
 *
 * 纯函数：生成期与 GameScreen 用同一份 (gridCols, gridRows, coreArea)（均在 layout 内）算同一值 → 零漂移
 * （同 coreArea-in-layout 防漂移模式）。短屏兜底：核心带行数 < N（极端短屏）时退回整网格居中——可解性只
 * 依赖字面行本身（名言钳在字面行内、卡片钳在全带，二者交集非空即可解），不依赖字面是否完全落在带内。
 */
export function computeCubeFace(
  gridCols: number,
  gridRows: number,
  coreArea: CoreAreaCells,
): { faceRow0: number; n: number } {
  const n = gridCols; // 立方体正方体边长 = 屏宽格数；纵向在矩形墙取居中一段
  const bandRows = coreArea.row1 - coreArea.row0 + 1;
  const center = Math.round((gridRows - n) / 2); // 字面居中 ≈ 屏中，便于 3D 摊平→2D 淡入对齐
  const faceRow0 = bandRows >= n
    ? clampInt(center, coreArea.row0, coreArea.row1 - n + 1) // 带够高：字面在带内居中
    : Math.max(0, center); // 极端短屏：整网格居中
  return { faceRow0, n };
}

// ─── 名言库 ──────────────────────────────────────────

export const PUZZLE_LIBRARY: Puzzle[] = [
  // 名人名言
  { id: 'q01', quote: '千里之行始于足下', author: '老子', source: '道德经', category: '名人名言' },
  { id: 'q02', quote: '温故而知新', author: '孔子', source: '论语', category: '名人名言' },
  { id: 'q03', quote: '知己知彼百战不殆', author: '孙子', source: '孙子兵法', category: '名人名言' },
  { id: 'q04', quote: '志当存高远', author: '诸葛亮', source: '诫外生书', category: '名人名言' },
  { id: 'q05', quote: '业精于勤荒于嬉', author: '韩愈', source: '进学解', category: '名人名言' },
  { id: 'q06', quote: '锲而不舍金石可镂', author: '荀子', source: '劝学', category: '名人名言' },
  { id: 'q07', quote: '上善若水', author: '老子', source: '道德经', category: '名人名言' },
  { id: 'q08', quote: '厚德载物', author: '周文王', source: '周易', category: '名人名言' },
  { id: 'q09', quote: '天道酬勤', author: '古语', source: '尚书', category: '名人名言' },
  { id: 'q10', quote: '宁静致远', author: '诸葛亮', source: '诫子书', category: '名人名言' },
  { id: 'q11', quote: '大智若愚', author: '老子', source: '道德经', category: '名人名言' },
  { id: 'q12', quote: '学而不厌诲人不倦', author: '孔子', source: '论语', category: '名人名言' },
  { id: 'q13', quote: '敏而好学不耻下问', author: '孔子', source: '论语', category: '名人名言' },
  { id: 'q14', quote: '己所不欲勿施于人', author: '孔子', source: '论语', category: '名人名言' },
  { id: 'q15', quote: '三人行必有我师', author: '孔子', source: '论语', category: '名人名言' },
  { id: 'q16', quote: '人无远虑必有近忧', author: '孔子', source: '论语', category: '名人名言' },
  { id: 'q17', quote: '生于忧患死于安乐', author: '孟子', source: '孟子', category: '名人名言' },
  { id: 'q18', quote: '水至清则无鱼', author: '班固', source: '汉书', category: '名人名言' },
  { id: 'q19', quote: '路漫漫其修远兮', author: '屈原', source: '离骚', category: '名人名言' },
  { id: 'q20', quote: '天行健君子以自强不息', author: '周文王', source: '周易', category: '名人名言' },
  // 诗词歌赋
  { id: 'p01', quote: '床前明月光', author: '李白', source: '静夜思', category: '诗词歌赋' },
  { id: 'p02', quote: '春眠不觉晓', author: '孟浩然', source: '春晓', category: '诗词歌赋' },
  { id: 'p03', quote: '白日依山尽', author: '王之涣', source: '登鹳雀楼', category: '诗词歌赋' },
  { id: 'p04', quote: '海上生明月', author: '张九龄', source: '望月怀远', category: '诗词歌赋' },
  { id: 'p05', quote: '红豆生南国', author: '王维', source: '相思', category: '诗词歌赋' },
  { id: 'p06', quote: '人面桃花相映红', author: '崔护', source: '题都城南庄', category: '诗词歌赋' },
  { id: 'p07', quote: '山重水复疑无路', author: '陆游', source: '游山西村', category: '诗词歌赋' },
  { id: 'p08', quote: '柳暗花明又一村', author: '陆游', source: '游山西村', category: '诗词歌赋' },
  { id: 'p09', quote: '不识庐山真面目', author: '苏轼', source: '题西林壁', category: '诗词歌赋' },
  { id: 'p10', quote: '飞流直下三千尺', author: '李白', source: '望庐山瀑布', category: '诗词歌赋' },
  { id: 'p11', quote: '独在异乡为异客', author: '王维', source: '九月九日忆山东兄弟', category: '诗词歌赋' },
  { id: 'p12', quote: '举头望明月低头思故乡', author: '李白', source: '静夜思', category: '诗词歌赋' },
  { id: 'p13', quote: '大漠孤烟直长河落日圆', author: '王维', source: '使至塞上', category: '诗词歌赋' },
  { id: 'p14', quote: '停车坐爱枫林晚', author: '杜牧', source: '山行', category: '诗词歌赋' },
  { id: 'p15', quote: '春风又绿江南岸', author: '王安石', source: '泊船瓜洲', category: '诗词歌赋' },
  { id: 'p16', quote: '千山鸟飞绝万径人踪灭', author: '柳宗元', source: '江雪', category: '诗词歌赋' },
  { id: 'p17', quote: '接天莲叶无穷碧', author: '杨万里', source: '晓出净慈寺', category: '诗词歌赋' },
  { id: 'p18', quote: '姑苏城外寒山寺', author: '张继', source: '枫桥夜泊', category: '诗词歌赋' },
  // 书摘
  { id: 'b01', quote: '一个人可以被毁灭', author: '海明威', source: '老人与海', category: '书摘' },
  { id: 'b02', quote: '为你千千万万遍', author: '胡赛尼', source: '追风筝的人', category: '书摘' },
  { id: 'b03', quote: '人间不值得但你值得', author: '李诞', source: '笑场', category: '书摘' },
  { id: 'b04', quote: '世上有两样东西不可直视', author: '东野圭吾', source: '白夜行', category: '书摘' },
  { id: 'b05', quote: '从前的日色变得慢', author: '木心', source: '从前慢', category: '书摘' },
];

// ─── 随机填充字符池 ──────────────────────────────────

const FILLER_CHARS =
  '天地人和风雨山水花鸟鱼虫日月星辰春夏秋冬东西南北' +
  '金木火土心性情意道法自然命运生死爱恨喜怒哀乐' +
  '福禄寿喜财宝器物诗文书画琴棋酒茶梦觉幻真' +
  '光明暗影黑白红黄蓝绿大小高低远近深浅' +
  '快慢强弱新旧美善德信忠孝礼义廉耻勇智仁' +
  '慧思学问道术器用功夫力能力行止进退取舍' +
  '成败得失有无虚实动静升降开合收放藏露隐现浮沉' +
  '山川湖海江河溪泉峰谷岩崖松竹梅兰菊荷桃柳' +
  '笔墨纸砚碑帖印篆楷行草隶画诗词曲赋歌吟诵读' +
  '讲论辩议思考察观听视望顾回顾返往来进出入归去留';

// ─── PRNG ─────────────────────────────────────────────

export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 填充墙：rows×cols 全填 FILLER_CHARS（不盖印任何名言）。用于「叠嶂」3D 模式的非正解面 ——
 * 视觉上是一堵正常字墙，但名言不会完整出现，故 checkSolution 恒假。纯函数，rng 由调用方传入。
 */
export function generateFillerGrid(rows: number, cols: number, rng: () => number): string[][] {
  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = FILLER_CHARS[Math.floor(rng() * FILLER_CHARS.length)];
    }
  }
  return grid;
}

export { mulberry32 };

// ─── 卡片镂空生成 ────────────────────────────────────

function generateCardHoles(
  quoteLength: number,
  cardSize: number,
  holeSpread: number,
  rng: () => number,
): CardHole[] {
  const holes: CardHole[] = [];
  const half = Math.floor(cardSize / 2);
  // offset 取值范围 [-range, range]，受 holeSpread 控制：
  // spread 小 → 紧凑；spread = 1 → 铺满到卡片边缘内一格。
  // 上限 half-1 保证镂空不超出卡片边界。
  const range = Math.max(1, Math.min(half - 1, Math.floor(half * holeSpread)));
  const used = new Set<string>();

  for (let i = 0; i < quoteLength; i++) {
    let attempts = 0;
    while (attempts < 200) {
      const offsetX = Math.floor(rng() * (2 * range + 1)) - range;
      const offsetY = Math.floor(rng() * (2 * range + 1)) - range;
      const key = `${offsetX},${offsetY}`;
      if (!used.has(key)) {
        used.add(key);
        holes.push({ offsetX, offsetY });
        break;
      }
      attempts++;
    }
  }
  return holes;
}

/** 不规则卡片掩码 */
function generateCardMask(cardSize: number, holes: CardHole[], rng: () => number): boolean[][] {
  const mask: boolean[][] = [];
  const holeSet = new Set(holes.map(h => `${h.offsetX},${h.offsetY}`));
  const half = Math.floor(cardSize / 2);

  for (let dy = -half; dy <= half; dy++) {
    const row: boolean[] = [];
    for (let dx = -half; dx <= half; dx++) {
      const isCorner = Math.abs(dx) === half && Math.abs(dy) === half;
      const isEdge = Math.abs(dx) === half || Math.abs(dy) === half;
      const key = `${dx},${dy}`;

      if (holeSet.has(key)) {
        row.push(true);
      } else if (isCorner) {
        row.push(rng() > 0.5);
      } else if (isEdge) {
        row.push(rng() > 0.15);
      } else {
        row.push(true);
      }
    }
    mask.push(row);
  }
  return mask;
}

// ─── 网格生成 ────────────────────────────────────────

function generateGrid(
  rows: number,
  cols: number,
  quote: string,
  holes: CardHole[],
  solCol: number,
  solRow: number,
  solRot: number,
  rng: () => number,
  depth: number = 0,
): string[][] {
  const grid: string[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      grid[r][c] = FILLER_CHARS[Math.floor(rng() * FILLER_CHARS.length)];
    }
  }

  // 放置名言字符
  for (let i = 0; i < holes.length; i++) {
    const rot = rotateOffset(holes[i], solRot);
    const row = solRow + rot.offsetY;
    const col = solCol + rot.offsetX;
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      grid[row][col] = quote[i];
    }
  }

  // 验证其他旋转不意外匹配
  for (const rot of [0, 90, 180, 270]) {
    if (rot === solRot) continue;
    const chars = holes.map(h => {
      const r = rotateOffset(h, rot);
      const row = solRow + r.offsetY;
      const col = solCol + r.offsetX;
      return (row >= 0 && row < rows && col >= 0 && col < cols) ? grid[row][col] : '';
    });
    if (chars.join('') === quote) {
      // 罕见：重新生成（有深度上限，避免极端情况下无限递归 / 栈溢出）
      if (depth < 50) {
        return generateGrid(rows, cols, quote, holes, solCol, solRow, solRot, rng, depth + 1);
      }
      // 超过上限仍冲突：直接返回当前网格（接受极罕见的双解，优于崩溃）
      return grid;
    }
  }

  return grid;
}

// ─── 公开 API ────────────────────────────────────────

/**
 * 从题库随机选一道题。
 * @param excludeId 排除的题 id（避免重复）
 * @param difficulty 提供时只在该档字数范围内筛选
 */
export function getRandomQuote(excludeId?: string, difficulty?: DifficultyLevel): Puzzle {
  const cfg = difficulty ? DIFFICULTY_CONFIGS[difficulty] : null;
  const available = PUZZLE_LIBRARY.filter(p => {
    if (excludeId && p.id === excludeId) return false;
    if (cfg) {
      const len = p.quote.length;
      if (len < cfg.quoteLenMin || len > cfg.quoteLenMax) return false;
    }
    return true;
  });
  const pool = available.length > 0 ? available : PUZZLE_LIBRARY;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 生成每日题：日期 + 难度 联合作为种子，每档独立选题。
 * 同一日期不同难度 → 不同种子 → 不同题。
 */
export function generateDailyPuzzle(
  date?: string,
  difficulty: DifficultyLevel = 'medium',
  screenW?: number,
  screenH?: number,
  source: Puzzle[] = PUZZLE_LIBRARY,
): { puzzle: Puzzle; layout: PuzzleLayout } {
  const isoDate = date || nowLocalIsoDate();
  const config = DIFFICULTY_CONFIGS[difficulty];
  // 种子包含 difficulty，确保同一天不同难度是不同题
  const seed = Math.abs(hashCode(`${isoDate}|${difficulty}`));
  const rng = mulberry32(seed);

  // 在该难度字数范围内确定性选题（按 index 取，不取 random）。
  // source 默认内置库；App 可传入远程库（fetch 到的 data/quotes.json），缺省/兜底回退内置。
  const pool = source.filter(p => {
    const len = p.quote.length;
    return len >= config.quoteLenMin && len <= config.quoteLenMax;
  });
  const candidates = pool.length > 0 ? pool : source;
  const puzzle = candidates[seed % candidates.length];

  const sw = screenW || 375;
  const sh = screenH || 667;
  const cellSize = computeCellSize(sw);
  const gridCols = Math.floor(sw / cellSize);
  const gridRows = Math.floor(sh / cellSize);
  const coreArea = computeCoreAreaCells(gridCols, gridRows, config, sw, sh, cellSize);

  return generatePuzzleFromQuote(
    puzzle,
    config,
    coreArea,
    gridCols,
    gridRows,
    cellSize,
    mulberry32(seed + 12345),
  );
}

/**
 * 核心生成函数：按难度配置和核心区生成 puzzle+layout。
 *
 * cellSize 随结果写进 layout.cellSize / layout.coreArea，供 GameScreen 直接使用——
 * 不再让游戏端自行重算核心区（重算会因 cellSize / 首帧 Dimensions 漂移导致 play 核心
 * ≠ 生成核心 → 正解落在拖拽 clamp 之外 → 不可解）。见 PuzzleLayout.coreArea 注释。
 */
export function generatePuzzleFromQuote(
  puzzle: Puzzle,
  config: DifficultyConfig,
  coreArea: CoreAreaCells,
  gridCols: number = DEFAULT_GRID_COLS,
  gridRows: number = DEFAULT_GRID_ROWS,
  cellSize: number = CELL_SIZE,
  rng?: () => number,
  fixedHoles?: CardHole[],
  fixedRotation?: number,
  /**
   * 叠嶂用：把名言正解位姿的「行」额外钳在立方体 N×N 字面行 [min, max] 内（与核心区行约束求交）。
   * 缺省时不约束（classic/blind/probe/hide 行为不变）。列向由 coreArea 约束即可（字面 = 全宽）。
   * 配合 ±half 内缩：镂空 offset 幅度 ≤ half-1（holeSpread≤1），4 个旋转下恒成立 → 镂空严格落在字面行内。
   */
  solRowRange?: { min: number; max: number },
): { puzzle: Puzzle; layout: PuzzleLayout } {
  const rand = rng || mulberry32(hashCode(puzzle.id + puzzle.quote));
  const quoteLen = puzzle.quote.length;
  const cardSize = config.cardSize;

  // 捉迷藏：A 可指定镂空与正解旋转（fixedHoles / fixedRotation）；其余模式随机生成。
  // 阅读序不变式仍由下方 holesSorted 排序保证 —— 无论 A 怎么 tap，quote[i] 都落到
  // 该旋转下的第 i 个阅读位（A 只决定镂空几何，不决定哪个字进哪个孔）。
  const holes = fixedHoles ?? generateCardHoles(quoteLen, cardSize, config.holeSpread, rand);
  const mask = generateCardMask(cardSize, holes, rand);

  const half = Math.floor(cardSize / 2);
  // solCol/solRow 限制在核心区内（含 half 边距），保证卡片完整在核心区。
  // solRowRange（叠嶂）：再与立方体字面行求交，把名言行钳在字面内（缺省 -Infinity/Infinity → no-op）。
  const minC = Math.max(0, coreArea.col0 + half);
  const maxC = Math.min(gridCols - 1, coreArea.col1 - half);
  const minR = Math.max(0, coreArea.row0 + half, solRowRange ? solRowRange.min + half : -Infinity);
  const maxR = Math.min(gridRows - 1, coreArea.row1 - half, solRowRange ? solRowRange.max - half : Infinity);
  const spanC = Math.max(1, maxC - minC + 1);
  const spanR = Math.max(1, maxR - minR + 1);

  const solCol = minC + Math.floor(rand() * spanC);
  const solRow = minR + Math.floor(rand() * spanR);
  const rotations = [0, 90, 180, 270];
  const solRot = fixedRotation != null ? fixedRotation : rotations[Math.floor(rand() * rotations.length)];

  // 核心不变量：正解态下透过镂空按网格阅读顺序（row 升序、col 升序）
  // 读出的字符串必须等于 quote。因此按 rotateOffset(h, solRot) 的
  // (offsetY, offsetX) 升序排列 holes，使 quote[i] 恰好落在第 i 个阅读位。
  // 排序在 generateCardMask 之后执行，不消耗 PRNG，镂空位置集合不变，
  // 每日确定性与唯一解验证均不受影响。
  const holesSorted = [...holes].sort((a, b) => {
    const ra = rotateOffset(a, solRot);
    const rb = rotateOffset(b, solRot);
    if (ra.offsetY !== rb.offsetY) return ra.offsetY - rb.offsetY;
    return ra.offsetX - rb.offsetX;
  });

  const grid = generateGrid(gridRows, gridCols, puzzle.quote, holesSorted, solCol, solRow, solRot, rand);

  return {
    puzzle,
    layout: {
      grid, gridRows, gridCols,
      cardShape: { size: cardSize, holes: holesSorted, mask },
      solutionPosition: { col: solCol, row: solRow },
      solutionRotation: solRot,
      // 随 layout 持久化：GameScreen 直接用，杜绝重算漂移（见上方注释 / PuzzleLayout.coreArea）
      coreArea,
      cellSize,
    },
  };
}

export function loadPuzzles(
  days: number = 30,
  difficulty: DifficultyLevel = 'medium',
  screenW?: number,
  screenH?: number,
  source: Puzzle[] = PUZZLE_LIBRARY,
): Array<{ puzzle: Puzzle; layout: PuzzleLayout; date: string }> {
  const result: Array<{ puzzle: Puzzle; layout: PuzzleLayout; date: string }> = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const isoDate = nowLocalIsoDate(d);
    try {
      result.push({ ...generateDailyPuzzle(isoDate, difficulty, screenW, screenH, source), date: isoDate });
    } catch { break; }
  }
  return result;
}

// ─── 模式（盲人摸象 / 投石问路）──────────────────────────

/**
 * 盲人摸象 / 投石问路 模式的固定倒计时（3 分钟）。
 * 两种模式固定使用 medium 的卡片/字数，但核心区采用「困难」档的大小（更大搜索空间），
 * 配合更短的 3 分钟限时，作为高难度的附加挑战。
 * GameScreen / BookmarkCard 据此计算倒计时与用时占比，避免在 layout 里塞冗余字段。
 */
export const MODE_TIME_LIMIT_SEC = 180;

/**
 * 盲人摸象：从 N 个镂空中确定性选出约一半作为「盲孔」索引集（已排序）。
 * 用独立 PRNG（与布局 PRNG 解耦）保证同一题/日期 → 同一盲孔集，可复现。
 * 选 floor(N/2) 个，N≤1 时退化为空（不盲）。
 */
export function deriveBlindedHoles(holeCount: number, rng: () => number): number[] {
  if (holeCount <= 1) return [];
  const indices = Array.from({ length: holeCount }, (_, i) => i);
  // Fisher–Yates 洗牌（用传入的确定性 rng）
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  const count = Math.max(0, Math.floor(holeCount / 2));
  return indices.slice(0, count).sort((a, b) => a - b);
}

/**
 * 为某题派生盲孔索引集（确定性，仅盲人摸象模式用）。
 * 内部封装 mulberry32，GameScreen 无需关心 PRNG。同一题恒得同一盲孔集。
 */
export function getBlindedHolesForPuzzle(puzzleId: string, holeCount: number): number[] {
  const seed = Math.abs(hashCode(`${puzzleId}|blind`));
  return deriveBlindedHoles(holeCount, mulberry32(seed));
}

/**
 * 生成「模式题」：盲人摸象 / 投石问路 用 medium 的卡片/字数 + 困难档的核心区大小 + 3 分钟倒计时；
 * classic 退化为普通每日题（按当前难度）。
 *
 * 每日确定性：mode + date + medium 联合种子 → 同一日期/模式恒生成同一题。
 * 与常规每日题（`${date}|${difficulty}`）种子不同，故三种模式各有独立的「今日题」。
 *
 * @param blindedHolesRng 盲孔派生用 rng（仅 blind 模式用）；不传则内部按种子派生。
 */
export function generateModePuzzle(
  mode: GameMode,
  date?: string,
  screenW?: number,
  screenH?: number,
  source: Puzzle[] = PUZZLE_LIBRARY,
): { puzzle: Puzzle; layout: PuzzleLayout } {
  if (mode === 'classic') {
    return generateDailyPuzzle(date, 'medium', screenW, screenH, source);
  }
  const isoDate = date || nowLocalIsoDate();
  const config = mode === 'cube' ? DIFFICULTY_CONFIGS.hard : DIFFICULTY_CONFIGS.medium;
  // 种子含 mode，确保 blind / probe / classic 三种「今日题」互不相同
  const seed = Math.abs(hashCode(`${isoDate}|${mode}|medium`));

  // 在该模式字数范围内确定性选题（source 默认内置库，可由 App 传入远程库）
  const pool = source.filter(p => {
    const len = p.quote.length;
    return len >= config.quoteLenMin && len <= config.quoteLenMax;
  });
  const candidates = pool.length > 0 ? pool : source;
  const puzzle = candidates[seed % candidates.length];

  const sw = screenW || 375;
  const sh = screenH || 667;
  const cellSize = computeCellSize(sw);
  if (mode === 'cube') {
    // 叠嶂：全屏矩形网格（gridCols × gridRows）+ 困难档全带核心区 → 松手摊平后核心区是「困难那样的高矩形」。
    // 立方体仍是 N×N×N 正方体（N = gridCols），其 N×N 字面 = 矩形墙居中一段连续行 [faceRow0, faceRow0+N-1]；
    // 名言只在此字面行内盖印（solRowRange），矩形其余行是 generateGrid 预填随机字 → 方阵内容居中、上下随机字补足成高矩形。
    // 详见 computeCubeFace / voxelFaces / voxelHtml。
    const gridCols = Math.floor(sw / cellSize);
    const gridRows = Math.floor(sh / cellSize);
    const coreArea = computeCoreAreaCells(gridCols, gridRows, config, sw, sh, cellSize);
    const { faceRow0, n } = computeCubeFace(gridCols, gridRows, coreArea);
    return generatePuzzleFromQuote(
      puzzle, config, coreArea, gridCols, gridRows, cellSize,
      mulberry32(seed + 12345),
      undefined, undefined,
      { min: faceRow0, max: faceRow0 + n - 1 },
    );
  }
  const gridCols = Math.floor(sw / cellSize);
  const gridRows = Math.floor(sh / cellSize);
  // 核心区用「困难」档大小（maximizeCore 铺满安全带 → 更大搜索空间），
  // 但卡片 / 字数仍用 medium（config）。配合 3 分钟限时，构成高难度附加挑战。
  const coreArea = computeCoreAreaCells(gridCols, gridRows, DIFFICULTY_CONFIGS.hard, sw, sh, cellSize);

  return generatePuzzleFromQuote(
    puzzle,
    config,
    coreArea,
    gridCols,
    gridRows,
    cellSize,
    mulberry32(seed + 12345),
  );
}
