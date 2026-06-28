import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  TouchableOpacity,
  StatusBar,
  Animated,
  Platform,
  Easing,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TextGrid, buildCellStyles } from '../components/TextGrid';
import { Puzzle, PuzzleLayout, DevModeState, DifficultyLevel, GameResult, GameMode } from '../game/types';
import { DIFFICULTY_CONFIGS, hashCode, computeCoreAreaCells, MODE_TIME_LIMIT_SEC, mulberry32 } from '../game/puzzleGenerator';
import { generateVoxelFaces } from '../game/voxelFaces';
import { VoxelPileView, VoxelPileViewHandle } from '../components/VoxelPileView';
import {
  computeCellSize,
  pixelToGrid,
  getRevealedChars,
  getHoleMatches,
  checkSolution,
  rotateOffset,
  computeShrunkCore,
  generatePerimeterStyle,
} from '../game/engine';
import { nowLocalIsoDate } from '../game/stats';
import { BookmarkData } from '../components/BookmarkCard';
import { DevConsole } from '../components/DevConsole';
import { Celebration } from '../components/Celebration';
import { soundManager } from '../utils/soundManager';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { CONFIG } from '../config';

// 外围磨砂遮罩的通用背景色（实色；字符微烁方案下为静态透明度）
const PERIMETER_MASK_BG = { backgroundColor: 'rgb(26, 22, 18)' };
// 外围「字符微烁」分组数：把外围字符按空间哈希分成 N 组，每组一个 native opacity 明灭动画。
// 分组（而非逐字）是为了把并发动画从数百压到 ~10，保证流畅。
const TWINKLE_GROUPS = 10;
// web 端 CSS @keyframes 名：外围微烁的 opacity 动画在浏览器合成线程跑，不占 JS 主线程
const TWINKLE_KEYFRAMES = 'ziyuanTwk';

// 盲人摸象：所有镂空「不透明褐色」盖住后方文字（黑色与金色调不搭；改用与镂空边框同色系的不透明褐）。
// 匹配则不透明绿（仍不显字，仅表「位置对上了」），全句解出后才揭晓文字。
// 关键：classic 用半透明 matchBg 是因为镂空要显字；盲模式镂空永不显字，必须不透明，否则墙字会透出。
const BLIND_HOLE_BG = 'rgb(200, 169, 110)';   // 不透明褐（与镂空边框同色系），盖住墙字
const BLIND_HOLE_BORDER = 'rgba(200, 169, 110, 0.22)';
const BLIND_MATCH_BG = 'rgb(76, 175, 80)';    // 不透明绿（盖住墙字，仅表「对上了」）

// 2×2 角度选择块的四象限视觉顺序（顺时针）：左上=0°、右上=90°、左下=270°、右下=180°。
// 渲染按此数组顺序铺成 2 行 2 列（前两个在上行，后两个在下行）。
const ANGLE_QUADS = [0, 90, 270, 180];

// 移动逐格振动的最小间隔（ms）：滑过字墙时每跨入一个新格子触发一次「选择」触感，
// 但给触感马达留恢复时间，避免快速拖动时连成一片嗡嗡声。慢拖→逐格都能响；快拖→节流降频。
const HAPTIC_CELL_MIN_MS = 45;

interface GameScreenProps {
  puzzle: Puzzle;
  layout: PuzzleLayout;
  onComplete: (result: GameResult) => void;
  onBack: () => void;
  devMode: DevModeState;
  isFavorite: boolean;
  onRegenerate: (mode: GameMode) => void;
  onToggleFavorite: () => void;
  onToggleShowAnswer: () => void;
  /** dev：题库上一题 / 下一题（模式感知） */
  onCycleQuote: (dir: -1 | 1, mode: GameMode) => void;
  /** dev：切换难度（立即生效） */
  onChangeDifficulty: (level: DifficultyLevel) => void;
  /** 触发全局书签分享（完成弹窗 / 查看模式均可调用） */
  onShareBookmark: (data: BookmarkData) => void;
  /** 开发者：打开题库管理页 */
  onOpenLibrary: () => void;
  /** 查看模式：今日已完成，进入即显示正解，禁止移动卡片 */
  viewOnly: boolean;
  /** 当前难度档位（用于计算核心解密区） */
  difficulty: DifficultyLevel;
  /** 游戏模式（classic/blind/probe/hide）；缺省 classic */
  mode?: GameMode;
  /** 捉迷藏：出题人 A 设定的每局时长（秒）；null/0=不限（向上计时、永不判失败）。仅 mode='hide' 生效 */
  hideTimeLimitSec?: number | null;
}

