// 字垣（WordWall）— 探险小虎队风格解密卡游戏
// 核心类型定义

/** 一道谜题 */
export interface Puzzle {
  id: string;
  /** 被隐藏的名言/诗句 */
  quote: string;
  /** 作者 */
  author: string;
  /** 来源（书名/篇名） */
  source: string;
  /** 分类 */
  category: PuzzleCategory;
}

export type PuzzleCategory = '名人名言' | '诗词歌赋' | '书摘';

/** 卡片上一个镂空的位置（相对于卡片中心的网格偏移） */
export interface CardHole {
  offsetX: number; // 列偏移（正=右）
  offsetY: number; // 行偏移（正=下）
}

/** 解密卡的形状定义 */
export interface CardShape {
  /** 卡片边长（网格单元数，正方形） */
  size: number;
  /** 镂空位置列表，长度 = quote.length */
  holes: CardHole[];
  /** 卡片轮廓（不规则形状掩码，size×size） */
  mask?: boolean[][];
}

/** 完整的谜题布局 */
export interface PuzzleLayout {
  /** 字符网格 */
  grid: string[][];
  /** 网格行数 */
  gridRows: number;
  /** 网格列数 */
  gridCols: number;
  /** 解密卡形状 */
  cardShape: CardShape;
  /** 解密卡中心在网格中的位置（列, 行） */
  solutionPosition: { col: number; row: number };
  /** 正确旋转角度（0/90/180/270） */
  solutionRotation: number;
  /**
   * 生成时用的核心解密区（cell 坐标）。GameScreen 必须直接使用此值，**不得重算**。
   *
   * 为何随 layout 持久化：生成期把正解钳在 [col0+half, col1-half]；可解的充要条件是
   * 游戏期拖拽 clamp 的可达 cell 范围与之**完全相同**。早期 GameScreen 自行重算核心区，
   * 一度漏传 cellSize（默认 28，而窄屏实为 20）→ 核心 cell 数比生成期小 → 正解落在
   * clamp 之外 → 不可解；即使补传 cellSize，App 挂载时 Dimensions 的首帧/旋转过渡值
   * 仍可能让重算用的 screenW 偏离生成期 → 同样不可解。把生成期核心区直接存进 layout，
   * 两个漂移源都被结构性消除（见 engine.test.ts「生成核心区 == 游戏核心区」回归）。
   */
  coreArea: CoreAreaCells;
  /**
   * 生成时用的格子像素大小（自适应：窄屏 20、桌面 28）。GameScreen 渲染必须用此值，
   * 保证网格/卡片像素尺寸与生成期一致，避免 Dimensions 首帧/旋转漂移。
   */
  cellSize: number;
}

/** 游戏运行时状态 */
export interface GameState {
  puzzle: Puzzle;
  layout: PuzzleLayout;
  /** 当前卡片中心像素 X */
  cardPixelX: number;
  /** 当前卡片中心像素 Y */
  cardPixelY: number;
  /** 当前旋转角度 */
  rotation: number;
  /** 是否已完成 */
  isComplete: boolean;
  /** 开始时间戳 */
  startTime: number;
  /** 完成用时（ms） */
  elapsedTime: number;
}

/**
 * 单局完成记录 —— 历史档案 / 书签分享 / 统计数据来源。
 * 每次解出一题生成一条，追加到 PlayerProgress.history。
 */
export interface GameRecord {
  /** ISO 日期，如 2026-06-14 */
  date: string;
  /** 谜题 id */
  puzzleId: string;
  /** 名言全文（书签展示用） */
  quote: string;
  author: string;
  source: string;
  category: PuzzleCategory;
  /** 完成时的难度档位 */
  difficulty: DifficultyLevel;
  /** 本局模式（缺省=classic，旧存档兼容） */
  mode?: GameMode;
  /** 解题用时（秒） */
  timeSec: number;
  /** 本局使用的道具数（0-3） */
  powerupsUsed: number;
  /** 本局使用「提示字」次数 */
  hintsUsed: number;
  /** 本局旋转次数 */
  rotations: number;
  /** 是否纯解（未用任何道具） */
  pureSolve: boolean;
  /** 完成时刻（epoch ms） */
  completedAt: number;

