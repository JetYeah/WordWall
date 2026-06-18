# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

字垣 / WordWall (formerly 文字寻宝 / Word Treasure Hunt) — an Expo / React Native game in the style of 探险小虎队 "decoder card" puzzles. The name 字垣 (zì-yuán) is a pun on 字缘 ("word-fate"): 文字筑墙，邂逅一句之缘 — "words build a wall; meet the one sentence meant for you." The whole screen is a wall of Chinese filler characters (each cell randomly styled for visual noise). The player has a single irregular **decoder card** with multiple holes; the quote's characters are scattered one-per-hole-position in the wall. The player **drags the card and rotates it in 90° steps** until every hole simultaneously lands on the correct character — at which point the full quote reads through the holes. Stack: Expo SDK 56, React Native 0.86, React 19, TypeScript. No backend; puzzles are generated client-side from a hardcoded 43-quote library (`PUZZLE_LIBRARY`).

The repo **is** a git repo (single `Initial commit` on `main`). Layout/state generation is fully deterministic per ISO date, so "daily puzzle" needs no server.

## Commands

```bash
npm install        # .npmrc sets registry.npmmirror.com + legacy-peer-deps=true
npm start          # expo start — Metro + QR for Expo Go
npm run android    # expo start --android
npm run ios        # expo start --ios
npm run web        # expo start --web
npm test           # jest (ts-jest preset) — runs the full suite (208 tests across 5 suites)
npx tsc --noEmit   # the ONLY type-check; Metro does not type-check
```

