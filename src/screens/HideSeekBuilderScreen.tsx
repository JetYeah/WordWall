// 字垣 — 捉迷藏「出题」屏（双人·同设备轮流玩）
//
// 出题人 A 四步：① 输入要藏的句子（4–11 字）② 在 cardSize×cardSize 网格上点出镂空
// ③ 选正解旋转角度 ④ 选每局时长。底部「交给 B」实时校验通过后才可点。
// 校验在 src/game/hideSeek.ts（纯函数）；layout 由 App.handleHideSeekSubmit 生成（复用
// generatePuzzleFromQuote 的 fixedHoles/fixedRotation）。
//
// 设计注：A 只决定镂空「几何」，不决定哪个字进哪个孔——阅读序由生成器按正解旋转重排保证
// （见 puzzleGenerator holesSorted）。故网格只表镂空形状，不预览文字。

import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Puzzle } from '../game/types';
import {
  validateHideSeekDraft,
  HIDE_SEEK_TIME_OPTIONS,
  HIDE_SEEK_LEN_MIN,
  HIDE_SEEK_LEN_MAX,
  hideSeekCardSize,
  hideSeekDifficulty,
  type HideSeekTimeOption,
  type HideSeekValidation,
} from '../game/hideSeek';
import { DIFFICULTY_CONFIGS } from '../game/puzzleGenerator';
import { CONFIG } from '../config';
import { soundManager } from '../utils/soundManager';

// 2×2 角度块视觉顺序（顺时针）：TL=0°、TR=90°、BL=270°、BR=180°（与 GameScreen 一致）
const ANGLE_QUADS = [0, 90, 270, 180];
const HIDE_ACCENT = '#FFB347';

interface Props {
  /** 工作题库（内置 + 自定义），用于句子去重 */
  workingLibrary: Puzzle[];
  onCancel: () => void;
  /** 校验通过后，把归一化结果交回 App 生成 layout 并跳转 Game */
  onSubmit: (v: HideSeekValidation) => void;
}

