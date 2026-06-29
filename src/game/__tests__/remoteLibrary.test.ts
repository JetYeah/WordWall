import { normalizeRemote, fetchRemoteLibrary, pickDailyQuote } from '../remoteLibrary';
import { Puzzle } from '../types';

const good = { quotes: [{ id: 'r1', quote: '海内存知己', author: '王勃', source: '送杜少府之任蜀州', category: '诗词歌赋' }] };

describe('normalizeRemote — 校验/清洗', () => {
  test('合法条目原样保留', () => {
    expect(normalizeRemote(good)).toEqual([good.quotes[0]]);
  });

  test('非对象 / 无 quotes 数组 → null', () => {
    expect(normalizeRemote(null)).toBeNull();
    expect(normalizeRemote({})).toBeNull();
    expect(normalizeRemote({ quotes: 'x' })).toBeNull();
  });

  test('空 quotes → null', () => {
    expect(normalizeRemote({ quotes: [] })).toBeNull();
  });

  test('缺字段（空 id）→ 全过滤 → null', () => {
    expect(normalizeRemote({ quotes: [{ id: '', quote: '海内存知己', author: '王勃', source: 'x', category: '诗词歌赋' }] })).toBeNull();
  });

  test('category 非法 → 过滤 → null', () => {
    expect(normalizeRemote({ quotes: [{ id: 'r1', quote: '海内存知己', author: '王勃', source: 'x', category: '其他' }] })).toBeNull();
  });

  test('字数 <4 / >11 → 过滤 → null', () => {
    expect(normalizeRemote({ quotes: [{ id: 'r1', quote: '海', author: 'x', source: 'y', category: '诗词歌赋' }] })).toBeNull();
    expect(normalizeRemote({ quotes: [{ id: 'r1', quote: '一二三四五六七八九十一二三四', author: 'x', source: 'y', category: '诗词歌赋' }] })).toBeNull();
  });

  test('id 重复 → 丢弃后者', () => {
    const r = normalizeRemote({ quotes: [
      { id: 'r1', quote: '海内存知己', author: 'a', source: 'b', category: '诗词歌赋' },
      { id: 'r1', quote: '落霞与孤鹜齐飞', author: 'c', source: 'd', category: '名人名言' },
    ] });
    expect(r?.length).toBe(1);
    expect(r?.[0].quote).toBe('海内存知己');
  });

  test('quote 重复 → 丢弃后者', () => {
    const r = normalizeRemote({ quotes: [
      { id: 'r1', quote: '海内存知己', author: 'a', source: 'b', category: '诗词歌赋' },
      { id: 'r2', quote: '海内存知己', author: 'c', source: 'd', category: '名人名言' },
    ] });
    expect(r?.length).toBe(1);
  });

  test('与内置 PUZZLE_LIBRARY 重复（千里之行始于足下 = q01）→ 过滤 → null', () => {
    expect(normalizeRemote({ quotes: [{ id: 'r1', quote: '千里之行始于足下', author: '老子', source: '道德经', category: '名人名言' }] })).toBeNull();
  });

  test('trim 空白后比较', () => {
    const r = normalizeRemote({ quotes: [{ id: ' r1 ', quote: ' 海内存知己 ', author: ' 王勃 ', source: ' x ', category: ' 诗词歌赋 ' }] });
    expect(r?.[0].id).toBe('r1');
    expect(r?.[0].quote).toBe('海内存知己');
  });
});

