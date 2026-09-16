/**
 * P2.1 / P2.3 / P2.4 验收脚本（单命令原子验证，全部断言 PASS 才退出 0）。
 *
 * 覆盖：
 * 1. Provider：env 解析（VERIFYOS_AI_*）+ 显式 cfg + 缺省回落 Mock；
 * 2. Provider：OpenAI 端点不可达时降级 Mock 并标注 degraded；
 * 3. 方法论注入：prefix 文本 + 规则参数 + 规则式生成维度（边界值 min-1/min/max/max+1 等）；
 * 4. 助手四模式（Mock）：chat 上下文注入 / gen 默认策略与方法论维度 / diag 根因分类 /
 *    explain 字段说明表；会话历史累积；
 * 5. 勾选人审闭环：候选卡片默认全选 → 拒绝/取消勾选 → confirm 部分入库（aiCreate=true）→
 *    重复 confirm 跳过 → confirmAll 收尾。
 *
 * 运行：cd api-test && node node_modules/.bin/tsx scripts/verify-ai-core.ts
 */
import {
  AiAssistant,
  ENV_API_KEY,
  ENV_BASE_URL,
  ENV_MODEL,
  METHODOLOGIES,
  MockProvider,
  OpenAICompatibleProvider,
  ReviewPipeline,
  buildMethodologyPrefix,
  generateMethodologyCases,
  methodologyByKey,
  methodologyRuleFlags,
  resolveProvider,
} from '../src/ai/index.js';

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures++;
    console.error(`  FAIL  ${message}`);
  }
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

/** 测试用 API 清单（含请求体 schema，覆盖 min/max、枚举、字符串长度） */
const TEST_SCHEMA = {
  type: 'object',
  required: ['name', 'age'],
  properties: {
    name: { type: 'string', minLength: 1 },
    age: { type: 'integer', minimum: 0, maximum: 150 },
    role: { type: 'string', enum: ['admin', 'user'] },
  },
} as const;

const TEST_APIS = [
  { method: 'GET' as const, path: '/users', summary: '用户列表', auth_type: 'bearer' },
  { method: 'POST' as const, path: '/users', summary: '创建用户', auth_type: 'bearer', request_schema: TEST_SCHEMA },
  { method: 'DELETE' as const, path: '/users/:id', summary: '删除用户', auth_type: 'bearer' },
];

const BOUNDARY = methodologyByKey('boundary');
const EQUIVALENCE = methodologyByKey('equivalence');