export const HideSeekBuilderScreen: React.FC<Props> = ({ workingLibrary, onCancel, onSubmit }) => {
  const insets = useSafeAreaInsets();
  const screenW = Dimensions.get('window').width;

  const [quote, setQuote] = useState('');
  const [hint, setHint] = useState('');
  const [tapped, setTapped] = useState<Array<{ row: number; col: number }>>([]);
  const [rotation, setRotation] = useState(0);
  const [timeLimitSec, setTimeLimitSec] = useState<HideSeekTimeOption>(null); // 默认不限

  const len = quote.trim().length;
  const inRange = len >= HIDE_SEEK_LEN_MIN && len <= HIDE_SEEK_LEN_MAX;
  const difficulty = hideSeekDifficulty(len); // 4–6→easy / 7–8→medium / 9+→hard（>11 字恒 hard/11）
  const cardSize = hideSeekCardSize(len);
  const half = Math.floor(cardSize / 2);

  // 句子字数档位变化 → 卡片大小变 → 清空已点镂空（旧坐标可能越界）
  useEffect(() => { setTapped([]); }, [cardSize]);

  const validation = useMemo(
    () => validateHideSeekDraft({ quote, hint, tapped, rotation, timeLimitSec }, workingLibrary),
    [quote, hint, tapped, rotation, timeLimitSec, workingLibrary],
  );

  const cellPx = Math.max(22, Math.min(40, Math.floor((screenW - 56) / cardSize)));
  const isTapped = (row: number, col: number) => tapped.some((t) => t.row === row && t.col === col);

  const toggleCell = (row: number, col: number) => {
    soundManager.playSound('button_click');
    setTapped((prev) => {
      const idx = prev.findIndex((t) => t.row === row && t.col === col);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [...prev, { row, col }];
    });
  };

  const handleSubmit = () => {
    if (!validation.ok) return;
    soundManager.playSound('button_click');
    onSubmit(validation);
  };

  const showErr = quote.trim().length > 0 && !validation.ok;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => { soundManager.playSound('button_click'); onCancel(); }} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={CONFIG.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>捉迷藏 · 出题</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* ① 句子 */}
        <Text style={styles.stepTitle}>① 想藏的句子</Text>
        <TextInput
          style={styles.input}
          value={quote}
          onChangeText={setQuote}
          placeholder={`输入 ${HIDE_SEEK_LEN_MIN}–${HIDE_SEEK_LEN_MAX} 字（对 B 有意义的一句话）`}
          placeholderTextColor={CONFIG.colors.textSecondary}
          maxLength={HIDE_SEEK_LEN_MAX}
          returnKeyType="done"
        />
        <View style={styles.rowBetween}>
          <Text style={styles.count}>{len} / {HIDE_SEEK_LEN_MAX} 字</Text>
          {inRange ? (
            <View style={[styles.chip, { borderColor: HIDE_ACCENT }]}>
              <Text style={[styles.chipText, { color: HIDE_ACCENT }]}>
                卡片 {cardSize}×{cardSize} · {DIFFICULTY_CONFIGS[difficulty].label}{len > 11 ? ' · 扩展' : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.hint}>字数需在 {HIDE_SEEK_LEN_MIN}–{HIDE_SEEK_LEN_MAX} 之间</Text>
          )}
        </View>

        {/* 提示信息（可选）：写了则在游戏内「出处」位显示，替代默认占位 */}
        <Text style={styles.stepSub}>提示信息（可选 · 游戏内显示在「出处」位）</Text>
        <TextInput
          style={styles.input}
          value={hint}
          onChangeText={setHint}
          placeholder="留空则不显示"
          placeholderTextColor={CONFIG.colors.textSecondary}
          maxLength={30}
          returnKeyType="done"
        />

        {/* ② 镂空 */}
        <Text style={styles.stepTitle}>② 镂空位置{inRange ? `（点满 ${len} 格）` : ''}</Text>
        <View style={[styles.gridWrap, !inRange && styles.disabledWrap]}>
          {Array.from({ length: cardSize }).map((_, row) => (
            <View key={row} style={styles.gridRow}>
              {Array.from({ length: cardSize }).map((_, col) => {
                const on = isTapped(row, col);
                const isCenter = row === half && col === half;
                return (
                  <TouchableOpacity
                    key={col}
                    disabled={!inRange}
                    activeOpacity={0.7}
                    onPress={() => toggleCell(row, col)}
                    style={[
                      styles.gridCell,
                      { width: cellPx, height: cellPx },
                      on && styles.gridCellOn,
                      isCenter && styles.gridCellCenter,
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.count}>镂空 {tapped.length} / {inRange ? len : '?'}</Text>
          {tapped.length > 0 ? (
            <TouchableOpacity style={styles.clearBtn} onPress={() => { soundManager.playSound('button_click'); setTapped([]); }} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={13} color={CONFIG.colors.textSecondary} />
              <Text style={styles.clearBtnText}>清空</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ③ 旋转 */}
        <Text style={styles.stepTitle}>③ 解密卡正解角度</Text>
        <View style={styles.quadBlock}>
          {ANGLE_QUADS.map((angle) => {
            const isCurrent = rotation === angle;
            return (
              <TouchableOpacity
                key={angle}
                activeOpacity={0.7}
                style={[styles.quadCell, isCurrent && styles.quadCellActive]}
                onPress={() => { soundManager.playSound('button_click'); setRotation(angle); }}
              >
                <Text style={[styles.quadText, isCurrent && styles.quadTextActive]}>{angle}°</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ④ 时长 */}
        <Text style={styles.stepTitle}>④ 每局时长</Text>
        <View style={styles.timeRow}>
          {HIDE_SEEK_TIME_OPTIONS.map((opt) => {
            const isCurrent = timeLimitSec === opt;
            return (
              <TouchableOpacity
                key={String(opt)}
                activeOpacity={0.7}
                style={[styles.timeCell, isCurrent && styles.timeCellActive]}
                onPress={() => { soundManager.playSound('button_click'); setTimeLimitSec(opt); }}
              >
                <Text style={[styles.timeText, isCurrent && styles.timeTextActive]}>
                  {opt === null ? '不限' : `${opt}秒`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {showErr ? <Text style={styles.error}>{validation.error}</Text> : null}
      </ScrollView>

      {/* 底部固定提交 */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!validation.ok}
          style={[styles.submitBtn, !validation.ok && styles.submitBtnDisabled]}
          onPress={handleSubmit}
        >
          <Ionicons name="people-outline" size={18} color={validation.ok ? '#14110A' : CONFIG.colors.textSecondary} />
          <Text style={[styles.submitText, !validation.ok && styles.submitTextDisabled]}>交给 B 解题</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CONFIG.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: CONFIG.colors.text, letterSpacing: 1 },
  body: { flex: 1, paddingHorizontal: 20 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: CONFIG.colors.text, marginTop: 22, marginBottom: 10, letterSpacing: 0.5 },
  input: {
    backgroundColor: CONFIG.colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: CONFIG.colors.text, borderWidth: 1, borderColor: 'rgba(200,169,110,0.18)',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  count: { fontSize: 13, color: CONFIG.colors.textSecondary, marginTop: 8 },
  hint: { fontSize: 12.5, color: CONFIG.colors.textSecondary, marginTop: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '600' },
  stepSub: { fontSize: 12.5, color: CONFIG.colors.textSecondary, marginTop: 16, marginBottom: 8 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(200,169,110,0.25)', backgroundColor: CONFIG.colors.surface,
  },
  clearBtnText: { fontSize: 12, color: CONFIG.colors.textSecondary },
  disabledWrap: { opacity: 0.4 },
  gridWrap: { alignSelf: 'center', marginTop: 4, padding: 8, borderRadius: 14, backgroundColor: 'rgba(45,35,25,0.5)', borderWidth: 1, borderColor: 'rgba(200,169,110,0.18)' },
  gridRow: { flexDirection: 'row' },
  gridCell: {
    margin: 2, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(200,169,110,0.22)',
    backgroundColor: 'rgba(245,230,200,0.04)',
  },
  gridCellOn: { backgroundColor: HIDE_ACCENT, borderColor: HIDE_ACCENT },
  gridCellCenter: { borderColor: 'rgba(200,169,110,0.5)' },
  quadBlock: { flexDirection: 'row', flexWrap: 'wrap', width: 152, height: 152, alignSelf: 'flex-start' },
  quadCell: {
    width: 74, height: 74, justifyContent: 'center', alignItems: 'center', borderRadius: 12, margin: 1,
    borderWidth: 1.5, borderColor: 'rgba(200,169,110,0.3)', backgroundColor: CONFIG.colors.surface,
  },
  quadCellActive: { borderColor: CONFIG.colors.primary, backgroundColor: 'rgba(200,169,110,0.16)' },
  quadText: { fontSize: 18, fontWeight: '700', color: CONFIG.colors.textSecondary },
  quadTextActive: { color: CONFIG.colors.primary },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeCell: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
    borderColor: 'rgba(200,169,110,0.25)', backgroundColor: CONFIG.colors.surface,
  },
  timeCellActive: { borderColor: HIDE_ACCENT, backgroundColor: 'rgba(255,179,71,0.16)' },
  timeText: { fontSize: 14, fontWeight: '600', color: CONFIG.colors.textSecondary },
  timeTextActive: { color: HIDE_ACCENT },
  error: { color: '#FF6B6B', fontSize: 13, marginTop: 16, textAlign: 'center' },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: 'rgba(26,22,18,0.96)', borderTopWidth: 1, borderTopColor: 'rgba(200,169,110,0.18)',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: HIDE_ACCENT, borderRadius: 14, paddingVertical: 15,
  },
  submitBtnDisabled: { backgroundColor: CONFIG.colors.surface },
  submitText: { fontSize: 16, fontWeight: '800', color: '#14110A', letterSpacing: 1 },
  submitTextDisabled: { color: CONFIG.colors.textSecondary },
});