  // ─── 书签「指纹」用：解密卡形状 + 正解角度（书签据此生成二维码式指纹块）───
  // 全部可选：旧存档无这些字段，书签会走 synthesizeFingerprintInput 兜底。
  /** 解密卡镂空（相对卡片中心） */
  cardHoles?: CardHole[];
  /** 解密卡边长（网格单元） */
  cardSize?: number;
  /** 正解旋转角度（0/90/180/270） */
  solutionRotation?: number;
}

/** 一局游戏的结算结果（GameScreen → App） */
export interface GameResult {
  /** 解题用时（秒） */
  timeSec: number;
  /** 使用道具数 */
  powerupsUsed: number;
  /** 使用提示字次数 */
  hintsUsed: number;
  /** 旋转次数 */
  rotations: number;
  /** 是否纯解 */
  pureSolve: boolean;
  /** 本局模式（缺省=classic，旧存档兼容） */
  mode?: GameMode;

  // ─── 书签「指纹」用：GameScreen 把正解卡面信息一并带上，存入历史记录 ───
  /** 解密卡镂空（相对卡片中心） */
  cardHoles?: CardHole[];
  /** 解密卡边长（网格单元） */
  cardSize?: number;
  /** 正解旋转角度（0/90/180/270） */
  solutionRotation?: number;
}

/**
 * 玩家综合统计。
 *
 * 关键修复：所有「最佳用时」类字段使用 `number | null`（null = 尚无记录）。
 * 旧版用 Infinity 作为「无记录」哨兵，但 JSON.stringify(Infinity) === 'null'，
 * 存盘后再读回变成 null，Math.min(null, t) 又把 null 强转为 0，导致 bestTime 永久变 0。
 * 改用 null 既能在 JSON 中正确往返，也避免任何数值歧义。
 */
export interface PlayerProgress {
  /** 已完成的日期（ISO）去重列表 */
  completedDates: string[];
  /** 当前连续天数 */
  streak: number;
  /** 史上最长连续天数 */
  bestStreak: number;
  /** 最近一次完成日期（ISO） */
  lastPlayDate: string;
  /** 全难度最快用时（秒）；null = 尚无记录 */
  bestTime: number | null;
  /** 各难度最快用时（秒）；null = 该难度尚无记录 */
  bestTimeByDifficulty: Record<DifficultyLevel, number | null>;
  /** 总完成题数（= completedDates.length，冗余字段便于展示） */
  totalCompleted: number;
  /** 各难度完成题数 */
  completionsByDifficulty: Record<DifficultyLevel, number>;
  /** 各分类完成题数 */
  completionsByCategory: Record<PuzzleCategory, number>;
  /** 各模式完成题数（classic/blind/probe）；盲人摸象 / 投石问路 成就用 */
  completionsByMode: Record<GameMode, number>;
  /** 各模式最快用时（秒）；null = 该模式尚无记录 */
  bestTimeByMode: Record<GameMode, number | null>;
  /**
   * 每日「附加题」（盲人摸象 / 投石问路）完成标记，按日期索引。
   * classic 每日完成走 completedDates；blind / probe 作为独立附加题，
   * 完成后在此按结算日记录，供日历角点、首页「已完成」状态、再次进入查看正解使用。
   * 日期 ISO → { blind, probe }。
   */
  bonusByDate: Record<string, { blind: boolean; probe: boolean }>;
  /** 累计游玩时长（秒） */
  totalPlayTimeSec: number;
  /** 累计旋转次数 */
  totalRotations: number;
  /** 累计使用道具次数 */
  totalPowerupsUsed: number;
  /** 累计使用提示字次数 */
  totalHintsUsed: number;
  /** 纯解（零道具）次数 */
  pureSolves: number;
  /** 解锁过的不同谜题 id（去重） */
  uniqueQuotes: string[];
  /** 完整历史档案（按时间倒序，最新在前；上限 200 条防膨胀） */
  history: GameRecord[];
  /** 已解锁成就 id */
  unlockedAchievements: string[];
  /** 数据结构版本，便于将来迁移 */
  schemaVersion: number;
}

/** 游戏设置 */
export interface GameSettings {
  soundEnabled: boolean;
  hapticEnabled: boolean;
  /** 当前难度档位（普通玩家固定 medium，开发者模式可切换） */
  difficulty: DifficultyLevel;
}

