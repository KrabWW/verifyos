/**
 * A7 验收自验证脚本：真跑通「真实响应 → schema 级断言生成」+「失败诊断（根因分类 + diff）」+「断言接受/拒绝」。
 *
 * 运行：npm run verify:ai-assert
 * 覆盖：
 *   - 从真实响应生成 schema 级断言（字段存在性 + 类型 + 取值，噪音字段标 ignore）；
 *   - 诊断通过（同响应自比对）；
 *   - 模拟失败：稳定字段缺失 → 契约破坏；字段类型变 → 契约破坏；
 *    稳定字段值变 → 业务变更；状态码 5xx → 环境差异；
 *   - 证据：diff 摘要含失败字段 + 期望/实际；
 *   - 断言接受写入 TestCase / 拒绝移除。
 */
import { randomUUID } from 'node:crypto';
import type { TestCase } from '../src/types/models.js';
import { generateSchemaAssertions } from '../src/assertion/generate.js';
import { diagnoseFailure } from '../src/assertion/diagnose.js';
import { acceptAssertions, rejectAssertions, reviewAssertions } from '../src/assertion/review.js';
import type { Assertion } from '../src/types/models.js';

let failures = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

/** 基线响应：含噪音字段（id/created_at/request_id/token）+ 稳定字段（name/score/nested.count） */
const BASELINE = {
  id: 42,
  name: 'alice',
  created_at: '2024-01-01T12:00:00.000Z',
  request_id: '550e8400-e29b-41d4-a716-446655440000',
  access_token: 'sk-live-abc123',
  score: 88,
  nested: { count: 1 },
};

/** 按 target + type + operator 找断言 */
function findAssertion(assertions: Assertion[], pred: (a: Assertion) => boolean): Assertion | undefined {
  return assertions.find(pred);
}

/** 构造一个最小 TestCase（断言为空）供接受/拒绝验证 */
function makeTestCase(assertions: Assertion[]): TestCase {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    api_definition_id: '',
    name: 'verify-ai-assert',
    request: { method: 'GET', path: '/users/1', query_params: {}, headers: {} },
    assertions,
    variables: {},
    source: 'ai',
    tags: ['verify'],
    last_result: 'pending',
    review_status: 'pending',
    created_at: now,
    updated_at: now,
  };
}

function main(): void {
  section('1. 真实响应 → schema 级断言生成');
  const generated = generateSchemaAssertions(BASELINE, { status_code: 200 });

  assert(
    generated.some((a) => a.type === 'status' && a.operator === 'eq' && a.expected === 200),
    '生成 status 断言 = 200 严格相等',
  );
  assert(generated.some((a) => a.type === 'schema' && a.target === undefined), '生成顶层响应体 schema 摘要断言');

  // 字段级：存在性 + 类型 + 取值（稳定字段）
  assert(
    generated.some((a) => a.type === 'jsonpath' && a.target === '$.name' && a.operator === 'exists'),
    '生成 $.name 存在性断言',
  );
  assert(
    generated.some((a) => a.type === 'schema' && a.target === '$.name' && a.schema?.type === 'string'),
    '生成 $.name 类型断言（string）',
  );
  assert(
    generated.some((a) => a.type === 'schema' && a.target === '$.score' && a.schema?.type === 'number'),
    '生成 $.score 类型断言（number）',
  );
  assert(
    generated.some((a) => a.type === 'jsonpath' && a.target === '$.name' && a.operator === 'eq' && a.expected === 'alice'),
    '生成 $.name 取值断言 = alice',
  );

  // 噪音字段：标 ignore（仅存在性，不严格相等）
  const idExists = findAssertion(generated, (a) => a.target === '$.id' && a.operator === 'exists');
  assert(idExists?.mode === 'ignore', '噪音字段 $.id 的 exists 断言标为 ignore');
  assert(
    !generated.some((a) => a.target === '$.id' && a.operator === 'eq'),
    '噪音字段 $.id 不生成严格相等取值断言',
  );
  assert(
    generated.some((a) => a.target === '$.created_at' && a.mode === 'ignore'),
    '噪音字段 $.created_at 标为 ignore',
  );

  section('2. 诊断：同响应自比对 → 通过');
  const ok = diagnoseFailure({ assertions: generated, response: BASELINE, status_code: 200 });
  assert(ok.passed === true, '同响应诊断通过');
  assert(ok.root_cause === null, '通过时 root_cause = null');

  section('3. 诊断：稳定字段缺失 → 契约破坏');
  const missingName = { ...BASELINE, name: undefined } as Record<string, unknown>;
  delete missingName.name;
  const dMissing = diagnoseFailure({ assertions: generated, response: missingName, status_code: 200 });
  assert(dMissing.passed === false, '缺字段诊断判失败');
  assert(dMissing.root_cause === 'contract_break', `根因 = contract_break（实际 ${dMissing.root_cause}）`);
  assert(
    dMissing.evidence.failures.some((f) => f.target === '$.name' && f.kind === 'missing'),
    '失败明细含 $.name missing',
  );
  assert(dMissing.evidence.summary.includes('$.name'), 'diff 摘要含失败字段 $.name');

  section('4. 诊断：字段类型变 → 契约破坏');
  const scoreString = { ...BASELINE, score: '88' };
  const dType = diagnoseFailure({ assertions: generated, response: scoreString, status_code: 200 });
  assert(dType.root_cause === 'contract_break', `根因 = contract_break（实际 ${dType.root_cause}）`);
  assert(
    dType.evidence.failures.some((f) => f.target === '$.score' && f.kind === 'type_mismatch'),
    '失败明细含 $.score type_mismatch',
  );

  section('5. 诊断：稳定字段值变 → 业务变更');
  const nameBob = { ...BASELINE, name: 'bob' };
  const dBiz = diagnoseFailure({ assertions: generated, response: nameBob, status_code: 200 });
  assert(dBiz.root_cause === 'business_change', `根因 = business_change（实际 ${dBiz.root_cause}）`);
  assert(
    dBiz.evidence.failures.some((f) => f.target === '$.name' && f.kind === 'value_mismatch'),
    '失败明细含 $.name value_mismatch',
  );

  section('6. 诊断：状态码 5xx → 环境差异');
  const d5xx = diagnoseFailure({ assertions: generated, response: BASELINE, status_code: 503 });
  assert(d5xx.root_cause === 'environment_diff', `根因 = environment_diff（实际 ${d5xx.root_cause}）`);
  assert(
    d5xx.evidence.failures.some((f) => f.kind === 'status_mismatch'),
    '失败明细含 status_mismatch',
  );

  section('7. 断言接受 / 拒绝写入用例');
  const tc = makeTestCase([]);
  const accepted = acceptAssertions(tc, generated);
  assert(accepted.assertions.length === generated.length, '接受后用例断言数 = 生成断言数');
  const nameAssertions = generated.filter((a) => a.target === '$.name');
  const rejected = rejectAssertions(accepted, nameAssertions);
  assert(
    !rejected.assertions.some((a) => a.target === '$.name'),
    '拒绝后用例不含 $.name 断言',
  );
  const reviewed = reviewAssertions(makeTestCase([]), [
    { assertion: generated.find((a) => a.target === '$.name')!, decision: 'accept' },
    { assertion: generated.find((a) => a.target === '$.score')!, decision: 'reject' },
  ]);
  assert(
    reviewed.assertions.some((a) => a.target === '$.name') && !reviewed.assertions.some((a) => a.target === '$.score'),
    '批量审阅：accept $.name + reject $.score',
  );

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}：A7 断言生成 + 失败诊断闭环跑通。`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
