// 字垣 — 开发者控制台（折叠式）
// 取代旧的固定 dev toolbar：平时只显示一个小圆按钮，展开后提供完整调试工具 + 元信息。
// 仅在 devMode.enabled 时由 GameScreen 渲染。

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Puzzle, PuzzleLayout, DifficultyLevel, GameMode } from '../game/types';
import { DIFFICULTY_CONFIGS, PUZZLE_LIBRARY } from '../game/puzzleGenerator';
import { soundManager } from '../utils/soundManager';
import { CONFIG } from '../config';

interface Props {
  puzzle: Puzzle;
  layout: PuzzleLayout;
  difficulty: DifficultyLevel;
  /** 游戏模式：非 classic 时隐藏「难度切换」行（卡片恒为 medium，切难度无意义且会丢弃当前对局） */
  mode?: GameMode;
  isFavorite: boolean;
  showAnswer: boolean;
  onRegenerate: () => void;
  onChangeDifficulty: (d: DifficultyLevel) => void;
  onCycleQuote: (dir: -1 | 1) => void;
  onToggleFavorite: () => void;
  onToggleShowAnswer: () => void;
  onDumpLayout: () => void;
  /** dev：不解题即预览当前题的书签（指纹 + 绿字句子 + 状态条） */
  onPreviewBookmark: () => void;
  /** dev：打开题库管理页（查看 / 增删改 / 按日期查 / AI 出题） */
  onOpenLibrary: () => void;
}

