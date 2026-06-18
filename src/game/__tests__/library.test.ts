// 字垣 — 题库管理纯逻辑测试（无 AsyncStorage）

import {
  getWorkingLibrary,
  isDuplicateQuote,
  validatePuzzleDraft,
  addPuzzlePure,
  updatePuzzlePure,
  deletePuzzlePure,
  lookupDailyByDate,
  filterLibrary,
  isBuiltinPuzzle,
  PUZZLE_CATEGORIES,
} from '../library';
import type { PuzzleDraft } from '../library';
import { PUZZLE_LIBRARY, generateDailyPuzzle } from '../puzzleGenerator';
import type { Puzzle } from '../types';

const draft = (over: Partial<PuzzleDraft> = {}): PuzzleDraft => ({
  quote: '海内存知己天涯若比邻',
  author: '王勃',
  source: '送杜少府之任蜀州',
  category: '诗词歌赋',
  ...over,
});

describe('getWorkingLibrary / isDuplicateQuote', () => {
  test('工作题库 = 内置 + 自定义', () => {
    const custom: Puzzle[] = [{ id: 'c1', quote: '测试一句', author: '甲', source: '乙', category: '书摘' }];
    const lib = getWorkingLibrary(custom);
    expect(lib.length).toBe(PUZZLE_LIBRARY.length + 1);
    expect(lib[lib.length - 1].id).toBe('c1');
  });

  test('去重：检测内置与自定义，trim 不敏感', () => {
    const builtinQuote = PUZZLE_LIBRARY[0].quote;
    expect(isDuplicateQuote(PUZZLE_LIBRARY, builtinQuote)).toBe(true);
    expect(isDuplicateQuote(PUZZLE_LIBRARY, `  ${builtinQuote}  `)).toBe(true);
    expect(isDuplicateQuote(PUZZLE_LIBRARY, '完全不存在的句子XYZ')).toBe(false);
    expect(isDuplicateQuote([], '')).toBe(false);
  });
});

describe('validatePuzzleDraft', () => {
  test('合法草稿 → puzzle 非空、error 空、id 以 c 开头', () => {
    const v = validatePuzzleDraft(draft(), PUZZLE_LIBRARY);
    expect(v.puzzle).not.toBeNull();
    expect(v.error).toBe('');
    if (v.puzzle) {
      expect(v.puzzle.quote).toBe('海内存知己天涯若比邻');
      expect(v.puzzle.author).toBe('王勃');
      expect(v.puzzle.id.startsWith('c')).toBe(true);
    }
  });

  test('名言过短 / 过长 / 空 → 拒绝', () => {
    expect(validatePuzzleDraft(draft({ quote: '一' }), PUZZLE_LIBRARY).puzzle).toBeNull();
    expect(validatePuzzleDraft(draft({ quote: '一二三四五六七八九十一二三四五六七八九十1' }), PUZZLE_LIBRARY).puzzle).toBeNull();
    expect(validatePuzzleDraft(draft({ quote: '   ' }), PUZZLE_LIBRARY).puzzle).toBeNull();
  });

  test('缺作者 / 缺出处 / 分类非法 → 拒绝（带可读错误）', () => {
    expect(validatePuzzleDraft(draft({ author: '' }), PUZZLE_LIBRARY).puzzle).toBeNull();
    expect(validatePuzzleDraft(draft({ source: '' }), PUZZLE_LIBRARY).puzzle).toBeNull();
    expect(validatePuzzleDraft(draft({ category: '其它' as any }), PUZZLE_LIBRARY).puzzle).toBeNull();
    // 错误信息非空
    expect(validatePuzzleDraft(draft({ author: '' }), PUZZLE_LIBRARY).error.length).toBeGreaterThan(0);
  });

  test('与内置库重复 → 拒绝', () => {
    const v = validatePuzzleDraft(draft({ quote: PUZZLE_LIBRARY[0].quote }), PUZZLE_LIBRARY);
    expect(v.puzzle).toBeNull();
    expect(v.error).toContain('重复');
  });
});

