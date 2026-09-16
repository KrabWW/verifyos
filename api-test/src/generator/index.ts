/**
 * 测试生成层（A3 录制→测试）。
 *
 * 对外导出：
 * - convertSessionToCases：把 A2 录制会话导出结果转成测试用例（含噪音检测 + 依赖 mock）；
 * - 噪音检测原语（classifyValue / isTokenHeader / isTokenKey / redactSample / describeRule）；
 * - schema 摘要工具（summarizeSchema / walkLeaves / buildJsonPath / parseJson）；
 * - 依赖 mock 生成（generateMocks）。
 */
export const MODULE = 'generator' as const;

export { convertSessionToCases } from './convert.js';
export { classifyValue, isTokenHeader, isTokenKey, redactSample, describeRule } from './noise.js';
export { parseJson, walkLeaves, buildJsonPath, summarizeSchema } from './schema.js';
export type { Leaf, PathSegment } from './schema.js';
export { generateMocks } from './mock.js';
export type {
  NoiseRule,
  NoiseFinding,
  DependencyMock,
  GeneratedTestCase,
  GenerationSummary,
  GenerationResult,
} from './types.js';
