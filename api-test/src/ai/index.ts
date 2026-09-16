/**
 * AI 智能层（P2）对外出口。
 *
 * - provider：LlmProvider / MockProvider / OpenAICompatibleProvider / resolveProvider；
 * - assistant：AiAssistant（chat / gen / diag / explain 四模式）；
 * - methodology：测试方法论定义与 prompt 注入（P2.4）；
 * - review：生成结果勾选卡片 → 人审入库管线（P2.3）。
 */
export const MODULE = 'ai' as const;

export type {
  LlmConfig,
  LlmMessage,
  ChatResult,
  LlmProvider,
} from './provider.js';
export {
  MockProvider,
  OpenAICompatibleProvider,
  resolveProvider,
  mockReply,
  extractSection,
  MODE_MARKER,
  SECTION_USER_INPUT,
  SECTION_RULE_OUTPUT,
  SECTION_API_LIST,
  SECTION_COVERAGE_GAPS,
  ENV_BASE_URL,
  ENV_API_KEY,
  ENV_MODEL,
  DEFAULT_MODEL,
} from './provider.js';

export type {
  AssistantMode,
  ApiSummaryInfo,
  GenData,
  DiagData,
  ExplainData,
  AssistantContext,
  AssistantRequest,
  FieldDoc,
  AssistantReply,
} from './assistant.js';
export { AiAssistant } from './assistant.js';

export type {
  MethodologyKey,
  Methodology,
  MethodologyRuleFlags,
  MethodologyCaseDraft,
  MethodologyTarget,
  ExpectBand,
} from './methodology.js';
export {
  METHODOLOGIES,
  methodologyByKey,
  methodologyRuleFlags,
  buildMethodologyPrefix,
  generateMethodologyCases,
} from './methodology.js';

export type {
  ReviewKind,
  ReviewCandidate,
  ReviewInput,
  StoredAiRecord,
  ReviewStore,
  CommitResult,
} from './review.js';
export {
  makeCandidate,
  InMemoryReviewStore,
  ReviewPipeline,
} from './review.js';