const DIFF_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export const DevConsole: React.FC<Props> = ({
  puzzle, layout, difficulty, mode, isFavorite, showAnswer,
  onRegenerate, onChangeDifficulty, onCycleQuote, onToggleFavorite, onToggleShowAnswer, onDumpLayout, onPreviewBookmark, onOpenLibrary,
}) => {
  const [open, setOpen] = useState(false);
  const tap = (fn: () => void) => () => { soundManager.playSound('button_click'); fn(); };

  const idxInLib = PUZZLE_LIBRARY.findIndex((p) => p.id === puzzle.id);

  return (
    <>
      {/* 折叠态：浮动小圆按钮 */}
      {!open && (
        <TouchableOpacity
          style={styles.fab}
          onPress={tap(() => setOpen(true))}
          activeOpacity={0.8}
        >
          <Ionicons name="construct-outline" size={20} color={CONFIG.colors.primary} />
        </TouchableOpacity>
      )}

      {/* 展开态：调试面板 */}
      {open && (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderLeft}>
              <Ionicons name="bug-outline" size={15} color={CONFIG.colors.primary} />
              <Text style={styles.panelTitle}>开发者控制台</Text>
            </View>
            <TouchableOpacity onPress={tap(() => setOpen(false))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-up-outline" size={20} color={CONFIG.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.panelScroll} bounces={false}>
            {/* 元信息 */}
            <Section title="谜题信息">
              <Meta label="题号" value={`${puzzle.id}${idxInLib >= 0 ? ` (库#${idxInLib + 1}/${PUZZLE_LIBRARY.length})` : ''}`} />
              <Meta label="名言" value={puzzle.quote} />
              <Meta label="出处" value={`${puzzle.author}《${puzzle.source}》`} />
              <Meta label="分类 / 字数" value={`${puzzle.category} / ${puzzle.quote.length} 字`} />
            </Section>

            <Section title="布局 / 正解">
              <Meta label="正解位置" value={`col=${layout.solutionPosition.col}  row=${layout.solutionPosition.row}`} />
              <Meta label="正解旋转" value={`${layout.solutionRotation}°`} />
              <Meta label="卡片 / 镂空" value={`${layout.cardShape.size}×${layout.cardShape.size}  ·  ${layout.cardShape.holes.length} 镂空`} />
              <Meta label="网格" value={`${layout.gridCols} cols × ${layout.gridRows} rows`} />
            </Section>

            {/* 难度 */}
            {mode == null || mode === 'classic' ? (
              <Section title="难度（立即切换）">
                <View style={styles.rowBtns}>
                  {DIFF_ORDER.map((d) => {
                    const active = d === difficulty;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.miniBtn, active && styles.miniBtnActive]}
                        onPress={tap(() => onChangeDifficulty(d))}
                      >
                        <Text style={[styles.miniBtnText, active && styles.miniBtnTextActive]}>
                          {DIFFICULTY_CONFIGS[d].label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Section>
            ) : (
              // 挑战模式：难度恒为 hard 档（卡片仍 medium 9×9）。切难度会丢弃当前对局且对卡片无意义 → 不提供切换按钮。
              <Section title="难度">
                <Meta label="难度档" value={mode === 'hide' ? '捉迷藏（自定义句子）' : '困难（挑战模式固定）'} />
                <Meta label="卡片" value={`${layout.cardShape.size}×${layout.cardShape.size}`} />
              </Section>
            )}

            {/* 题库导航 */}
            <Section title="题库导航">
              <View style={styles.rowBtns}>
                <TouchableOpacity style={styles.miniBtn} onPress={tap(() => onCycleQuote(-1))} disabled={idxInLib < 0}>
                  <Ionicons name="chevron-back" size={16} color={CONFIG.colors.text} />
                  <Text style={styles.miniBtnText}>上一题</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.miniBtn} onPress={tap(() => onCycleQuote(1))} disabled={idxInLib < 0}>
                  <Text style={styles.miniBtnText}>下一题</Text>
                  <Ionicons name="chevron-forward" size={16} color={CONFIG.colors.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.miniBtnFull} onPress={tap(onRegenerate)}>
                <Ionicons name="shuffle-outline" size={16} color={CONFIG.colors.primary} />
                <Text style={styles.miniBtnText}>换题（同难度随机）</Text>
              </TouchableOpacity>
            </Section>

            {/* 题库管理 */}
            <Section title="题库">
              <TouchableOpacity style={[styles.miniBtnFull, { borderColor: CONFIG.colors.primary, backgroundColor: 'rgba(200,169,110,0.14)' }]} onPress={tap(onOpenLibrary)}>
                <Ionicons name="library-outline" size={16} color={CONFIG.colors.primary} />
                <Text style={[styles.miniBtnText, { color: CONFIG.colors.primary, fontWeight: '700' }]}>题库管理（增删改 / 查日期）</Text>
              </TouchableOpacity>
            </Section>

            {/* 调试动作 */}
            <Section title="调试">
              <View style={styles.rowBtns}>
                <TouchableOpacity
                  style={[styles.miniBtn, showAnswer && styles.miniBtnActive]}
                  onPress={tap(onToggleShowAnswer)}
                >
                  <Ionicons name={showAnswer ? 'eye-off-outline' : 'eye-outline'} size={16} color={showAnswer ? CONFIG.colors.background : CONFIG.colors.primary} />
                  <Text style={[styles.miniBtnText, showAnswer && styles.miniBtnTextActive]}>{showAnswer ? '隐藏答案' : '显示答案'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.miniBtn, isFavorite && styles.miniBtnActive]}
                  onPress={tap(onToggleFavorite)}
                >
                  <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={16} color={isFavorite ? CONFIG.colors.background : '#FFD700'} />
                  <Text style={[styles.miniBtnText, isFavorite && styles.miniBtnTextActive]}>{isFavorite ? '已收藏' : '收藏'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.miniBtnFull} onPress={tap(onDumpLayout)}>
                <Ionicons name="code-slash-outline" size={16} color={CONFIG.colors.primary} />
                <Text style={styles.miniBtnText}>输出布局 JSON 到控制台</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnFull, { marginTop: 8, borderColor: CONFIG.colors.primary, backgroundColor: 'rgba(200,169,110,0.14)' }]} onPress={tap(onPreviewBookmark)}>
                <Ionicons name="bookmark-outline" size={16} color={CONFIG.colors.primary} />
                <Text style={[styles.miniBtnText, { color: CONFIG.colors.primary, fontWeight: '700' }]}>预览书签（当前题）</Text>
              </TouchableOpacity>
            </Section>

            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      )}
    </>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Meta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metaRow}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue} selectable>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 104,
    left: 16,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(26,22,18,0.92)',
    borderWidth: 1.2,
    borderColor: CONFIG.colors.primary,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 12, elevation: 8,
  },
  panel: {
    position: 'absolute',
    top: 96, left: 12, right: 12,
    maxHeight: '72%',
    backgroundColor: 'rgba(26,22,18,0.97)',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: CONFIG.colors.primary,
    paddingHorizontal: 14,
    paddingBottom: 12,
    zIndex: 20, elevation: 12,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(245,230,200,0.1)',
    marginBottom: 6,
  },
  panelHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  panelTitle: { color: CONFIG.colors.primary, fontWeight: '700', fontSize: 14, marginLeft: 8, letterSpacing: 1 },
  panelScroll: { marginBottom: 0 },
  section: { paddingVertical: 8 },
  sectionTitle: { color: CONFIG.colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 1 },
  metaRow: { flexDirection: 'row', paddingVertical: 3 },
  metaLabel: { width: 92, color: CONFIG.colors.textSecondary, fontSize: 12 },
  metaValue: { flex: 1, color: CONFIG.colors.text, fontSize: 12, fontWeight: '500' },
  rowBtns: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  miniBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(245,230,200,0.06)', borderWidth: 1, borderColor: 'rgba(245,230,200,0.12)',
  },
  miniBtnActive: { backgroundColor: CONFIG.colors.primary, borderColor: CONFIG.colors.primary },
  miniBtnText: { color: CONFIG.colors.text, fontSize: 12 },
  miniBtnTextActive: { color: CONFIG.colors.background, fontWeight: '700' },
  miniBtnFull: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(245,230,200,0.06)', borderWidth: 1, borderColor: 'rgba(245,230,200,0.12)',
  },
});
