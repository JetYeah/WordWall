// 字垣 — 题库管理（仅开发者模式可见）
// 功能：查看全部题库（内置 + 自定义）、新增 / 编辑 / 删除自定义题、按日期查询每日题、试玩任一题。
// 内置题（q/p/b 前缀）只读；自定义题（c 前缀）可编辑 / 删除。

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, StatusBar,
  Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Puzzle, PuzzleCategory, DifficultyLevel } from '../game/types';
import {
  getWorkingLibrary, filterLibrary, isBuiltinPuzzle, lookupDailyByDate, PUZZLE_CATEGORIES, PuzzleDraft,
} from '../game/library';
import { generateFromRange, GenResult } from '../game/aiGenerator';
import { DIFFICULTY_CONFIGS } from '../game/puzzleGenerator';
import { nowLocalIsoDate } from '../game/stats';
import { soundManager } from '../utils/soundManager';
import { CONFIG } from '../config';

interface Props {
  customPuzzles: Puzzle[];
  onAdd: (draft: PuzzleDraft) => string;          // 返回 '' 成功，否则错误信息
  onUpdate: (id: string, draft: PuzzleDraft) => string;
  onDelete: (id: string) => void;
  /** 试玩任一题（生成 layout 并进入 Game） */
  onPlay: (puzzle: Puzzle) => void;
  onBack: () => void;
}

