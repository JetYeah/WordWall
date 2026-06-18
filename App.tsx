import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Stack } from './src/navigation/createAppStack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { AchievementsScreen } from './src/screens/AchievementsScreen';
import { LibraryManagerScreen } from './src/screens/LibraryManagerScreen';
import { HideSeekBuilderScreen } from './src/screens/HideSeekBuilderScreen';
import { BookmarkModal } from './src/components/BookmarkModal';
import { BookmarkData } from './src/components/BookmarkCard';
import { Puzzle, PuzzleLayout, PlayerProgress, GameSettings, DevModeState, FavoriteQuote, DifficultyLevel, GameResult, Achievement, GameMode } from './src/game/types';
import { generateDailyPuzzle, generatePuzzleFromQuote, getRandomQuote, loadPuzzles, DIFFICULTY_CONFIGS, computeCoreAreaCells, PUZZLE_LIBRARY, generateModePuzzle, pickDifficultyForQuote } from './src/game/puzzleGenerator';
import { addPuzzlePure, updatePuzzlePure, deletePuzzlePure, PuzzleDraft } from './src/game/library';
import type { HideSeekValidation } from './src/game/hideSeek';
import { loadCustomPuzzles, saveCustomPuzzles } from './src/utils/libraryStore';
import { applyCompletion, nowLocalIsoDate } from './src/game/stats';
import { findNewlyUnlocked, getAchievement, TIER_META } from './src/game/achievements';
import { makeDefaultProgress, loadPlayerProgress, savePlayerProgress, loadGameSettings, saveGameSettings, loadFavorites, saveFavorites } from './src/utils/storage';
import { soundManager } from './src/utils/soundManager';
import { CONFIG } from './src/config';
import { computeCellSize } from './src/game/engine';

export type RootStackParamList = {
  Home: undefined;
  Game: { puzzle: Puzzle; layout: PuzzleLayout; isDaily?: boolean; mode?: GameMode; date?: string; hideTimeLimitSec?: number | null };
  Settings: undefined;
  History: undefined;
  Achievements: undefined;
  Library: undefined;
  HideSeekBuilder: undefined;
};

// Stack 由平台文件提供（src/navigation/createAppStack.ts = web / .native.ts = native），
// 让 @react-navigation/stack 只进 web 包：否则它在 Android 会连带打包 react-native-gesture-handler，
// 而 gesture-handler@2.24 引用的 react-native 内部 shim 在 RN 0.86(SDK56) 已不存在，standalone 打包会失败。
// （screenOptions 不再传 animation：JS stack 不识别该 prop，native-stack 默认即 slide，视觉无差。）

const todayIso = () => nowLocalIsoDate();

