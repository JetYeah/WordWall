# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

字垣 / WordWall — an Expo / React Native game in the style of 探险小虎队 "decoder card" puzzles. The name 字垣 (zì-yuán) puns on 字缘 ("word-fate"): 文字筑墙，邂逅一句之缘. The whole screen is a wall of Chinese filler characters (each cell randomly styled for visual noise). The player holds one irregular **decoder card** with multiple holes; the quote's characters are scattered one-per-hole-position in the wall. The player **drags the card and rotates it in 90° steps** until every hole simultaneously lands on the correct character — the full quote then reads through the holes. Stack: Expo SDK 56, React Native 0.86, React 19, TypeScript. No backend; puzzles are generated client-side from a built-in 43-quote library (`PUZZLE_LIBRARY`). Layout/state is fully deterministic per ISO date, so "daily puzzle" needs no server.

## Commands

```bash
npm install        # .npmrc sets registry.npmmirror.com + legacy-peer-deps=true
npm start          # expo start — Metro + QR for Expo Go
npm run android    # expo start --android
npm run ios        # expo start --ios
npm run web        # expo start --web
npm test           # jest (ts-jest) — ~245 tests across 8 suites
npx tsc --noEmit   # type-checks APP code only (tests excluded — see test-infra gotcha)
npx jest src/game/__tests__/engine.test.ts   # single test file
```

