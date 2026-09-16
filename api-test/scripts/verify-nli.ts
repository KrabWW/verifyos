/**
 * P1.7 验收自验证脚本：自然语言 -> 断言（nlToAssertions）。
 *
 * 运行：npm run verify:nli
 * 覆盖 10 条中文 NL 输入（+ 英文对照）：
 *   状态码 / 存在性 / 相等（数字、字符串、布尔）/ 非空 / 类型断言 /
 *   多子句合并 / 否定（不等于）/ 比较（大于）/ 包含 /
 *   responseSample 路径校验（错路径上报 + 候选建议）。
 */
import { nlToAssertions, parseNlAssertions } from '../src/assertion/nl.js';
import { diagnoseFailure } from '../src/assertion/diagnose.js';
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

/** 按 type + target + operator 找断言 */
function find(as: Assertion[], type: string, target?: string, operator?: string): Assertion | undefined {
  return as.find((a) => a.type === type && (target === undefined || a.target === target) && (operator === undefined || a.operator === operator));
}

/** 响应样例：供路径校验与诊断 */
const SAMPLE = {
  status: 'ok',
  data: { user_id: 1001, name: 'alice', vip: true, tags: ['a', 'b'], score: 88 },
};

function main(): void {
  section('1. 状态码断言');
  const a1 = nlToAssertions('状态码应该是 200');
  const st = find(a1, 'status', undefined, 'eq');
  assert(st?.expected === 200, '「状态码应该是 200」-> status eq 200');

  section('2. 存在性断言');
  const a2 = nlToAssertions('data.name 应该存在');
  assert(
    find(a2, 'jsonpath', '$.data.name', 'exists') !== undefined,
    '「data.name 应该存在」-> $.data.name exists',
  );

  section('3. 相等断言（数字类型推断）');
  const a3 = nlToAssertions('data.score 应该是 88');
  const eqNum = find(a3, 'jsonpath', '$.data.score', 'eq');
  assert(eqNum?.expected === 88 && typeof eqNum?.expected === 'number', '「data.score 应该是 88」-> eq 88（number）');

  section('4. 相等断言（字符串 + 布尔）');
  const a4 = nlToAssertions('data.name 应该是 "alice"，data.vip 等于 true');
  assert(find(a4, 'jsonpath', '$.data.name', 'eq')?.expected === 'alice', '「data.name 应该是 "alice"」-> eq "alice"（string）');
  assert(find(a4, 'jsonpath', '$.data.vip', 'eq')?.expected === true, '「data.vip 等于 true」-> eq true（boolean）');

  section('5. 非空断言');
  const a5 = nlToAssertions('data.name 不应该为空');
  assert(find(a5, 'jsonpath', '$.data.name', 'exists') !== undefined, '「data.name 不应该为空」-> exists');
  const neSchema = find(a5, 'schema', '$.data.name');
  assert(neSchema !== undefined, '非空 -> 附带 schema 非空断言');

  section('6. 类型断言');
  const a6 = nlToAssertions('data.name 应该是字符串，data.score 应该是数字');
  assert(find(a6, 'schema', '$.data.name')?.schema?.type === 'string', '「data.name 应该是字符串」-> schema type=string');
  assert(find(a6, 'schema', '$.data.score')?.schema?.type === 'number', '「data.score 应该是数字」-> schema type=number');

  section('7. 多子句 + 未识别上报');
  const a7r = parseNlAssertions('状态码应该是 201，data.user_id 应该存在，随便一句话');
  assert(a7r.assertions.length >= 2, '多子句切分：产出 >= 2 条断言');
  assert(a7r.unknown_clauses.length === 1 && a7r.unknown_clauses[0] === '随便一句话', '未识别子句进入 unknown_clauses');

  section('8. 否定与比较');
  const a8 = nlToAssertions('data.score 不等于 60，data.score 应该大于 60');
  assert(find(a8, 'jsonpath', '$.data.score', 'ne')?.expected === 60, '「不等于 60」-> ne 60');
  assert(find(a8, 'jsonpath', '$.data.score', 'gt')?.expected === 60, '「应该大于 60」-> gt 60');

  section('9. 包含 + 响应样例校验');
  const a9 = nlToAssertions('status 应该包含 ok', SAMPLE);
  assert(find(a9, 'jsonpath', '$.status', 'contains')?.expected === 'ok', '「status 应该包含 ok」-> contains ok');
  const a9r = parseNlAssertions('status 应该包含 ok', SAMPLE);
  assert(a9r.invalid_targets.length === 0, '合法路径不误报');
  const a9bad = parseNlAssertions('data.typo_field 应该存在', SAMPLE);
  assert(
    a9bad.invalid_targets.length === 1 && a9bad.invalid_targets[0]?.target === '$.data.typo_field',
    '错路径进入 invalid_targets（提前发现路径写错）',
  );
  assert(a9bad.invalid_targets[0]?.suggestions.length === 0, '样例中无同名字段时建议为空');

  section('10. 端到端：NL 断言 + 样例响应诊断通过');
  const e2eText = '状态码应该是 200，data.name 应该存在，data.name 应该是字符串，data.vip 等于 true';
  const e2e = nlToAssertions(e2eText, SAMPLE);
  const e2r = parseNlAssertions(e2eText, SAMPLE);
  assert(e2r.invalid_targets.length === 0, '全部 target 路径校验通过');
  const d = diagnoseFailure({ assertions: e2e, response: SAMPLE, status_code: 200 });
  assert(d.passed === true, 'NL 断言对样例响应诊断通过');

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}：P1.7 NL->断言 跑通。`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