export default function App() {
  const [ready, setReady] = useState(false);
  const [dailyData, setDailyData] = useState<{ puzzle: Puzzle; layout: PuzzleLayout } | null>(null);
  // 盲人摸象 / 投石问路 的「今日题」（classic 走 dailyData）
  const [modeData, setModeData] = useState<{ blind: { puzzle: Puzzle; layout: PuzzleLayout } | null; probe: { puzzle: Puzzle; layout: PuzzleLayout } | null }>({ blind: null, probe: null });
  const [historyData, setHistoryData] = useState<Array<{ puzzle: Puzzle; layout: PuzzleLayout; date: string }>>([]);
  const [progress, setProgress] = useState<PlayerProgress>(makeDefaultProgress);
  const [settings, setSettings] = useState<GameSettings>({ soundEnabled: true, hapticEnabled: true, difficulty: 'medium' });
  const [devMode, setDevMode] = useState<DevModeState>({ enabled: false, showAnswer: false });
  const [favorites, setFavorites] = useState<FavoriteQuote[]>([]);
  // 开发者自定义题库（AsyncStorage 持久化）；与内置 PUZZLE_LIBRARY 合并为「工作题库」
  const [customPuzzles, setCustomPuzzles] = useState<Puzzle[]>([]);
  const customPuzzlesRef = useRef<Puzzle[]>([]);
  customPuzzlesRef.current = customPuzzles;

  // 全局书签分享弹窗（GameScreen / History 复用同一实例）
  const [bookmarkData, setBookmarkData] = useState<BookmarkData | null>(null);
  // 成就解锁浮层队列
  const [pendingUnlocks, setPendingUnlocks] = useState<Achievement[]>([]);

  const navRef = useRef<any>(null);
  // progress 的 ref 镜像：handleComplete 同步读取最新值，避免在 setProgress updater 内
  // 触发其它 setState / 副作用（updater 可能被调用多次，会导致重复解锁音效 / 重复入队）。
  const progressRef = useRef<PlayerProgress>(progress);
  progressRef.current = progress;

  // 屏幕像素尺寸（传给生成器算核心区）
  const screenPix = useRef(() => {
    const { width, height } = Dimensions.get('window');
    return { w: width, h: height };
  }).current();

  // — 初始化：加载存档、生成今日题、初始化音效 —
  useEffect(() => {
    (async () => {
      const [p, s, favs, custom] = await Promise.all([
        loadPlayerProgress(),
        loadGameSettings(),
        loadFavorites(),
        loadCustomPuzzles(),
      ]);
      setProgress(p);
      setSettings(s);
      setFavorites(favs);
      setCustomPuzzles(custom);
      soundManager.setSoundEnabled(s.soundEnabled);
      soundManager.setHapticEnabled(s.hapticEnabled);
      const daily = generateDailyPuzzle(undefined, s.difficulty, screenPix.w, screenPix.h);
      setDailyData(daily);
      setModeData({
        blind: generateModePuzzle('blind', undefined, screenPix.w, screenPix.h),
        probe: generateModePuzzle('probe', undefined, screenPix.w, screenPix.h),
      });
      setHistoryData(loadPuzzles(30, s.difficulty, screenPix.w, screenPix.h));
      setReady(true);
    })();
    // 音效系统懒加载（首个声音都在用户操作之后，满足自动播放策略）
    soundManager.initialize();
  }, []);

  // 设置变化 → 同步音效开关 + 持久化
  useEffect(() => {
    soundManager.setSoundEnabled(settings.soundEnabled);
    soundManager.setHapticEnabled(settings.hapticEnabled);
  }, [settings.soundEnabled, settings.hapticEnabled]);

  useEffect(() => { if (ready) savePlayerProgress(progress); }, [progress, ready]);
  useEffect(() => { if (ready) saveFavorites(favorites); }, [favorites, ready]);

  const handleSettingsChange = useCallback((s: GameSettings) => {
    setSettings(s);
    saveGameSettings(s);
  }, []);

  // — 完成一局：统计并入 + 成就解锁判定 —
  // isDaily=true：真正的每日题，计入连胜 / 完成日 / totalCompleted。
  // isDaily=false：历史复玩 / dev 题，仅记录解题统计，不污染每日进度。
  const handleComplete = useCallback((puzzle: Puzzle, result: GameResult, isDaily: boolean, mode: GameMode, date?: string) => {
    // 结算日：优先用路由传入的 date（今日题=今天、历史日期=该历史日）；缺省（自定义题库试玩）回退今天。
    // 历史/今日路径下 date 恒为今天，故与旧行为一致；显式传入是为消除「date 形参存在却没用」的隐患。
    const rec = date ?? todayIso();
    // 捉迷藏是 ad-hoc 自定义题：不计入任何统计 / 成就 / 历史（庆祝弹窗由 GameScreen 自行展示）。
    if (mode === 'hide') return;
    // 盲人摸象 / 投石问路 视为「困难」档挑战（hard 核心区 + 3 分钟限时 + 禁用道具）。
    // 此 difficulty 仅作「展示档」存入 GameRecord.difficulty（徽章 / 书签标签用；不影响指纹——
    // 真实 cardHoles cardSize 9 走 buildFingerprintFromData 专有分支）。classic 难度桶
    // （completionsByDifficulty / bestTimeByDifficulty）在 applyCompletion 内按 mode==='classic' 门控，
    // 模式题不污染 classic 难度统计、不误触发 y_hard1/spd_hard 等 classic 难度成就（走 completionsByMode/bestTimeByMode）。
    const difficulty: DifficultyLevel = mode === 'classic' ? settings.difficulty : 'hard';
    // 同步从 ref 读取最新进度，计算 next / 成就，再一次性 setState；副作用在 updater 之外。
    const prev = progressRef.current;
    const next = applyCompletion(prev, puzzle, result, { date: rec, difficulty, now: Date.now(), isDaily, mode });
    const newly = findNewlyUnlocked(next, { favoritesCount: favorites.length });
    const finalStats: PlayerProgress = newly.length
      ? { ...next, unlockedAchievements: [...next.unlockedAchievements, ...newly.map((a) => a.id)] }
      : next;
    setProgress(finalStats);
    if (newly.length) {
      setPendingUnlocks((q) => [...q, ...newly]);
      soundManager.playSound('achievement');
      void soundManager.playHaptic('success');
    }
  }, [settings.difficulty, favorites.length]);

  // ─── 成就解锁浮层：自动逐条消费 ───
  useEffect(() => {
    if (pendingUnlocks.length === 0) return;
    const t = setTimeout(() => {
      setPendingUnlocks((q) => q.slice(1));
    }, 4200);
    return () => clearTimeout(t);
  }, [pendingUnlocks]);

  const dismissUnlock = useCallback(() => setPendingUnlocks((q) => q.slice(1)), []);

  // ─── Dev mode callbacks ──────────────────────

  // Dev mode「换题」：同难度字数范围内换一道（排除当前）。模式感知：
  // classic 按当前难度；blind/probe 固定 medium，刷新对应 modeData。
  const handleRegeneratePuzzle = useCallback((mode: GameMode) => {
    if (mode === 'hide') return; // 捉迷藏无每日 / 题库概念，dev 换题无意义
    const isClassic = mode === 'classic';
    const diff: DifficultyLevel = isClassic ? settings.difficulty : 'medium';
    const config = DIFFICULTY_CONFIGS[diff];
    const cellSize = computeCellSize(screenPix.w);
    const gridCols = Math.floor(screenPix.w / cellSize);
    const gridRows = Math.floor(screenPix.h / cellSize);
    // 非经典模式用 hard 核心区（与 generateModePuzzle 一致），卡片/字数仍 medium（config）。
    const coreArea = computeCoreAreaCells(gridCols, gridRows, isClassic ? config : DIFFICULTY_CONFIGS.hard, screenPix.w, screenPix.h, cellSize);
    const excludeId = isClassic ? dailyData?.puzzle.id : modeData[mode]?.puzzle.id;
    const newQuote = getRandomQuote(excludeId, diff);
    const newData = generatePuzzleFromQuote(newQuote, config, coreArea, gridCols, gridRows, cellSize);
    if (isClassic) setDailyData(newData);
    else setModeData((prev) => ({ ...prev, [mode]: newData }));
    // Reset nav stack: Home → new Game（dev 换题不计入每日进度）
    navRef.current?.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        { name: 'Game', params: { puzzle: newData.puzzle, layout: newData.layout, isDaily: false, mode } },
      ],
    });
  }, [dailyData, modeData, settings.difficulty, screenPix]);

  // Dev mode「切难度」：立即按新难度生成今日题
  const handleChangeDifficulty = useCallback((level: DifficultyLevel) => {
    if (level === settings.difficulty) return;
    const next = { ...settings, difficulty: level };
    setSettings(next);
    saveGameSettings(next);
    const newData = generateDailyPuzzle(undefined, level, screenPix.w, screenPix.h);
    setDailyData(newData);
    setHistoryData(loadPuzzles(30, level, screenPix.w, screenPix.h));
    navRef.current?.navigate('Home' as any);
  }, [settings, screenPix]);

  const handleToggleFavorite = useCallback((puzzle: Puzzle) => {
    setFavorites((prev) => {
      const exists = prev.find(f => f.id === puzzle.id);
      if (exists) return prev.filter(f => f.id !== puzzle.id);
      return [...prev, {
        id: puzzle.id,
        quote: puzzle.quote,
        author: puzzle.author,
        source: puzzle.source,
        category: puzzle.category,
        savedAt: Date.now(),
      }];
    });
  }, []);

  const handleToggleDevMode = useCallback(() => {
    setDevMode(prev => ({ ...prev, enabled: !prev.enabled, showAnswer: false }));
  }, []);

  // Dev mode「上一题 / 下一题」：在题库中循环（跨难度字数范围，便于测试全库）。模式感知。
  const handleCycleQuote = useCallback((dir: -1 | 1, mode: GameMode) => {
    if (mode === 'hide') return; // 捉迷藏不循环题库
    const isClassic = mode === 'classic';
    const curId = isClassic ? dailyData?.puzzle.id : modeData[mode]?.puzzle.id;
    const idx = PUZZLE_LIBRARY.findIndex((p) => p.id === curId);
    if (idx < 0) return;
    const nextQuote = PUZZLE_LIBRARY[(idx + dir + PUZZLE_LIBRARY.length) % PUZZLE_LIBRARY.length];
    const diff: DifficultyLevel = isClassic ? settings.difficulty : 'medium';
    const config = DIFFICULTY_CONFIGS[diff];
    const cellSize = computeCellSize(screenPix.w);
    const gridCols = Math.floor(screenPix.w / cellSize);
    const gridRows = Math.floor(screenPix.h / cellSize);
    // 非经典模式用 hard 核心区（与 generateModePuzzle 一致），卡片/字数仍 medium（config）。
    const coreArea = computeCoreAreaCells(gridCols, gridRows, isClassic ? config : DIFFICULTY_CONFIGS.hard, screenPix.w, screenPix.h, cellSize);
    const newData = generatePuzzleFromQuote(nextQuote, config, coreArea, gridCols, gridRows, cellSize);
    if (isClassic) setDailyData(newData);
    else setModeData((prev) => ({ ...prev, [mode]: newData }));
    navRef.current?.reset({
      index: 1,
      routes: [
        { name: 'Home' },
        { name: 'Game', params: { puzzle: newData.puzzle, layout: newData.layout, isDaily: false, mode } },
      ],
    });
  }, [dailyData, modeData, settings.difficulty, screenPix]);

  const handleToggleShowAnswer = useCallback(() => {
    setDevMode(prev => ({ ...prev, showAnswer: !prev.showAnswer }));
  }, []);

  // ─── 题库管理（开发者）──────────────────────────────
  // 新增自定义题；返回 '' 成功 / 错误信息失败（供 UI 即时反馈）
  const handleAddPuzzle = useCallback((draft: PuzzleDraft): string => {
    const r = addPuzzlePure(customPuzzlesRef.current, draft);
    if (r.error) return r.error;
    setCustomPuzzles(r.custom);
    void saveCustomPuzzles(r.custom);
    return '';
  }, []);

  const handleUpdatePuzzle = useCallback((id: string, draft: PuzzleDraft): string => {
    const r = updatePuzzlePure(customPuzzlesRef.current, id, draft);
    if (r.error) return r.error;
    setCustomPuzzles(r.custom);
    void saveCustomPuzzles(r.custom);
    return '';
  }, []);

  const handleDeletePuzzle = useCallback((id: string) => {
    const next = deletePuzzlePure(customPuzzlesRef.current, id);
    setCustomPuzzles(next);
    void saveCustomPuzzles(next);
  }, []);

  // 试玩任一题（自定义 / 内置 / 日期查询结果）：按字数选难度 → 生成 layout → 进 Game
  const handlePlayCustom = useCallback((puzzle: Puzzle) => {
    const diff = pickDifficultyForQuote(puzzle.quote.length);
    const config = DIFFICULTY_CONFIGS[diff];
    const cellSize = computeCellSize(screenPix.w);
    const gridCols = Math.floor(screenPix.w / cellSize);
    const gridRows = Math.floor(screenPix.h / cellSize);
    const coreArea = computeCoreAreaCells(gridCols, gridRows, config, screenPix.w, screenPix.h, cellSize);
    const { layout } = generatePuzzleFromQuote(puzzle, config, coreArea, gridCols, gridRows, cellSize);
    navRef.current?.navigate('Game' as any, { puzzle, layout, isDaily: false, mode: 'classic' } as any);
  }, [screenPix]);

  // 捉迷藏：A 校验通过后，据其指定的镂空 / 旋转 / 时长生成 layout 并交给 B。
  // 复用 generatePuzzleFromQuote 的 fixedHoles / fixedRotation：A 的镂空几何原样到达 B（layout 按值传递、GameScreen 不重算）。
  const handleHideSeekSubmit = useCallback((v: HideSeekValidation) => {
    const config = DIFFICULTY_CONFIGS[v.difficulty];
    const cellSize = computeCellSize(screenPix.w);
    const gridCols = Math.floor(screenPix.w / cellSize);
    const gridRows = Math.floor(screenPix.h / cellSize);
    const coreArea = computeCoreAreaCells(gridCols, gridRows, config, screenPix.w, screenPix.h, cellSize);
    const puzzle: Puzzle = {
      id: `hide_${Math.random().toString(36).slice(2, 8)}`,
      quote: v.quote,
      // 提示信息：A 写了就在游戏内「出处」位显示（—— 提示《…》），否则用默认占位
      author: v.hint ? '提示' : '捉迷藏',
      source: v.hint || '出题人自拟',
      category: '名人名言',
    };
    const { layout } = generatePuzzleFromQuote(puzzle, config, coreArea, gridCols, gridRows, cellSize, undefined, v.holes, v.rotation);
    navRef.current?.navigate('Game' as any, {
      puzzle, layout, isDaily: false, mode: 'hide', hideTimeLimitSec: v.timeLimitSec,
    } as any);
  }, [screenPix]);

  const handleOpenLibrary = useCallback(() => {
    navRef.current?.navigate('Library' as any);
  }, []);

  // ─── Navigation helper ────────────────────────

  const navigate = (screen: string, params?: any) => {
    navRef.current?.navigate(screen as any, params as any);
  };

  if (!ready || !dailyData) return null;

  const todayIsoStr = todayIso();
  const todayDone = progress.completedDates.includes(todayIsoStr);
  // 各模式「今日已完成」：classic 走 completedDates；blind / probe 走 bonusByDate。
  // 首页据此把对应模式卡片标为「已完成」，且点击进入即查看正解（App.Game 据此判 viewOnly）。
  const modeDoneToday = {
    classic: todayDone,
    blind: progress.bonusByDate[todayIsoStr]?.blind === true,
    probe: progress.bonusByDate[todayIsoStr]?.probe === true,
  };

  return (
    <SafeAreaProvider>
    <NavigationContainer
      ref={navRef}
      theme={{
        dark: true,
        colors: {
          primary: CONFIG.colors.primary,
          background: CONFIG.colors.background,
          card: CONFIG.colors.background,
          text: CONFIG.colors.text,
          border: CONFIG.colors.surface,
          notification: CONFIG.colors.primary,
        },
        fonts: {
          regular: { fontFamily: undefined as any, fontWeight: '400' },
          medium: { fontFamily: undefined as any, fontWeight: '500' },
          bold: { fontFamily: undefined as any, fontWeight: '700' },
          heavy: { fontFamily: undefined as any, fontWeight: '900' },
        },
      }}
    >
      <Stack.Navigator
        id="RootStack"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home">
          {() => (
            <HomeScreen
              onStartMode={(m: GameMode) => {
                if (m === 'hide') return; // 捉迷藏走 onStartHideSeek，不应经此入口
                const data = m === 'classic' ? dailyData : modeData[m];
                if (!data) return;
                // 仅 classic「今日解密」计入每日进度；blind/probe 为独立挑战，记录解题统计但不计入每日
                navigate('Game', {
                  puzzle: data.puzzle,
                  layout: data.layout,
                  isDaily: m === 'classic',
                  mode: m,
                  date: todayIsoStr,
                });
              }}
              modeData={{
                classic: dailyData,
                blind: modeData.blind,
                probe: modeData.probe,
              }}
              onHistory={() => navigate('History')}
              onSettings={() => navigate('Settings')}
              onAchievements={() => navigate('Achievements')}
              onStartHideSeek={() => navigate('HideSeekBuilder')}
              progress={progress}
              favoritesCount={favorites.length}
              modeDone={modeDoneToday}
              devModeEnabled={devMode.enabled}
              difficulty={settings.difficulty}
              soundEnabled={settings.soundEnabled}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Game">
          {({ route }) => {
            const { puzzle, layout } = route.params as any;
            const mode: GameMode = (route.params as any).mode ?? 'classic';
            const date: string | undefined = (route.params as any).date;
            const hideTimeLimitSec: number | null | undefined = (route.params as any).hideTimeLimitSec;
            const isFavorite = favorites.some(f => f.id === puzzle.id);
            // 查看模式（正解展示 + 下方信息框）：
            //   classic —— 该日期已写入 completedDates（今日 / 历史已完成）→ 再次进入显示正解
            //   blind / probe —— 该日期已记入 bonusByDate（今日已完成附加题）→ 再次进入显示正解
            // dev 模式永不锁查看。date 缺省（自定义题库试玩）→ 永不查看，可反复重解。
            const classicDone = mode === 'classic' && typeof date === 'string' && progress.completedDates.includes(date);
            const bonusDone = mode !== 'classic' && typeof date === 'string' && (progress.bonusByDate[date]?.[mode as 'blind' | 'probe'] === true);
            const viewOnly = (classicDone || bonusDone) && !devMode.enabled;
            // 仅「真正的今日题」计入每日进度；历史复玩 / dev 题 / blind / probe 不计。
            const isDaily = (route.params as any).isDaily !== false;
            // 有效难度：classic 用全局设置；blind/probe 视为「困难」（v5 起 hard 核心区 + 无道具硬核挑战）。
            // 驱动完成徽章 / 书签 / 核心区回退 / DevConsole 高亮，与首页标签一致显示「困难」。
            const effectiveDifficulty: DifficultyLevel = mode === 'classic' ? settings.difficulty : 'hard';
            return (
              <GameScreen
                puzzle={puzzle}
                layout={layout}
                mode={mode}
                hideTimeLimitSec={hideTimeLimitSec}
                onComplete={(result: GameResult) => handleComplete(puzzle, result, isDaily, mode, date)}
                onBack={() => navigate('Home')}
                devMode={devMode}
                isFavorite={isFavorite}
                onRegenerate={handleRegeneratePuzzle}
                onToggleFavorite={() => handleToggleFavorite(puzzle)}
                onToggleShowAnswer={handleToggleShowAnswer}
                onCycleQuote={handleCycleQuote}
                onChangeDifficulty={handleChangeDifficulty}
                onShareBookmark={(data: BookmarkData) => setBookmarkData(data)}
                onOpenLibrary={handleOpenLibrary}
                viewOnly={viewOnly}
                difficulty={effectiveDifficulty}
              />
            );
          }}
        </Stack.Screen>

        <Stack.Screen name="Settings">
          {() => (
            <SettingsScreen
              settings={settings}
              onSettingsChange={handleSettingsChange}
              devModeEnabled={devMode.enabled}
              onToggleDevMode={handleToggleDevMode}
              currentDifficulty={settings.difficulty}
              onChangeDifficulty={handleChangeDifficulty}
              onBack={() => navigate('Home')}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="History">
          {() => (
            <HistoryScreen
              puzzles={historyData.map(h => ({ puzzle: h.puzzle, date: h.date }))}
              records={progress.history}
              completedDates={progress.completedDates}
              bonusByDate={progress.bonusByDate}
              onSelectPuzzle={(puzzle: Puzzle, date: string) => {
                const found = historyData.find(h => h.puzzle.id === puzzle.id);
                // 带上 date：App.Game 据此判断该日是否已完成 → 已完成则进入查看模式（显示正解）。
                if (found) navigate('Game', { puzzle: found.puzzle, layout: found.layout, isDaily: false, mode: 'classic', date });
              }}
              onShareRecord={(data: BookmarkData) => setBookmarkData(data)}
              onBack={() => navigate('Home')}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Achievements">
          {() => (
            <AchievementsScreen
              progress={progress}
              favoritesCount={favorites.length}
              onBack={() => navigate('Home')}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Library">
          {() => (
            <LibraryManagerScreen
              customPuzzles={customPuzzles}
              onAdd={handleAddPuzzle}
              onUpdate={handleUpdatePuzzle}
              onDelete={handleDeletePuzzle}
              onPlay={handlePlayCustom}
              onBack={() => navigate('Home')}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="HideSeekBuilder">
          {() => (
            <HideSeekBuilderScreen
              workingLibrary={[...PUZZLE_LIBRARY, ...customPuzzles]}
              onCancel={() => navigate('Home')}
              onSubmit={handleHideSeekSubmit}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>

      {/* 全局书签分享弹窗 */}
      <BookmarkModal data={bookmarkData} onClose={() => setBookmarkData(null)} />

      {/* 成就解锁浮层（最高 z-index，盖在所有屏幕之上） */}
      <AchievementToast
        unlock={pendingUnlocks[0]}
        onDismiss={dismissUnlock}
      />
    </NavigationContainer>
    </SafeAreaProvider>
  );
}

// ─── 成就解锁浮层 ──────────────────────────────────────
// 用透明 Modal 承载：native-stack 的屏幕 surface 会盖住 NavigationContainer 的普通兄弟 View，
// 纯绝对定位的 toast 在 iOS 上会被遮挡。Modal 是独立窗口层级，能稳定浮于其上。
const AchievementToast: React.FC<{ unlock?: Achievement; onDismiss: () => void }> = ({ unlock, onDismiss }) => {
  const tier = unlock ? TIER_META[unlock.tier] : null;
  return (
    <Modal visible={!!unlock} transparent animationType="fade" onRequestClose={onDismiss}>
      <View pointerEvents="box-none" style={toastStyles.wrap}>
        {!!unlock && tier && (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => { soundManager.playSound('button_click'); onDismiss(); }}
            style={[toastStyles.card, { borderColor: tier.color }]}
          >
            <View style={[toastStyles.iconWrap, { backgroundColor: `${tier.color}22` }]}>
              <Ionicons name="trophy" size={22} color={tier.color} />
            </View>
            <View style={toastStyles.textWrap}>
              <Text style={toastStyles.kicker}>✦ 成就解锁</Text>
              <Text style={toastStyles.name} numberOfLines={1}>{unlock.name}</Text>
              <Text style={toastStyles.desc} numberOfLines={1}>{unlock.desc}</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

const toastStyles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: 54, left: 0, right: 0,
    alignItems: 'center', paddingHorizontal: 24,
    zIndex: 9999, elevation: 9999,
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(38, 30, 22, 0.97)',
    borderRadius: 16, padding: 12, paddingRight: 18,
    borderWidth: 1.5, minWidth: 280, maxWidth: 360,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  textWrap: { flex: 1 },
  kicker: { fontSize: 10, color: CONFIG.colors.primary, letterSpacing: 2, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '700', color: CONFIG.colors.text, marginTop: 2 },
  desc: { fontSize: 11, color: CONFIG.colors.textSecondary, marginTop: 2 },
});