- `start.sh` = `npm install --legacy-peer-deps && npm start` (WSL/git-bash only; redundant `--legacy-peer-deps` since `.npmrc` already sets it).
- `tsconfig.json` just `extends: expo/tsconfig.base` with empty `compilerOptions` — no path aliases, no strict overrides. **Note: `strict` is OFF** (expo base doesn't set it) — see the discriminated-union gotcha in v4 below.
- Single-test: `npx jest src/game/__tests__/engine.test.ts`.

## Architecture

**State split between `App.tsx` and `GameScreen.tsx`.** `App.tsx` owns `dailyData {puzzle, layout}`, `historyData`, `progress`, `settings`, `devMode` (in-memory only), and `favorites`, loading them from AsyncStorage on mount. `GameScreen` owns all per-move state: `cardCenter` (pixel coords), `rotation`, `revealedChars`, `holeMatches`, `isComplete`.

**Navigation**: `@react-navigation/native-stack`, stack `Home / Game / Settings / History`. `RootStackParamList` types `Game: { puzzle: Puzzle; layout: PuzzleLayout }` — **both** puzzle and pre-built layout are passed in so the screen never regenerates. The `Stack.Navigator` carries `id="RootStack"` (this native-stack version's type marks `id` required). Screens use inline render-prop children so `App.tsx` can inject callbacks; `animation: 'slide_from_right'`, `headerShown: false`.

**Engine / UI separation** — pure logic in `src/game/`, no React imports:
- `engine.ts` — `CELL_SIZE` (28, the single px↔cell constant), `DEFAULT_GRID_COLS/ROWS` (16/28, overridden at runtime by actual screen size), `DEFAULT_CARD_SIZE` (9). Functions: `rotateOffset` (90°-step hole rotation), `getGridCellAtHole`, `pixelToGrid` (rounds px/CELL_SIZE), `getRevealedChars` (chars currently under all holes), `getHoleMatches` (per-hole correctness), `checkSolution` (whole-quote correctness), `generateCellStyle` (deterministic per-cell visual noise: weight/opacity/micro-rotation/color from a hash).
- `puzzleGenerator.ts` — `PUZZLE_LIBRARY` (43 quotes), `hashCode`, `mulberry32` PRNG, `generateCardHoles` (one hole per quote char, random non-overlapping offsets within the card), `generateCardMask` (irregular card outline), `generateGrid` (fills with `FILLER_CHARS` then stamps `quote[i]` at `solutionPosition + rotateOffset(holes[i], solutionRotation)`, **and re-rolls if any of the other 3 rotations accidentally also match** — guarantees a unique solution), `generateDailyPuzzle` / `generatePuzzleFromQuote` / `loadPuzzles` / `getRandomQuote`.
- `types.ts` — `Puzzle`, `CardHole {offsetX, offsetY}` (relative to card **center**, in grid cells), `CardShape {size, holes, mask}`, `PuzzleLayout {grid, gridRows, gridCols, cardShape, solutionPosition, solutionRotation}`, `GameState`, `PlayerProgress`, `GameSettings`, `CellStyle`, `FavoriteQuote`, `DevModeState`.

**The decoder-card loop** (core mechanic, spans `engine.ts` + `puzzleGenerator.ts` + `GameScreen.tsx`):
1. Generator picks `solutionPosition` (col,row), `solutionRotation` ∈ {0,90,180,270}, then stamps each `quote[i]` at the rotated hole offset. Initial card rotation in `GameScreen` = `solutionRotation + 90 + rand*90`, so the start state is **never** solved.
2. Card position is stored as a **pixel-space center** (`cardCenter.x/y`), kept in a `useRef` mirror (`posRef`) so `PanResponder` callbacks read latest position synchronously without waiting for re-render. Rotation likewise mirrored in `rotRef`.
3. On every pan move **and** every rotate tap, `GameScreen.tryCheck(px, py, rot)` runs. It computes the grid cell via `pixelToGrid`, then `getRevealedChars` + `getHoleMatches` to update hole highlighting; `checkSolution` (revealed chars `join('') === quote`) fires completion.
4. Per-hole green highlight = that hole's char matches. `matchCount >= holes.length * 0.6` turns the card border gold ("you're close"). Hole text is counter-rotated (`-rotation`) so characters stay upright while the card rotates.
5. Completion is **only** `checkSolution` over the whole quote — there is no partial/"word discovered" win state.

**Reading-order invariant** (core rule, enforced in `generatePuzzleFromQuote`): in the solved state (card at `solutionPosition` + `solutionRotation`), the characters visible through the holes — read in grid order (row ascending, then col ascending) — must equal the quote. This holds because `holes` are sorted by `rotateOffset(h, solRot)`'s `(offsetY, offsetX)` *before* `quote[i]` is stamped at `holes[i]`'s rotated position, so `holes[i]` is by construction the i-th reading position. Do not remove this sort or reorder `holes` elsewhere — the invariant is what makes the puzzle read as a sentence, and `getRevealedChars`/`checkSolution` rely on hole index ↔ quote index aligning with reading order.

**Coordinate system** (read this twice before touching layout):
- `CELL_SIZE` (28) is the single px↔cell source of truth. Grid dims = `floor(screen.w / CELL_SIZE)` × `floor(screen.h / CELL_SIZE)` (computed in `App.tsx`, passed to generator).
- The card's pixel size = `cardShape.size * CELL_SIZE`. Hole pixel position inside the card = `(hole.offsetX + halfGrid) * CELL_SIZE` (offsets are relative to card center, can be negative).
- `pixelToGrid(cardCenterPx) → {col, row}` is the card's center cell; each hole's actual cell = that + `rotateOffset(hole, rotation)`.
- The grid is centered horizontally with `gridOffsetX = max(0, (screenW - gridW)/2)`; card pixel coords are in **screen** space, so `GameScreen` adds `gridOffsetX` when jumping the card to the solution (dev mode). Do not add padding inside `TextGrid` — it desyncs the card from the cells.

**Daily determinism**: `generateDailyPuzzle(date?)` → `hashCode(ISO_DATE)` picks `PUZZLE_LIBRARY[seed % len]`, and a `mulberry32` PRNG seeded from the same hash drives hole layout / mask / grid fill / solution position+rotation. Same date → identical puzzle. `loadPuzzles(30)` regenerates the last 30 days the same way for the History screen. Note the generator is called with two separate PRNGs (`mulberry32(seed)` to pick the puzzle, `mulberry32(seed+12345)` to lay it out) — keep them separate or you'll break determinism.

**DevMode & favorites**: Toggled in Settings, `DevModeState {enabled, showAnswer}` lives only in memory (not persisted). When enabled, `GameScreen` renders a toolbar: 换题 (regenerate, calls `getRandomQuote` excluding current id), 答案 (snap card to `solutionPosition`/`solutionRotation` and green-highlight the answer cells), 收藏 / 跳过. `FavoriteQuote[]` is persisted in `App.tsx`.

**Persistence** (`src/utils/storage.ts`, keys match `config.ts`): `decode_card_progress`, `decode_card_settings`, `decode_card_favorites`. `App.tsx` is the sole writer.

## Known issues & gotchas

- **Tests exist and run.** `npx jest` runs 208 tests across 5 suites: `engine.test.ts` (engine/generator invariants, daily determinism, **narrow-screen solvability regression**, **mode generation + blind-hole derivation**), `progress.test.ts` (stats/achievements/migration/**mode stats**), `library.test.ts` (custom-library CRUD/dedup/date-lookup), `aiGenerator.test.ts` (local-corpus range matching + dedup), `fingerprint.test.ts`. `npm test` is wired to jest. When changing `engine.ts` / `puzzleGenerator.ts` / `stats.ts` / `achievements.ts` / `library.ts` / `aiGenerator.ts`, keep these green.

- **Former dead code was removed/wired (v3).** The old `Card.tsx` / `JuicyEffects.tsx` / `Timer.tsx` stubs are **deleted**. `soundManager.ts` is now **fully wired** on `expo-audio` (see v3 section below) — the old claim "nothing plays sound" is obsolete.

- **Declared-but-unused dependencies.** `react-native-reanimated` (babel.config.js **does** load `react-native-reanimated/plugin`), `react-native-gesture-handler`, and `react-native-paper` are in `package.json` but the source uses neither worklets nor gesture-handler nor Paper components. Drag uses RN `PanResponder`; animations use RN `Animated`. The reanimated plugin is harmless but currently serves no purpose.

- **Rotation-then-check throttle** now also compares `rotation` (`lastRot.current === rot`), so rotating onto the solution at the same cell correctly fires `checkSolution`. (Was a known gap; fixed.)

- **`generateGrid` uniqueness re-roll** is now **depth-capped at 50** (returns the grid if still conflicted after 50 tries, rather than recursing unboundedly).

- **Narrow-screen solvability (was a HIGH bug, fixed).** `computeCoreAreaCells` now caps `coreCols/coreRows` at the grid dimensions; combined with the existing half-margin solution clamp (matching the play-time `clampToCore`), every hole stamps in-bounds on any screen where `gridCols >= cardSize`. There is a regression test iterating widths 280–414 × heights × all difficulties.

- **Core-area layout contract (`computeCoreAreaCells`, v4).** Three hard rules, with regression tests in `engine.test.ts` (`核心区布局契约`): (1) **L/R symmetry** — left/right non-core column counts are always equal, enforced by making `coreCols` the same parity as `gridCols` (parity-adjust branch prefers `coreCols-1`, falls back to `+1` if that drops below `cardSize+2`). (2) **Hard mode maximizes** (`DifficultyConfig.maximizeCore: true`, only `hard`) — cols = `gridCols-2` (≥1 non-core col each side), rows fill the safe vertical band. Easy/medium still use `coreWidthRatio`/`coreHeightRatio` but are likewise symmetry- + band-constrained. (3) **No function-area overlap** — the core's vertical band is `[TOP_RESERVE_PX=108, screenH - BOTTOM_RESERVE_PX=198]` (both exported), so the core never presses into the top bar or the powerup+bottom bar (this is what fixes hard-mode core being covered by the powerup bar on phones). Degenerate narrow screens (`gridCols < cardSize+4`) fall back to full-width/min core — still symmetric & solvable, the best achievable under the geometry. `GameScreen` reads the core rect from `layout.coreArea` (never recomputes) so play-core == gen-core stays intact.

- **Countdown + whistle gated on screen activity (`GameScreen`).** The 1s countdown `setInterval` AND the 30s/10s `time_warning` ("whistle") are gated on `isActive = useIsFocused() && AppState==='active'` — NOT just focus. `useIsFocused` alone misses app-backgrounding (pressing Home / switching apps), which is the most common way users "leave the match"; RN's `setInterval` keeps ticking in the background, so without the `AppState` half the whistle still fires off-screen. While inactive, `remaining` freezes (resumes on return) and `startTimeRef` is advanced by the away-duration (`pausedAtRef`) so the recorded solve-time matches the displayed timer. `warned30/10Ref` are deliberately NOT reset on blur, preventing a double-whistle on return.

- **Metro does not type-check.** `tsc --noEmit` clean ≠ clean bundle; type errors don't block bundling, only syntax/import-resolution errors do. Run both before claiming "it works."

- **`app.json` exists** (slug `wordwall`, dark UI, portrait, scheme `wordwall`; app display name 字垣). `babel.config.js` exists with the reanimated plugin (see above). There is no `metro.config.js` customization beyond `expo/metro-config` defaults.

- **`.spec-workflow/`** (untracked) is the spec-workflow MCP tooling directory — not part of the app.

## Docs are aspirational / outdated

`README.md`, `DESIGN.md`, `PROJECT_SUMMARY.md`, and the files under `docs/` describe an **earlier design** that does not match the current code:
- A 3-minute time limit / timeout failure — **does not exist** (no timeout; the timer just counts up).
- A "Juicy Time" system with particle bursts, confetti, screen shake, sound effects, haptics — **none of this is wired in** (see dead-code list above).
- A "single-hole marker card" / 4-char chunks / collect-one-chunk-per-drop loop — **replaced** by the multi-hole decoder-card + rotation model described above.
- A Node/Express + Firestore backend, Howler.js, `server/` / `data/` / `design/` directories, a `prj1/` project layout — **none exist**.

Trust the source under `src/` and `App.tsx` over these docs.

## v3 systems (sound / stats / achievements / bookmark / dev console)

A feature+fix pass added these. Docs above describe the v2 core; this section is current.

### Sound & haptics — now wired (`expo-audio`)
- `src/utils/soundManager.ts` was rewritten off `expo-av` (which Expo **removed in SDK 55+**; this app is SDK 56) onto `expo-audio`'s `createAudioPlayer`. Players are created once in `initialize()` (idempotent), replayed via `seekTo(0)` + `play()`. `setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' })`.
- App calls `soundManager.initialize()` on mount and syncs `soundEnabled`/`hapticEnabled` from settings. Triggers in `GameScreen`: `card_place` (on release-snap, only if moved), `button_click` (rotate / powerup), `word_discovered` (per newly-green hole), `near_miss` (once at ≥60% holes), `time_warning` (at 30s & 10s), `puzzle_complete` (solve), `achievement` (App, on unlock). Haptics via `expo-haptics` paired with each.
- Settings toggles (`soundEnabled`/`hapticEnabled`) now actually gate the manager (they were no-ops before).

### Data model (`PlayerProgress` expanded; `bestTime` is `number | null`)
- `src/game/types.ts`: `PlayerProgress` now carries per-difficulty best/count, per-category counts, `bestStreak`, `totalPlayTimeSec`, rotation/powerup/hint totals, `pureSolves`, `uniqueQuotes`, `history: GameRecord[]`, `unlockedAchievements`, `schemaVersion`. **`bestTime` (and `bestTimeByDifficulty`) are `number | null`** — the old `Infinity` sentinel broke JSON round-trip (`JSON.stringify(Infinity)==='null'` → `Math.min(null,t)===0`). All best-time math is null-safe.
- `src/game/schema.ts` holds `CURRENT_SCHEMA_VERSION` / `HISTORY_MAX` (pure constants, kept out of `storage.ts` so the game-logic layer doesn't drag native `AsyncStorage` into jest).
- `src/game/stats.ts`: `applyCompletion(prev, puzzle, result, {date, difficulty, now, isDaily})` — the single reducer for all counters. `isDaily=false` (history replay / dev puzzle) skips completedDates/streak/lastPlayDate but still records solve stats. Same-day re-completion does **not** reset streak.
- `src/utils/storage.ts`: `migrateProgress` reconciles any legacy/partial blob to the full shape (bestTime Infinity/NaN/0 → null, totalCompleted derived from completedDates). Back-compat with v1/v2 saves.

### Achievements (`src/game/achievements.ts`)
- ~24 achievements across milestone/streak/speed/purity/collection/mastery, each `progress(stats, ctx)` + `target` (+ optional `customCheck`/`displayValue`). `findNewlyUnlocked(stats, ctx)` returns achievements satisfied but not yet recorded. `ctx.favoritesCount` is threaded in (favorites live in App, not stats).
- Unlock flow: `App.handleComplete` computes `next` via `applyCompletion` (reading a `progressRef` mirror, NOT inside a setState updater), runs `findNewlyUnlocked`, merges ids, and queues an `AchievementToast` (top banner, 4.2s each) + `achievement` sound + success haptic.
- `AchievementsScreen` shows a stats summary + grouped achievement grid with tier colors and progress bars; reached from Home.

### Bookmark share (`BookmarkCard` + `BookmarkModal` + `shareBookmark`) — v2.1 redesigned
- `BookmarkCard` (forwardRef) is now a **dark 汉兜/词影-style** card. The hero is a **QR-like "fingerprint" block** generated by `src/game/fingerprint.ts` `buildFingerprint(input)` from four solve attributes: (1) decoder-card shape — the real `cardHoles` placed on a seed-derived irregular silhouette, **rotated by `solutionRotation`**; (2) time ratio — outer frame lights clockwise proportional to `timeSec/timeLimitSec`; (3) angle — the inner block rotates by `solutionRotation` AND the **badge moves clockwise to the matching corner** (TL=0°→TR=90°→BR=180°→BL=270°) so the angle is obvious at a glance (the subtle hole-rotation alone was hard to read); (4) powerup usage — the badge *color* (`badgePure`=green / `badgeUsed`=copper). The badge sits at the angle-determined corner; the other three corners are gold 2×2 finder anchors (QR look). Below the block the **full quote renders in `CONFIG.colors.success` green** (echoing the in-game correct-answer display), then author《source》, then a 汉兜-style status bar: `日期 · 难度 · 用时 · 纯解/道具`.
- `buildFingerprint` is pure & deterministic (same input → same output; no `Math.random`/`Date`). `rotateMatrix` is clockwise to match `engine.rotateOffset`. `synthesizeFingerprintInput` is the fallback for old `GameRecord`s lacking `cardHoles`/`cardSize`/`solutionRotation` (new records carry them; `GameResult`/`GameRecord` gained these optional fields in v2.1, copied through `applyCompletion`).
- `BookmarkModal` wraps the card; on 分享 it calls `captureRef` (`react-native-view-shot`, bundled in Expo Go SDK 56) → `expo-sharing.shareAsync` on native; on web, `captureRef` data-uri → anchor download. Graceful cancel/failure handling. Share filename prefix is `ziyuan-`.
- Triggered from the completion overlay (分享书签 — passes the live `cardShape`/`solutionRotation`), from History (completed days → 书签 — via `recordToBookmark`, reads the persisted card fields), and from the DevConsole `预览书签` button (see below).
- **Bug fixed in v2.1:** the completion bookmark used to pass `new Date().toISOString()` (UTC date — off-by-one for CN users 0–8am); now uses `nowLocalIsoDate()`, consistent with the rest of the codebase.
- **Standalone test page:** `bookmark-preview.html` (repo root, double-click to open — no build needed) ports `buildFingerprint`/`rotateMatrix`/`cellHash`/`synthesizeFingerprintInput` **verbatim** to vanilla JS and renders an interactive live card (tweak 名言/难度/角度/用时/纯解/种子) plus 5 comparison galleries (A four-elements, B rotation×4, C time gradient 0–100%, D pure vs powerup, E different quotes). If `fingerprint.ts` changes, sync the `<script>` port.
- **Perimeter-animation picker:** `perimeter-anim-preview.html` (repo root) — live demo of 5 candidate animations for the non-core wall (近乎静止 / 缓墨呼吸 / 流光缓扫 / 字符微烁 / 当前对照).
- **Perimeter animation = 字符微烁 (chosen):** the non-core wall chars are split into `TWINKLE_GROUPS`=10 deterministic spatial-hash groups; each group is one native-driven opacity loop with a different period, so the wall shimmers in a staggered "dust-mote" pattern. `GameScreen` renders the perimeter as 10 sparse `TextGrid` layers (new **sparse group mode** in `TextGrid` — `groupIndex`/`groupCount`/`skipR0..skipC1` props, absolute-positioned, skips the core rect) stacked over a **static-opacity** frost (the old breathing was removed so the two effects don't fight). The old `swayX`/`swayY`/`breath` `Animated.Value`s + 4 perimeter strips + `strips` useMemo are gone. Drag pauses all twinkle via `animControlRef` (same pause/resume hook the sway used).

### Developer console (`DevConsole`)
- Replaces the old fixed 4-button toolbar with a collapsible floating button → panel: puzzle/layout metadata inspector, inline difficulty switch, 上一题/下一题 library navigation, 换题, 显示答案, 收藏, 输出布局 JSON to console. `onCycleQuote` cycles `PUZZLE_LIBRARY`.
- `预览书签` button (调试区, v2.1) — dev-only, calls `GameScreen.handlePreviewBookmark` → `onShareBookmark` to pop the `BookmarkModal` **without solving** (it bypasses the `!devMode.enabled` completion guard, going straight through App's `setBookmarkData`). Builds `BookmarkData` from the live `cardShape.holes`/`size`/`solutionRotation` + elapsed time + current powerup state — so cycling quotes, tapping powerups, or waiting each vary the fingerprint live. The fastest way to eyeball the share card during dev (solving is gated off in dev mode, so the completion-overlay 分享书签 button never appears there).
- Dev mode no longer pollutes daily progress (regenerated/cycled puzzles have `isDaily=false`) and never locks `viewOnly` (so devs can re-test after solving today).

### Other v3 fixes (from mimo-bug-audit)
- Completion celebration no longer suppressed: the 3s overlay timer is gated on `enteredCompleteRef` (did we START solved?), not on the `viewOnly` prop (which flips true the instant App records today's completion). Fresh solves celebrate; view-only entries don't.
- `viewOnly` shows "已完成" instead of a 0:00 timer.
- Stale `snapToGrid` closure (post-shrink snap jumped outside the gold core) fixed via `snapToGridRef` mirror (same pattern as `tryCheckRef`/`clampRef`).
- `gridSeed` uses `hashCode(puzzle.id)` (was `charCodeAt(0)*137` → wall styling collided per category prefix).
- Safe-area insets (`SafeAreaProvider` in App, `useSafeAreaInsets` in GameScreen) so the back/rotate buttons clear notches.
- `Celebration` particle burst on solve; completion card scale-in.

## v4 systems (game modes / dev library + local AI / per-cell haptics)

A feature pass added three things. v2/v3 docs above are still accurate; this section is current for the new surface.

### Game modes (`GameMode = 'classic' | 'blind' | 'probe'`)
- Three modes are now selectable from the Home screen (`HomeScreen.onStartMode`), orthogonal to difficulty. **classic** = the existing daily (uses the user's difficulty). **blind (盲人摸象)** and **probe (投石问路)** are fixed-**medium** puzzles (medium core area, cardSize 9) with a **5-minute** countdown (`MODE_TIME_LIMIT_SEC = 300`).
- `generateModePuzzle(mode, date?, screenW, screenH)` (puzzleGenerator.ts) seeds with `${date}|${mode}|medium` so each mode has its own deterministic daily puzzle (three modes → three different "today" puzzles). classic delegates to `generateDailyPuzzle(date, 'medium')`.
- **盲人摸象 (blind):** `deriveBlindedHoles(n, rng)` / `getBlindedHolesForPuzzle(puzzleId, n)` deterministically pick `floor(n/2)` holes as "blind". Blind holes **never show their char until the whole quote is solved** (`isComplete`); they turn green when matched but render no char (otherwise a near-black `BLIND_HOLE_BG` fill = "涂黑"). Non-blind holes behave like classic (char + green on match). Matching logic (`getHoleMatches`/`checkSolution`) is unchanged — only *display* differs.
- **投石问路 (probe):** chars are visible through holes, but there is **no per-hole correctness indication**. When `matchCount > 0`, **all** hole borders go green uniformly, and a **green count badge** renders at the card's top-left (counter-rotated `-rotation` to stay upright) showing the number of currently-matched holes. No badge when `matchCount === 0`.
- `GameScreen` takes a `mode` prop; the timer is `mode ∈ {blind,probe} ? 300 : DIFFICULTY_CONFIGS[difficulty].timeLimitSec`. Both new modes are **replayable** (never enter `viewOnly`; only classic-today-completed does), and their completions are recorded with `isDaily=false` (they don't pollute the daily streak/`completedDates`).
- **CRITICAL wiring invariant (was a HIGH bug, fixed):** blind/probe are generated at medium, so App derives `effectiveDifficulty = mode === 'classic' ? settings.difficulty : 'medium'` and passes it BOTH as `GameScreen`'s `difficulty` prop (drives the completion badge / bookmark label / DevConsole highlight) AND into `applyCompletion` (so `completionsByDifficulty`/`bestTimeByDifficulty` aren't polluted by the dev's global difficulty setting). Don't pass raw `settings.difficulty` to a mode game.
- `PlayerProgress` gained `completionsByMode: Record<GameMode, number>` and `bestTimeByMode: Record<GameMode, number | null>` (null-safe, migrated). `GameResult.mode` / `GameRecord.mode` carry the mode. `BookmarkData.mode` makes `BookmarkCard` use `MODE_TIME_LIMIT_SEC` for blind/probe time-ratio and show the mode label in the status bar.
- **9 new achievements** (category `special` — added to `AchievementsScreen`'s `ACHIEVEMENT_CATEGORIES_ORDER`): `mod_blind_{1,5,10}`, `mod_probe_{1,5,10}`, `mod_dual` (both modes ≥3), `mod_blind_speed` / `mod_probe_speed` (≤ `floor(MODE_TIME_LIMIT_SEC*2/3)` = 120s via `bestTimeByMode` + `customCheck` — expressed as a fraction of the limit so it stays reachable when the mode timer changes; see v5).

### Per-cell-cross haptics (移动逐字振动)
- `soundManager` gained a `'selection'` `HapticType` → `Haptics.selectionAsync()` (expo-haptics' lightest, built for rapid tick feedback; no-op + try/catch-safe on web).
- In `GameScreen.tryCheck`, when the card **center** crosses into a new grid cell (`cellChanged`, distinct from rotation-only), a selection haptic fires — throttled by `HAPTIC_CELL_MIN_MS = 45` via `lastCellHapticRef` (slow drags tick per cell; fast drags downsample to avoid a continuous buzz). Gated by `!isComplete && !isFailed`; reset on puzzle switch + retry. Gives the "fingertip brushing a real word-block wall" feel.

### Developer library management + local AI quote generator
- **Custom puzzle library** is persisted in AsyncStorage (`decode_card_custom_library`, `src/utils/libraryStore.ts`). The **working library** = built-in `PUZZLE_LIBRARY` (immutable, q/p/b ids, drives deterministic dailies) + custom puzzles (c-prefix ids). `src/game/library.ts` is the **pure** logic (no AsyncStorage — keeps jest native-free): `getWorkingLibrary`, `isDuplicateQuote` (trim-insensitive, checks built-in + custom), `validatePuzzleDraft` (2–20 chars, author/source required, valid category, no dup), `addPuzzlePure`/`updatePuzzlePure` (edit excludes self from dedup; built-in ids are read-only)/`deletePuzzlePure`, `lookupDailyByDate` (returns the 3 difficulty dailies for a date), `filterLibrary`, `isBuiltinPuzzle`.
- **`CrudOutcome` / `ValidateResult` are `{ puzzle: Puzzle | null; error: string }` (null-judged), NOT `{ok:true}|{ok:false}` — see the strict-off gotcha below.** Success = `error === ''`.
- **`LibraryManagerScreen`** (route `Library`, dev-only via DevConsole 题库管理 entry): list all (builtin tagged 内置/read-only, custom 自定义/editable), add/edit modal, delete (custom only), filter by author/source/quote, **date lookup** (enter YYYY-MM-DD → see that day's 3 dailies, tappable to play), and an **AI 出题** section. `App.handlePlayCustom` generates a layout on the fly (`pickDifficultyForQuote` by length → `generatePuzzleFromQuote`) and navigates to Game (`isDaily:false`, `mode:classic`). CRUD callbacks read `customPuzzlesRef` (synchronous mirror) + persist.
- **Local AI quote generator** (user chose the offline "本地语料+模板" option — no network, no key): `src/game/quoteCorpus.ts` (~70 public-domain classical entries, intentionally NOT duplicating the 43 built-ins) + `src/game/aiGenerator.ts` `generateFromRange(input, library, limit=12)`. The dev types an author/book/keyword; it filters the corpus by author/source/quote substring, **dedups against the working library**, returns candidates (c-prefix ids) for one-tap 加入. No matches → random fallback + a note. `Math.random` is used for ids + random sampling (non-deterministic AI gen is fine; daily determinism is unaffected — that path uses `PUZZLE_LIBRARY` + seed only).

### ⚠️ strict-OFF gotcha (cost real debugging time)
`expo/tsconfig.base` does **not** enable `strict`, so `strictNullChecks` is off. **Boolean-literal discriminated unions (`{ ok: true } | { ok: false }`) do NOT narrow** in this config — `if (!v.ok) return { ok:false, error: v.error }` errors with `Property 'error' does not exist on type { ok: true; ... }`, even via ternary/fall-through. The existing codebase avoids `ok`-unions for this reason. **When writing success/failure pure functions here, use null-judged results** (`{ puzzle: Puzzle | null; error: string }`); narrowing on `if (v.puzzle)` is rock-solid in any config. Don't flip `strict` on globally — it surfaces many pre-existing issues. (See memory `zhiyuan-tsconfig-strict-off`.)

## v5 systems (completion info box / calendar history / bonus modes / blind-all-brown / fingerprint seams / hard-core modes / 2×2 angle selector / eliminate-angle powerup)

A feature pass changed blind/probe presentation, history UI, completion reveal, and rotation control. v2/v3/v4 docs above are accurate **except where this section supersedes** (called out inline).

### Completion info box (always shown when solved/viewing) — supersedes the dev-only answerOverlay
- The bottom info box (quote in `success` green · `—— author《source》` · `位置: (col,row) 旋转: N°`) now renders whenever `(devMode.enabled && devMode.showAnswer) || isComplete || viewOnly` — not just dev mode. `pointerEvents="none"`, positioned `answerOverlay` `bottom:132` (clears the 76px 2×2 angle block + safe area).
- The completion celebration gained a **查看谜底** button (`setShowComplete(false)`) that dismisses the overlay to reveal the solved board + info box (solved board stays because `isComplete` is still true). The celebration effect remains gated on `enteredCompleteRef` (viewOnly re-entry never celebrates). The 返回 action moved to a secondary text button below.

### History is now a fingerprint calendar (HistoryScreen fully rewritten)
- Replaced the FlatList with stacked **month-block calendars** (most-recent month first). Each block: `YYYY年M月` label (top-left), Mon-first weekday header (`一二三四五六日`), then a `flexWrap` 7-wide grid. Calendar math: `firstWeekday = (new Date(y,m-1,1).getDay()+6)%7` (Mon=0), `daysInMonth = new Date(y,m,0).getDate()`.
- Each day cell: date number on top; below it a **mini fingerprint** (`MiniFingerprint`, built via `recordToBookmark` + `buildFingerprintFromData`) if `completedDates.includes(iso)`; a gray rect if in the 30-day window but not completed (tappable → play); faint/empty if future or out of window. Bonus dots overlay (see below). Long-press a completed day → share bookmark.
- `MiniFingerprint` uses **flex:1 rows/cells in a fixed-size container** (not explicit cellPx) — the same seam-killing technique as `BookmarkCard` (see fingerprint-seams below). Wrapped in `React.memo` (keyed on the stable `record` object from `recordByDate`).
- `onSelectPuzzle(puzzle, date)` now takes the date; App threads it as the Game route's `date` param.

### Blind/Probe are bonus challenges with per-day completion tracking (supersedes "replayable, isDaily=false, never viewOnly")
- **New persisted field** `PlayerProgress.bonusByDate: Record<string, {blind, probe}>`. `stats.applyCompletion` sets `bonusByDate[opts.date][mode]=true` **only for blind/probe** (classic still uses `completedDates`). Defaulted to `{}` in `makeDefaultProgress` + migrated (`mergeBonusByDate`); the `migrateProgress(null).toEqual(makeDefaultProgress())` and JSON round-trip tests hold because both sides are `{}`.
- **Game route gained a `date?: string` param.** App computes `viewOnly = (classicDone || bonusDone) && !devMode.enabled`, where `classicDone = mode==='classic' && date!=null && completedDates.includes(date)` and `bonusDone = mode!=='classic' && date!=null && bonusByDate[date]?.[mode]===true`. Home passes `date=today` for all three modes; History passes the day's date; **Library custom plays pass NO date → never viewOnly (always replayable)**. This unifies "re-open a completed puzzle → view answer + info box" across classic-today, classic-history, and blind/probe-today.
- `HomeScreen` replaced its `todayDone: boolean` prop with `modeDone: {classic, blind, probe}`. Done cards (any mode) show a green 已完成 chip + `已完成 · 点击查看正解` sub + checkmark icon; clicking a done bonus mode enters viewOnly (answer revealed). The classic pulse animation keys off `modeDone.classic`.
- Calendar bonus **dots**: top-left = blind (`#9F7AEA`), top-right = probe (`#4FB6C8`), drawn over the day cell (fingerprint or gray).

### Blind mode holes are ALL opaque brown (supersedes "half the holes 涂黑")
- In blind mode **every** hole is now opaque brown `BLIND_HOLE_BG = 'rgb(200,169,110)'` (matches the hole-border hue; black was aesthetically off) until matched, then opaque green `BLIND_MATCH_BG = 'rgb(76,175,80)'` — **no char is shown until `isComplete`** (the isComplete branch reveals all). The opacity is essential: blind holes never render a char, so a translucent fill would let the wall char behind bleed through. This makes blind mode pure-positional (no reading) → harder.
- The per-hole blind subset (`blindedSet` / `getBlindedHolesForPuzzle`) is **no longer used in rendering** (all holes uniform). The `deriveBlindedHoles` / `getBlindedHolesForPuzzle` functions remain (tested in `engine.test.ts`) as vestigial generator API. `getHoleMatches`/`checkSolution` are unchanged — only display differs.

### Fingerprint rendering is seam-free (flex:1, not cellPx) — SUPERSEDED by v6 (absolute-positioned integer cells + 1px overlap)
- v5 used N flex:1 rows × N flex:1 cells. This still left sub-pixel seams in practice (and `flex:1` does not clip-proof the layout). v6 replaces it with a shared `FingerprintGrid` component — see the **v6** section below.

### Blind/Probe use HARD core-area size + 3-min limit (supersedes "medium core + 5-min")
- `MODE_TIME_LIMIT_SEC` is now **180** (was 300). `generateModePuzzle` keeps `config = DIFFICULTY_CONFIGS.medium` (cardSize 9, quotes 7–8) but computes `coreArea = computeCoreAreaCells(…, DIFFICULTY_CONFIGS.hard, …)` — so the **search space is hard-sized** (maximizeCore fills the safe band) while the card/quote stay medium. `GameScreen.totalTime` and `BookmarkCard` time-ratio denominator both pick up the new 180 automatically via the import. `engine.test.ts` mode block updated (180, medium cardSize, `layout.coreArea` equals the hard-computed core and ≥ medium area). Seed string unchanged → determinism preserved.

### Rotation control is a 2×2 angle selector (supersedes the single 旋转 button)
- The bottom-right rotate button is replaced by a 2×2 block (`styles.quadBlock`, 76×76, gold-bordered). `ANGLE_QUADS = [0, 90, 270, 180]` renders as TL=0°, TR=90°, BL=270°, BR=180° (clockwise). Each quadrant is a `TouchableOpacity` calling `handleSetRotation(angle)` (replaces `handleRotate`'s +90 step): sets `rotRef`/`rotation`, fires `tryCheck`, increments `rotationCountRef` **only when the angle actually changes** (tapping the current angle is a no-op). Current angle's quadrant is gold (`quadCellActive`); disabled quadrants are gray (`quadCellDisabled`). Whole block `opacity:0.4` + quadrants `disabled` when `isComplete||isFailed`.
- A `disabledAngles: number[]` state (+ `disabledAnglesRef` mirror) tracks angles eliminated by the powerup. Reset on puzzle-switch + retry.

### Powerup 3 is now "排除角度" (eliminate one wrong angle) — supersedes "对角度" auto-rotate
- `powerups` state key renamed `rotate` → **`eliminate`** (single-use boolean, same shape as shrink/reveal). `triggerEliminate` picks a random angle from `[0,90,180,270] \ {solutionRotation} \ disabledAngles` and pushes it into `disabledAngles`; the corresponding 2×2 quadrant grays out and becomes unclickable. **`solutionRotation` is never eliminated** (the solution quadrant stays reachable). `powerupsUsed` counts it the same way. Icon `ban-outline`, label 排除角度.

## v6 systems (seam-free fingerprint grid / bonus dots flank the date / blind-probe = 困难 label + classic-bucket gating / powerups disabled in modes)

A pass fixed fingerprint rendering seams, the calendar bonus-dot overlap, the mode difficulty label, and disabled powerups in challenge modes. v2–v5 docs above are accurate **except where this section supersedes** (the flex:1 seam claim above is superseded).

### Fingerprint is rendered by a shared `FingerprintGrid` (absolute integer cells + 1px overlap, NOT flex:1)
- New `src/components/FingerprintGrid.tsx` is the single renderer used by BOTH `BookmarkCard.FingerprintBlock` (size `FINGERPRINT_PX=208`) and `HistoryScreen.MiniFingerprint` (size `fpSize≈cellW-4`). Each caller passes its own `colors: Record<FingerprintCellType,string>` (body differs: bookmark `#2E2517` vs mini `#3D2B1F`); transparent `bg` cells are not rendered (panel shows through).
- **Why not `flex:1` (v5) or `ceil`:** `flex:1` still leaves sub-pixel seams on fractional DPRs (Yoga computes fractional cell positions; each cell rounds independently → ~1px gap showing the near-black `#0A0906` panel). The first attempt used `cellPx = ceil(size/N)` which is seam-free BUT **clips the entire last row + last column** whenever `(N-1)*cellPx ≥ size` — on the mini thumbnail this lost the BR finder/badge and the right+bottom timing arc on ~all phone widths.
- **v6.1 algorithm (clip-proof + seam-free):** distribute `[0,size]` over N — `base=floor(size/N)`, `extra=size-base*N` given to the first `extra` indices, `span(i)=base+(i<extra?1:0)`, `off(i)=Σ_{j<i}span(j)` so `Σ span === size` and `off(N-1)=size-span(N-1) < size` (last cell always inside the box). Each cell is `position:'absolute', left:off[c], top:off[r], width:span(c)+1, height:span(r)+1`; the +1 overlaps the right/bottom neighbor by 1px (later-drawn wins), overflow:hidden clips the ≤1px overhang. All N rows/cols visible, no seams. **Do not go back to flex:1 or ceil.**

### History calendar bonus dots flank the date (no longer overlay the fingerprint)
- In `HistoryScreen.renderCell`, the blind (紫 `#9F7AEA`) / probe (青 `#4FB6C8`) dots moved OUT of the fingerprint box into two fixed-width `daySlot` (`width:9`) Views flanking the `<Text dayNum>` inside a new `dayRow` (height 14 + marginBottom 3, keeping the cell ≈ `cellW+17` to match the placeholder). `bonusDot` is no longer `position:'absolute'` (size 7). `dayNum` got `numberOfLines={1}` (a 2-digit day could wrap/clip on <307px widths). Slots are fixed-width so the date stays centered whether or not a dot is present.

### blind/probe are shown as 困难 (hard), but do NOT write to classic difficulty buckets
- `App.tsx` derives `effectiveDifficulty = mode==='classic' ? settings.difficulty : 'hard'` — drives the HomeScreen chip label (`HomeScreen`'s own `DIFFICULTY_CONFIGS[isClassic?difficulty:'hard'].label`), the GameScreen completion badge, and `BookmarkData.difficulty`. (Generation config stays **medium** — cardSize 9, quotes 7–8 — only the core/search-space is hard; only the displayed tier changed.)
- **Classic difficulty buckets are gated on `mode==='classic'` in `stats.applyCompletion`** (`completionsByDifficulty` / `bestTimeByDifficulty` only written for classic). blind/probe track via `completionsByMode` / `bestTimeByMode` only — so they do **not** pollute classic-hard stats and do **not** spuriously unlock `y_hard1` / `spd_hard` / `y_all3` (which read `completionsByDifficulty.hard` / `bestTimeByDifficulty.hard`). `GameRecord.difficulty` still stores the passed value (`'hard'`) as a display tier; it does not feed classic buckets. `progress.test.ts` has a regression test asserting blind → no classic bucket + `completionsByMode.blind===1`.
- `DevConsole` got a `mode?` prop: the difficulty-switch row renders only for classic; for modes it shows a static "困难（挑战模式固定）" info line (switching is meaningless for modes and would discard the session).

### All 3 powerups disabled in blind/probe
- `GameScreen` hides the powerup bar when `mode!=='classic'` (added to the `!viewOnly && !isComplete && !isFailed` show-condition). Each trigger (`triggerShrink` / `triggerReveal` / `triggerEliminate`) also early-returns on `mode!=='classic'` (defense-in-depth; `mode` added to their useCallback deps). Net effect: blind/probe are always pure solves (`powerupsUsed===0`, `pureSolve===true`) → the bookmark/badge show 纯解.

## v7 systems (fingerprint v6.2 no-overhang / home best-time clip / calendar classic-only / app icon+splash / 捉迷藏 mode / test-infra fix)

A pass addressed 5 user requests. v2–v6 docs above are accurate **except where this section supersedes** (the v6.1 "+1 on last row/col, clip with overflow:hidden" claim is superseded by v6.2 below).

### Fingerprint v7 — physical-pixel alignment (kills the corner AA "burrs")
- The recurring "四角大块细微毛刺" was NOT overhang (v6.2 no-+1 / v6.3 1–2px inset didn't cure it). Root cause: each cell is a solid `<View>`; when an edge lands on a non-integer **physical** pixel, the GPU anti-aliases it → ~1px semi-transparent fringe. The 2×2 corner finders/badge are the largest, longest solid rects → their AA fringe is the most visible.
- **v7 fix (`FingerprintGrid.tsx`):** distribute in **physical** px via `PixelRatio.get()` — `physSize=round(size*dpr)`, `insetPhys≥1`, integer `physSpan`/`physOff`; render each cell at `lay(insetPhys+physOff[i])` / `lay(physSpan[i])` (`lay = p/dpr`). Every cell edge lands on an integer physical pixel → **no AA**; adjacent cells share the same integer boundary (`physOff[i+1]`) → no gap, no +1 overlap needed. Keep `overflow:hidden` as a backstop. Book mark (208) + mini both crisp. Do NOT re-add the `+1` overlap or go back to layout-px `floor(size/N)`.
- Bookmark `fingerprintPanel` also gained `overflow:'hidden'` + `borderWidth: 1` (was 0.8) for clean rounded-corner clipping.
- `bookmark-preview.html` renders via CSS grid (`display:grid`, fixed 16px cells), NOT this absolute algorithm — no sync needed for this change (the CLAUDE.md sync note covers `fingerprint.ts` logic only).

### HomeScreen best-time no longer clips
- `styles.statCard` `padding:16` → `paddingVertical:16, paddingHorizontal:10`; `styles.statNum` added `flexShrink:1, width:'100%', textAlign:'center'`. Long times (`12:38`/`59:59`/`1:02:09`, `formatDuration`'s minute field is unpadded) no longer clip the right edge. Three cards stay equal-width `flex:1`.

### History calendar shows classic-mode fingerprint only
- `HistoryScreen.recordByDate` now skips `r.mode==='blind'||r.mode==='probe'` (treats `undefined` as classic — old records predate the `mode` field). Previously a day done classic-then-blind rendered the BLIND fingerprint (history newest-first won). Now the calendar + long-press share use the classic record. `isCompleted` was already classic-only (only classic writes `completedDates`), so bonus-only days stay gray + bonus dots.

### App icon + splash (brand assets)
- `app.json` now has `icon`, `splash` (contain + `#14110A`), `android.adaptiveIcon` (fg/bg/mono), `ios.icon`, `web.favicon`. `scripts/gen-brand-assets.js` is a **zero-dep Node generator** (ports `buildFingerprint` + a pure-JS PNG encoder via built-in `zlib` + CRC32) that writes the 5 no-text PNGs to `assets/` directly — run `node scripts/gen-brand-assets.js`. `brand-assets.html` (repo root, canvas→PNG download) renders ALL 6 incl. the **splash** (字垣 + 万字为垣·一句结缘, needs browser CJK fonts → user downloads `splash.png` from it). Icon = fingerprint motif. **Custom icon/splash only show after a real build (prebuild/EAS/run); Expo Go shows its own.**

### 捉迷藏 mode (4th `GameMode = 'classic'|'blind'|'probe'|'hide'`) — two-player pass-and-play
- **Generator:** `generatePuzzleFromQuote` gained optional `fixedHoles?: CardHole[]` + `fixedRotation?: number` (`puzzleGenerator.ts`). When passed, holes/rotation are user-chosen (the reading-order `holesSorted` still runs, so quote[i] lands in the i-th reading position regardless of A's tap order — A controls hole *geometry*, not which char per hole). `pickDifficultyForQuote` relocated here from App.tsx (exported; avoids App↔hideSeek cycle).
- **`src/game/hideSeek.ts`** (pure, tested): `validateHideSeekDraft` (len 4–11 via `HIDE_SEEK_LEN_MIN/MAX`, dedup via `library.isDuplicateQuote`, hole count === quote.length, holes in-bounds `|offset|≤half`, rotation ∈ 4, time ∈ `HIDE_SEEK_TIME_OPTIONS=[null,60,120,180,300]`), `holesFromToggleGrid`. Null-judged result (NOT `{ok:true|false}` — see strict-OFF gotcha). Tests: `__tests__/hideSeek.test.ts` (22, incl. end-to-end fixedHoles+fixedRotation solvability × 3 difficulties × 4 rotations + symmetric-hole depth-50 fallback).
- **`GameMode='hide'` ripple:** added `hide` key to every `Record<GameMode,...>` init — `storage.ts` `MODES`/`completionsByMode`/`bestTimeByMode` (the `MODES` array drives the merge backfill), `HomeScreen.MODE_META`, `BookmarkCard.MODE_LABELS`. `stats.ts` unchanged (hide never reaches `applyCompletion`).
- **`HideSeekBuilderScreen`** (new): 4 steps — sentence input + live char count + derived cardSize chip → cardSize×cardSize tap-grid → 2×2 ANGLE_QUADS rotation → segmented time (不限/60/120/180/300) → sticky 交给B (disabled until `validateHideSeekDraft.ok`). On submit passes the validated result to `App.handleHideSeekSubmit`, which builds a `Puzzle` + calls `generatePuzzleFromQuote(...,undefined,holes,rotation)` + navigates Game `{mode:'hide', hideTimeLimitSec}`.
- **GameScreen timer:** new `hideTimeLimitSec?: number|null` prop. `totalTime = mode==='hide' ? (hideTimeLimitSec ?? 0) : ...`; `noTimer = mode==='hide' && totalTime===0`. `noTimer` → a separate `elapsed` count-up (no countdown, `isFailed` never set, whistle guarded off); timed hide uses the normal countdown. Timer label: `viewOnly?'已完成' : noTimer? formatTime(elapsed) : formatTime(remaining)`. (Solve time still uses the wall-clock `Date.now()-startTimeRef` mechanism — works for both.)
- **App wiring:** `RootStackParamList` gained `HideSeekBuilder` + `Game.hideTimeLimitSec`; `handleHideSeekSubmit`; new `<Stack.Screen name="HideSeekBuilder">`; `handleComplete` early-returns for `mode==='hide'` (celebration still fires from GameScreen — only the stats write is skipped); `handleRegeneratePuzzle`/`handleCycleQuote` guard `mode==='hide'` (no library/daily to cycle); `HomeScreen.onStartHideSeek` → the 捉迷藏 card (separate full-width card, NOT a 4th `modeData`/`modeDone` entry). HomeScreen mode-cards map uses `as const` so `m` narrows to the 3 play modes (avoids indexing `modeData[m]`/`modeDone[m]` with `'hide'`). `viewOnly` is always false for hide (no `date`). hide completion badge = 捉迷藏 (#FFB347). Bookmark share works (one-shot — no history record). Stale-doc note: classic DOES have a real countdown + `isFailed` on timeout (`DIFFICULTY_CONFIGS[difficulty].timeLimitSec`), NOT "counts up" — `noTimer` hide is the first true count-up/no-fail mode.
- `DevConsole` difficulty info line is now mode-aware (`捉迷藏（自定义句子）` for hide) and no longer hardcodes "（medium）".

### ⚠️ Test / type-check infrastructure (was BROKEN before this pass — fixed)
- **`tsc --noEmit` was never actually clean** in this env (TS **6.0** + ts-jest don't auto-include `@types/jest`, so every test file failed "Cannot find name 'describe'"; the `fontFamily: undefined` theme block in App.tsx also errored). Fixes: (1) `package.json` jest config gained `globals['ts-jest'].tsconfig.types = ["jest","node"]` so ts-jest type-checks tests with jest globals; (2) `tsconfig.json` `exclude` now drops `__tests__/**`, `*.test.ts(x)`, `scripts`, `*.html` (re-listing the expo-base excludes) so the **app** `tsc --noEmit` checks app code only (tests are type-checked by ts-jest); (3) App.tsx theme `fontFamily: undefined as any`. Result: `npx tsc --noEmit` exit 0; `npm test` = 230 green (was unrunnable). **When changing test files, run `npm test` (not bare tsc) — bare tsc no longer sees tests.**