export const GameScreen: React.FC<GameScreenProps> = ({
  puzzle,
  layout,
  onComplete,
  onBack,
  devMode,
  isFavorite,
  onRegenerate,
  onToggleFavorite,
  onToggleShowAnswer,
  onCycleQuote,
  onChangeDifficulty,
  onShareBookmark,
  onOpenLibrary,
  viewOnly,
  difficulty,
  mode = 'classic',
  hideTimeLimitSec,
}) => {
  const { grid, gridRows, gridCols, cardShape, solutionPosition, solutionRotation, coreArea: layoutCoreArea, cellSize: layoutCellSize } = layout;
  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
  // cellSize 与 coreArea 都直接取自 layout（生成期算好），GameScreen 不再重算——
  // 重算会因 cellSize / Dimensions 首帧漂移导致 play 核心 ≠ 生成核心、正解落在拖拽 clamp 外（不可解）。
  // 见 PuzzleLayout.coreArea 注释 + engine.test.ts「生成核心区 == 游戏核心区」回归。
  // 兜底（?? 重算）：仅当 layout 是 Fast Refresh 残留的旧缓存（缺这两字段）时才走，避免热重载
  // NaN 崩溃；正式挂载生成的 layout 必带，走快路径。按下 `r` 全量重载后此分支永不触发。
  const cellSize = layoutCellSize ?? computeCellSize(screenW);
  const cardPixelSize = cardShape.size * cellSize;
  const halfCard = cardPixelSize / 2;
  // 卡片坐标系 Y 原点（cube 现为全屏矩形墙，Y 原点恒 0；保留 ref 供 PanResponder/tryCheck 闭包同步读取）
  const gridOriginYRef = useRef(0);
  gridOriginYRef.current = 0;

  // 安全区 insets（刘海/底部 home 条）；web 上为 0
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top + 12, 44);
  const safeBottom = Math.max(insets.bottom + 12, 24);
  // 屏幕焦点：离开 Game（回首页等）时 isFocused=false。
  // 关键修复（mimo issue #3）：倒计时 setInterval 在屏幕不可见 / App 后台时仍会滴答，
  // 到 30s/10s 就吹口哨——用户明明已不在对局却听到倒计时警告。
  // useIsFocused 只覆盖「导航失焦」，不覆盖「App 切后台」（按 Home / 切应用）——
  // 而后者正是用户最可能的复现场景。故用 useIsFocused ∩ AppState==='active' 作「活跃」门控：
  // 不活跃时停掉计时（remaining 冻结、不响警告），重新活跃时从冻结值续上。
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  const isActive = isFocused && appActive;
  const gridW = gridCols * cellSize;
  const gridH = gridRows * cellSize;
  const gridOffsetX = Math.max(0, (screenW - gridW) / 2);
  const halfGrid = Math.floor(cardShape.size / 2);

  // ─── 道具系统状态（先于 clampToCore，因 activeCore 依赖 shrunkCore） ─────
  // shrink: 缩小核心区 10%（含 solutionPosition）
  // reveal: 高亮 quote 中一个随机字在文字墙所有出现位置
  // eliminate: 排除一个不正确角度（在 2×2 角度选择块中随机禁用一个错误角度）
  const [powerups, setPowerups] = useState({ shrink: false, reveal: false, eliminate: false });
  // 角度选择块中被道具「排除角度」禁用的角度集合（0/90/180/270 中的若干）。仅禁用「错误」角度，正解恒可选。
  const [disabledAngles, setDisabledAngles] = useState<number[]>([]);
  const disabledAnglesRef = useRef<number[]>([]);
  disabledAnglesRef.current = disabledAngles;
  // 排除角度道具的「已触发」同步标记：powerupsRef 只在 commit 后更新，同帧双击会双重放行；
  // 用 ref 在触发瞬间置位，保证一次性语义。重置于换题 / 重试。
  const eliminateFiredRef = useRef(false);
  const [revealedChar, setRevealedChar] = useState<string | null>(null);
  // 道具 1 触发后的新核心区（屏幕像素坐标）；null = 用原 coreArea
  const [shrunkCore, setShrunkCore] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ─── 核心解密区（屏幕像素坐标，已对齐 cellSize） ───────
  // 卡片只能在此区域内活动；正解也只在此区域内。外围渲染磨砂遮罩。
  // cells 直接取自 layout.coreArea（生成期算好），不重算——保证 play 核心 == 生成核心，
  // 正解恒落在拖拽 clamp 可达范围内（可解性闭环）。见 PuzzleLayout.coreArea。
  // （layoutCoreArea 缺失时兜底重算，仅 Fast Refresh 旧缓存会走，见上方说明。）
  const coreCellsLayout = layoutCoreArea ?? computeCoreAreaCells(gridCols, gridRows, DIFFICULTY_CONFIGS[difficulty], screenW, screenH, cellSize);
  const { coreX, coreY, coreW, coreH } = useMemo(() => ({
    coreX: gridOffsetX + coreCellsLayout.col0 * cellSize,
    // 核心区 = 困难档全带（cube 现为全屏矩形墙、Y 原点 0；卡片 / 磨砂 / 金框包围整个高矩形）
    coreY: coreCellsLayout.row0 * cellSize,
    coreW: (coreCellsLayout.col1 - coreCellsLayout.col0 + 1) * cellSize,
    coreH: (coreCellsLayout.row1 - coreCellsLayout.row0 + 1) * cellSize,
  }), [coreCellsLayout, gridOffsetX, cellSize]);

  // activeCore：道具 1 触发后用 shrunkCore，否则用原 coreArea。
  // 拆出原子值作为 clampToCore 依赖，避免对象引用变化导致每帧重建。
  const activeCore = shrunkCore ?? { x: coreX, y: coreY, w: coreW, h: coreH };
  const acX = activeCore.x, acY = activeCore.y, acW = activeCore.w, acH = activeCore.h;

  // 道具栏纵向位置：核心区不高时贴底（默认美观位）；核心区过高（困难模式）时贴核心下沿。
  // 但钳到「不压底栏」——宁可让道具栏盖住核心区底部几格（卡片仍可从别处抓取拖动，不影响可解性），
  // 也绝不挡住底栏的旋转按钮（刚需）。修复 cellSize 后核心区变高（play 核心 == 生成核心），
  // 旧逻辑会把道具栏挤进底栏压住旋转键，故加此钳制。
  const POWERUP_BOTTOM_DEFAULT = 124;
  const POWERUP_H = 60;
  const bottomBarTop = screenH - safeBottom - 76; // 底栏顶端（paddingTop 12 + 内容高 64）
  const maxPowerupTop = bottomBarTop - POWERUP_H - 4; // 不压底栏的上限
  const defaultPowerupTop = screenH - POWERUP_BOTTOM_DEFAULT - POWERUP_H;
  const desiredPowerupTop = Math.max(defaultPowerupTop, acY + acH + 6); // 不低于核心下沿
  const powerupTopPx = Math.min(desiredPowerupTop, maxPowerupTop);

  // ─── 外围「字符微烁」动效（与核心区静止文字形成对比） ─────
  // 设计：外围字符按空间哈希分 TWINKLE_GROUPS 组，每组一个 native opacity 明灭循环
  // （周期不同 → 自然错相，像浮尘各自明灭）。拖拽时经 animControlRef 暂停所有明灭，省帧 + 避免视觉干扰。
  // 外围「字符微烁」：每组字符一个 native opacity 动画，交错明灭（替代旧的微抖动+呼吸）。
  // 初值散开（0.45..0.95），避免起步时各组同步亮起。
  const twinkleValues = useRef(
    Array.from({ length: TWINKLE_GROUPS }, (_, k) => new Animated.Value(0.45 + (k / TWINKLE_GROUPS) * 0.5)),
  ).current;

  // PanResponder 通过此 ref 暂停/恢复外围动画（拖拽时停掉明灭，省帧 + 避免视觉干扰）
  const animControlRef = useRef<{ pause: () => void; resume: () => void }>({
    pause: () => {},
    resume: () => {},
  });

  // 每个明灭层的周期/相位（native Animated 与 web CSS @keyframes 共用同一份配置）
  const twinkleLayerCfg = useMemo(
    () => Array.from({ length: TWINKLE_GROUPS }, (_, k) => {
      const dur = 3200 + (k % 5) * 650; // 3.2s..5.8s（错相周期）
      return { dur, delay: -Math.round((k / TWINKLE_GROUPS) * dur) }; // 负延迟 → 起步即错相
    }),
    [],
  );

  // native：每组一个 native opacity 明灭循环（合成线程），拖拽时暂停。
  // web 跳过——改用 CSS @keyframes（下方注入），opacity 在浏览器合成线程跑、零主线程开销。
  useEffect(() => {
    if (Platform.OS !== 'web') {
      let loops: Animated.CompositeAnimation[] = [];
      const buildAll = () => {
        loops.forEach((l) => l.stop());
        loops = [];
        for (let k = 0; k < TWINKLE_GROUPS; k++) {
          const v = twinkleValues[k];
          const dur = twinkleLayerCfg[k].dur;
          const loop = Animated.loop(
            Animated.sequence([
              Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(v, { toValue: 0.45, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
          );
          loop.start();
          loops.push(loop);
        }
      };
      buildAll();
      animControlRef.current = {
        pause: () => loops.forEach((l) => l.stop()),
        resume: () => buildAll(),
      };
      return () => loops.forEach((l) => l.stop());
    }
  }, [twinkleValues, twinkleLayerCfg]);

  // web：注入 CSS @keyframes（一次，全局共享）。opacity 动画在合成线程，不占 JS 主线程。
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const doc = (globalThis as any).document;
    if (!doc) return;
    const id = 'ziyuan-twinkle-kf';
    if (doc.getElementById(id)) return;
    const el = doc.createElement('style');
    el.id = id;
    el.textContent = `@keyframes ${TWINKLE_KEYFRAMES}{0%,100%{opacity:.45}50%{opacity:1}}`;
    doc.head.appendChild(el);
  }, []);

  // 核心区文字切片（仅渲染核心范围 cells，避免渲染全 377 格再裁剪）
  const coreCells = useMemo(() => {
    const r0 = Math.floor(acY / cellSize);
    const r1 = Math.ceil((acY + acH) / cellSize) - 1;
    const c0 = Math.floor((acX - gridOffsetX) / cellSize);
    const c1 = Math.ceil((acX + acW - gridOffsetX) / cellSize) - 1;
    return { rowRange: [r0, r1] as [number, number], colRange: [c0, c1] as [number, number] };
  }, [acX, acY, acW, acH, gridOffsetX]);

  // 文字墙视觉噪声种子：用整串 id 的 hash，避免仅按首字符（q01/q02… 同前缀）撞样式
  const gridSeed = Math.abs(hashCode(puzzle.id));

  // ─── 叠嶂（错落立方体堆）模式：6 面 N×N 字墙 ───────────────────
  // 3D 堆（VoxelPileView）负责旋转寻面；吸附摊平后切到该面的 2D 字墙 + 解密卡解题（平墙、对齐零风险）。
  // 引擎对 2D string[][] 一无所知，「当前生效网格」= voxelFaces.grids[currentFace]（cube flat 时）。
  const isCube = mode === 'cube';
  const voxelFaces = useMemo(
    () => (isCube ? generateVoxelFaces(layout, mulberry32(Math.abs(hashCode(puzzle.id + '|voxel')))) : null),
    [isCube, layout, puzzle.id],
  );
  // 起步面：seed 派生、且 != 正解面（强制开局搜索，不在正解面上）
  const cubeStartFace = useMemo(() => {
    if (!voxelFaces) return 0;
    const r = mulberry32(Math.abs(hashCode(puzzle.id + '|cubeStart')))();
    return (voxelFaces.solutionFace + 1 + Math.floor(r * 5)) % 6;
  }, [voxelFaces, puzzle.id]);
  const [currentFace, setCurrentFace] = useState(cubeStartFace);
  // cubePhase: 'rotate'（3D 堆旋转寻面）/ 'flat'（已吸附摊平，2D 字墙 + 卡片解题）
  const [cubePhase, setCubePhase] = useState<'rotate' | 'flat'>('rotate');
  const currentFaceRef = useRef(currentFace);
  currentFaceRef.current = currentFace;
  const voxelFacesRef = useRef(voxelFaces);
  voxelFacesRef.current = voxelFaces;
  const cubeViewRef = useRef<VoxelPileViewHandle>(null);
  // 当前生效网格（cube flat = 当前面字墙，其它 = layout.grid）；tryCheck / 2D 墙渲染同步读此 ref。
  const currentGridRef = useRef(grid);
  currentGridRef.current = isCube && voxelFaces && cubePhase === 'flat' ? voxelFaces.grids[currentFace] : grid;
  // 文字墙样式矩阵：核心层与外围层各算一份。
  // 核心层用 generateCellStyle（固定字号、小角度、偏暗，保证镂空下可读）；
  // 外围「字符微烁」层用 generatePerimeterStyle（字号随机 16–22、旋转 ±8°、更亮，
  // 贴近 perimeter-anim-preview.html 的观感）。各算一次共享给对应层，避免每层各自重建。
  const coreStyles = useMemo(() => buildCellStyles(grid, gridSeed, undefined, cellSize), [grid, gridSeed, cellSize]);
  const perimeterStyles = useMemo(
    () => buildCellStyles(grid, gridSeed, generatePerimeterStyle, cellSize),
    [grid, gridSeed, cellSize],
  );

  // 叠嶂：立方体 N×N 字面 = 矩形墙居中一段行 [faceRow0, faceRow0+n)；切出 N×N 喂 voxelHtml（其只寻址 [0,N)）。
  // coreStyles 已是矩形（gridRows 行）→ 切 [faceRow0, faceRow0+n) 得 N×N；每面字不同但样式按 (row,col,seed) 确定、与面无关。
  const cubeFaceRow0 = voxelFaces?.faceRow0 ?? 0;
  const cubeN = voxelFaces?.n ?? 0;
  const cubeGrids = useMemo(
    () => (voxelFaces ? voxelFaces.grids.map((g) => g.slice(cubeFaceRow0, cubeFaceRow0 + cubeN)) : []),
    [voxelFaces, cubeFaceRow0, cubeN],
  );
  const cubeStyles = useMemo(
    () => (voxelFaces ? coreStyles.slice(cubeFaceRow0, cubeFaceRow0 + cubeN) : []),
    [voxelFaces, coreStyles, cubeFaceRow0, cubeN],
  );

  // 把 cardCenter 钳制在 activeCore 内（留 halfCard 边距，保证卡片完整在核心区）
  const clampToCore = useCallback(
    (x: number, y: number) => {
      const minX = acX + halfCard;
      const maxX = acX + acW - halfCard;
      const minY = acY + halfCard;
      const maxY = acY + acH - halfCard;
      return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
      };
    },
    [acX, acY, acW, acH, halfCard],
  );
  // PanResponder 只创建一次，回调闭包通过 ref 读最新 clampToCore
  const clampRef = useRef(clampToCore);
  clampRef.current = clampToCore;

  // ─── Card position — Animated.ValueXY drives the transform (native ops on RN,
  //      RAF-batched on web); PanResponder calls setValue, avoiding per-frame
  //      setState and the full GameScreen re-render it used to trigger.
  // cardCenter = 卡片中心点的屏幕坐标；与 cell 中心对齐时
  // 屏幕坐标 = gridOffsetX + col*cellSize + cellSize/2（X），row 同理（Y）。
  const initialCenter = useMemo(
    () => {
      if (viewOnly) {
        return {
          x: solutionPosition.col * cellSize + gridOffsetX + cellSize / 2,
          y: solutionPosition.row * cellSize + cellSize / 2,
        };
      }
      // 非 viewOnly：落点取核心区中心，再吸附到最近格点中心（与松手 snapToGrid 一致）。
      // 否则当核心区宽/高为偶数格时几何中心落在两格之间，进游戏瞬间卡片歪在半格上，
      // 要等玩家拖一次松手才吸附。
      const raw = clampToCore(coreX + coreW / 2, coreY + coreH / 2);
      const gp = pixelToGrid(raw.x, raw.y, gridOffsetX, gridOriginYRef.current, cellSize);
      return clampToCore(
        gridOffsetX + gp.col * cellSize + cellSize / 2,
        gp.row * cellSize + cellSize / 2,
      );
    },
    [viewOnly, solutionPosition, gridOffsetX, clampToCore, coreX, coreY, coreW, coreH, cellSize],
  );
  const cardPos = useRef(
    new Animated.ValueXY({ x: initialCenter.x - halfCard, y: initialCenter.y - halfCard }),
  ).current;
  // Mutable refs so PanResponder callbacks (created once) read the latest values.
  const posRef = useRef({ ...initialCenter });
  const dragBase = useRef({ ...initialCenter });

  // ─── Rotation ──────────────────────────
  const initialRotation = useMemo(
    () =>
      viewOnly
        ? solutionRotation
        : (solutionRotation + 90 + Math.floor(Math.random() * 3) * 90) % 360,
    [viewOnly, solutionRotation],
  );
  const [rotation, setRotation] = useState(initialRotation);
  const rotRef = useRef(initialRotation);

  // ─── Revealed chars ────────────────────
  const lastGP = useRef(pixelToGrid(initialCenter.x, initialCenter.y, gridOffsetX, gridOriginYRef.current, cellSize));
  const lastRot = useRef(initialRotation);
  const [revealedChars, setRevealedChars] = useState<string[]>(() => {
    const { col, row } = pixelToGrid(initialCenter.x, initialCenter.y, gridOffsetX, gridOriginYRef.current, cellSize);
    return getRevealedChars(currentGridRef.current, col, row, cardShape.holes, initialRotation);
  });
  const [holeMatches, setHoleMatches] = useState<boolean[]>(() => {
    const { col, row } = pixelToGrid(initialCenter.x, initialCenter.y, gridOffsetX, gridOriginYRef.current, cellSize);
    return getHoleMatches(currentGridRef.current, col, row, cardShape.holes, initialRotation, puzzle.quote);
  });
  const [isComplete, setIsComplete] = useState(viewOnly);
  const startTimeRef = useRef(Date.now());
  // 倒计时（秒）：盲人摸象 / 投石问路 固定 MODE_TIME_LIMIT_SEC（180 = 3 分钟）；常规按难度（困难 300 / 中等 240 / 简单 180）；viewOnly 不计时。
  // 捉迷藏：A 设 hideTimeLimitSec（0=不限→向上计时、永不判失败）。
  const totalTime = mode === 'hide'
    ? (hideTimeLimitSec ?? 0)
    : (mode === 'blind' || mode === 'probe') ? MODE_TIME_LIMIT_SEC
    : mode === 'cube' ? 0
    : DIFFICULTY_CONFIGS[difficulty].timeLimitSec;
  // 不限时不判失败：只向上累计 elapsed，永不 isFailed（hide 无限 / cube 实验模式均不限时）
  const noTimer = (mode === 'hide' && totalTime === 0) || mode === 'cube';
  const [remaining, setRemaining] = useState(viewOnly ? 0 : totalTime);
  // 向上计时（仅 noTimer 用）：累计已玩秒数
  const [elapsed, setElapsed] = useState(0);
  // 失败态：倒计时归零自动判失败，弹失败卡片 + 重试按钮（noTimer 永不失败）
  const [isFailed, setIsFailed] = useState(false);
  // 完成弹窗：解出后延迟 3s 再弹（先展示镂空绿色高亮的正解）。
  // viewOnly 查看模式不弹窗。
  const [showComplete, setShowComplete] = useState(false);

  // ─── 本局统计（结算 / 书签 / 成就用）与音效触发记账 ─────
  const rotationCountRef = useRef(0);          // 旋转次数
  const powerupsRef = useRef(powerups);        // 镜像最新道具状态（tryCheck 闭包读取）
  powerupsRef.current = powerups;
  const prevMatchCountRef = useRef(0);         // 上一帧匹配镂空数（用于「新匹配」音效）
  const lastCellHapticRef = useRef(0);         // 上次「逐格振动」时间戳（节流用）
  const nearMissPlayedRef = useRef(false);     // 「很接近」提示是否已响过
  const warned30Ref = useRef(false);           // 30s 警告是否已响
  const warned10Ref = useRef(false);           // 10s 警告是否已响
  const movedRef = useRef(false);              // 本次拖拽是否真的移动过（决定是否放 card_place 音）
  const [solvedTimeSec, setSolvedTimeSec] = useState(0);
  const lastResultRef = useRef<GameResult | null>(null);
  // 解出那一刻的本地日期（书签 date 用）：与 App 存档的 record.date 一致，
  // 避免完成弹窗延迟 3s 弹出跨过午夜时，书签日期与历史记录日期不一致。
  const solvedDateRef = useRef<string>(nowLocalIsoDate());

  // puzzle 切换时重置道具状态（dev 换题、跳过、收藏后再玩等）
  useEffect(() => {
    setPowerups({ shrink: false, reveal: false, eliminate: false });
    setDisabledAngles([]);
    eliminateFiredRef.current = false;
    setRevealedChar(null);
    setShrunkCore(null);
    // 同步重置本局统计与音效记账
    rotationCountRef.current = 0;
    prevMatchCountRef.current = 0;
    lastCellHapticRef.current = 0;
    nearMissPlayedRef.current = false;
    warned30Ref.current = false;
    warned10Ref.current = false;
    lastResultRef.current = null;
    setSolvedTimeSec(0);
  }, [puzzle.id]);

  // Refs 镜像最新值：PanResponder 只创建一次，闭包必须读 ref 才能拿到最新 state。
  const isCompleteRef = useRef(isComplete);
  isCompleteRef.current = isComplete;
  const isFailedRef = useRef(isFailed);
  isFailedRef.current = isFailed;
  const tryCheckRef = useRef<(px: number, py: number, rot: number) => void>(() => {});

  // web 指针捕获：grant 时 setPointerCapture，鼠标移出卡片/窗口仍持续触发 move，
  // 解决 web 端"拖拽丢失"。release/terminate 时释放。
  const captureRef = useRef<{ target: any; pid: any }>({ target: undefined, pid: undefined });
  const releaseCapture = useCallback(() => {
    if (Platform.OS === 'web' && captureRef.current.target) {
      try {
        captureRef.current.target.releasePointerCapture?.(captureRef.current.pid);
      } catch {
        /* 指针已释放 */
      }
      captureRef.current = { target: undefined, pid: undefined };
    }
  }, []);

  // ─── Throttled grid check ───────────────
  const tryCheck = useCallback(
    (px: number, py: number, rot: number) => {
      const gp = pixelToGrid(px, py, gridOffsetX, gridOriginYRef.current, cellSize);
      // 节流：grid 位置 AND 旋转都没变才跳过（旧版只比 row/col，旋转后同格不更新）
      const cellChanged = gp.col !== lastGP.current.col || gp.row !== lastGP.current.row;
      if (!cellChanged && lastRot.current === rot) return;
      lastGP.current = gp;
      lastRot.current = rot;
      // 移动跨入新格子 → 短促「选择」振动（模拟指尖擦过真实字墙的触感）。
      // 节流 HAPTIC_CELL_MIN_MS：慢拖逐格都响；快拖降频，避免马达连成嗡嗡声。
      // 已完成 / 失败 / 未开启触感时不响。
      if (cellChanged && !isCompleteRef.current && !isFailedRef.current) {
        const now = Date.now();
        if (now - lastCellHapticRef.current >= HAPTIC_CELL_MIN_MS) {
          lastCellHapticRef.current = now;
          void soundManager.playHaptic('selection');
        }
      }
      const chars = getRevealedChars(currentGridRef.current, gp.col, gp.row, cardShape.holes, rot);
      const matches = getHoleMatches(currentGridRef.current, gp.col, gp.row, cardShape.holes, rot, puzzle.quote);
      const matchCount = matches.filter(Boolean).length;
      const holesLen = cardShape.holes.length;

      // 仅在变化时 set，避免每帧无谓 re-render
      setRevealedChars((prev) =>
        prev.length === chars.length && prev.every((c, i) => c === chars[i]) ? prev : chars,
      );
      setHoleMatches((prev) =>
        prev.length === matches.length && prev.every((v, i) => v === matches[i]) ? prev : matches,
      );

      // — 音效：新镂空变绿（word_discovered） —
      if (!isCompleteRef.current && matchCount > prevMatchCountRef.current && matchCount > 0) {
        soundManager.playJuicyEffect('word_discovered', 'light');
      }
      // — 音效：接近但未解（near_miss，一次性） —
      const closeThreshold = holesLen * 0.6;
      if (
        !isCompleteRef.current &&
        !nearMissPlayedRef.current &&
        matchCount >= closeThreshold &&
        matchCount < holesLen
      ) {
        nearMissPlayedRef.current = true;
        soundManager.playJuicyEffect('near_miss', 'medium');
      }
      prevMatchCountRef.current = matchCount;

      if (
        !isCompleteRef.current &&
        !isFailedRef.current &&
        !devMode.enabled &&
        checkSolution(currentGridRef.current, gp.col, gp.row, cardShape.holes, rot, puzzle.quote)
      ) {
        isCompleteRef.current = true;
        setIsComplete(true);
        const timeSec = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
        const pu = powerupsRef.current;
        const powerupsUsed = (pu.shrink ? 1 : 0) + (pu.reveal ? 1 : 0) + (pu.eliminate ? 1 : 0);
        const result: GameResult = {
          timeSec,
          powerupsUsed,
          hintsUsed: pu.reveal ? 1 : 0,
          rotations: rotationCountRef.current,
          pureSolve: powerupsUsed === 0,
          mode,
          // 书签指纹用：随历史记录持久化（历史书签据此生成同一枚指纹）
          cardHoles: cardShape.holes,
          cardSize: cardShape.size,
          solutionRotation,
        };
        lastResultRef.current = result;
        solvedDateRef.current = nowLocalIsoDate();
        setSolvedTimeSec(timeSec);
        soundManager.playJuicyEffect('puzzle_complete', 'success');
        onComplete(result);
      }
    },
    [cardShape.holes, puzzle.quote, startTimeRef, onComplete, devMode.enabled],
  );
  tryCheckRef.current = tryCheck;

  // ─── Snap-on-release ────────────────────
  // 松手时把 cardCenter 吸附到最近的 cell 中心屏幕坐标，
  // 保证镂空始终对齐完整字符（不会卡在两格之间）。
  // 用 ~120ms timing 平滑过渡；动画进行中若玩家再次按下，
  // 停掉并把 baseline 同步到动画当前位置，避免下次拖拽跳变。
  const snapAnimRef = useRef<any>(null);
  const snapToGrid = useCallback(() => {
    if (isCompleteRef.current) return;
    // clamp 后再吸附，保证 snap 目标始终在核心区内
    const clamped = clampToCore(posRef.current.x, posRef.current.y);
    const gp = pixelToGrid(clamped.x, clamped.y, gridOffsetX, gridOriginYRef.current, cellSize);
    const snapX = gridOffsetX + gp.col * cellSize + cellSize / 2;
    const snapY = gp.row * cellSize + cellSize / 2;
    // 双重保险：cell 中心也可能因浮点边缘情况贴近边界，再 clamp 一次
    const final = clampToCore(snapX, snapY);
    posRef.current = final;
    dragBase.current = final;
    if (snapAnimRef.current) snapAnimRef.current.stop();
    snapAnimRef.current = Animated.timing(cardPos, {
      toValue: { x: final.x - halfCard, y: final.y - halfCard },
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    snapAnimRef.current.start(() => { snapAnimRef.current = null; });
    tryCheckRef.current(final.x, final.y, rotRef.current);
    // 真正移动过才放「落卡」音（纯点击不响）
    if (movedRef.current) {
      soundManager.playJuicyEffect('card_place', 'light');
      movedRef.current = false;
    }
  }, [gridOffsetX, cardPos, halfCard, clampToCore]);

  // snapToGrid 镜像到 ref：PanResponder 只创建一次，release 回调必须读最新版
  // （道具「缩小」后 clampToCore 变化，旧 snapToGrid 会按原始核心区吸附 → 卡片跳出缩小的金框）
  const snapToGridRef = useRef(snapToGrid);
  snapToGridRef.current = snapToGrid;

  // ─── PanResponder — update ref + state ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        // 拖拽开始：暂停外围动画，避免与 cardPos 同时更新造成原生合成器卡顿
        animControlRef.current.pause();
        movedRef.current = false;
        // 吸附动画进行中：停掉并按当前值同步 baseline，防止下次 dx/dy 从旧 baseline 起跳
        if (snapAnimRef.current) {
          snapAnimRef.current = null;
          cardPos.stopAnimation(({ x, y }) => {
            posRef.current = { x: x + halfCard, y: y + halfCard };
            dragBase.current = { ...posRef.current };
          });
        } else {
          dragBase.current = { ...posRef.current };
        }
        // web: 捕获指针，鼠标移出卡片/窗口仍持续触发 move
        if (Platform.OS === 'web') {
          const target = (e.nativeEvent as any).target;
          const pid = (e.nativeEvent as any).pointerId;
          try {
            target?.setPointerCapture?.(pid);
          } catch {
            /* ignore */
          }
          captureRef.current = { target, pid };
        }
      },
      onPanResponderMove: (_e, gs) => {
        if (isCompleteRef.current) return;
        if (Math.abs(gs.dx) + Math.abs(gs.dy) > 0.5) movedRef.current = true;
        // clamp 到核心区，卡片无法被拖到外围磨砂区
        const { x: cx, y: cy } = clampRef.current(dragBase.current.x + gs.dx, dragBase.current.y + gs.dy);
        posRef.current = { x: cx, y: cy };
        // setValue 走 Animated 通道（RN 原生 / web RAF），不触发 React re-render
        cardPos.x.setValue(cx - halfCard);
        cardPos.y.setValue(cy - halfCard);
        tryCheckRef.current(cx, cy, rotRef.current);
      },
      onPanResponderRelease: () => {
        releaseCapture();
        snapToGridRef.current();
        // 拖拽结束：恢复外围生命感动效
        animControlRef.current.resume();
      },
      onPanResponderTerminate: () => {
        releaseCapture();
        animControlRef.current.resume();
      },
    }),
  ).current;

  // ─── 叠嶂：VoxelPileView 吸附摊平落定 → 切到 2D 字墙 + 卡片解题 ──
  // onFlat(face)：切 currentFace、currentGridRef=该面字墙、重置 lastGP 强制重检、重跑 tryCheck、
  //   cubePhase='flat'（卡片显形可拖）。解出/失败后忽略。摊平落定音效 + 选择触感。
  const handleCubeFlat = useCallback((face: number) => {
    if (isCompleteRef.current || isFailedRef.current) return;
    currentFaceRef.current = face;
    setCurrentFace(face);
    if (voxelFacesRef.current) currentGridRef.current = voxelFacesRef.current.grids[face];
    // 卡片落到核心区中心（全屏矩形墙、Y 原点 0），吸附到最近格点中心
    const ccy = ((coreCellsLayout.row0 + coreCellsLayout.row1 + 1) / 2) * cellSize;
    const ccx = gridOffsetX + ((coreCellsLayout.col0 + coreCellsLayout.col1 + 1) / 2) * cellSize;
    const gp0 = pixelToGrid(ccx, ccy, gridOffsetX, 0, cellSize);
    const snapX = gridOffsetX + gp0.col * cellSize + cellSize / 2;
    const snapY = gp0.row * cellSize + cellSize / 2;
    posRef.current = { x: snapX, y: snapY };
    dragBase.current = { x: snapX, y: snapY };
    cardPos.x.setValue(snapX - halfCard);
    cardPos.y.setValue(snapY - halfCard);
    lastGP.current = { col: NaN, row: NaN };
    tryCheckRef.current(snapX, snapY, rotRef.current);
    setCubePhase('flat');
    soundManager.playJuicyEffect('button_click', 'light');
    void soundManager.playHaptic('selection');
  }, [gridOffsetX, coreCellsLayout, cellSize, halfCard, cardPos]);
  // 返回旋转：注入 unflatten → 3D 堆还原；cubePhase='rotate'（卡片隐藏）。解出后不允许再转（保留正解展示）。
  const handleCubeReturnRotate = useCallback(() => {
    if (isCompleteRef.current) return;
    cubeViewRef.current?.unflatten();
    setCubePhase('rotate');
    soundManager.playSound('button_click');
  }, []);

  // ─── 角度选择：点击 2×2 角度块某个象限 → 直接旋转到该角度 ─────
  // 被道具「排除角度」禁用的角度不可选；点击当前角度为 no-op（不计旋转次数）。
  const handleSetRotation = useCallback((angle: number) => {
    if (isCompleteRef.current || isFailedRef.current) return;
    if (disabledAnglesRef.current.includes(angle)) return;
    if (rotRef.current === angle) return;
    rotationCountRef.current += 1;
    rotRef.current = angle;
    setRotation(angle);
    soundManager.playJuicyEffect('button_click', 'light');
    tryCheck(posRef.current.x, posRef.current.y, angle);
  }, [tryCheck]);

  // ─── 道具触发 ─────────────────────────
  // 道具 1：核心区一次性缩 10%，中心对齐到 solutionPosition cell 中心。
  //         若卡片当前位置在新核心区外，clamp 到新核心区边界。
  const triggerShrink = useCallback(() => {
    if (mode !== 'classic' || isCompleteRef.current || powerupsRef.current.shrink) return;
    soundManager.playJuicyEffect('button_click', 'medium');
    setPowerups((prev) => {
      if (prev.shrink) return prev;
      const cur = shrunkCore ?? { x: coreX, y: coreY, w: coreW, h: coreH };
      // 新核心区：宽高整格、左上角吸附整格（消除半格偏移致 coreCells 向外多取 1 行/列）、
      // 含 solutionPosition、clip 到原核心区内。纯函数 computeShrunkCore（见 engine.ts）。
      const shrunk = computeShrunkCore(
        cur,
        solutionPosition,
        { x: coreX, y: coreY, w: coreW, h: coreH },
        cardShape.size,
        gridOffsetX,
        cellSize,
      );
      const { x: newX, y: newY, w: newW, h: newH } = shrunk;
      setShrunkCore(shrunk);
      // 卡片若在新核心区外，clamp 到新核心区边界（同步 ref + Animated value）
      const minX = newX + halfCard;
      const maxX = newX + newW - halfCard;
      const minY = newY + halfCard;
      const maxY = newY + newH - halfCard;
      const cx = Math.max(minX, Math.min(maxX, posRef.current.x));
      const cy = Math.max(minY, Math.min(maxY, posRef.current.y));
      posRef.current = { x: cx, y: cy };
      dragBase.current = { x: cx, y: cy };
      cardPos.x.setValue(cx - halfCard);
      cardPos.y.setValue(cy - halfCard);
      tryCheckRef.current(cx, cy, rotRef.current);
      return { ...prev, shrink: true };
    });
  }, [mode, shrunkCore, coreX, coreY, coreW, coreH, cardShape.size, gridOffsetX, solutionPosition.col, solutionPosition.row, halfCard, cardPos]);

  // 道具 2：随机选 quote 中一个字，高亮其在文字墙所有出现位置
  const triggerReveal = useCallback(() => {
    if (mode !== 'classic' || isCompleteRef.current || powerupsRef.current.reveal) return;
    soundManager.playJuicyEffect('button_click', 'medium');
    setPowerups((prev) => {
      if (prev.reveal) return prev;
      const idx = Math.floor(Math.random() * puzzle.quote.length);
      setRevealedChar(puzzle.quote[idx]);
      return { ...prev, reveal: true };
    });
  }, [mode, puzzle.quote]);

  // 道具 3：排除一个不正确角度 —— 从「非正解、非当前角度、且尚未禁用」的角度中随机禁用一个，
  // 在 2×2 角度块中显示为灰色不可点击。正解角度与「当前所在角度」永不被排除（禁用当前角度既无信息量，
  // 又会让当前格视觉上显示为禁用）。正解恒可达。
  const triggerEliminate = useCallback(() => {
    if (mode !== 'classic' || isCompleteRef.current || isFailedRef.current || powerupsRef.current.eliminate || eliminateFiredRef.current) return;
    const candidates = [0, 90, 180, 270].filter(
      (a) => a !== solutionRotation && a !== rotRef.current && !disabledAnglesRef.current.includes(a),
    );
    if (candidates.length === 0) return; // 无可排除（正解外 3 个角度均已禁用，理论不到此）
    eliminateFiredRef.current = true; // 同帧双击兜底：保证只触发一次
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    soundManager.playJuicyEffect('button_click', 'medium');
    setDisabledAngles((d) => (d.includes(pick) ? d : [...d, pick]));
    setPowerups((prev) => (prev.eliminate ? prev : { ...prev, eliminate: true }));
  }, [mode, solutionRotation]);

  // ─── Dev mode: move card to solution ────
  useEffect(() => {
    if (devMode.enabled && devMode.showAnswer) {
      const sx = solutionPosition.col * cellSize + gridOffsetX + cellSize / 2;
      const sy = solutionPosition.row * cellSize + cellSize / 2;
      posRef.current = { x: sx, y: sy };
      dragBase.current = { x: sx, y: sy };
      cardPos.x.setValue(sx - halfCard);
      cardPos.y.setValue(sy - halfCard);
      rotRef.current = solutionRotation;
      setRotation(solutionRotation);
      tryCheck(sx, sy, solutionRotation);
    }
  }, [devMode.enabled, devMode.showAnswer]);

  // ─── 倒计时 ───────────────────────
  // 每秒减 1；归零自动判失败。解出 / 失败 / viewOnly / 不活跃 时停止。
  // 不活跃停止：离开 Game 或 App 切后台后倒计时不应继续——否则用户明明已不在对局
  // 仍会听到 30s/10s 口哨（issue #3）。
  useEffect(() => {
    if (!isActive || isComplete || isFailed || viewOnly) return;
    if (noTimer) {
      // 不限时：每秒向上累计已玩时长（不判失败、无哨兵）
      const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => clearInterval(iv);
    }
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(iv);
          // 仅当尚未解出时才判失败（避免最后一秒同时解出又超时的竞态叠加两层弹窗）
          if (!isCompleteRef.current) setIsFailed(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [isActive, isComplete, isFailed, viewOnly, noTimer]);

  // — 倒计时警告音：30s / 10s 各响一次（仅活跃时；失焦 / 后台绝不响） —
  useEffect(() => {
    if (!isActive || viewOnly || isComplete || isFailed || noTimer) return;
    if (remaining === 30 && !warned30Ref.current) {
      warned30Ref.current = true;
      soundManager.playJuicyEffect('time_warning', 'warning');
    } else if (remaining === 10 && !warned10Ref.current) {
      warned10Ref.current = true;
      soundManager.playJuicyEffect('time_warning', 'warning');
    }
  }, [remaining, isActive, viewOnly, isComplete, isFailed, noTimer]);

  // — 暂停计时：不活跃期间（离开屏幕 / 后台）把离开时长补给 startTimeRef，
  //   使「显示倒计时」与「记录的解题用时」都只算实际游玩时长（两者一致）。
  //   warned30/10Ref 不在此重置——保留以避免重新进入时重吹口哨。
  const pausedAtRef = useRef<number | null>(null);
  useEffect(() => {
    // 不在计时（已完成/失败/查看）：清掉暂停标记，避免重试时误补给大段时长
    if (isComplete || isFailed || viewOnly) {
      pausedAtRef.current = null;
      return;
    }
    if (!isActive) {
      if (pausedAtRef.current === null) pausedAtRef.current = Date.now();
    } else if (pausedAtRef.current !== null) {
      startTimeRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }, [isActive, isComplete, isFailed, viewOnly]);

  // — 时间到（失败）反馈 —
  const prevFailedRef = useRef(false);
  useEffect(() => {
    if (isFailed && !prevFailedRef.current) {
      soundManager.playJuicyEffect('near_miss', 'error');
    }
    prevFailedRef.current = isFailed;
  }, [isFailed]);

  // 解出后延迟 3s 弹完成框（先展示镂空绿色高亮的正解）。
  // 关键：庆祝只取决于「本局是否刚刚解出」，与 viewOnly 解耦 ——
  // 解出瞬间 App 会把今日标记完成、viewOnly 翻 true，若 effect 还依赖 viewOnly，
  // 定时器会被立刻清掉、完成弹窗永不出现（mimo-bug-audit HIGH）。
  // enteredCompleteRef 记录进入屏幕时是否已完成（查看模式）；中途解出才庆祝。
  const enteredCompleteRef = useRef(isComplete);
  useEffect(() => {
    if (!isComplete || devMode.enabled) return;
    if (enteredCompleteRef.current) return; // 进入时已是查看模式 → 不庆祝
    const t = setTimeout(() => setShowComplete(true), 3000);
    return () => clearTimeout(t);
  }, [isComplete, devMode.enabled]);

  // 完成弹窗卡片入场动画（放大淡入）
  const completeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showComplete) return;
    completeAnim.setValue(0);
    Animated.spring(completeAnim, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [showComplete, completeAnim]);

  // 解出瞬间：把卡片吸附到正解 cell 中心，保证镂空与字符完美对齐，
  // 而不是冻结在拖拽停下的偏移位置上。
  //
  // 关键点：这条动画走 native driver、直接驱动 cardPos，与 panHandlers 是否
  // 解绑完全无关。isComplete 一旦置 true，panHandlers 会立即被解绑（禁止拖动），
  // 但解绑不会打断已在 native 层运行的吸附动画——于是卡片仍会平滑滑入正解中心，
  // 实现"先吸附到位，再真正不可拖动"。若不补这步，解出往往发生在拖拽途中
  // （卡片中心刚进入正解格），松手时 snapToGrid 又因 isComplete 提前返回，
  // 卡片便卡在两格之间被冻结。
  // viewOnly / devMode 不在此吸附：前者初始即在正解，后者由 devMode effect 直接放正解。
  useEffect(() => {
    // 注意：解出后 App.tsx 会把本局标记为已完成，使 viewOnly 翻成 true（查看模式）。
    // 因此这里只能用 isComplete 守卫，不能再带上 viewOnly/devMode —— 否则正常解出时
    // viewOnly 已翻 true，会把"吸附到正解"这条收尾动画错误地跳过，卡片卡在偏移位。
    // 初始即为查看模式时，卡片已在正解，此处吸附是 no-op，安全。
    if (!isComplete) return;
    const snapX = gridOffsetX + solutionPosition.col * cellSize + cellSize / 2;
    const snapY = solutionPosition.row * cellSize + cellSize / 2;
    const final = clampToCore(snapX, snapY);
    posRef.current = final;
    dragBase.current = final;
    if (snapAnimRef.current) snapAnimRef.current.stop();
    snapAnimRef.current = Animated.timing(cardPos, {
      toValue: { x: final.x - halfCard, y: final.y - halfCard },
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    snapAnimRef.current.start(() => {
      snapAnimRef.current = null;
    });
  }, [isComplete, gridOffsetX, solutionPosition.col, solutionPosition.row, clampToCore, cardPos, halfCard]);

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── 重试：倒计时归零后重置全部游戏状态 ─────
  // puzzle.id 不变，所以 [puzzle.id] 的 useEffect 不会触发；必须手动重置。
  const handleRetry = useCallback(() => {
    // 计时 / 完成 / 失败
    setRemaining(totalTime);
    setElapsed(0);
    setIsFailed(false);
    setIsComplete(false);
    isCompleteRef.current = false;
    setShowComplete(false);
    startTimeRef.current = Date.now();
    // 旋转
    const freshRot = (solutionRotation + 90 + Math.floor(Math.random() * 3) * 90) % 360;
    rotRef.current = freshRot;
    setRotation(freshRot);
    lastRot.current = freshRot;
    // 卡片位置回到核心区中心并吸附到最近格点（与初始落点 initialCenter 一致——
    // 否则重试后卡片同样会歪在半格上）
    const rawRetry = clampRef.current(coreX + coreW / 2, coreY + coreH / 2);
    const gpRetry = pixelToGrid(rawRetry.x, rawRetry.y, gridOffsetX, gridOriginYRef.current, cellSize);
    const freshPos = clampRef.current(
      gridOffsetX + gpRetry.col * cellSize + cellSize / 2,
      gpRetry.row * cellSize + cellSize / 2,
    );
    posRef.current = freshPos;
    dragBase.current = freshPos;
    lastGP.current = pixelToGrid(freshPos.x, freshPos.y, gridOffsetX, gridOriginYRef.current, cellSize);
    cardPos.x.setValue(freshPos.x - halfCard);
    cardPos.y.setValue(freshPos.y - halfCard);
    // 镂空字符 / 匹配状态
    const gp = pixelToGrid(freshPos.x, freshPos.y, gridOffsetX, gridOriginYRef.current, cellSize);
    setRevealedChars(getRevealedChars(grid, gp.col, gp.row, cardShape.holes, freshRot));
    setHoleMatches(getHoleMatches(grid, gp.col, gp.row, cardShape.holes, freshRot, puzzle.quote));
    // 道具
    setPowerups({ shrink: false, reveal: false, eliminate: false });
    setDisabledAngles([]);
    eliminateFiredRef.current = false;
    setRevealedChar(null);
    setShrunkCore(null);
    // 本局统计 / 音效记账
    rotationCountRef.current = 0;
    prevMatchCountRef.current = 0;
    lastCellHapticRef.current = 0;
    nearMissPlayedRef.current = false;
    warned30Ref.current = false;
    warned10Ref.current = false;
    prevFailedRef.current = false;
    movedRef.current = false;
    lastResultRef.current = null;
    setSolvedTimeSec(0);
  }, [
    totalTime, solutionRotation, gridOffsetX, coreX, coreY, coreW, coreH,
    halfCard, cardPos, grid, cardShape.holes, puzzle.quote,
  ]);

  const matchCount = holeMatches.filter(Boolean).length;

  // dev：输出当前布局 JSON 到控制台（便于复现 / 排查）
  const [devHint, setDevHint] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDumpLayout = useCallback(() => {
    const dump = {
      id: puzzle.id, quote: puzzle.quote, difficulty,
      solutionPosition: layout.solutionPosition,
      solutionRotation: layout.solutionRotation,
      holes: layout.cardShape.holes,
      cardSize: layout.cardShape.size,
      gridCols: layout.gridCols, gridRows: layout.gridRows,
    };
    // eslint-disable-next-line no-console
    console.log('[DEV] layout =', JSON.stringify(dump));
    setDevHint('布局 JSON 已输出到控制台');
    // 用 ref 管理 timer：连按时先清旧的，避免提前消失 / 泄漏（onPress 的返回值会被丢弃）
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setDevHint(null), 2200);
  }, [puzzle, layout, difficulty]);

  // ─── Dev：预览当前题的书签（不解题即可查看指纹 + 绿字句子 + 状态条）─────
  // 复用 onShareBookmark（App 顶层 BookmarkModal）。用真实卡面信息（cardShape.holes /
  // size / solutionRotation）生成指纹；用时取本局已耗时，道具状态取当前——便于在 dev 下
  // 通过「点道具 / 等一会 / 换题 / 切难度」快速预览指纹四要素的不同效果。
  const handlePreviewBookmark = useCallback(() => {
    const elapsed = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
    const pu = powerupsRef.current;
    const powerupsUsedNow = (pu.shrink ? 1 : 0) + (pu.reveal ? 1 : 0) + (pu.eliminate ? 1 : 0);
    onShareBookmark({
      quote: puzzle.quote,
      author: puzzle.author,
      source: puzzle.source,
      date: nowLocalIsoDate(),
      difficulty,
      timeSec: elapsed,
      pureSolve: powerupsUsedNow === 0,
      powerupsUsed: powerupsUsedNow,
      rotations: rotationCountRef.current,
      mode,
      cardHoles: cardShape.holes,
      cardSize: cardShape.size,
      solutionRotation,
    });
  }, [puzzle, difficulty, onShareBookmark, cardShape.holes, cardShape.size, solutionRotation]);

  // ─── 分享「本局」书签（完成弹窗按钮 + 解出后顶栏常驻按钮共用）─────
  // 仅本局刚刚解出（!enteredCompleteRef）有效：lastResultRef 携带结算数据。
  // viewOnly（再次进入已完成题）无本局结算 → 不显示常驻按钮，改由历史记录长按分享。
  const handleShareSolved = useCallback(() => {
    soundManager.playSound('button_click');
    onShareBookmark({
      quote: puzzle.quote,
      author: puzzle.author,
      source: puzzle.source,
      date: solvedDateRef.current,
      difficulty,
      timeSec: solvedTimeSec,
      pureSolve: lastResultRef.current?.pureSolve ?? false,
      powerupsUsed: lastResultRef.current?.powerupsUsed ?? 0,
      rotations: rotationCountRef.current,
      mode,
      cardHoles: cardShape.holes,
      cardSize: cardShape.size,
      solutionRotation,
    });
  }, [puzzle, difficulty, onShareBookmark, cardShape.holes, cardShape.size, solutionRotation, mode, solvedTimeSec]);

  // ─── Compute highlighted grid cells (dev mode answer) ──
  const answerCells = useMemo(() => {
    if (!(devMode.enabled && devMode.showAnswer)) return null;
    return cardShape.holes.map((hole) => {
      const rot = rotateOffset(hole, solutionRotation);
      return {
        col: solutionPosition.col + rot.offsetX,
        row: solutionPosition.row + rot.offsetY,
        char: puzzle.quote[cardShape.holes.indexOf(hole)],
      };
    });
  }, [devMode.enabled, devMode.showAnswer, cardShape.holes, solutionPosition, solutionRotation, puzzle.quote]);

  // ─── 道具 2：高亮字符在文字墙中所有出现位置 ──
  const revealedCells = useMemo(() => {
    if (!revealedChar) return null;
    const cells: Array<{ row: number; col: number }> = [];
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === revealedChar) cells.push({ row: r, col: c });
      }
    }
    return cells;
  }, [revealedChar, grid]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CONFIG.colors.background} />

      {/* 非 cube 模式：平面字墙（外围微烁 + 静态核心 + 磨砂遮罩 + 核心边框）。cube 模式走下方 3D 立方体墙。 */}
      {!isCube && (<>
      {/* 外围「字符微烁」：TWINKLE_GROUPS 层叠加，每层一组字符（空间哈希）、各自 opacity 明灭。
          整层覆盖全网格、跳过核心区（核心由下方静态核心层渲染），逐字绝对定位（稀疏、不占位）。
          两端各走最优路径：
            - native：Animated opacity（合成线程）+ renderToHardwareTextureAndroid/shouldRasterizeIOS
              把字符子树栅格成 GPU 纹理，动画只调制纹理（角度多样性保留）。
            - web：CSS @keyframes（浏览器合成线程、零主线程开销）—— react-native-web 的 Animated
              在 web 退化成 JS RAF，故改走 CSS 动画。拖拽时 native 经 animControlRef 暂停。 */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {twinkleLayerCfg.map((cfg, k) => {
          const layer = (
            <TextGrid
              grid={grid}
              seed={gridSeed}
              cellStyles={perimeterStyles}
              cellSize={cellSize}
              groupIndex={k}
              groupCount={TWINKLE_GROUPS}
              skipR0={coreCells.rowRange[0]}
              skipC0={coreCells.colRange[0]}
              skipR1={coreCells.rowRange[1]}
              skipC1={coreCells.colRange[1]}
            />
          );
          return Platform.OS === 'web' ? (
            <View
              key={`tw${k}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: gridOffsetX,
                top: 0,
                animation: `${TWINKLE_KEYFRAMES} ${cfg.dur}ms ease-in-out ${cfg.delay}ms infinite`,
              } as any}
            >
              {layer}
            </View>
          ) : (
            <Animated.View
              key={`tw${k}`}
              renderToHardwareTextureAndroid
              shouldRasterizeIOS
              style={{ position: 'absolute', left: gridOffsetX, top: 0, opacity: twinkleValues[k] }}
            >
              {layer}
            </Animated.View>
          );
        })}
      </View>

      {/* 静态核心文字墙 — 仅渲染核心切片（无 overflow:hidden wrapper，性能更佳）。
          revealedCells/answerCells 高亮叠层保持原位（全屏坐标）。 */}
      <View style={[styles.gridContainer, { width: gridW, height: gridH, left: gridOffsetX }]}>
        <View style={{ position: 'absolute', left: coreCells.colRange[0] * cellSize, top: coreCells.rowRange[0] * cellSize }}>
          <TextGrid grid={grid} seed={gridSeed} cellStyles={coreStyles} cellSize={cellSize} rowRange={coreCells.rowRange} colRange={coreCells.colRange} />
        </View>

        {/* 道具 2：高亮 revealedChar 在文字墙所有出现位置（金色） */}
        {revealedCells &&
          revealedCells.map((c, i) => (
            <View
              key={`rc${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: c.col * cellSize,
                top: c.row * cellSize,
                width: cellSize,
                height: cellSize,
                backgroundColor: 'rgba(255, 215, 0, 0.32)',
                borderWidth: 1.5,
                borderColor: '#FFD700',
                borderRadius: 3,
              }}
            />
          ))}

        {/* Dev answer: green-highlight the correct cells on the grid */}
        {answerCells &&
          answerCells.map((c, i) => (
            <View
              key={`ac${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: c.col * cellSize,
                top: c.row * cellSize,
                width: cellSize,
                height: cellSize,
                backgroundColor: 'rgba(76, 175, 80, 0.45)',
                borderWidth: 2,
                borderColor: CONFIG.colors.success,
                borderRadius: 3,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: cellSize - 4,
                  fontWeight: '900',
                  color: '#fff',
                }}
              >
                {c.char}
              </Text>
            </View>
          ))}
      </View>

      {/* 外围磨砂遮罩 — 4 块围绕 activeCore，仅作背景不参与游戏。
          字符微烁方案下为静态透明度（不再呼吸），把"活气"交给下层字符的明灭，避免两层动效打架。
          父容器透明不覆盖核心区。 */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: acY, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
        <View style={{ position: 'absolute', left: 0, top: acY + acH, right: 0, bottom: 0, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
        <View style={{ position: 'absolute', left: 0, top: acY, width: acX, height: acH, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
        <View style={{ position: 'absolute', left: acX + acW, top: acY, right: 0, height: acH, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
      </View>

      {/* 核心解密区边框 — 加粗金色，跟随 activeCore */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: acX,
          top: acY,
          width: acW,
          height: acH,
          borderWidth: 3,
          borderColor: CONFIG.colors.primary,
          borderRadius: 8,
        }}
      />
      </>
      )}

      {/* 叠嶂（错落立方体堆）：VoxelPileView 旋转寻面（3D）；吸附摊平后切到该面 2D 字墙 + 解密卡解题。
          3D 堆全程挂载（flat 时淡出 + 不接收触点，便于「返回旋转」注入 unflatten 复位）。
          flat 阶段 = 平墙解题（经典机制、卡片天然对齐）。 */}
      {isCube && voxelFaces && (
        <>
          <View pointerEvents={cubePhase === 'flat' ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, { opacity: cubePhase === 'flat' ? 0 : 1 }]}>
            <VoxelPileView
              ref={cubeViewRef}
              grids={cubeGrids}
              n={cubeN}
              cell={cellSize}
              startFace={cubeStartFace}
              solutionFace={voxelFaces.solutionFace}
              dens={0.7}
              styles={cubeStyles}
              onFlat={handleCubeFlat}
            />
          </View>

          {/* rotate：旋转寻面提示 */}
          {cubePhase === 'rotate' && (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: Math.max(acY - 30, safeTop + 40), alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: 'rgba(217,201,163,0.7)', letterSpacing: 2 }}>转一转，找到藏名言的那一面</Text>
              <Text style={{ marginTop: 4, fontSize: 11, color: 'rgba(217,201,163,0.45)', letterSpacing: 1 }}>拖动旋转 · 松手吸附 · 自动摊平成墙</Text>
            </View>
          )}

          {/* flat：吸附摊平后，该面的 2D 字墙 + 解密卡解题 */}
          {cubePhase === 'flat' && (
            <>
              {/* 2D 字墙（当前吸附面，全屏矩形 gridRows×gridCols；正解面 = layout.grid，名言在立方体字面行内，其余随机字补足成高矩形） */}
              <View style={{ position: 'absolute', left: gridOffsetX, top: 0, width: gridW, height: gridH }}>
                <TextGrid grid={voxelFaces.grids[currentFace]} seed={gridSeed} cellStyles={coreStyles} cellSize={cellSize} />
              </View>

              {/* 非核心区磨砂遮罩（同 classic） */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: acY, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
                <View style={{ position: 'absolute', left: 0, top: acY + acH, right: 0, bottom: 0, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
                <View style={{ position: 'absolute', left: 0, top: acY, width: acX, height: acH, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
                <View style={{ position: 'absolute', left: acX + acW, top: acY, right: 0, height: acH, ...PERIMETER_MASK_BG, opacity: 0.5 }} />
              </View>

              {/* 核心解密区金框 */}
              <View pointerEvents="none" style={{ position: 'absolute', left: acX, top: acY, width: acW, height: acH, borderWidth: 3, borderColor: CONFIG.colors.primary, borderRadius: 8 }} />

              {/* 返回旋转按钮（未解出时可换面继续找；不提示是否正解面，玩家自行判断） */}
              {!isComplete && !isFailed && (
                <TouchableOpacity activeOpacity={0.6} onPress={handleCubeReturnRotate} style={{ position: 'absolute', right: 16, top: acY + acH + 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(20,17,10,0.6)', borderWidth: 1, borderColor: '#4A90D9', zIndex: 6, elevation: 6 }}>
                  <Ionicons name="refresh" size={16} color="#4A90D9" />
                  <Text style={{ color: '#4A90D9', fontSize: 13, fontWeight: '600' }}>返回旋转</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      )}

      {/* Decode card — 始终渲染：解出/查看模式下镂空绿色高亮即正解。
          isComplete 后解绑 panHandlers + 旋转按钮 disabled，禁止移动。 */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: cardPixelSize,
          height: cardPixelSize,
          transform: [
            { translateX: cardPos.x },
            { translateY: cardPos.y },
            { rotate: `${rotation}deg` },
          ],
          // 叠嶂：仅 flat 阶段（2D 字墙解题）显形可拖；rotate 阶段（3D 旋转寻面）隐藏并解绑手势。
          opacity: isCube ? (cubePhase === 'flat' ? 1 : 0) : 1,
          // 叠嶂：卡片须在 WebView / 2D 墙之上（Android 靠 elevation 抬到原生 WebView 之上）
          ...(isCube ? { zIndex: 8, elevation: 8 } : {}),
        }}
        {...(isComplete || isFailed || (isCube && cubePhase !== 'flat') ? {} : panResponder.panHandlers)}
      >
          {/* Card body */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: CONFIG.colors.cardBg,
                borderRadius: 12,
                borderWidth: 2,
                borderColor:
                  matchCount >= cardShape.holes.length * 0.6
                    ? CONFIG.colors.cardBorderActive
                    : CONFIG.colors.cardBorder,
              },
            ]}
            pointerEvents="none"
          />

          {/* Holes — 渲染规则随模式而变：
              classic：逐孔绿 + 显字（既有行为）
              blind（盲人摸象）：所有镂空永不显字（解出前）。未匹配=不透明褐（盖住墙字）；
                              匹配=不透明绿（仅表位置对上）。全句解出后才揭晓文字。增加难度：全程靠位置不靠认字。
              probe（投石问路）：显字但不标单孔对错；任一字对上则全部边框统一变绿 + 左上角计数徽章 */}
          {cardShape.holes.map((hole, i) => {
            const isMatch = holeMatches[i];
            // 计算本孔显示态（颜色 / 是否显字）
            let bgColor = isMatch ? CONFIG.colors.matchBg : CONFIG.colors.holeBg;
            let borderColor = isMatch ? CONFIG.colors.matchBorder : CONFIG.colors.holeBorder;
            let textColor = isMatch ? CONFIG.colors.matchText : CONFIG.colors.holeText;
            let showChar = true;
            if (isComplete) {
              // 解出：全部正解绿 + 显字（盲模式镂空也在此刻揭晓）
              bgColor = CONFIG.colors.matchBg;
              borderColor = CONFIG.colors.matchBorder;
              textColor = CONFIG.colors.matchText;
              showChar = true;
            } else if (mode === 'blind') {
              // 盲人摸象：所有镂空不显字。未匹配=不透明褐（盖住墙字）；匹配=不透明绿（仅表位置对上）。
              // 不用半透明 matchBg：盲模式镂空永不显字，半透明会让墙字透出来，违背「盖住」初衷。
              showChar = false;
              if (isMatch) {
                bgColor = BLIND_MATCH_BG;
                borderColor = CONFIG.colors.matchBorder;
              } else {
                bgColor = BLIND_HOLE_BG;
                borderColor = BLIND_HOLE_BORDER;
              }
            } else if (mode === 'probe') {
              // 投石问路：显字；不标单孔对错；有任一字对上则全部边框统一绿
              showChar = true;
              bgColor = CONFIG.colors.holeBg;
              borderColor = matchCount > 0 ? CONFIG.colors.matchBorder : CONFIG.colors.holeBorder;
              textColor = CONFIG.colors.holeText;
            }
            return (
              <View
                key={`h${i}`}
                style={{
                  position: 'absolute',
                  left: (hole.offsetX + halfGrid) * cellSize,
                  top: (hole.offsetY + halfGrid) * cellSize,
                  width: cellSize,
                  height: cellSize,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: bgColor,
                  borderWidth: 1.5,
                  borderColor,
                  borderRadius: 3,
                }}
              >
                {showChar && (
                  <Text
                    selectable={false}
                    style={{
                      fontSize: cellSize - 6,
                      fontWeight: 'bold',
                      color: textColor,
                      transform: [{ rotate: `${-rotation}deg` }],
                    }}
                  >
                    {revealedChars[i] || ''}
                  </Text>
                )}
              </View>
            );
          })}

          {/* 投石问路：左上角绿色计数徽章（任一字对上时出现；围绕自身反向旋转保持正立） */}
          {mode === 'probe' && matchCount > 0 && !isComplete && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 3,
                top: 3,
                width: cellSize + 4,
                height: cellSize + 4,
                borderRadius: (cellSize + 4) / 2,
                backgroundColor: CONFIG.colors.success,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.55)',
                transform: [{ rotate: `${-rotation}deg` }],
                zIndex: 5, elevation: 5,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: Math.max(11, cellSize - 6) }}>
                {matchCount}
              </Text>
            </View>
          )}
        </Animated.View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: safeTop }]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={CONFIG.colors.text} />
        </TouchableOpacity>
        <Text style={[styles.timer, viewOnly && styles.timerDone, !noTimer && remaining <= 30 && !isComplete && !viewOnly && styles.timerUrgent]}>
          {viewOnly ? '已完成' : noTimer ? formatTime(elapsed) : formatTime(remaining)}
        </Text>
        {/* 本局刚解出（非查看模式）→ 顶栏常驻「书签」按钮，解出后/关闭庆祝后随时可分享。
            查看模式 / 未解出 → 显示匹配进度徽章。 */}
        {isComplete && !enteredCompleteRef.current && !devMode.enabled ? (
          <TouchableOpacity style={styles.topShareBtn} onPress={handleShareSolved} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="bookmark-outline" size={18} color={CONFIG.colors.primary} />
            <Text style={styles.topShareText}>书签</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.matchBadge}>
            <Text style={styles.matchText}>
              {matchCount}/{cardShape.holes.length}
            </Text>
          </View>
        )}
      </View>

      {/* Dev console（折叠式，取代旧固定 toolbar） */}
      {devMode.enabled && (
        <DevConsole
          puzzle={puzzle}
          layout={layout}
          difficulty={difficulty}
          mode={mode}
          isFavorite={isFavorite}
          showAnswer={devMode.showAnswer}
          onRegenerate={() => onRegenerate(mode)}
          onChangeDifficulty={onChangeDifficulty}
          onCycleQuote={(dir) => onCycleQuote(dir, mode)}
          onToggleFavorite={onToggleFavorite}
          onToggleShowAnswer={onToggleShowAnswer}
          onDumpLayout={handleDumpLayout}
          onPreviewBookmark={handlePreviewBookmark}
          onOpenLibrary={onOpenLibrary}
        />
      )}

      {/* Dev 临时提示（如「已输出到控制台」） */}
      {devHint && (
        <View pointerEvents="none" style={styles.devHintWrap}>
          <View style={styles.devHintChip}>
            <Ionicons name="terminal-outline" size={14} color={CONFIG.colors.primary} />
            <Text style={styles.devHintText}>{devHint}</Text>
          </View>
        </View>
      )}

      {/* 答案信息框 —— 三种情形下在下方区域显示（与开发者模式「查看答案」同一外观）：
          1) 开发者模式打开「显示答案」
          2) 本局刚刚解出（isComplete）—— 解出后在下方常驻显示正解信息
          3) 查看模式（viewOnly，今日 / 历史已完成题再次进入）—— 始终显示 */}
      {((devMode.enabled && devMode.showAnswer) || isComplete || viewOnly) && !showComplete && (
        <View style={styles.answerOverlay} pointerEvents="none">
          <Text style={styles.answerQuote}>{puzzle.quote}</Text>
          <Text style={styles.answerMeta}>—— {puzzle.author}《{puzzle.source}》</Text>
          <Text style={styles.answerMeta}>
            位置: ({solutionPosition.col}, {solutionPosition.row})  旋转: {solutionRotation}°
          </Text>
        </View>
      )}

      {/* 道具栏 — 每题 3 个，触发后置灰。viewOnly / 已解出 / 非 classic 模式 时隐藏。
          盲人摸象 / 投石问路 禁用全部道具以提升难度（triggerXxx 亦以 mode!=='classic' 短路兜底）。
          缩小（核心区缩 10%） / 提示字（高亮一字所有出现位） / 排除角度（禁用一个错误角度） */}
      {!viewOnly && !isComplete && !isFailed && mode === 'classic' && (
        <View style={[styles.powerupBar, { top: powerupTopPx }]}>
          <TouchableOpacity
            style={[styles.powerupBtn, powerups.shrink && styles.powerupBtnDisabled]}
            disabled={powerups.shrink}
            onPress={triggerShrink}
            activeOpacity={0.7}
          >
            <Ionicons name="scan-outline" size={22} color={CONFIG.colors.primary} />
            <Text style={styles.powerupBtnText}>缩小</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.powerupBtn, powerups.reveal && styles.powerupBtnDisabled]}
            disabled={powerups.reveal}
            onPress={triggerReveal}
            activeOpacity={0.7}
          >
            <Ionicons name="eye-outline" size={22} color={CONFIG.colors.primary} />
            <Text style={styles.powerupBtnText}>提示字</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.powerupBtn, powerups.eliminate && styles.powerupBtnDisabled]}
            disabled={powerups.eliminate}
            onPress={triggerEliminate}
            activeOpacity={0.7}
          >
            <Ionicons name="ban-outline" size={22} color={CONFIG.colors.primary} />
            <Text style={styles.powerupBtnText}>排除角度</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 底栏：左侧出处提示 + 右侧 2×2 角度选择块。
          四象限分别对应 0°/90°/270°/180°（左上/右上/左下/右下 顺时针），点击直接旋转到该角度；
          当前角度高亮金色；被道具「排除角度」禁用的错误角度灰色不可点。 */}
      <View style={[styles.bottomBar, { paddingBottom: safeBottom }]}>
        <View style={styles.hintArea}>
          <Text style={styles.hintText} numberOfLines={1}>
            {puzzle.author}《{puzzle.source}》
          </Text>
        </View>
        <View style={[styles.quadBlock, (isComplete || isFailed) && { opacity: 0.4 }]}>
          {ANGLE_QUADS.map((angle) => {
            const isCurrent = rotation === angle;
            const isDisabled = disabledAngles.includes(angle);
            const locked = isComplete || isFailed;
            return (
              <TouchableOpacity
                key={angle}
                style={[
                  styles.quadCell,
                  isCurrent && styles.quadCellActive,
                  isDisabled && styles.quadCellDisabled,
                ]}
                disabled={locked || isDisabled}
                onPress={() => handleSetRotation(angle)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.quadText,
                    isCurrent && styles.quadTextActive,
                    isDisabled && styles.quadTextDisabled,
                  ]}
                >
                  {angle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 解谜成功庆祝粒子（解出瞬间迸发，非查看模式） */}
      <Celebration active={isComplete && !enteredCompleteRef.current && !devMode.enabled} />

      {/* Completion overlay — 解出 3s 后才弹 */}
      {showComplete && (
        <View style={styles.completeOverlay}>
          <Animated.View
            style={[
              styles.completeCard,
              {
                opacity: completeAnim,
                transform: [{ scale: completeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
              },
            ]}
          >
            <Text style={styles.completeEmoji}>✨</Text>
            <Text style={styles.completeTitle}>解密成功</Text>
            <Text style={styles.completeQuote}>{puzzle.quote}</Text>
            <Text style={styles.completeAuthor}>—— {puzzle.author}《{puzzle.source}》</Text>
            <View style={styles.completeBadges}>
              {mode !== 'classic' && (
                <View style={[styles.completeBadge, { borderColor: mode === 'blind' ? '#9F7AEA' : mode === 'probe' ? '#4FB6C8' : mode === 'cube' ? '#4A90D9' : '#FFB347' }]}>
                  <Text style={[styles.completeBadgeText, { color: mode === 'blind' ? '#9F7AEA' : mode === 'probe' ? '#4FB6C8' : mode === 'cube' ? '#4A90D9' : '#FFB347', fontWeight: '700' }]}>
                    {mode === 'blind' ? '盲人摸象' : mode === 'probe' ? '投石问路' : mode === 'cube' ? '叠嶂' : '捉迷藏'}
                  </Text>
                </View>
              )}
              <View style={styles.completeBadge}><Text style={styles.completeBadgeText}>{DIFFICULTY_CONFIGS[difficulty].label}</Text></View>
              <View style={styles.completeBadge}><Text style={styles.completeBadgeText}>用时 {formatTime(solvedTimeSec)}</Text></View>
              <View style={styles.completeBadge}><Text style={styles.completeBadgeText}>{rotationCountRef.current} 次旋转</Text></View>
              {(lastResultRef.current?.pureSolve) && (
                <View style={[styles.completeBadge, styles.completeBadgeGold]}><Text style={styles.completeBadgeTextGold}>纯解</Text></View>
              )}
            </View>
            <View style={styles.completeActions}>
              <TouchableOpacity
                style={[styles.completeBtn, styles.completeBtnPrimary]}
                onPress={() => {
                  soundManager.playSound('button_click');
                  // 关闭庆祝弹窗，停留在已解出的棋盘 + 下方信息框（正解展示）
                  setShowComplete(false);
                }}
              >
                <Ionicons name="eye-outline" size={18} color={CONFIG.colors.background} />
                <Text style={styles.completeBtnText}>查看谜底</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeBtn, styles.completeBtnGhost]}
                onPress={handleShareSolved}
              >
                <Ionicons name="bookmark-outline" size={18} color={CONFIG.colors.textSecondary} />
                <Text style={styles.completeBtnGhostText}>分享书签</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.completeBackBtn}
              onPress={() => {
                soundManager.playSound('button_click');
                onBack();
              }}
            >
              <Text style={styles.completeBackText}>返回首页</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Failure overlay — 倒计时归零自动判失败，提供重试 / 返回。
          不显示正解（超时是失败，不是揭秘；想看答案去查看模式或重试解出）。 */}
      {isFailed && (
        <View style={styles.failOverlay}>
          <View style={styles.failCard}>
            <Text style={styles.failEmoji}>⏰</Text>
            <Text style={styles.failTitle}>时间到</Text>
            <Text style={styles.failHint}>别灰心，再试一次</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Ionicons name="refresh-circle" size={20} color={CONFIG.colors.background} />
              <Text style={styles.retryBtnText}>重试</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.failBackBtn} onPress={onBack}>
              <Text style={styles.failBackBtnText}>返回</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CONFIG.colors.wallBg },
  gridContainer: { position: 'absolute', left: 0, top: 0 },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(26,22,18,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  timer: {
    fontSize: 18, fontWeight: '600', color: CONFIG.colors.text,
    backgroundColor: 'rgba(26,22,18,0.6)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    fontVariant: ['tabular-nums'],
  },
  timerUrgent: {
    color: '#FF6B6B', fontWeight: '700',
  },
  timerDone: {
    color: CONFIG.colors.success, fontWeight: '700',
  },
  matchBadge: {
    backgroundColor: 'rgba(26,22,18,0.6)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
  },
  matchText: { color: CONFIG.colors.primary, fontSize: 16, fontWeight: '700' },
  topShareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(26,22,18,0.6)', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16,
  },
  topShareText: { color: CONFIG.colors.primary, fontSize: 14, fontWeight: '700' },
  devToolbar: {
    position: 'absolute', top: 100, left: 16, right: 16,
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: 'rgba(26,22,18,0.92)', borderRadius: 14, paddingVertical: 10, zIndex: 10,
  },
  devBtn: { alignItems: 'center', paddingHorizontal: 10 },
  devBtnText: { color: CONFIG.colors.textSecondary, fontSize: 10, marginTop: 3 },
  devHintWrap: {
    position: 'absolute', top: 152, left: 0, right: 0, alignItems: 'center', zIndex: 30,
  },
  devHintChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(26,22,18,0.95)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: CONFIG.colors.primary,
  },
  devHintText: { color: CONFIG.colors.text, fontSize: 12 },
  answerOverlay: {
    // bottom 留足底栏（2×2 角度块 76px + safeBottom）的高度，避免信息框压住角度块
    position: 'absolute', bottom: 132, left: 20, right: 20,
    backgroundColor: 'rgba(26,22,18,0.95)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: CONFIG.colors.primary, zIndex: 10,
  },
  answerQuote: { fontSize: 20, fontWeight: '700', color: CONFIG.colors.success, textAlign: 'center', marginBottom: 8 },
  answerMeta: { fontSize: 13, color: CONFIG.colors.textSecondary, textAlign: 'center', marginBottom: 4 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  hintArea: {
    flex: 1, backgroundColor: 'rgba(26,22,18,0.6)',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 12,
  },
  hintText: { color: CONFIG.colors.textSecondary, fontSize: 13 },
  quadBlock: {
    width: 76, height: 76, flexDirection: 'row', flexWrap: 'wrap',
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 2, borderColor: CONFIG.colors.primary,
    backgroundColor: CONFIG.colors.surface,
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  quadCell: {
    width: '50%', height: '50%',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: CONFIG.colors.surface,
    borderWidth: 0.75, borderColor: 'rgba(26,22,18,0.55)', // 象限间细分割线（窗格效果）
  },
  quadCellActive: {
    backgroundColor: CONFIG.colors.primary,
  },
  quadCellDisabled: {
    backgroundColor: 'rgba(245,230,200,0.05)',
  },
  quadText: {
    fontSize: 13, fontWeight: '700', color: CONFIG.colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  quadTextActive: {
    color: CONFIG.colors.background,
  },
  quadTextDisabled: {
    color: CONFIG.colors.textSecondary, opacity: 0.3,
  },
  powerupBar: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 18, zIndex: 5,
  },
  powerupBtn: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: 'rgba(45, 35, 25, 0.85)',
    borderWidth: 1.5, borderColor: CONFIG.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  powerupBtnText: { fontSize: 10, color: CONFIG.colors.textSecondary, marginTop: 2 },
  powerupBtnDisabled: { opacity: 0.3 },
  completeOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(26,22,18,0.9)', justifyContent: 'center', alignItems: 'center',
    zIndex: 50, // 盖在 answerOverlay(zIndex:10) / 顶栏之上，避免完成弹窗被下层元素穿过
  },
  completeCard: {
    backgroundColor: CONFIG.colors.surface, borderRadius: 20, padding: 32,
    marginHorizontal: 32, alignItems: 'center', borderWidth: 1, borderColor: CONFIG.colors.primary,
  },
  completeEmoji: { fontSize: 48, marginBottom: 8 },
  completeTitle: { fontSize: 22, fontWeight: '700', color: CONFIG.colors.primary, marginBottom: 16, letterSpacing: 3 },
  completeQuote: { fontSize: 21, fontWeight: '600', color: CONFIG.colors.text, textAlign: 'center', lineHeight: 32, marginBottom: 10 },
  completeAuthor: { fontSize: 14, color: CONFIG.colors.textSecondary, marginBottom: 16 },
  completeBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 22 },
  completeBadge: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 10,
    backgroundColor: 'rgba(245,230,200,0.08)', borderWidth: 1, borderColor: 'rgba(245,230,200,0.16)',
  },
  completeBadgeGold: { backgroundColor: 'rgba(218,165,32,0.16)', borderColor: CONFIG.colors.primary },
  completeBadgeText: { fontSize: 12, color: CONFIG.colors.textSecondary, fontWeight: '500' },
  completeBadgeTextGold: { fontSize: 12, color: CONFIG.colors.primary, fontWeight: '700' },
  completeActions: { flexDirection: 'row', gap: 12 },
  completeBackBtn: {
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 24, alignSelf: 'center',
  },
  completeBackText: { color: CONFIG.colors.textSecondary, fontSize: 14 },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, paddingHorizontal: 22, borderRadius: 12,
  },
  completeBtnGhost: { borderWidth: 1, borderColor: 'rgba(245,230,200,0.22)' },
  completeBtnGhostText: { color: CONFIG.colors.textSecondary, fontSize: 15 },
  completeBtnPrimary: { backgroundColor: CONFIG.colors.primaryDark },
  completeBtnText: { color: CONFIG.colors.text, fontSize: 15, fontWeight: '700' },
  failOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(26,22,18,0.92)', justifyContent: 'center', alignItems: 'center',
  },
  failCard: {
    backgroundColor: CONFIG.colors.surface, borderRadius: 20, padding: 32,
    marginHorizontal: 32, alignItems: 'center', borderWidth: 1, borderColor: '#FF6B6B',
  },
  failEmoji: { fontSize: 48, marginBottom: 12 },
  failTitle: { fontSize: 24, fontWeight: '700', color: '#FF6B6B', marginBottom: 16 },
  failHint: { fontSize: 14, color: CONFIG.colors.textSecondary, marginBottom: 22 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CONFIG.colors.primary, paddingHorizontal: 36, paddingVertical: 14, borderRadius: 12,
    marginBottom: 10,
  },
  retryBtnText: { color: CONFIG.colors.background, fontSize: 16, fontWeight: '700' },
  failBackBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  failBackBtnText: { color: CONFIG.colors.textSecondary, fontSize: 14 },
});
