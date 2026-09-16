/**
 * 项目元信息。
 * 独立于 package.json 硬编码一份，避免 ESM 下 JSON import 断言带来的兼容差异，
 * 便于 hello 入口与 CLI 输出打印稳定。
 */
export const PROJECT_NAME = 'VerifyOS API Test';

export const VERSION = '0.1.0';

/** 对标三大能力（后续 A2-A9 逐步落地） */
export const CAPABILITIES = [
  { id: 'record', name: '流量录制→测试', ref: 'Keploy' },
  { id: 'inventory', name: 'API inventory + 覆盖率', ref: 'Akto' },
  { id: 'spec', name: 'spec→AI 生成 edge-case', ref: 'Schemathesis / Postman Agent Mode / Bruno' },
] as const;
