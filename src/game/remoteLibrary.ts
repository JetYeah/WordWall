// 字垣 — 远程题库（每日一题真·动态来源）
//
// data/quotes.json 托管在 GitHub main，经 jsDelivr CDN 拉取；AsyncStorage 缓存 + 内置库兜底。
// 远程只存「题面」(quote/author/source/category)，layout / 卡片 / 解仍由客户端 generatePuzzleFromQuote
// 本地确定性生成 —— 故 JSON 极轻、加题 = 往数组追加一行 + push（无需发版）。
//
// 选题契约不变：hashCode(date|difficulty) % 子池.length（子池 = 字数∈难度的条目）。
// 见 pickDailyQuote —— 它复刻 generateDailyPuzzle 的选题，并加「当天缓存命中优先」防后台刷新跳题。

import { Puzzle, DifficultyLevel } from './types';
import { DIFFICULTY_CONFIGS, hashCode, PUZZLE_LIBRARY } from './puzzleGenerator';

/** jsDelivr（国内友好 CDN，自动跟 main）。raw.githubusercontent 作兜底。均 HTTPS（Android 默认禁 cleartext）。 */
export const REMOTE_URL = 'https://cdn.jsdelivr.net/gh/JetYeah/WordWall@main/data/quotes.json';
export const REMOTE_URL_FALLBACK = 'https://raw.githubusercontent.com/JetYeah/WordWall/main/data/quotes.json';

/** 远程库缓存 TTL：超过则视为过期（触发后台重新 fetch）。 */
export const REMOTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_CATEGORIES = new Set<string>(['名人名言', '诗词歌赋', '书摘']);
const MIN_LEN = 4;  // 最低难度档 easy = 4–6 字
const MAX_LEN = 11; // 最高难度档 hard = 9–11 字；更长永远选不到，直接过滤

/**
 * 校验 + 清洗远程题库 JSON（纯函数，便于 jest）。
 *  - 结构须为 `{ quotes: [...] }`
 *  - 每条：5 字段（id/quote/author/source/category）均非空字符串、category ∈ union、quote 字数 4–11
 *  - id 唯一、quote 去重（trim 比较）、过滤与内置 PUZZLE_LIBRARY 重复的 quote
 * 清洗后为空 / 结构错 → 返回 null（调用方走 AsyncStorage 缓存 → 内置库兜底）。
 */
export function normalizeRemote(raw: any): Puzzle[] | null {
  if (!raw || !Array.isArray(raw.quotes)) return null;
  const seenId = new Set<string>();
  const seenQuote = new Set<string>();
  for (const p of PUZZLE_LIBRARY) seenQuote.add(p.quote.trim()); // 内置库白名单，去重
  const out: Puzzle[] = [];
  for (const q of raw.quotes) {
    if (!q || typeof q !== 'object') continue;
    const id = typeof q.id === 'string' ? q.id.trim() : '';
    const quote = typeof q.quote === 'string' ? q.quote.trim() : '';
    const author = typeof q.author === 'string' ? q.author.trim() : '';
    const source = typeof q.source === 'string' ? q.source.trim() : '';
    const category = typeof q.category === 'string' ? q.category.trim() : '';
    if (!id || !quote || !author || !source || !category) continue;
    if (!VALID_CATEGORIES.has(category)) continue;
    const len = quote.length;
    if (len < MIN_LEN || len > MAX_LEN) continue;
    if (seenId.has(id)) continue;
    if (seenQuote.has(quote)) continue;
    seenId.add(id);
    seenQuote.add(quote);
    out.push({ id, quote, author, source, category: category as Puzzle['category'] });
  }
  return out.length > 0 ? out : null;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 拉取远程题库：jsDelivr → raw 兜底；5s 超时；normalizeRemote 校验清洗。
 * 全程 try/catch，**永不抛** —— 任何失败返回 null（调用方走 AsyncStorage 缓存 → 内置库）。
 */
export async function fetchRemoteLibrary(): Promise<Puzzle[] | null> {
  for (const url of [REMOTE_URL, REMOTE_URL_FALLBACK]) {
    try {
      const raw = await fetchJsonWithTimeout(url, 5000);
      const cleaned = normalizeRemote(raw);
      if (cleaned && cleaned.length > 0) return cleaned;
    } catch {
      // 网络错 / 超时 / 解析错 → 试下一个 URL
    }
  }
  return null;
}

/**
 * 当天选题（纯函数）：子池 = source 中字数 ∈ difficulty 的；`hashCode(date|difficulty)` 确定性取。
 *  - picked[key] 命中且该 id 仍在 source 内 → 复用（保证后台刷新题库后「今天的题」不跳变）。
 *  - 否则按 hash 选，返回 key 供调用方写回 picked（`${date}|${difficulty}`，换难度独立稳定）。
 * 与 generateDailyPuzzle 的 seed 同源（都 `hashCode(date|difficulty)`），故 picked 未命中时二者选同一题。
 */
export function pickDailyQuote(
  source: Puzzle[],
  date: string,
  difficulty: DifficultyLevel,
  picked: Record<string, string>,
): { puzzle: Puzzle; key: string } {
  const key = `${date}|${difficulty}`;
  const cfg = DIFFICULTY_CONFIGS[difficulty];
  const subpool = source.filter(p => p.quote.length >= cfg.quoteLenMin && p.quote.length <= cfg.quoteLenMax);
  const candidates = subpool.length > 0 ? subpool : source;
  // 当天缓存命中：复用同一题（只要它仍在当前 source 内）
  const pickedId = picked[key];
  if (pickedId) {
    const hit = source.find(p => p.id === pickedId);
    if (hit) return { puzzle: hit, key };
  }
  const idx = candidates.length > 0 ? Math.abs(hashCode(key)) % candidates.length : 0;
  return { puzzle: candidates[idx], key };
}