const DIFFS: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export const LibraryManagerScreen: React.FC<Props> = ({
  customPuzzles, onAdd, onUpdate, onDelete, onPlay, onBack,
}) => {
  const [query, setQuery] = useState('');
  const [dateQuery, setDateQuery] = useState(nowLocalIsoDate());
  const [editing, setEditing] = useState<{ id?: string; draft: PuzzleDraft } | null>(null);
  // AI 出题（本地语料）
  const [aiInput, setAiInput] = useState('');
  const [aiResult, setAiResult] = useState<GenResult | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const working = useMemo(() => getWorkingLibrary(customPuzzles), [customPuzzles]);
  const filtered = useMemo(() => filterLibrary(working, query), [working, query]);
  const dateResult = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateQuery.trim())) return null;
    try { return lookupDailyByDate(dateQuery.trim()); } catch { return null; }
  }, [dateQuery]);

  const openAdd = useCallback(() => {
    soundManager.playSound('button_click');
    setEditing({ draft: { quote: '', author: '', source: '', category: '名人名言' } });
  }, []);

  const openEdit = useCallback((p: Puzzle) => {
    soundManager.playSound('button_click');
    setEditing({ id: p.id, draft: { quote: p.quote, author: p.author, source: p.source, category: p.category } });
  }, []);

  const saveDraft = useCallback(() => {
    if (!editing) return;
    const err = editing.id ? onUpdate(editing.id, editing.draft) : onAdd(editing.draft);
    if (err) {
      Alert.alert('无法保存', err);
    } else {
      soundManager.playSound('puzzle_complete');
      setEditing(null);
    }
  }, [editing, onAdd, onUpdate]);

  const confirmDelete = useCallback((p: Puzzle) => {
    soundManager.playSound('button_click');
    Alert.alert('删除题目', `确定删除「${p.quote}」？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(p.id) },
    ]);
  }, [onDelete]);

  // AI 出题：按出处范围从本地语料匹配 + 去重
  const handleGenerate = useCallback(() => {
    soundManager.playSound('button_click');
    const r = generateFromRange(aiInput, getWorkingLibrary(customPuzzles));
    setAiResult(r);
    setAddedIds(new Set());
  }, [aiInput, customPuzzles]);

  const handleAddCandidate = useCallback((p: Puzzle) => {
    const err = onAdd({ quote: p.quote, author: p.author, source: p.source, category: p.category });
    if (!err) {
      soundManager.playSound('puzzle_complete');
      setAddedIds((prev) => new Set(prev).add(p.id));
    } else {
      Alert.alert('无法加入', err);
    }
  }, [onAdd]);

  const renderItem = ({ item }: { item: Puzzle }) => {
    const builtin = isBuiltinPuzzle(item);
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.rowMain} onPress={() => { soundManager.playSound('button_click'); onPlay(item); }} activeOpacity={0.7}>
          <View style={styles.rowHead}>
            <Text style={styles.rowQuote} numberOfLines={1}>{item.quote}</Text>
            <View style={[styles.tag, builtin ? styles.tagBuiltin : styles.tagCustom]}>
              <Text style={styles.tagText}>{builtin ? '内置' : '自定义'}</Text>
            </View>
          </View>
          <Text style={styles.rowMeta} numberOfLines={1}>{item.author}《{item.source}》 · {item.category} · {item.quote.length}字</Text>
        </TouchableOpacity>
        {!builtin && (
          <View style={styles.rowActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Ionicons name="create-outline" size={20} color={CONFIG.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CONFIG.colors.background} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => { soundManager.playSound('button_click'); onBack(); }} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={CONFIG.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>题库管理</Text>
        <Text style={styles.headerCount}>{working.length} 题</Text>
      </View>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={(
          <View>
            {/* 新增 */}
            <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.8}>
              <Ionicons name="add-circle-outline" size={20} color={CONFIG.colors.background} />
              <Text style={styles.addBtnText}>新增题目</Text>
            </TouchableOpacity>

            {/* 搜索 */}
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color={CONFIG.colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="按名言 / 作者 / 出处筛选"
                placeholderTextColor={CONFIG.colors.textSecondary}
                value={query}
                onChangeText={setQuery}
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={16} color={CONFIG.colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 日期查询 */}
            <View style={styles.dateSection}>
              <View style={styles.sectionLabelRow}>
                <Ionicons name="calendar-outline" size={15} color={CONFIG.colors.primary} />
                <Text style={styles.sectionLabel}>按日期查找每日题</Text>
              </View>
              <View style={styles.dateInputWrap}>
                <TextInput
                  style={styles.dateInput}
                  value={dateQuery}
                  onChangeText={setDateQuery}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={CONFIG.colors.textSecondary}
                />
              </View>
              {dateResult ? (
                <View style={styles.dateResults}>
                  {DIFFS.map((d) => {
                    const p = dateResult[d];
                    return (
                      <TouchableOpacity key={d} style={styles.dateRow} onPress={() => { soundManager.playSound('button_click'); onPlay(p); }} activeOpacity={0.7}>
                        <View style={[styles.diffChipSmall, { backgroundColor: `${CONFIG.colors.primary}22` }]}>
                          <Text style={styles.diffChipText}>{DIFFICULTY_CONFIGS[d].label}</Text>
                        </View>
                        <View style={styles.dateRowText}>
                          <Text style={styles.dateRowQuote} numberOfLines={1}>{p.quote}</Text>
                          <Text style={styles.dateRowMeta} numberOfLines={1}>{p.author}《{p.source}》</Text>
                        </View>
                        <Ionicons name="play-circle-outline" size={20} color={CONFIG.colors.primary} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.dateHint}>输入合法日期（如 2026-06-14）查看该日三档每日题</Text>
              )}
            </View>

            {/* AI 出题（本地语料） */}
            <View style={styles.dateSection}>
              <View style={styles.sectionLabelRow}>
                <Ionicons name="sparkles-outline" size={15} color={CONFIG.colors.primary} />
                <Text style={styles.sectionLabel}>AI 出题（本地语料）</Text>
              </View>
              <Text style={styles.dateHint}>输入作者 / 书名 / 关键词（如「李白」「论语」），从本地语料智能匹配并去重；留空则随机生成。</Text>
              <View style={styles.aiInputRow}>
                <TextInput
                  style={styles.dateInput}
                  value={aiInput}
                  onChangeText={setAiInput}
                  placeholder="作者 / 书名 / 关键词"
                  placeholderTextColor={CONFIG.colors.textSecondary}
                />
                <TouchableOpacity style={styles.genBtn} onPress={handleGenerate} activeOpacity={0.8}>
                  <Text style={styles.genBtnText}>生成</Text>
                </TouchableOpacity>
              </View>
              {aiResult && (
                <View style={styles.aiResults}>
                  <Text style={styles.aiNote}>{aiResult.note}</Text>
                  {aiResult.candidates.map((p) => {
                    const added = addedIds.has(p.id);
                    return (
                      <View key={p.id} style={styles.aiCandidate}>
                        <View style={styles.aiCandidateText}>
                          <Text style={styles.dateRowQuote} numberOfLines={1}>{p.quote}</Text>
                          <Text style={styles.dateRowMeta} numberOfLines={1}>{p.author}《{p.source}》 · {p.category}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.aiAddBtn, added && styles.aiAddBtnDone]}
                          disabled={added}
                          onPress={() => handleAddCandidate(p)}
                        >
                          <Text style={styles.aiAddBtnText}>{added ? '已加入' : '加入'}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.sectionLabelRow}>
              <Ionicons name="library-outline" size={15} color={CONFIG.colors.primary} />
              <Text style={styles.sectionLabel}>全部题库（{filtered.length}）</Text>
            </View>
          </View>
        )}
      />

      {/* 新增 / 编辑弹层 */}
      <DraftModal
        visible={!!editing}
        draft={editing?.draft ?? null}
        title={editing?.id ? '编辑题目' : '新增题目'}
        onChange={(d) => setEditing((e) => (e ? { ...e, draft: d } : e))}
        onClose={() => setEditing(null)}
        onSave={saveDraft}
      />
    </View>
  );
};

// ─── 新增 / 编辑表单弹层 ──────────────────────────────
const DraftModal: React.FC<{
  visible: boolean;
  draft: PuzzleDraft | null;
  title: string;
  onChange: (d: PuzzleDraft) => void;
  onClose: () => void;
  onSave: () => void;
}> = ({ visible, draft, title, onChange, onClose, onSave }) => {
  const set = (k: keyof PuzzleDraft, v: string) => draft && onChange({ ...draft, [k]: v });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>

          <Text style={styles.fieldLabel}>名言正文（2–20 字，不可与库内重复）</Text>
          <TextInput
            style={styles.fieldInput}
            value={draft?.quote ?? ''}
            onChangeText={(v) => set('quote', v)}
            placeholder="如：海内存知己天涯若比邻"
            placeholderTextColor={CONFIG.colors.textSecondary}
            multiline
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>作者</Text>
              <TextInput style={styles.fieldInput} value={draft?.author ?? ''} onChangeText={(v) => set('author', v)} placeholder="王勃" placeholderTextColor={CONFIG.colors.textSecondary} />
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>出处</Text>
              <TextInput style={styles.fieldInput} value={draft?.source ?? ''} onChangeText={(v) => set('source', v)} placeholder="送杜少府之任蜀州" placeholderTextColor={CONFIG.colors.textSecondary} />
            </View>
          </View>

          <Text style={styles.fieldLabel}>分类</Text>
          <View style={styles.catRow}>
            {PUZZLE_CATEGORIES.map((c) => {
              const active = draft?.category === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.catBtn, active && styles.catBtnActive]}
                  onPress={() => draft && onChange({ ...draft, category: c as PuzzleCategory })}
                >
                  <Text style={[styles.catBtnText, active && styles.catBtnTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGhost]} onPress={onClose}>
              <Text style={styles.modalBtnGhostText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={onSave}>
              <Text style={styles.modalBtnPrimaryText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CONFIG.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: CONFIG.colors.text },
  headerCount: { fontSize: 13, color: CONFIG.colors.primary, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 48 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CONFIG.colors.primary, paddingVertical: 14, borderRadius: 14, marginBottom: 14,
  },
  addBtnText: { color: CONFIG.colors.background, fontSize: 15, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CONFIG.colors.surface, borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(245,230,200,0.1)', marginBottom: 18,
  },
  searchInput: { flex: 1, color: CONFIG.colors.text, paddingVertical: 12, fontSize: 14 },

  dateSection: {
    backgroundColor: CONFIG.colors.surface, borderRadius: 14, padding: 14, marginBottom: 18,
    borderWidth: 1, borderColor: 'rgba(200,169,110,0.18)',
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionLabel: { color: CONFIG.colors.primary, fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  dateInputWrap: { flexDirection: 'row' },
  dateInput: {
    flex: 1, color: CONFIG.colors.text, backgroundColor: 'rgba(245,230,200,0.06)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  dateResults: { marginTop: 10, gap: 8 },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(245,230,200,0.05)', borderRadius: 10, padding: 10,
  },
  dateRowText: { flex: 1 },
  dateRowQuote: { color: CONFIG.colors.text, fontSize: 14, fontWeight: '600' },
  dateRowMeta: { color: CONFIG.colors.textSecondary, fontSize: 11, marginTop: 2 },
  diffChipSmall: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  diffChipText: { color: CONFIG.colors.primary, fontSize: 11, fontWeight: '600' },
  dateHint: { color: CONFIG.colors.textSecondary, fontSize: 12, marginTop: 8 },
  aiInputRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  genBtn: { backgroundColor: CONFIG.colors.primary, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 10 },
  genBtnText: { color: CONFIG.colors.background, fontWeight: '700', fontSize: 14 },
  aiResults: { marginTop: 12, gap: 8 },
  aiNote: { color: CONFIG.colors.primary, fontSize: 12, fontWeight: '600' },
  aiCandidate: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(245,230,200,0.05)', borderRadius: 10, padding: 10 },
  aiCandidateText: { flex: 1 },
  aiAddBtn: { backgroundColor: CONFIG.colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  aiAddBtnDone: { backgroundColor: 'rgba(76,175,80,0.25)', borderWidth: 1, borderColor: CONFIG.colors.success },
  aiAddBtnText: { color: CONFIG.colors.background, fontSize: 12, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CONFIG.colors.surface, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  rowMain: { flex: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowQuote: { color: CONFIG.colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowMeta: { color: CONFIG.colors.textSecondary, fontSize: 12, marginTop: 4 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tagBuiltin: { backgroundColor: 'rgba(168,152,120,0.18)' },
  tagCustom: { backgroundColor: 'rgba(200,169,110,0.22)' },
  tagText: { fontSize: 10, color: CONFIG.colors.primary, fontWeight: '600' },
  rowActions: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  iconBtn: { padding: 6 },

  // modal
  modalWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 },
  modalCard: {
    width: '100%', backgroundColor: CONFIG.colors.surface, borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: CONFIG.colors.primary,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: CONFIG.colors.primary, marginBottom: 16, textAlign: 'center' },
  fieldLabel: { fontSize: 12, color: CONFIG.colors.textSecondary, marginTop: 10, marginBottom: 6 },
  fieldInput: {
    color: CONFIG.colors.text, backgroundColor: 'rgba(245,230,200,0.06)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: 'rgba(245,230,200,0.1)',
  },
  fieldRow: { flexDirection: 'row', gap: 10 },
  fieldCol: { flex: 1 },
  catRow: { flexDirection: 'row', gap: 8 },
  catBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: 'rgba(245,230,200,0.06)', borderWidth: 1, borderColor: 'rgba(245,230,200,0.12)',
  },
  catBtnActive: { backgroundColor: CONFIG.colors.primary, borderColor: CONFIG.colors.primary },
  catBtnText: { color: CONFIG.colors.text, fontSize: 13 },
  catBtnTextActive: { color: CONFIG.colors.background, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  modalBtnGhost: { borderWidth: 1, borderColor: 'rgba(245,230,200,0.22)' },
  modalBtnGhostText: { color: CONFIG.colors.textSecondary, fontSize: 15 },
  modalBtnPrimary: { backgroundColor: CONFIG.colors.primary },
  modalBtnPrimaryText: { color: CONFIG.colors.background, fontSize: 15, fontWeight: '700' },
});
