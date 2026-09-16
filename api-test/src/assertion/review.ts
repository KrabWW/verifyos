/**
 * 断言接受/拒绝（A7 核心 3）：生成的断言可 accept/reject，accept 写入 TestCase。
 *
 * 审阅语义：
 * - accept：把断言合并进 test_case.assertions（按 type+target+operator 去重，避免重复写入）；
 * - reject：从 test_case.assertions 移除匹配的断言（按同签名，拒绝则不写入/移除）。
 * - 批量 reviewAssertions：对一组 AssertionReview 逐条应用 accept/reject，返回新用例。
 *
 * 注意：审阅的是「断言」而非「用例」，因此 review_status 保持不变（AI 生成仍需人审，见 README）。
 */
import type { Assertion, TestCase } from '../types/models.js';
import type { AssertionReview } from './types.js';

/** 断言签名：用于去重/匹配（type + target + operator 唯一标识一条断言） */
function assertionKey(a: Assertion): string {
  return `${a.type}|${a.target ?? ''}|${a.operator ?? ''}`;
}

/** 追加一条断言（按签名去重）；返回新数组 */
function appendUnique(list: Assertion[], a: Assertion): Assertion[] {
  const key = assertionKey(a);
  if (list.some((item) => assertionKey(item) === key)) return list;
  return [...list, a];
}

/** 移除匹配的断言；返回新数组 */
function removeMatching(list: Assertion[], a: Assertion): Assertion[] {
  const key = assertionKey(a);
  return list.filter((item) => assertionKey(item) !== key);
}

/**
 * 接受断言：写入 test_case（去重后追加），返回新用例。
 * 原用例不被修改（不可变）。
 */
export function acceptAssertions(testCase: TestCase, assertions: Assertion[]): TestCase {
  let next = testCase.assertions;
  for (const a of assertions) next = appendUnique(next, a);
  return { ...testCase, assertions: next, updated_at: new Date().toISOString() };
}

/**
 * 拒绝断言：从 test_case 移除匹配的断言，返回新用例。
 */
export function rejectAssertions(testCase: TestCase, assertions: Assertion[]): TestCase {
  let next = testCase.assertions;
  for (const a of assertions) next = removeMatching(next, a);
  return { ...testCase, assertions: next, updated_at: new Date().toISOString() };
}

/**
 * 批量审阅：对一组 AssertionReview 逐条 accept/reject，返回新用例。
 */
export function reviewAssertions(testCase: TestCase, reviews: AssertionReview[]): TestCase {
  const accepted: Assertion[] = [];
  const rejected: Assertion[] = [];
  for (const r of reviews) {
    (r.decision === 'accept' ? accepted : rejected).push(r.assertion);
  }
  let out = acceptAssertions(testCase, accepted);
  out = rejectAssertions(out, rejected);
  return out;
}
