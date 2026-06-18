// 字垣 — 本地 AI 出题生成器测试

import { generateFromRange, MAX_CANDIDATES } from '../aiGenerator';
import { QUOTE_CORPUS } from '../quoteCorpus';
import { PUZZLE_LIBRARY } from '../puzzleGenerator';
import { getWorkingLibrary } from '../library';
import type { Puzzle } from '../types';

describe('generateFromRange', () => {
  test('按作者筛选：返回该作者的新题，全部 c 前缀 id', () => {
    const lib = getWorkingLibrary([]); // 仅内置库
    const r = generateFromRange('李白', lib);
    expect(r.candidates.length).toBeGreaterThan(0);
    // 候选全部来自李白（作者 / 出处 / 正文匹配；李白条目作者均为李白）
    r.candidates.forEach((p) => {
      expect(p.id.startsWith('c')).toBe(true);
      expect(
        p.author.includes('李白') || p.source.includes('李白') || p.quote.includes('李白'),
      ).toBe(true);
    });
    expect(r.note).toContain('李白');
  });

  test('去重：不返回已在工作题库中的题（内置 + 自定义）', () => {
    // 内置库含「千里之行始于足下」（老子·道德经）；语料也收录了同一句 → 应被去重剔除
    const lib = getWorkingLibrary([]);
    const r = generateFromRange('道德经', lib);
    const quotes = r.candidates.map((p) => p.quote);
    expect(quotes).not.toContain('千里之行始于足下');
    // 自定义题也应参与去重
    const custom: Puzzle[] = [{ id: 'c1', quote: '合抱之木生于毫末', author: '老子', source: '道德经', category: '名人名言' }];
    const lib2 = getWorkingLibrary(custom);
    const r2 = generateFromRange('道德经', lib2);
    expect(r2.candidates.map((p) => p.quote)).not.toContain('合抱之木生于毫末');
  });

  test('候选 id 在本次生成内唯一', () => {
    const r = generateFromRange('杜甫', getWorkingLibrary([]));
    const ids = r.candidates.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('无匹配关键词：回退随机候选，note 说明未找到', () => {
    const r = generateFromRange('完全不存在的作者名XYZ', getWorkingLibrary([]));
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.note).toContain('未找到');
  });

  test('空输入：返回随机候选 + 语料库总数说明', () => {
    const r = generateFromRange('', getWorkingLibrary([]));
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(r.note).toContain(String(QUOTE_CORPUS.length));
  });

  test('上限：候选数不超过 MAX_CANDIDATES', () => {
    const r = generateFromRange('', getWorkingLibrary([]));
    expect(r.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
  });

  test('生成的 Puzzle 字段齐全（quote/author/source/category）', () => {
    const r = generateFromRange('论语', getWorkingLibrary([]));
    r.candidates.forEach((p) => {
      expect(typeof p.quote === 'string' && p.quote.length > 0).toBe(true);
      expect(typeof p.author === 'string').toBe(true);
      expect(typeof p.source === 'string').toBe(true);
      expect(['名人名言', '诗词歌赋', '书摘']).toContain(p.category);
    });
  });

  test('语料库条目本身 quote 唯一（避免语料内部重复）', () => {
    const quotes = QUOTE_CORPUS.map((e) => e.quote.trim());
    expect(new Set(quotes).size).toBe(quotes.length);
  });
});