- `tsconfig.json` just `extends: expo/tsconfig.base`, empty `compilerOptions` — no path aliases. **`strict` is OFF** (expo base doesn't set it) — see the strict-OFF gotcha.
- Metro does NOT type-check; `tsc --noEmit` clean ≠ clean bundle. Run both before claiming "it works."
- `react-native-gesture-handler` is declared but unused (drag uses RN `PanResponder`; animation uses RN `Animated`). **`react-native-reanimated` and `react-native-paper` are NOT installed** — an older revision of this file claimed they were "declared but unused"; that was stale (no babel plugin either). `react-native-webview` (13.16.x) IS installed — used by the 叠嶂 cube mode (real 3D via WebView, see below).

## Architecture

**State split.** `App.tsx` owns `dailyData {puzzle, layout}`, `historyData`, `progress`, `settings`, `devMode` (in-memory only), `favorites`, `customPuzzles`, loading from AsyncStorage on mount. `GameScreen` owns all per-move state: `cardCenter` (pixel coords), `rotation`, `revealedChars`, `holeMatches`, `isComplete`. `App.tsx` is the sole writer to persisted progress.

**Navigation** (`@react-navigation/native-stack`), stack `Home / Game / Settings / History / Achievements / Library / HideSeekBuilder`. `RootStackParamList` types `Game: { puzzle, layout, mode, difficulty, date?, hideTimeLimitSec? }` — both puzzle and pre-built layout are passed in so the screen never regenerates. `Stack.Navigator` carries `id="RootStack"` (required by this native-stack version). Screens use inline render-prop children so `App.tsx` injects callbacks; `animation: 'slide_from_right'`, `headerShown: false`.

**Engine / UI separation** — pure logic in `src/game/`, no React imports:
- `engine.ts` — `CELL_SIZE` (28, the single px↔cell constant), constants (`DEFAULT_GRID_COLS/ROWS`, `DEFAULT_CARD_SIZE=9`, `TOP_RESERVE_PX=108`, `BOTTOM_RESERVE_PX=198`). Functions: `rotateOffset` (90°-step hole rotation), `pixelToGrid` (rounds px/CELL_SIZE), `getRevealedChars` (chars under all holes), `getHoleMatches` (per-hole correctness), `checkSolution` (whole-quote correctness), `computeCoreAreaCells` (the solvable core rect), `generateCellStyle` (deterministic per-cell visual noise from a hash).
- `puzzleGenerator.ts` — `PUZZLE_LIBRARY` (43 quotes), `hashCode`, `mulberry32` PRNG, `generateCardHoles`/`generateCardMask`, `generateGrid` (fills with `FILLER_CHARS` then stamps `quote[i]` at `solutionPosition + rotateOffset(holes[i], solutionRotation)`, **re-rolling if any of the other 3 rotations also match** — unique solution; depth-capped at 50), `generateDailyPuzzle`, `generatePuzzleFromQuote` (optional `fixedHoles`/`fixedRotation` for hide mode), `generateModePuzzle`, `pickDifficultyForQuote`, `loadPuzzles`, `getRandomQuote`. `MODE_TIME_LIMIT_SEC = 180`.
- `types.ts` — `Puzzle`, `CardHole {offsetX, offsetY}` (relative to card **center**, in grid cells), `CardShape {size, holes, mask}`, `PuzzleLayout {grid, gridRows, gridCols, cardShape, solutionPosition, solutionRotation, coreArea}`, `PlayerProgress`, `GameSettings`, `GameMode = 'classic'|'blind'|'probe'|'hide'|'cube'`, `FavoriteQuote`, `DevModeState`.
- Other pure modules: `stats.ts` (`applyCompletion` reducer), `achievements.ts`, `schema.ts` (constants, kept out of `storage.ts` so game-logic stays jest/native-free), `library.ts` (custom-library logic), `aiGenerator.ts` + `quoteCorpus.ts` (offline AI), `hideSeek.ts` (hide validation), `fingerprint.ts` (bookmark fingerprint), `voxelFaces.ts` (叠嶂 6-face wall generator), `voxelHtml.ts` (叠嶂 three.js WebGL HTML payload — pure).

**The decoder-card loop** (core mechanic):
1. Generator picks `solutionPosition` (col,row), `solutionRotation` ∈ {0,90,180,270}, stamps each `quote[i]` at the rotated hole offset. Initial card rotation = `solutionRotation + 90 + rand*90`, so start state is **never** solved.
2. Card position is a **pixel-space center** (`cardCenter.x/y`), mirrored in a `useRef` (`posRef`) so `PanResponder` reads latest position synchronously. Rotation mirrored in `rotRef`.
3. On every pan move **and** every angle tap, `GameScreen.tryCheck(px, py, rot)` runs: `pixelToGrid` → `getRevealedChars` + `getHoleMatches` to highlight holes; `checkSolution` (revealed chars `join('') === quote`) fires completion.
4. Per-hole green = that hole's char matches. `matchCount >= holes.length * 0.6` turns the card border gold. Hole text is counter-rotated (`-rotation`).
5. Completion = **only** `checkSolution` over the whole quote (no partial win state).

**Reading-order invariant** (CORE RULE — enforced in `generatePuzzleFromQuote`): in the solved state, the chars visible through the holes — read in grid order (row asc, then col asc) — must equal the quote. This holds because `holes` are sorted by `rotateOffset(h, solRot)`'s `(offsetY, offsetX)` *before* `quote[i]` is stamped, so `holes[i]` is by construction the i-th reading position. **Do not remove this sort or reorder `holes` elsewhere** — `getRevealedChars`/`checkSolution` rely on hole index ↔ quote index aligning with reading order. (`fixedHoles` for hide mode still run this sort, so A controls hole geometry, not which char lands per hole.)

**Coordinate system** (read twice before touching layout):
- `CELL_SIZE` (28) is the single px↔cell source of truth. Grid dims = `floor(screen.w / CELL_SIZE)` × `floor(screen.h / CELL_SIZE)` (computed in `App.tsx`).
- Card pixel size = `cardShape.size * CELL_SIZE`. Hole pixel pos inside card = `(hole.offsetX + halfGrid) * CELL_SIZE` (offsets relative to center, can be negative).
- `pixelToGrid(cardCenterPx) → {col, row}` is the card's center cell; each hole's cell = that + `rotateOffset(hole, rotation)`.
- Grid centered horizontally via `gridOffsetX = max(0, (screenW - gridW)/2)`; card coords are **screen** space, so `GameScreen` adds `gridOffsetX` when snapping to the solution. **Do not add padding inside `TextGrid`** — it desyncs the card from the cells.

**Daily determinism**: `generateDailyPuzzle(date?)` → `hashCode(ISO_DATE)` picks `PUZZLE_LIBRARY[seed % len]`; a `mulberry32` PRNG seeded from the same hash drives hole layout/mask/grid fill/solution. Same date → identical puzzle. `loadPuzzles(30)` regenerates the last 30 days for History. Uses two separate PRNGs (`mulberry32(seed)` to pick, `mulberry32(seed+12345)` to lay out) — **keep them separate** or determinism breaks.

**Remote daily library (真·每日一题)**: daily/mode/history 题源优先用远程库 `data/quotes.json`（GitHub main，经 jsDelivr `https://cdn.jsdelivr.net/gh/JetYeah/WordWall@main/data/quotes.json`）。App 启动后台 `fetchRemoteLibrary`（5s 超时、jsDelivr→raw 兜底、`normalizeRemote` 校验去重、**永不抛**）+ AsyncStorage 24h 缓存（`decode_card_remote_library`）+ 内置 `PUZZLE_LIBRARY` 兜底。`generateDailyPuzzle`/`generateModePuzzle`/`loadPuzzles` 加可选 `source` 形参（默认内置，向后兼容）；`App.tsx` mount effect 注入 effective source（缓存??内置）首屏先出题、**后台** fetch 刷新 source（不阻塞首屏）。选题仍 `hashCode(date|difficulty) % 子池`，由 `pickDailyQuote`（`src/game/remoteLibrary.ts`）实现并加「当天缓存」`decode_card_daily_picked`（`{[date|difficulty]: quoteId}`）——后台刷新题库后「今天的题」经 picked 命中不变（rng 与 generateDailyPuzzle 同源 `seed+12345`，无 picked 时二者逐字一致）。加题 = 往 `data/quotes.json` 追加一行 + push main（jsDelivr 自动跟进，**无需发版**）。layout/卡片/解仍客户端本地确定性生成（远程只存题面 `quote/author/source/category`）。`r` 前缀 id 区别内置 `q/p/b` 与自定义 `c`。三级兜底：远程 → 缓存 → `PUZZLE_LIBRARY`，断网/CDN 抽风/JSON 损坏均能玩。

**Core-area layout contract** (`computeCoreAreaCells`, regression tests in `engine.test.ts` `核心区布局契约` + narrow-screen solvability 280–414px × all difficulties): (1) **L/R symmetry** — left/right non-core column counts are always equal (`coreCols` same parity as `gridCols`). (2) **Hard maximizes** (`maximizeCore: true`) — cols=`gridCols-2`, rows fill the safe vertical band; easy/medium use `coreWidthRatio`/`coreHeightRatio` but are symmetry- + band-constrained. (3) **No function-area overlap** — core's vertical band is `[TOP_RESERVE_PX=108, screenH - BOTTOM_RESERVE_PX=198]`, so it never hits the top bar or powerup+bottom bar. Narrow degenerate screens (`gridCols < cardSize+4`) fall back to full-width/min core (still symmetric & solvable). `GameScreen` reads `layout.coreArea` (never recomputes) so play-core == gen-core.

## Game modes (`GameMode`)

Five modes, selectable from Home (orthogonal to difficulty):
- **classic** = the daily, uses the user's difficulty; real countdown (`DIFFICULTY_CONFIGS[difficulty].timeLimitSec`) + `isFailed` on timeout.
- **blind (盲人摸象)** / **probe (投石问路)** = fixed-challenge bonus modes. Generated at **medium** config (cardSize 9, quotes 7–8) but with a **hard-sized core area** (`computeCoreAreaCells(..., DIFFICULTY_CONFIGS.hard, ...)`); **180s** limit; **all 3 powerups disabled** (always pure solves). Each seeds with `${date}|${mode}|medium` → three different deterministic "today" puzzles.
- **hide (捉迷藏)** = two-player pass-and-play. Player A picks a sentence + taps hole positions + rotation + optional time limit in `HideSeekBuilderScreen`; `generatePuzzleFromQuote(..., undefined, fixedHoles, fixedRotation)` builds it. Timer: `noTimer` (= `mode==='hide' && totalTime===0`) → count-up `elapsed`, no `isFailed`; else normal countdown. hide completion badge = 捉迷藏 (#FFB347).
- **cube (叠嶂)** = real-3D experimental mode (错落立方体堆). A **full-screen rectangular grid** (`gridCols × gridRows`, hard-config `coreArea` = the full vertical band) — the cube itself stays an `N×N×N` **square** (`N = gridCols`; `computeCubeFace` picks a centered row-band `[faceRow0, faceRow0+N-1]` as its N×N face within the rectangle). The quote is stamped only inside that face-band (`generatePuzzleFromQuote` `solRowRange`); the rest of the rectangle is random filler → the post-flatten solving area is a **hard-style tall rectangle, not a square** (cube content centered, random chars fill the rest — the user-requested behavior). `generateVoxelFaces` makes 6 rectangular walls — the quote stamped on ONE (`layout.grid` reused by reference), other 5 filler; each carries `faceRow0`/`n` so GameScreen slices the N×N face-band out of each to feed `voxelHtml` (the 3D cube is always N×N×N). Rendered via `VoxelPileView` (`react-native-webview` + **three.js WebGL** — see the dedicated section). Player rotates the 3D pile 360°, snaps to a face → cubes auto-flatten into that face's wall → RN crossfades to a 2D TextGrid wall + decode card (classic-style solve). **No timer (`noTimer`, count-up, never `isFailed`), no powerups, no stats** (`App.handleComplete` early-returns for cube like hide; `handleRegeneratePuzzle`/`handleCycleQuote` no-op for cube). cube completion badge = 叠嶂 (#4A90D9).

**blind display:** **every** hole is opaque brown (`BLIND_HOLE_BG`) until matched, then opaque green (`BLIND_MATCH_BG`); **no char shown until `isComplete`** → pure-positional. (`deriveBlindedHoles` subset API remains but is vestigial; rendering is uniform.) **probe display:** chars visible, **no per-hole correctness indication**; when `matchCount > 0` all hole borders go green uniformly + a green count badge (counter-rotated) shows matched count. Matching logic (`getHoleMatches`/`checkSolution`) is unchanged for both — only display differs.

**⚠️ Difficulty-bucket wiring invariant:** `App.tsx` derives `effectiveDifficulty = mode === 'classic' ? settings.difficulty : 'hard'` (ALL non-classic modes incl. hide) and passes it to BOTH `GameScreen.difficulty` (badge/bookmark label) AND `applyCompletion`. blind/probe/hide display as 困难 but **classic difficulty buckets are gated on `mode==='classic'`** in `stats.applyCompletion` (`completionsByDifficulty`/`bestTimeByDifficulty` written for classic only) — so modes don't pollute classic-hard stats or spuriously unlock `y_hard1`/`spd_hard`/`y_all3`. **Don't pass raw `settings.difficulty` to a mode game.** (`GameRecord.difficulty` still stores `'hard'` as a display tier.)

**Completion tracking:** classic → `completedDates`/streak; blind/probe → `bonusByDate[date][mode]` (bonus dots on the calendar). `viewOnly = (classicDone || bonusDone) && !devMode.enabled` — re-opening a completed puzzle reveals the answer. Library custom plays + hide pass **no date → never viewOnly (always replayable)**. hide never reaches `applyCompletion` (no stats write; celebration still fires from GameScreen).

## 叠嶂 (cube) — real 3D voxel pile via WebView+three.js (read before touching cube mode)

**形态：** N×N×N 体素块，小立方体严丝合缝对齐、按密度（`DENS=0.5`）随机缺一些（错落），但**每条轴列保底 ≥1 块** → 6 个面投影过去始终是完整字墙（每格由「该方向最前方存在的块」露字）。透视相机、360° 任意旋转、松手吸附到最近 6 面；吸附后逐块摊平成一面平墙。

**为什么 WebView+three.js（不是纯 RN、也不是 CSS 3D）：** RN transform 无 `translateZ`/`preserve-3d`；CSS 3D 在 WebView 里能做四面盒子，但「很多小立方体 + 任意角度旋转 + 摊平」用 CSS 是几百个 div、移动端扛不住。WebGL（three.js）跑在同一个 WebView 里，CJK 用 CanvasTexture 清晰（WebView 自带 canvas，绕开原生无 canvas 的死结），几百立方体合并成单 mesh（1 draw call）流畅。three.js r128 走国内 CDN（BootCDN→Staticfile→cdnjs 多源回退）+ 加载失败重试 UI（实验模式、需联网首载）。Expo Go 自带 webview，无需 prebuild。

**两阶段解题（核心，对齐零风险）：** 3D 堆只负责「旋转寻面」；吸附摊平后 **RN 淡入该面的 2D TextGrid 字墙 + 解密卡**解题（平墙 = 经典机制、卡片天然对齐，不再有透视缩放对齐问题）。点「返回旋转」→ 注入 `__unflatten` → 3D 堆还原继续转。

- `voxel-pile-preview.html`（repo root）——独立设计原型（双击打开，浏览器跑）。参数与实装基本一致（DENS/密度/吸附/摊平），调外观用它最快。`cube3d-preview.html` 是更早的四面盒子概念，已废弃。
- `src/game/voxelFaces.ts` `generateVoxelFaces(layout, rng)` —— 纯、有测：6 面 gridRows×gridCols **矩形**字墙（立方体 N×N 字面 = 居中行段 `[faceRow0, faceRow0+n)`，由 `computeCubeFace` 算；GameScreen 切出喂 voxelHtml），`grids[solutionFace] === layout.grid`（引用复用），其余 `generateFillerGrid`。
- `src/game/voxelHtml.ts` `buildVoxelHtml(opts)` —— 纯载荷生成器：three.js r128 场景（多源 CDN），合并几何（**必须 `toNonIndexed()` 再拼接**，否则索引丢失→三角形乱连）、CanvasTexture 字图集、透视相机、拖拽旋转（Euler YXZ）+ 吸附（**用「面法线最朝相机」选最近面**，避开四元数双覆盖）、**顶点动画摊平**（frontmost 块沿轴滑到表面共面、其余缩没）、镜头推进。仅离散事件 `postMessage({type:'flat',face})`；`window.__unflatten()` 复位。
- `src/components/VoxelPileView.tsx` —— WebView 封装：memoize `source={{html}}`（防 `tryCheck` 高频重渲染触发 reload）、`onMessage`→`onFlat(face)`、`ref.unflatten()` 注入 `__unflatten`。

**Seam contract（GameScreen）：** `cubePhase: 'rotate'|'flat'`。`'rotate'`：VoxelPileView 挂载可见、卡片隐藏；`'flat'`：VoxelPileView `opacity:0`+`pointerEvents:'none'`（仍挂载以便 `__unflatten`），2D TextGrid 字墙（`voxelFaces.grids[currentFace]`）+ 解密卡显形。`onFlat(face)` → `handleCubeFlat`：切 `currentFace`、`currentGridRef = grids[face]`（**先于** tryCheck）、重置 `lastGP={NaN,NaN}`、重跑 tryCheck、`cubePhase='flat'`、`button_click`+`selection` 音触（解出/失败 bail）。「返回旋转」→ `handleCubeReturnRotate`：`cubeViewRef.unflatten()` + `cubePhase='rotate'`。卡片 gated `opacity: isCube ? (cubePhase==='flat'?1:0) : 1` + panHandlers `...(isComplete||isFailed||(isCube&&cubePhase!=='flat') ? {} : ...)`，cube 模式 `zIndex/elevation:8`。

`currentGridRef` 是引擎唯一通道（引擎函数不收 grid 参数）；cube flat 时 = `grids[currentFace]`（矩形墙），否则 `layout.grid`。`cubeStartFace` seed 派生且 `≠ solutionFace`（强制开局搜索）。`layout` 为**全屏矩形**（gridCols × gridRows）；立方体 N×N 字面 = 矩形墙居中行段（`computeCubeFace`，纯函数、生成期与渲染期同输入 → 零漂移），名言只盖印在字面行内（`generateModePuzzle` 传 `solRowRange`），矩形其余行是随机字 → 摊平后核心区是「困难那样的高矩形」。GameScreen 把每面 N×N 字面切出喂 voxelHtml（其只寻址 `[0,N)`）；正解面 = `layout.grid` → 在正解面解题与 classic 完全一致（`checkSolution` 同一堵矩形墙）。

## Persistence & data model

`src/utils/storage.ts` (keys match `config.ts`): `decode_card_progress`, `decode_card_settings`, `decode_card_favorites`, `decode_card_custom_library`. `migrateProgress` reconciles any legacy blob to the full shape. `PlayerProgress` carries per-difficulty best/count, per-mode best/count (`bestTimeByMode` null-safe), per-category counts, `bonusByDate`, `bestStreak`, `totalPlayTimeSec`, powerup totals, `pureSolves`, `uniqueQuotes`, `history: GameRecord[]`, `unlockedAchievements`, `schemaVersion`. **`bestTime`/`bestTimeByDifficulty`/`bestTimeByMode` are `number | null`** — never `Infinity` (breaks JSON round-trip: `JSON.stringify(Infinity)==='null'`). `applyCompletion(prev, puzzle, result, {date, difficulty, now, isDaily})` is the single reducer; `isDaily=false` skips streak/completedDates but still records solve stats; same-day re-completion doesn't reset streak.

## Achievements

`src/game/achievements.ts` — 35 achievements across milestone/streak/speed/purity/collection/mastery/special, each `progress(stats, ctx)` + `target` (+ optional `customCheck`/`displayValue`). `findNewlyUnlocked(stats, ctx)` returns satisfied-but-unrecorded; `ctx.favoritesCount` threaded in (favorites live in App). Unlock flow in `App.handleComplete`: computes `next` via `applyCompletion` (reading a `progressRef` mirror, NOT inside setState), runs `findNewlyUnlocked`, merges ids, queues an `AchievementToast` (4.2s) + `achievement` sound + haptic. 9 mode achievements (category `special`): `mod_blind_{1,5,10}`, `mod_probe_{1,5,10}`, `mod_dual` (both ≥3), `mod_blind_speed`/`mod_probe_speed` (≤ `MODE_SPEED_THRESHOLD` = `floor(MODE_TIME_LIMIT_SEC*2/3)` = 120s).

## Bookmark / fingerprint share

`BookmarkCard` + `BookmarkModal` — a dark 汉兜/词影-style card. The hero is a **QR-like "fingerprint"** from `src/game/fingerprint.ts` `buildFingerprint(input)` built from four solve attributes: (1) decoder-card shape (real `cardHoles` on a seed-derived silhouette, rotated by `solutionRotation`); (2) time ratio (outer frame lights clockwise ∝ `timeSec/timeLimitSec`); (3) angle (inner block rotates by `solutionRotation` AND a badge moves to the matching corner TL=0°→TR=90°→BR=180°→BL=270°; other 3 corners are gold 2×2 finder anchors); (4) powerup usage (badge color: green=纯解 / copper=used). Below: full quote in `success` green, `author《source》`, status bar `日期·难度·用时·纯解/道具`.

- `buildFingerprint` is pure & deterministic (no `Math.random`/`Date`). `rotateMatrix` is clockwise to match `engine.rotateOffset`. `synthesizeFingerprintInput` is the fallback for old `GameRecord`s lacking `cardHoles`/`cardSize`/`solutionRotation` (new records carry them, copied through `applyCompletion`).
- Rendered by shared `src/components/FingerprintGrid.tsx` (used by both the 208px bookmark block and the calendar mini thumbnail; each caller passes its own `colors` map; transparent `bg` cells are not rendered). **Algorithm: distribute in PHYSICAL px via `PixelRatio.get()`** — `physSize=round(size*dpr)`, integer `physSpan`/`physOff`, render each cell at `lay(physOff[i])`/`lay(physSpan[i])` (`lay=p/dpr`). Every cell edge lands on an integer physical pixel → no AA fringe ("四角毛刺"); adjacent cells share an integer boundary → no gap. Keep `overflow:hidden` as a backstop. **Do NOT go back to `flex:1`, `ceil(size/N)`, or a `+1` overlap** — all left sub-pixel seams or clipped the last row/col.
- Share: `captureRef` (`react-native-view-shot`, bundled in Expo Go SDK 56) → `expo-sharing.shareAsync` (native) / data-uri anchor download (web). Filename prefix `ziyuan-`. Graceful cancel/failure handling.
- Triggered from the completion overlay (passes live card data, uses `nowLocalIsoDate()` not UTC — UTC was off-by-one for CN 0–8am), from History completed days (via `recordToBookmark` reading persisted card fields), and from DevConsole `预览书签` (dev-only, pops the modal without solving).
- **Standalone preview:** `bookmark-preview.html` (repo root, double-click — no build) ports `buildFingerprint`/`rotateMatrix`/`cellHash`/`synthesizeFingerprintInput` **verbatim** to vanilla JS — sync its `<script>` if `fingerprint.ts` changes. (`brand-assets.html`, `perimeter-anim-preview.html` are other standalone tools.)

**Perimeter animation = 字符微烁:** non-core wall chars split into `TWINKLE_GROUPS=10` deterministic spatial-hash groups, each a native opacity loop with a different period (dust-mote shimmer). Rendered as 10 sparse `TextGrid` layers (sparse group mode: `groupIndex`/`groupCount`/`skipR0..skipC1` props, absolute-positioned, skips the core rect) over a static-opacity frost. Drag pauses all via `animControlRef`.

## Rotation control & powerups (classic only)

- **Rotation** = a 2×2 angle selector (`ANGLE_QUADS = [0, 90, 270, 180]` → TL=0°, TR=90°, BL=270°, BR=180°). Each quadrant calls `handleSetRotation(angle)` (sets `rotRef`/`rotation`, fires `tryCheck`, counts rotation only when the angle changes). Current quadrant is gold; `disabledAngles` (from the eliminate powerup) gray out quadrants. Whole block disabled when `isComplete||isFailed`.
- **3 powerups** (single-use booleans): **shrink**, **reveal**, **eliminate (排除角度)**. `triggerEliminate` pushes a random angle from `[0,90,180,270] \ {solutionRotation} \ disabledAngles` into `disabledAngles` — **`solutionRotation` is never eliminated** (solution stays reachable). All 3 disabled in blind/probe/hide (`mode!=='classic'`, both hidden and early-returned for defense-in-depth) → those modes are always pure solves. `tryCheck` throttle also compares `rotation` so rotating onto the solution at the same cell fires `checkSolution`.
- **Per-cell haptics:** when the card **center** crosses into a new grid cell, a selection haptic fires — throttled `HAPTIC_CELL_MIN_MS=45` via `lastCellHapticRef` (slow drags tick per cell, fast drags downsample). Gated `!isComplete && !isFailed`.

## Sound & haptics

`src/utils/soundManager.ts` on `expo-audio`'s `createAudioPlayer` (expo-av was removed in SDK 55+). Players created once in idempotent `initialize()`, replayed via `seekTo(0)`+`play()`; `setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })`. Settings toggles (`soundEnabled`/`hapticEnabled`) actually gate the manager. Triggers in `GameScreen`: `card_place` (release-snap if moved), `button_click` (rotate/powerup), `word_discovered` (per newly-green hole), `near_miss` (once at ≥60%), `time_warning` (30s & 10s), `puzzle_complete`; `achievement` in App. Haptics via `expo-haptics` paired with each; `selection` type for per-cell ticks (no-op + try/catch-safe on web).

## Timer behavior (GameScreen)

The 1s countdown `setInterval` AND the 30s/10s `time_warning` are gated on `isActive = useIsFocused() && AppState==='active'` — **NOT just focus**. `useIsFocused` alone misses app-backgrounding (Home/switch), the most common way users "leave"; RN's `setInterval` ticks in the background, so without the `AppState` half the whistle fires off-screen. While inactive, `remaining` freezes (resumes on return) and `startTimeRef` advances by the away-duration (`pausedAtRef`) so recorded solve-time matches the displayed timer. `warned30/10Ref` deliberately NOT reset on blur (prevents double-whistle). Timer label: `viewOnly?'已完成' : noTimer? formatTime(elapsed) : formatTime(remaining)`. Solve time uses wall-clock `Date.now()-startTimeRef` (works for both countdown and count-up).

## Dev tools

- **DevMode** (toggled in Settings, `DevModeState {enabled, showAnswer}` lives in memory only, never persisted). When enabled, `GameScreen` shows dev actions (换题/答案/收藏/跳过). Dev mode never pollutes daily progress (`isDaily=false`) and never locks `viewOnly`.
- **DevConsole** (collapsible floating panel): puzzle/layout metadata inspector, inline difficulty switch (classic only; modes show a static 困难 info line), 上一题/下一题 library nav, 换题, 显示答案, 收藏, 输出布局 JSON, 题库管理 (→ `LibraryManagerScreen`), `预览书签`. `onCycleQuote` cycles `PUZZLE_LIBRARY`.
- **Custom library** (`decode_card_custom_library`, `src/utils/libraryStore.ts`): working library = built-in `PUZZLE_LIBRARY` (immutable q/p/b ids, drives dailies) + custom (c-prefix). `src/game/library.ts` is pure logic (no AsyncStorage — keeps jest native-free): `getWorkingLibrary`, `isDuplicateQuote` (trim-insensitive), `validatePuzzleDraft` (2–20 chars, author/source required), `addPuzzlePure`/`updatePuzzlePure`/`deletePuzzlePure` (built-in read-only), `lookupDailyByDate`, `filterLibrary`. **`CrudOutcome`/`ValidateResult` are `{ puzzle: Puzzle | null; error: string }` (null-judged), NOT `{ok:true|false}`** — see strict-OFF gotcha. `LibraryManagerScreen` (route `Library`, dev-only): list/add/edit/delete + filter + date lookup + AI 出题.
- **Local AI quote generator** (offline "本地语料+模板", no network/key): `quoteCorpus.ts` (~70 public-domain entries, not duplicating the 43 built-ins) + `aiGenerator.ts` `generateFromRange(input, library, limit=12)` — filters by author/source/quote substring, dedups against working library, returns c-prefix candidates; no matches → random fallback. `Math.random` is fine here (non-deterministic AI gen; daily determinism is unaffected — that path uses `PUZZLE_LIBRARY` + seed only).
- **hideSeek.ts** (pure, tested): `validateHideSeekDraft` (len 4–11, dedup, hole count === quote.length, holes in-bounds `|offset|≤half`, rotation ∈ 4, time ∈ `[null,60,120,180,300]`), `holesFromToggleGrid`. Null-judged result.

## History screen

Stacked **month-block calendars** (most-recent first): `YYYY年M月` label, Mon-first header (`一二三四五六日`), 7-wide `flexWrap` grid. Calendar math: `firstWeekday=(new Date(y,m-1,1).getDay()+6)%7` (Mon=0), `daysInMonth=new Date(y,m,0).getDate()`. Each day cell: date number + **mini fingerprint** (`MiniFingerprint` via `recordToBookmark`+`buildFingerprintFromData`) if classic-completed (`recordByDate` skips blind/probe records so classic-then-bonus days show the classic print); gray rect if in the 30-day window but not done (tappable → play); bonus dots **flank the date** in fixed-width slots (blind 紫 `#9F7AEA` left, probe 青 `#4FB6C8` right). Long-press a completed day → share bookmark. `onSelectPuzzle(puzzle, date)` threads `date` into the Game route.

## Completion reveal

A bottom info box (quote in `success` green · `—— author《source》` · `位置: (col,row) 旋转: N°`) renders whenever `(devMode.enabled && devMode.showAnswer) || isComplete || viewOnly`. The celebration overlay's **查看谜底** button dismisses it to reveal the solved board + info box (board stays because `isComplete` is still true). The celebration effect is gated on `enteredCompleteRef` (did we START solved?) — fresh solves celebrate, viewOnly re-entries don't. `Celebration` particle burst + completion card scale-in.

## Brand assets

`app.json` has `icon`, `splash` (contain + `#14110A`), `android.adaptiveIcon` (fg/bg/mono), `ios.icon`, `web.favicon`. `scripts/gen-brand-assets.js` is a **zero-dep Node generator** (ports `buildFingerprint` + pure-JS PNG encoder via built-in `zlib`+CRC32) writing 5 no-text PNGs to `assets/` — `node scripts/gen-brand-assets.js`. `brand-assets.html` renders all 6 incl. the splash (needs browser CJK fonts). **Custom icon/splash only show after a real build (prebuild/EAS/run); Expo Go shows its own.**

## ⚠️ Critical gotchas

- **strict is OFF** (`expo/tsconfig.base` sets no `strict` → `strictNullChecks` off). **Boolean-literal discriminated unions (`{ok:true}|{ok:false}`) do NOT narrow** — `if (!v.ok) return {ok:false, error:v.error}` errors `Property 'error' does not exist on {ok:true;...}`, even via ternary. The codebase uses **null-judged results** (`{ puzzle: T|null; error: string }`); narrow on `if (v.puzzle)` (rock-solid in any config). Don't flip `strict` on globally — surfaces many pre-existing issues. (Memory `zhiyuan-tsconfig-strict-off`.)
- **Test/type-check infra (TS 6.0):** bare `npx tsc --noEmit` checks **app code only** — `tsconfig.json` `exclude`s `__tests__/**`, `*.test.ts(x)`, `scripts`, `*.html`; tests are type-checked by ts-jest (`package.json` jest `globals['ts-jest'].tsconfig.types = ["jest","node"]`). **When changing test files, run `npm test`, not bare tsc** — bare tsc no longer sees tests. App.tsx theme uses `fontFamily: undefined as any` to satisfy the theme type. (Memory `zhiyuan-test-infra-ts6`.)
- **Stale-closure ref pattern:** any value read inside `PanResponder`/`setInterval`/event callbacks must be mirrored in a `useRef` (`posRef`, `rotRef`, `tryCheckRef`, `clampRef`, `snapToGridRef`, `progressRef`, `customPuzzlesRef`, `lastCellHapticRef`, …) — callbacks read the ref synchronously; setState drives re-render. Same reason completion stats are computed off a `progressRef` mirror, not inside a setState updater.
- **`gridSeed` uses `hashCode(puzzle.id)`** (was `charCodeAt(0)*137` → wall styling collided per category prefix).
- **Safe-area insets** (`SafeAreaProvider` in App, `useSafeAreaInsets` in GameScreen) so back/rotate buttons clear notches.

## Tests

`npm test` runs ~237 tests across 7 suites: `engine.test.ts` (engine/generator invariants, daily determinism, narrow-screen solvability, mode generation + blind-hole derivation, 核心区布局契约), `progress.test.ts` (stats/achievements/migration/mode stats), `library.test.ts` (custom-library CRUD/dedup/date-lookup), `aiGenerator.test.ts` (corpus range matching + dedup), `fingerprint.test.ts`, `hideSeek.test.ts` (incl. end-to-end fixedHoles+fixedRotation solvability × 3 difficulties × 4 rotations + symmetric-hole depth-50 fallback), `voxelFaces.test.ts` (叠嶂 6-face wall generation: cube square layout, solution-face reuse, other faces unsolvable at all 4 rotations, determinism). When changing `engine.ts`/`puzzleGenerator.ts`/`stats.ts`/`achievements.ts`/`library.ts`/`aiGenerator.ts`/`hideSeek.ts`/`fingerprint.ts`/`voxelFaces.ts`, keep these green. (`voxelHtml.ts` is a pure HTML-string builder; the three.js scene it emits is verified visually via `voxel-pile-preview.html` + Expo Go, not unit-tested.)

## Docs are aspirational / outdated

`README.md`, `DESIGN.md`, `PROJECT_SUMMARY.md`, and `docs/` describe an **earlier design** — a "Juicy Time" system (particle/confetti/shake), a single-hole marker card / 4-char chunks / collect-one-chunk-per-drop, and a Node/Express + Firestore backend with `server/`/`data/`/`design/`/`prj1/` directories. **None of that exists** (the old stubs `Card.tsx`/`JuicyEffects.tsx`/`Timer.tsx` are deleted). Trust the source under `src/` and `App.tsx`. (`.spec-workflow/`, untracked, is the spec-workflow MCP tooling directory — not part of the app.)
