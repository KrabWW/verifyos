/**
 * P1.8 验收自验证脚本：自愈断言（healAssertions）。
 *
 * 运行：npm run verify:heal
 * 覆盖：
 *   - 改名场景：user_id -> account.uid（同值）自动映射 + 变更记录；
 *   - 挪位置场景：items[0].sku -> products[0].sku（同名不同位置）；
 *   - 值 + 位置都变：以同值兜底映射；
 *   - 彻底消失字段 -> broken（断言不改）；
 *   - 未变化字段原样保留；
 *   - 自愈后的断言对新响应诊断通过（端到端）。
 */
import { healAssertions } from '../src/assertion/self-heal.ts';
import { generateSchemaAssertions } from '../src/assertion/generate.js';
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

function main(): void {
  section('1. 改名场景：user_id -> account.uid（同值映射）');
  const oldResp = { user_id: 1001, name: 'alice', score: 88 };
  const renamedResp = { account: { uid: 1001 }, name: 'alice', score: 88 };
  const oldAssertions: Assertion[] = [
    { type: 'status', operator: 'eq', expected: 200, mode: 'strict' },
    { type: 'jsonpath', target: '$.user_id', operator: 'exists', mode: 'strict' },
    { type: 'jsonpath', target: '$.user_id', operator: 'eq', expected: 1001, mode: 'strict' },
    { type: 'jsonpath', target: '$.name', operator: 'eq', expected: 'alice', mode: 'strict' },
  ];
  const r1 = healAssertions(oldAssertions, oldResp, renamedResp);
  const uid = r1.healed.find((a) => a.target === '$.account.uid');
  assert(uid !== undefined, '$.user_id 的断言被重定向到 $.account.uid');
  assert(!r1.healed.some((a) => a.target === '$.user_id'), 'healed 中不再有旧 target $.user_id');
  const uidEq = r1.healed.find((a) => a.target === '$.account.uid' && a.operator === 'eq');
  assert(
    uidEq !== undefined && uidEq.expected === 1001,
    '重定向后 eq 断言期望值保持 1001',
  );
  const c1 = r1.changes.find((c) => c.from === '$.user_id');
  assert(c1 !== undefined && c1.to === '$.account.uid', '变更记录 from $.user_id -> to $.account.uid');
  assert(c1?.reason.includes('value_match'), 'reason 标注 value_match（同值字段）');
  assert(r1.broken.length === 0, '改名场景无 broken');

  section('2. 同一字段多条断言共享映射');
  const remapped = r1.healed.filter((a) => a.target === '$.account.uid');
  assert(remapped.length === 2, '$.user_id 的 exists + eq 两条断言都映射到 $.account.uid');
  assert(r1.changes.filter((c) => c.from === '$.user_id').length === 1, 'changes 中 $.user_id 只记录一次');

  section('3. 未变化字段原样保留');
  const nameA = r1.healed.find((a) => a.target === '$.name' && a.operator === 'eq');
  assert(nameA?.expected === 'alice', '$.name 断言原样保留');
  assert(r1.healed.some((a) => a.type === 'status' && a.expected === 200), 'status 断言原样保留');
  assert(!r1.changes.some((c) => c.from === '$.name'), '$.name 不产生变更记录');

  section('4. 挪位置场景：items[0].sku -> products[0].sku（同名映射）');
  const oldList = { items: [{ sku: 'A-1', stock: 3 }] };
  const newList = { products: [{ sku: 'A-2', stock: 5 }] };
  const r4 = healAssertions(
    [{ type: 'jsonpath', target: '$.items[0].sku', operator: 'eq', expected: 'A-1', mode: 'strict' }],
    oldList,
    newList,
  );
  const c4 = r4.changes[0];
  assert(c4?.from === '$.items[0].sku' && c4.to === '$.products[0].sku', '$.items[0].sku -> $.products[0].sku');
  assert(c4?.reason.includes('name_match'), 'reason 标注 name_match（同名不同位置，值已变走不了同值）');

  section('5. 彻底消失字段 -> broken');
  const r5 = healAssertions(
    [
      { type: 'jsonpath', target: '$.legacy_flag', operator: 'exists', mode: 'strict' },
      { type: 'jsonpath', target: '$.name', operator: 'eq', expected: 'alice', mode: 'strict' },
    ],
    oldResp,
    { name: 'alice', score: 88 },
  );
  assert(r5.broken.length === 1 && r5.broken[0]?.target === '$.legacy_flag', '$.legacy_flag 进 broken');
  assert(r5.broken[0]?.reason.includes('no_match'), 'broken reason 标注 no_match');
  assert(
    r5.healed.some((a) => a.target === '$.legacy_flag' && a.operator === 'exists'),
    'broken 断言不改，原样留在 healed 中等人工处理',
  );
  assert(!r5.changes.some((c) => c.from === '$.legacy_flag'), 'broken 不产生变更记录');

  section('6. 端到端：schema 生成断言 -> 改名响应自愈 -> 诊断通过');
  const baseResp = { user_id: 2002, nickname: 'bob', vip_level: 3 };
  const driftedResp = { account: { uid: 2002 }, nickname: 'bob', vip_level: 3 };
  const generated = generateSchemaAssertions(baseResp, { status_code: 200 });
  const before = diagnoseFailure({ assertions: generated, response: driftedResp, status_code: 200 });
  assert(before.passed === false, '自愈前：旧断言对新响应诊断失败（schema 漂移）');
  const { healed, changes, broken } = healAssertions(generated, baseResp, driftedResp);
  // 噪音字段（user_id 是 *_id）只生成 exists/schema 断言，expect_eq 不在；同值映射应覆盖它们
  assert(changes.length >= 1, `生成断言的失配 target 被映射（${changes.length} 条变更）`);
  assert(broken.length === 0, '端到端场景无 broken');
  const after = diagnoseFailure({ assertions: healed, response: driftedResp, status_code: 200 });
  assert(after.passed === true, '自愈后：重定向断言对新响应诊断通过');

  console.log(`\n${failures === 0 ? 'ALL PASS' : 'HAS FAILURES'}：P1.8 自愈断言 跑通。`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