describe('addPuzzlePure / updatePuzzlePure / deletePuzzlePure', () => {
  test('新增：去重通过则追加', () => {
    const r = addPuzzlePure([], draft());
    expect(r.error).toBe('');
    expect(r.custom).toHaveLength(1);
    expect(r.puzzle?.quote).toBe('海内存知己天涯若比邻');
  });

  test('新增重复（与内置）→ 拒绝且不修改数组', () => {
    const r = addPuzzlePure([], draft({ quote: PUZZLE_LIBRARY[0].quote }));
    expect(r.error).not.toBe('');
    expect(r.custom).toHaveLength(0);
  });

  test('修改自定义题：保留原 id，内容更新', () => {
    const added = addPuzzlePure([], draft());
    const id = added.puzzle!.id;
    const r = updatePuzzlePure(added.custom, id, draft({ quote: '另一句不同的话', author: '李四' }));
    expect(r.error).toBe('');
    expect(r.custom).toHaveLength(1);
    expect(r.custom[0].id).toBe(id); // id 不变
    expect(r.custom[0].author).toBe('李四');
  });

  test('修改内置题 id → 拒绝', () => {
    const r = updatePuzzlePure([], PUZZLE_LIBRARY[0].id, draft());
    expect(r.error).not.toBe('');
  });

  test('修改后与库内其它题重复 → 拒绝（但不拦截与自身相同正文）', () => {
    const added = addPuzzlePure([], draft());
    const id = added.puzzle!.id;
    // 改成与内置重复 → 拒绝
    const r = updatePuzzlePure(added.custom, id, draft({ quote: PUZZLE_LIBRARY[0].quote }));
    expect(r.error).not.toBe('');
    // 保持自身正文不变（仅改作者）→ 通过（查重排除自身）
    const r2 = updatePuzzlePure(added.custom, id, draft({ author: '张三' }));
    expect(r2.error).toBe('');
  });

  test('删除：按 id 移除', () => {
    const added = addPuzzlePure([], draft());
    const next = deletePuzzlePure(added.custom, added.puzzle!.id);
    expect(next).toHaveLength(0);
  });
});

describe('lookupDailyByDate', () => {
  test('返回三档难度，且与 generateDailyPuzzle 一致（确定性）', () => {
    const DATE = '2026-06-14';
    const m = lookupDailyByDate(DATE);
    expect(m.easy.id).toBe(generateDailyPuzzle(DATE, 'easy').puzzle.id);
    expect(m.medium.id).toBe(generateDailyPuzzle(DATE, 'medium').puzzle.id);
    expect(m.hard.id).toBe(generateDailyPuzzle(DATE, 'hard').puzzle.id);
    // 三档通常不同题
    expect(new Set([m.easy.id, m.medium.id, m.hard.id]).size).toBe(3);
  });

  test('同日期多次查询稳定', () => {
    const a = lookupDailyByDate('2026-06-15');
    const b = lookupDailyByDate('2026-06-15');
    expect(a).toEqual(b);
  });
});

describe('filterLibrary / isBuiltinPuzzle', () => {
  test('按作者 / 出处 / 正文子串筛选（大小写不敏感）', () => {
    const lib = getWorkingLibrary([]);
    const byAuthor = filterLibrary(lib, '李白');
    expect(byAuthor.length).toBeGreaterThan(0);
    expect(byAuthor.every((p) => p.author.includes('李白'))).toBe(true);
    // 查无
    expect(filterLibrary(lib, '完全不存在的作者名ZZZ')).toHaveLength(0);
    // 空查询返回全部
    expect(filterLibrary(lib, '')).toHaveLength(lib.length);
  });

  test('isBuiltinPuzzle：内置为 true，自定义（c 前缀）为 false', () => {
    expect(isBuiltinPuzzle(PUZZLE_LIBRARY[0])).toBe(true);
    const custom: Puzzle = { id: 'c123', quote: 'x', author: 'y', source: 'z', category: '书摘' };
    expect(isBuiltinPuzzle(custom)).toBe(false);
  });

  test('PUZZLE_CATEGORIES 三项齐全', () => {
    expect(PUZZLE_CATEGORIES).toEqual(['名人名言', '诗词歌赋', '书摘']);
  });
});
