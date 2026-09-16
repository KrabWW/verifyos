/**
 * spec → edge-case 模块（A6）：从 OpenAPI spec 生成 happy-path + edge-case + fuzz 用例。
 *
 * 能力：
 * - happy-path：按参数/请求体 schema 取合法样例值，断言 2xx；
 * - edge-case ：规则式边界（缺失必填 / 空串 / 越界 / 错误类型 / 非法枚举 / 数组越界），断言 4xx；
 * - fuzz      ：属性测试式采样（随机+边界），断言非 5xx，找 500/schema 违规；
 * - 导出 JSON 字符串，可回放 / 可落盘。
 *
 * 对标：Schemathesis / Postman Agent Mode。
 * 数据模型：test_case，详见 docs/tech-selection.md 与 src/types/models.ts。
 */
export const MODULE = 'spec-test' as const;

export * from './sample.js';
export * from './edge.js';
export * from './fuzz.js';
export * from './generate.js';
