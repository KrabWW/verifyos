/**
 * 覆盖率模块（A5）：API 测试覆盖率看板。
 *
 * 能力：
 * - 覆盖率 = 已测 API / inventory 总数，按 operation + response code 维度；
 * - 文本看板（总数/已测/未测/百分比 + operation 明细）；
 * - 未覆盖清单（驱动补测试），支持按 path 或 risk 排序；
 * - 覆盖趋势（每次跑测试追加 CoverageRecord，随历史累积）。
 *
 * 数据模型：coverage（models.ts 草案）+ 本模块的 CoverageRecord（趋势快照）。
 */
export const MODULE = 'coverage' as const;

export * from './types.js';
export * from './engine.js';
export * from './store.js';
export * from './board.js';