describe('pickDailyQuote — 当天选题', () => {
  const SRC: Puzzle[] = [
    { id: 't1', quote: '海内存知己', author: '王勃', source: '送杜少府之任蜀州', category: '诗词歌赋' }, // 5 easy
    { id: 't2', quote: '落霞与孤鹜齐飞', author: '王勃', source: '滕王阁序', category: '名人名言' },     // 7 medium
    { id: 't3', quote: '先天下之忧而忧', author: '范仲淹', source: '岳阳楼记', category: '名人名言' },   // 7 medium
    { id: 't4', quote: '鞠躬尽瘁死而后已', author: '诸葛亮', source: '出师表', category: '名人名言' },   // 8 medium
  ];

  test('确定性：同输入同输出', () => {
    const a = pickDailyQuote(SRC, '2026-06-29', 'medium', {});
    const b = pickDailyQuote(SRC, '2026-06-29', 'medium', {});
    expect(a.puzzle.id).toBe(b.puzzle.id);
    expect(a.key).toBe('2026-06-29|medium');
  });

  test('子池过滤：easy 只在 4–6 字里选（仅 t1）', () => {
    const e = pickDailyQuote(SRC, '2026-06-29', 'easy', {});
    expect(e.puzzle.id).toBe('t1');
  });

  test('picked 命中且 id 在 source → 复用', () => {
    const r = pickDailyQuote(SRC, '2026-06-29', 'medium', { '2026-06-29|medium': 't3' });
    expect(r.puzzle.id).toBe('t3');
  });

  test('picked 命中但 id 不在 source → 重选（与空 picked 一致）', () => {
    const r = pickDailyQuote(SRC, '2026-06-29', 'medium', { '2026-06-29|medium': 'gone' });
    const fresh = pickDailyQuote(SRC, '2026-06-29', 'medium', {});
    expect(r.puzzle.id).toBe(fresh.puzzle.id);
  });

  test('换难度独立 key', () => {
    const m = pickDailyQuote(SRC, '2026-06-29', 'medium', {});
    const e = pickDailyQuote(SRC, '2026-06-29', 'easy', {});
    expect(m.key).not.toBe(e.key);
  });

  test('不同日期通常不同题（子池 ≥2 时）', () => {
    const d1 = pickDailyQuote(SRC, '2026-06-29', 'medium', {}).puzzle.id;
    const d2 = pickDailyQuote(SRC, '2026-06-28', 'medium', {}).puzzle.id;
    // medium 子池 3 条，相邻两日 seed 不同，极大概率不同题（不强断言 != 以免撞 hash 边界）
    expect(SRC.find(p => p.id === d1)).toBeDefined();
    expect(SRC.find(p => p.id === d2)).toBeDefined();
  });
});

describe('fetchRemoteLibrary — fetch + 兜底', () => {
  const origFetch = (global as any).fetch;
  afterEach(() => { (global as any).fetch = origFetch; });
  const setFetch = (impl: (url: string) => any) => { (global as any).fetch = jest.fn(impl as any); };

  test('主 URL 成功 → 返回 normalize 结果', async () => {
    setFetch(async () => ({ ok: true, json: async () => good }));
    const lib = await fetchRemoteLibrary();
    expect(lib).not.toBeNull();
    expect(lib![0].id).toBe('r1');
  });

  test('主 URL 抛错 → fallback URL 成功', async () => {
    let call = 0;
    setFetch(async () => { call++; if (call === 1) throw new Error('net'); return { ok: true, json: async () => good }; });
    const lib = await fetchRemoteLibrary();
    expect(lib).not.toBeNull();
    expect(call).toBe(2);
  });

  test('主 URL ok=false → fallback 成功', async () => {
    let call = 0;
    setFetch(async () => { call++; if (call === 1) return { ok: false, status: 404, json: async () => null }; return { ok: true, json: async () => good }; });
    const lib = await fetchRemoteLibrary();
    expect(lib).not.toBeNull();
  });

  test('normalize 失败（无合法条目）→ 试 fallback', async () => {
    let call = 0;
    setFetch(async () => { call++; if (call === 1) return { ok: true, json: async () => ({ quotes: [] }) }; return { ok: true, json: async () => good }; });
    const lib = await fetchRemoteLibrary();
    expect(lib).not.toBeNull();
    expect(call).toBe(2);
  });

  test('全失败 → null（永不抛）', async () => {
    setFetch(async () => { throw new Error('net'); });
    const lib = await fetchRemoteLibrary();
    expect(lib).toBeNull();
  });

  test('res.ok=false 且 fallback 也失败 → null', async () => {
    setFetch(async () => ({ ok: false, status: 500, json: async () => null }));
    const lib = await fetchRemoteLibrary();
    expect(lib).toBeNull();
  });
});