async function main(): Promise<void> {
  /* ---------------- 1. Provider：env 解析 ---------------- */
  section('1. Provider：env 解析（VERIFYOS_AI_*）');
  const envKeys = [ENV_BASE_URL, ENV_API_KEY, ENV_MODEL];
  const saved = envKeys.map((k) => [k, process.env[k]] as const);
  const clearEnv = (): void => {
    for (const k of envKeys) delete process.env[k];
  };
  const restoreEnv = (): void => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  try {
    clearEnv();
    assert(resolveProvider() instanceof MockProvider, '无 env 无 cfg → MockProvider（项目常态）');
    assert(resolveProvider({ base_url: 'https://llm.local/v1' }) instanceof MockProvider, 'cfg 只有 base_url（不完整）→ MockProvider');

    process.env[ENV_BASE_URL] = 'https://llm.local/v1';
    process.env[ENV_API_KEY] = 'sk-test';
    process.env[ENV_MODEL] = 'test-model';
    assert(resolveProvider() instanceof OpenAICompatibleProvider, 'env 三件套齐全 → OpenAICompatibleProvider');

    clearEnv();
    assert(
      resolveProvider({ base_url: 'https://llm.local/v1', api_key: 'sk-x', model: 'm1' }) instanceof OpenAICompatibleProvider,
      '显式完整 cfg → OpenAICompatibleProvider',
    );

    /* ---------------- 2. Provider：降级 ---------------- */
    section('2. Provider：端点不可达时降级 Mock');
    const bad = new OpenAICompatibleProvider({ base_url: 'http://127.0.0.1:1/v1', api_key: 'sk-test', model: 'test-model' });
    const degraded = await bad.chat([{ role: 'user', content: '[用户输入]\n你好\n\n[规则引擎输出]\n（无）' }]);
    assert(degraded.degraded === true, 'LLM 调用失败 → degraded=true');
    assert(degraded.provider === 'mock', '降级后 provider=mock');
    assert(typeof degraded.content === 'string' && degraded.content.length > 0, '降级回复非空（规则式兜底）');
  } finally {
    restoreEnv();
  }

  /* ---------------- 3. 方法论注入 ---------------- */
  section('3. 方法论注入（P2.4）');
  assert(METHODOLOGIES.length === 4, '方法论共 4 项（等价类/边界值/判定表/场景法）');

  const prefix = buildMethodologyPrefix([BOUNDARY, EQUIVALENCE]);
  assert(prefix.includes('边界值分析') && prefix.includes('等价类划分'), 'prefix 含勾选的两项中文标签');
  assert(prefix.includes('min-1、min、max、max+1'), 'prefix 含边界值明确指令（min-1/min/max/max+1）');
  assert(buildMethodologyPrefix([]) === '', '全不选 → prefix 为空串（不注入）');

  const flags = methodologyRuleFlags([BOUNDARY]);
  assert(flags.boundary === true && !flags.equivalence && !flags.decision_table && !flags.scenario, '规则参数：只开 boundary 维度');

  const target = { method: 'POST' as const, path: '/users', request_schema: TEST_SCHEMA, scenario_apis: TEST_APIS };
  const boundaryCases = generateMethodologyCases(target, [BOUNDARY]);
  const titles = boundaryCases.map((c) => c.title).join('\n');
  assert(boundaryCases.length === 5, `勾边界值 → 5 条边界用例（age×4 + name×1，实际 ${boundaryCases.length}）`);
  assert(titles.includes('min-1') && titles.includes('min（0）') && titles.includes('max（150）') && titles.includes('max+1'), '边界用例含 min-1 / min / max / max+1 取值');
  assert(boundaryCases.every((c) => c.category === 'boundary'), '边界用例 category 均为 boundary');

  const eqCases = generateMethodologyCases(target, [EQUIVALENCE]);
  assert(eqCases.length === 6 && eqCases.every((c) => c.title.startsWith('等价类')), '勾等价类 → 每字段有效+无效代表值（3 字段×2=6）');

  const tableCases = generateMethodologyCases(target, [methodologyByKey('decision_table')]);
  assert(tableCases.length > 0 && tableCases.every((c) => c.title.includes('判定表第')), '勾判定表 → 枚举/布尔组合行用例');

  const scenarioCases = generateMethodologyCases(target, [methodologyByKey('scenario')]);
  assert(
    scenarioCases.length === 1 && scenarioCases[0]!.steps !== undefined && scenarioCases[0]!.steps!.length === 3,
    '勾场景法 → 串接 3 个 API 的主流程草稿',
  );

  /* ---------------- 4. chat 模式 ---------------- */
  section('4. 助手 chat 模式（Mock）：上下文注入');
  const assistant = new AiAssistant(new MockProvider());
  assert(assistant.providerName === 'mock', '显式 MockProvider 构造生效');

  const chatReply = await assistant.ask({
    mode: 'chat',
    input: '当前系统有哪些接口？',
    context: { apis: TEST_APIS, coverage_gaps: ['DELETE /users/:id 完全未测'] },
  });
  assert(chatReply.provider === 'mock' && chatReply.degraded === false, 'chat 回复来自 mock 且未降级');
  assert(chatReply.content.includes('3 个 API'), 'chat 回复含 API 总数（清单注入生效）');
  assert(chatReply.content.includes('GET /users') && chatReply.content.includes('DELETE /users/:id'), 'chat 回复含清单条目（上下文注入 system prompt）');
  assert(chatReply.content.includes('完全未测'), 'chat 回复含覆盖率窟窿');

  /* ---------------- 5. gen 模式 ---------------- */
  section('5. 助手 gen 模式（Mock）：默认策略 + 方法论维度');
  const postApi = TEST_APIS[1]!;

  const baselineReply = await assistant.ask({
    mode: 'gen',
    input: '给创建用户接口生成用例',
    context: { apis: TEST_APIS, data: { api: postApi } },
  });
  assert(
    baselineReply.candidates?.length === 1 && baselineReply.candidates[0]!.title.includes('happy-path'),
    '未勾方法论 → 默认策略 happy-path 候选 1 条',
  );
  const baselineCase = baselineReply.candidates?.[0]!.payload as { source: string; review_status: string; assertions: Array<{ type: string; expected?: unknown }> };
  assert(baselineCase.source === 'ai' && baselineCase.review_status === 'pending', '候选 payload：source=ai + review_status=pending（人审语义）');
  assert(baselineCase.assertions[0]!.type === 'status', '候选 payload：含 status 断言');
  assert(baselineReply.content.includes('【AI 生成完成】') && baselineReply.content.includes('默认策略'), 'Mock 回复：生成完成 + 默认策略说明');

  const genReply = await assistant.ask({
    mode: 'gen',
    input: '按边界值分析生成用例',
    context: {
      apis: TEST_APIS,
      data: { api: postApi, response: { id: 'u-1', name: 'alice', age: 20, role: 'user' }, status_code: 201 },
    },
    methodology: [BOUNDARY],
  });
  const candidates = genReply.candidates ?? [];
  assert(candidates.length === 6, `勾边界值 → 5 条边界用例 + 1 条断言候选（实际 ${candidates.length}）`);
  assert(candidates.some((c) => c.kind === 'case' && c.title.includes('min-1')), '候选含 min-1 边界用例（方法论驱动规则式生成）');
  assert(candidates.some((c) => c.kind === 'case' && c.title.includes('max+1')), '候选含 max+1 边界用例');
  const min1 = candidates.find((c) => c.title.includes('min-1'));
  const min1Body = JSON.parse((min1!.payload as { request: { body: string } }).request.body) as { age: number };
  assert(min1Body.age === -1, 'min-1 变异写入请求体（age=-1）');
  const assertionCandidate = candidates.find((c) => c.kind === 'assertion');
  const assertions = (assertionCandidate?.payload ?? []) as Array<{ type: string }>;
  assert(assertions.length > 0 && assertions[0]!.type === 'status', '响应样例 → schema 级断言候选（复用 assertion/generate）');
  assert(genReply.content.includes('边界值'), 'Mock 回复含方法论生成内容');
  assert(candidates.every((c) => c.source === 'ai' && c.reason.length > 0 && c.checked === true), '候选卡片：source=ai + reason 非空 + 默认全选');

  /* ---------------- 6. diag 模式 ---------------- */
  section('6. 助手 diag 模式（Mock）：根因分类');
  const diagReply = await assistant.ask({
    mode: 'diag',
    input: '这条用例为什么挂了？',
    context: {
      apis: TEST_APIS,
      data: {
        assertions: [
          { type: 'status', operator: 'eq', expected: 200, mode: 'strict' },
          { type: 'jsonpath', target: '$.data.name', operator: 'eq', expected: 'alice', mode: 'strict' },
        ],
        response: { data: { name: 'bob' } },
        status_code: 200,
      },
    },
  });
  assert(diagReply.diagnosis?.passed === false, '诊断结论：未通过');
  assert(diagReply.diagnosis?.root_cause === 'business_change', '根因分类：business_change（结构一致、稳定字段值变化）');
  assert(diagReply.content.includes('根因分类') && diagReply.content.includes('业务变更'), 'Mock 回复含根因分类与中文标签');
  assert((diagReply.diagnosis?.evidence.failed_count ?? 0) === 1, '失败证据：1 处字段不符');

  /* ---------------- 7. explain 模式 ---------------- */
  section('7. 助手 explain 模式（Mock）：字段说明表');
  const explainReply = await assistant.ask({
    mode: 'explain',
    input: '解释一下创建用户接口的字段',
    context: { apis: TEST_APIS, data: { api: postApi } },
  });
  assert(explainReply.fields?.length === 3, `字段说明 3 行（name/age/role，实际 ${explainReply.fields?.length}）`);
  const roleDoc = explainReply.fields?.find((f) => f.path === 'role');
  assert(roleDoc?.constraints.includes('enum='), 'role 字段约束含枚举取值');
  assert(explainReply.content.includes('字段说明') && explainReply.content.includes('role'), 'Mock 回复含字段说明表');

  /* ---------------- 8. 会话历史 ---------------- */
  section('8. 会话历史累积');
  const history = assistant.getHistory();
  assert(history.length === 10, `5 次 ask → 历史 10 条（实际 ${history.length}）`);
  assert(history[0]!.role === 'user' && history[1]!.role === 'assistant', '历史按 user/assistant 成对累积');
  assistant.resetHistory();
  assert(assistant.getHistory().length === 0, 'resetHistory 清空历史');

  /* ---------------- 9. 勾选人审闭环 ---------------- */
  section('9. 勾选人审闭环（P2.3）：6 候选 → 拒 1 → 免 1 → 入库 4');
  const pipeline = new ReviewPipeline();
  const cards = pipeline.adopt(candidates);
  assert(cards.length === 6, '收编 assistant 生成的 6 张候选卡片');
  assert(pipeline.list().every((c) => c.checked === true && c.source === 'ai'), '卡片默认全选 + source=ai');

  const rejectedId = cards[0]!.id;
  const uncheckedId = cards[5]!.id;
  assert(pipeline.reject([rejectedId]) === 1, '拒绝 1 张卡片');
  pipeline.setChecked([uncheckedId], false);

  const allIds = cards.map((c) => c.id);
  const commit1 = pipeline.confirm(allIds);
  assert(commit1.committed === 4 && commit1.skipped === 2, `勾选入库：成功 4 / 跳过 2（实际 ${commit1.committed}/${commit1.skipped}）`);
  assert(
    commit1.skipped_reasons.some((s) => s.reason.includes('拒绝')) && commit1.skipped_reasons.some((s) => s.reason.includes('未勾选')),
    '跳过原因：1 张被拒绝 + 1 张未勾选',
  );

  const commit2 = pipeline.confirm(commit1.records.map((r) => r.id));
  assert(commit2.committed === 0 && commit2.skipped === 4 && commit2.skipped_reasons.every((s) => s.reason.includes('已入库')), '重复 confirm 同 4 个 id → 全部跳过（幂等）');

  const commit3 = pipeline.confirm(['not-exist-id']);
  assert(commit3.committed === 0 && commit3.skipped_reasons[0]!.reason.includes('不存在'), '未知 id → 跳过并给原因');

  const commit4 = pipeline.confirmAll();
  assert(commit4.committed === 0, 'confirmAll：剩余卡片均不可入（1 拒绝 + 1 未勾选）');

  assert(pipeline.committedCount === 4, `入库记录共 4 条（实际 ${pipeline.committedCount}）`);
  assert(pipeline.list().length === 6, '管线卡片总数不变（含已定案卡片）');
  const records = pipeline.storedRecords();
  assert(records.every((r) => r.aiCreate === true), '入库记录 aiCreate 标记全部为 true');
  const committedCases = records.filter((r) => r.kind === 'case').map((r) => r.payload as { review_status: string; source: string });
  assert(committedCases.every((c) => c.review_status === 'pending' && c.source === 'ai'), '入库用例保持人审语义（review_status=pending, source=ai）');

  /* ---------------- 10. buildCandidates 独立入口 ---------------- */
  section('10. buildCandidates 独立入口');
  const standalone = new ReviewPipeline();
  const built = standalone.buildCandidates([
    { kind: 'case', title: '用例A', payload: { name: 'a' } },
    { kind: 'assertion', title: '断言B', payload: [] },
  ]);
  assert(built.length === 2 && built.every((c) => c.checked && c.source === 'ai' && c.reason.length > 0), '直接构造候选：默认全选 + AI 依据');
  const commitBuilt = standalone.confirmAll();
  assert(commitBuilt.committed === 2 && standalone.committedCount === 2, '独立管线 confirmAll 全量入库');

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
