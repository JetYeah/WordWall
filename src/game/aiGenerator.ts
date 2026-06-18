// 字垣 — 本地「AI 出题」生成器（纯函数，可单测）
//
// 用户选定「本地语料+模板生成」方案：不联网、无 Key。开发者录入作者 / 书名作为「出处范围」，
// 本生成器从 quoteCorpus 语料中匹配该范围（作者 / 出处 / 正文子串），去重后供挑选。
//
// 「智能」体现在：按出处范围精确匹配 + 与现有题库（内置 + 自定义）去重 + 无匹配时回退随机候选。
// 候选 id 以 c 前缀生成（自定义题），加入题库后即可试玩。

import { Puzzle } from './types';
import { QUOTE_CORPUS, CorpusEntry } from './quoteCorpus';
import { hashCode } from './puzzleGenerator';

/** 单次生成最多返回的候选数（供挑选；过多反而难选） */
export const MAX_CANDIDATES = 12;

export interface GenResult {
  /** 候选题目（已去重、已赋 c 前缀 id） */
  candidates: Puzzle[];
  /** 给开发者的说明（找到 N 条 / 未找到已回退随机 等） */
  note: string;
}

function toPuzzle(e: CorpusEntry, idx: number): Puzzle {
  // id：c 前缀 + 正文 hash + 序号 + 随机后缀，确保数组内唯一（去重以正文为准）
  const suffix = Math.floor(Math.random() * 1296).toString(36);
  return {
    id: `c${Math.abs(hashCode(e.quote)).toString(36)}${idx.toString(36)}${suffix}`,
    quote: e.quote,
    author: e.author,
    source: e.source,
    category: e.category,
  };
}

/** 从 fresh 池中随机抽取 limit 条（Fisher–Yates；非确定性，AI 出题可接受） */
function sampleRandom(fresh: CorpusEntry[], limit: number): CorpusEntry[] {
  const arr = [...fresh];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, limit);
}

/**
 * 按出处范围生成候选题目。
 * @param input 作者 / 书名 / 关键词（子串匹配，大小写不敏感）；空则返回随机候选
 * @param library 现有工作题库（用于去重；传 getWorkingLibrary(custom)）
 */
export function generateFromRange(input: string, library: Puzzle[], limit: number = MAX_CANDIDATES): GenResult {
  const q = input.trim().toLowerCase();
  const existing = new Set(library.map((p) => p.quote.trim()));
  const freshAll = QUOTE_CORPUS.filter((e) => !existing.has(e.quote.trim()));

  if (q) {
    const matched = freshAll.filter(
      (e) => e.author.toLowerCase().includes(q) || e.source.toLowerCase().includes(q) || e.quote.toLowerCase().includes(q),
    );
    if (matched.length === 0) {
      // 范围内无新题：回退随机候选，并说明原因
      const cand = sampleRandom(freshAll, limit).map((e, i) => toPuzzle(e, i));
      const inLib = QUOTE_CORPUS.some(
        (e) => (e.author.toLowerCase().includes(q) || e.source.toLowerCase().includes(q)) && existing.has(e.quote.trim()),
      );
      return {
        candidates: cand,
        note: inLib
          ? `「${input.trim()}」范围内的题目已全部在库中，已随机补充新候选`
          : `语料中未找到与「${input.trim()}」相关的题目，已随机补充候选`,
      };
    }
    const candidates = matched.slice(0, limit).map((e, i) => toPuzzle(e, i));
    const more = matched.length > limit ? `（仅显示前 ${limit} 条）` : '';
    return { candidates, note: `找到 ${matched.length} 条与「${input.trim()}」相关的新题目${more}` };
  }

  // 无输入：随机候选
  const cand = sampleRandom(freshAll, limit).map((e, i) => toPuzzle(e, i));
  return { candidates: cand, note: `已随机生成 ${cand.length} 条候选（语料库共 ${QUOTE_CORPUS.length} 条）` };
}
