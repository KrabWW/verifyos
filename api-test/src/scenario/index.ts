/**
 * 场景编排层（A8，P1.6 扩展条件/循环/CSV 数据驱动）。
 *
 * 对外导出：
 * - 类型：Scenario / Step（api|condition|loop）/ DataSet / VariableExtraction / Environment / ScenarioReport 等；
 * - 编排：ScenarioRunner（场景运行器，支持条件分支、count/forEach/while 循环、数据集迭代）；
 * - 环境：EnvironmentStore（多环境存储/切换）；
 * - 传输：Transport / HttpRequest / HttpResponse / joinUrl / MockTransport（内存 mock 执行器）；
 * - 断言评估：evaluateAssertions（场景内最小实现）；
 * - 表达式：evaluateExpression（条件/while 安全求值器，不用 eval）；
 * - 报告导出：reportToMarkdown / reportToJson / reportToJunit；
 * - 工具：jsonpathGet（JSONPath 取值）、renderTemplate（{{var}} 渲染）。
 */
export const MODULE = 'scenario' as const;

export { ScenarioRunner } from './engine.js';
export { EnvironmentStore } from './environment.js';
export { MockTransport } from './mock.js';
export type { MockHandler } from './mock.js';
export { evaluateAssertion, evaluateAssertions } from './assert.js';
export { evaluateExpression } from './expr.js';
export type { ExprValue } from './expr.js';
export { reportToMarkdown, reportToJson, reportToJunit } from './report.js';
export { jsonpathGet, stringifyValue } from './jsonpath.js';
export { renderTemplate, renderRecord } from './template.js';
export { joinUrl } from './transport.js';
export type { Transport, HttpRequest, HttpResponse } from './transport.js';
export type {
  VariableExtraction,
  ScenarioStep,
  ConditionStep,
  LoopStep,
  Step,
  DataSet,
  Scenario,
  Environment,
  AssertionOutcome,
  StepOutcome,
  ScenarioReport,
} from './types.js';
