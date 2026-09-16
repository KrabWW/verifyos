/**
 * API inventory 模块（A4）：API 自动发现 + 资产清单。
 *
 * 能力：
 * - OpenAPI spec 导入（JSON/YAML）→ api_definition；
 * - 录制流量聚合（无 spec 时反推）→ api_definition；
 * - 浏览 / 搜索 / 标注（internal/external/deprecated）；
 * - spec 漂移检测（增/删/改）。
 *
 * 数据模型：api_definition，详见 docs/tech-selection.md。
 */
export const MODULE = 'inventory' as const;

export * from './openapi.js';
export * from './normalize.js';
export * from './convert.js';
export * from './traffic.js';
export * from './drift.js';
export * from './store.js';
export * from './classify.js';
