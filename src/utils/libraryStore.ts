// 字垣 — 自定义题库持久化（AsyncStorage）
// 纯逻辑见 src/game/library.ts；本文件只做加载 / 保存 / 落盘型 CRUD。

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Puzzle } from '../game/types';
import {
  PuzzleDraft,
  CrudOutcome,
  addPuzzlePure,
  updatePuzzlePure,
  deletePuzzlePure,
} from '../game/library';

const LIB_KEY = 'decode_card_custom_library';

/** 合法 Puzzle 形状守卫（加载时过滤损坏条目） */
function isValidPuzzle(v: any): v is Puzzle {
  return !!v && typeof v === 'object'
    && typeof v.id === 'string' && v.id.length > 0
    && typeof v.quote === 'string' && v.quote.length > 0
    && typeof v.author === 'string'
    && typeof v.source === 'string'
    && typeof v.category === 'string';
}

export async function loadCustomPuzzles(): Promise<Puzzle[]> {
  try {
    const raw = await AsyncStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidPuzzle) : [];
  } catch {
    return [];
  }
}

export async function saveCustomPuzzles(custom: Puzzle[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIB_KEY, JSON.stringify(custom));
  } catch (e) {
    console.error('saveCustomPuzzles:', e);
  }
}

/** 新增（含去重校验）并落盘。成功 → error === ''；失败 → error 为可读原因、custom 原样回传。 */
export async function addCustomPuzzle(draft: PuzzleDraft, custom: Puzzle[]): Promise<CrudOutcome> {
  const r = addPuzzlePure(custom, draft);
  if (!r.error) await saveCustomPuzzles(r.custom);
  return r;
}

/** 修改自定义题（按 id；内置题不可改）并落盘 */
export async function updateCustomPuzzle(id: string, draft: PuzzleDraft, custom: Puzzle[]): Promise<CrudOutcome> {
  const r = updatePuzzlePure(custom, id, draft);
  if (!r.error) await saveCustomPuzzles(r.custom);
  return r;
}

/** 删除自定义题（按 id）并落盘 */
export async function deleteCustomPuzzle(id: string, custom: Puzzle[]): Promise<Puzzle[]> {
  const next = deletePuzzlePure(custom, id);
  await saveCustomPuzzles(next);
  return next;
}
