// 字垣 — 数据 schema 常量（纯值，无任何副作用导入）
// 单独抽离，避免 game 逻辑层（stats / achievements）反向依赖 utils/storage，
// 从而在 jest(node) 环境下测试时不会把原生 AsyncStorage 拉进来。

/** 数据结构版本，存盘时盖戳，加载时据以迁移 */
export const CURRENT_SCHEMA_VERSION = 2;

/** history 数组上限，防无限膨胀 */
export const HISTORY_MAX = 200;