/** 难度档位 */
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/**
 * 游戏模式（与难度正交）。
 * - classic：常规模式，镂空逐字揭示 + 单孔变绿（既有行为）。
 * - blind（盲人摸象）：约一半镂空被「涂黑」——盲孔匹配只变绿不显字，全句解出才显字。
 * - probe（投石问路）：镂空显示字但不标单个对错；有任一字对上时全部边框统一变绿，
 *   左上角显示绿色数字徽章 = 当前对字数。
 * - hide（捉迷藏）：双人·同设备轮流玩。A 自定义出题（句子 / 镂空 / 正解角度 / 每局时长），
 *   B 按 classic 渲染解题；不计入任何统计 / 成就（App.handleComplete 对 hide 提前返回）。
 *
 * blind / probe 固定使用 medium 的卡片/字数，但核心区采用 hard 档大小，倒计时 3 分钟（180s，见 puzzleGenerator.MODE_TIME_LIMIT_SEC）。
 */
export type GameMode = 'classic' | 'blind' | 'probe' | 'hide';

/** 难度档位配置：决定字数范围、核心区大小、卡片大小、镂空散度 */
export interface DifficultyConfig {
  level: DifficultyLevel;
  /** 中文显示名 */
  label: string;
  /** 名言字数范围（含两端） */
  quoteLenMin: number;
  quoteLenMax: number;
  /** 核心解密区占屏幕宽的比例 (0-1) */
  coreWidthRatio: number;
  /** 核心解密区占屏幕高的比例 (0-1) */
  coreHeightRatio: number;
  /** 解密卡边长（cell 数，必须奇数） */
  cardSize: number;
  /** 镂空散度 (0-1)，控制 offset 范围占卡片半径的比例 */
  holeSpread: number;
  /** 倒计时秒数（简单 180 / 中等 240 / 困难 300） */
  timeLimitSec: number;
  /**
   * 困难模式专用：是否把核心区铺到屏幕安全区的极限。
   * - 横向铺到 gridCols-2（左右各保留 ≥1 列非核心区）
   * - 纵向铺满「不压功能区（顶栏 / 道具栏 + 底栏）」的安全带
   * 其它档位按 ratio 收敛。详见 computeCoreAreaCells。
   */
  maximizeCore?: boolean;
}

/** 核心解密区在 grid 中的 cell 范围（生成时约束 solCol/solRow） */
export interface CoreAreaCells {
  col0: number;
  row0: number;
  col1: number;
  row1: number;
}

/** 单个格子的样式信息（用于渲染文字墙的视觉多样性） */
export interface CellStyle {
  fontWeight: 'normal' | 'bold' | '300' | '500' | '700' | '900';
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
}

/** 收藏的名言 */
export interface FavoriteQuote {
  id: string;
  quote: string;
  author: string;
  source: string;
  category: PuzzleCategory;
  savedAt: number;
}

/** 开发者模式状态（仅内存，不持久化） */
export interface DevModeState {
  enabled: boolean;
  showAnswer: boolean;
}

// ─── 成就系统 ──────────────────────────────────────────

export type AchievementCategory =
  | 'milestone' // 里程碑（完成题数）
  | 'streak'    // 连续天数
  | 'speed'     // 速度
  | 'purity'    // 纯解（零道具）
  | 'collection'// 收集（分类 / 不同题 / 收藏）
  | 'mastery'   // 精通（难度 / 时长）
  | 'special';  // 特殊

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/** 成就判定时需要的额外上下文（PlayerProgress 之外的实时状态，如收藏数） */
export interface AchievementContext {
  favoritesCount: number;
}

/** 一项成就定义 */
export interface Achievement {
  id: string;
  /** 成就名（中文，展示用） */
  name: string;
  /** 描述 */
  desc: string;
  category: AchievementCategory;
  tier: AchievementTier;
  /** Ionicons 图标名（由 @expo/vector-icons 渲染） */
  icon: string;
  /** 当前进度值（与 target 比较判断是否解锁） */
  progress: (stats: PlayerProgress, ctx: AchievementContext) => number;
  /** 解锁阈值 */
  target: number;
  /** 额外判定（如速度成就的「≤阈值」）。给出时优先于 progress>=target */
  customCheck?: (stats: PlayerProgress, ctx: AchievementContext) => boolean;
  /** 自定义进度文案（如速度成就显示「最佳 58s / ≤60s」） */
  displayValue?: (stats: PlayerProgress, ctx: AchievementContext) => string;
}
