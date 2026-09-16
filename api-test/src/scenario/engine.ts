/**
 * 场景运行器（A8 核心，P1.6 扩展条件/循环/CSV 数据驱动）。
 *
 * 把一个 Scenario（有序步骤列表 + 变量提取）在指定 Environment 下按序执行：
 * 1. 变量上下文 = 环境变量（最低） ∪ 数据行变量（中） ∪ 用例自带变量（高） ∪ 运行时提取变量（最高）；
 * 2. 步骤类型（types.ts Step 联合类型）：
 *    - api：渲染 {{var}} 占位 → 发请求（Transport）→ 评估断言 → 提取响应字段为变量；
 *    - condition：安全求值表达式（expr.ts，不用 eval）→ 递归执行 then/else 分支；
 *    - loop：count/forEach/while 三种模式逐轮递归执行循环体；
 * 3. 数据驱动：Scenario.data_sets 每行注入变量后完整跑一遍全部步骤（多数据集按笛卡尔积）；
 * 4. 汇总产出 ScenarioReport（每接口 pass/fail + 断言明细 + 耗时 + 分支/迭代信息）。
 *
 * 变量作用域：
 * - 条件/循环体内可读写外层变量（提取变量写回外层作用域，循环外可见）；
 * - forEach 循环变量（如 item）只存在于循环执行期间，循环结束即移出作用域；
 * - 数据行变量（含 dataset.<name>.<field> 命名空间变量）每轮重置。
 *
 * 变量传递核心：前一个接口响应的某字段（JSONPath）提取为变量，供后续接口的
 * path / headers / body / query 用 {{name}} 引用（如登录拿 token → 后续 Authorization）。
 */
import type {
  ConditionStep,
  DataSet,
  Environment,
  LoopStep,
  Scenario,
  ScenarioReport,
  ScenarioStep,
  Step,
  StepOutcome,
  VariableExtraction,
} from './types.js';
import type { Assertion } from '../types/models.js';
import { evaluateAssertions } from './assert.js';
import { evaluateExpression } from './expr.js';
import { parseJson } from '../generator/schema.js';
import { jsonpathGet, stringifyValue } from './jsonpath.js';
import { renderRecord, renderTemplate } from './template.js';
import { joinUrl, type HttpRequest, type HttpResponse, type Transport } from './transport.js';

/** while 循环默认安全上限（防死循环） */
const DEFAULT_MAX_ITERATIONS = 1000;

/** 渲染 query 参数（TestCase 的 string[] 值按 ',' 拼接后渲染） */
function renderQuery(
  query: Record<string, string[]>,
  vars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, values] of Object.entries(query)) {
    out[key] = values.map((v) => renderTemplate(v, vars)).join(',');
  }
  return out;
}

/** 从响应体按提取配置取变量（name → 字符串值） */
function extractVariables(body: unknown, extracts: VariableExtraction[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ex of extracts) {
    out[ex.name] = stringifyValue(jsonpathGet(body, ex.jsonpath));
  }
  return out;
}

/** 渲染断言列表中的 {{var}} 占位（如 expected 引用数据集字段），其余字段原样 */
function renderAssertions(assertions: Assertion[], vars: Record<string, string>): Assertion[] {
  return assertions.map((a) => ({
    ...a,
    expected: typeof a.expected === 'string' ? renderTemplate(a.expected, vars) : a.expected,
  }));
}

/** 数据集笛卡尔积：多个数据集的行组合（[] 表示无数据集、跑一轮空行；某数据集 rows 为空则整体为空） */
function datasetCombinations(dataSets: DataSet[] | undefined): Record<string, string>[] {
  if (!dataSets || dataSets.length === 0) return [{}];
  // 初始为一个空组合：第一个数据集的每行与空组合拼接，后续数据集在此基础上展开
  let combos: Record<string, string>[] = [{}];
  for (const ds of dataSets) {
    if (ds.rows.length === 0) return [];
    const next: Record<string, string>[] = [];
    for (const base of combos) {
      for (const row of ds.rows) {
        const flat: Record<string, string> = { ...base };
        for (const [field, value] of Object.entries(row)) {
          flat[field] = value;
          flat[`dataset.${ds.name}.${field}`] = value;
        }
        next.push(flat);
      }
    }
    combos = next;
  }
  return combos;
}

/** 判别步骤类型：接口调用 / 条件 / 循环 */
function isConditionStep(step: Step): step is ConditionStep {
  return 'condition' in step;
}

function isLoopStep(step: Step): step is LoopStep {
  return 'loop' in step;
}

/** 生成步骤序号（报告用，扁平递增） */
let stepSeq = 0;

/**
 * 场景运行器。
 *
 * P1.6 起执行器为递归结构（api/condition/loop 任意嵌套），结果步骤扁平收集；
 * 数据集在 run 层逐行迭代（场景级 loop），每轮独立重置提取变量。
 */
export class ScenarioRunner {
  constructor(private readonly transport: Transport) {}

  /** 在指定环境下运行场景，返回报告 */
  async run(scenario: Scenario, environment: Environment): Promise<ScenarioReport> {
    const startedAt = new Date();
    const steps: StepOutcome[] = [];
    const combos = datasetCombinations(scenario.data_sets);
    stepSeq = 0;

    // 数据轮次从 1 开始编号（0 保留给「无数据集」场景）
    for (let iteration = 1; iteration <= combos.length; iteration++) {
      const rowVars = combos[iteration - 1] as Record<string, string>;
      // 每轮数据迭代重置提取变量（数据行变量随轮切换），condition/loop 嵌套步骤共用该作用域
      const scope = new MapScope({ ...environment.vars, ...rowVars });
      for (const step of scenario.steps) {
        await this.execStep(step, environment, scope, steps, iteration);
      }
    }

    const finishedAt = new Date();
    const totalAssertions = steps.reduce((sum, s) => sum + s.assertions.length, 0);
    const passedAssertions = steps.reduce((sum, s) => sum + s.assertions.filter((a) => a.passed).length, 0);
    const passedSteps = steps.filter((s) => s.passed).length;

    return {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      environment_name: environment.name,
      base_url: environment.base_url,
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      passed: passedSteps === steps.length && steps.length > 0,
      total_steps: steps.length,
      passed_steps: passedSteps,
      failed_steps: steps.length - passedSteps,
      total_assertions: totalAssertions,
      passed_assertions: passedAssertions,
      failed_assertions: totalAssertions - passedAssertions,
      total_iterations: combos.length === 1 && Object.keys(combos[0] ?? {}).length === 0 ? 0 : combos.length,
      steps,
    };
  }

  /** 分发执行单个步骤（api / condition / loop），结果扁平追加到 outcomes */
  private async execStep(
    step: Step,
    env: Environment,
    scope: Scope,
    outcomes: StepOutcome[],
    iteration: number,
  ): Promise<void> {
    if (isConditionStep(step)) {
      await this.execCondition(step, env, scope, outcomes, iteration);
    } else if (isLoopStep(step)) {
      await this.execLoop(step, env, scope, outcomes, iteration);
    } else {
      await this.execApi(step, env, scope, outcomes, iteration);
    }
  }

  /** 接口调用步骤：渲染 → 发请求 → 断言 → 提取 */
  private async execApi(
    step: ScenarioStep,
    env: Environment,
    scope: Scope,
    outcomes: StepOutcome[],
    iteration: number,
  ): Promise<void> {
    const tc = step.test_case;
    const context = scope.resolve(tc.variables);
    stepSeq++;

    const path = renderTemplate(tc.request.path, context);
    const url = joinUrl(env.base_url, path);
    const req: HttpRequest = {
      method: tc.request.method,
      url,
      query_params: renderQuery(tc.request.query_params, context),
      headers: renderRecord(tc.request.headers, context),
      body: tc.request.body === undefined ? undefined : renderTemplate(tc.request.body, context),
    };

    const stepStarted = Date.now();
    let response: HttpResponse | undefined;
    let error: string | undefined;

    try {
      response = await this.transport.send(req);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const latencyMs = Date.now() - stepStarted;

    const assertions = response ? evaluateAssertions(renderAssertions(tc.assertions, context), response) : [];

    // 提取变量（仅执行成功且响应存在时），写回运行时作用域（循环/分支外可见）
    let stepExtracted: Record<string, string> = {};
    if (response && step.extract && step.extract.length > 0) {
      stepExtracted = extractVariables(parseJson(response.body), step.extract);
      for (const [k, v] of Object.entries(stepExtracted)) scope.set(k, v);
    }

    const passed = error === undefined && assertions.every((a) => a.passed);
    outcomes.push({
      kind: 'api',
      name: `${stepSeq}. ${tc.name}`,
      method: tc.request.method,
      path,
      url,
      status_code: response ? response.status_code : null,
      latency_ms: latencyMs,
      passed,
      assertions,
      extracted: stepExtracted,
      error,
      iteration,
    });
  }

  /** 条件步骤：求值 → 走 then/else 分支，结果带 branch 信息 */
  private async execCondition(
    step: ConditionStep,
    env: Environment,
    scope: Scope,
    outcomes: StepOutcome[],
    iteration: number,
  ): Promise<void> {
    const cond = step.condition;
    const context = scope.resolve();
    const label = cond.name ?? cond.expr;
    stepSeq++;

    const stepStarted = Date.now();
    let branch: 'then' | 'else' | 'none' = 'none';
    let error: string | undefined;

    try {
      branch = evaluateExpression(cond.expr, context) ? 'then' : 'else';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const branchSteps = branch === 'then' ? cond.thenSteps : branch === 'else' ? cond.elseSteps : [];
    const before = outcomes.length;
    for (const sub of branchSteps) {
      await this.execStep(sub, env, scope, outcomes, iteration);
    }
    const branchOutcomes = outcomes.slice(before);
    const passed = error === undefined && branchOutcomes.every((o) => o.passed);

    // 条件汇总插在分支结果之前（阅读顺序与执行顺序一致：条件 → 分支明细）
    outcomes.splice(before, 0, {
      kind: 'condition',
      name: `${stepSeq}. 条件：${label}`,
      method: 'GET',
      path: '',
      url: '',
      status_code: null,
      latency_ms: Date.now() - stepStarted,
      passed,
      assertions: [],
      extracted: {},
      error,
      branch,
      condition_expr: renderTemplate(cond.expr, context),
      iteration,
    });
  }

  /** 循环步骤：count/forEach/while 三模式逐轮执行循环体 */
  private async execLoop(
    step: LoopStep,
    env: Environment,
    scope: Scope,
    outcomes: StepOutcome[],
    iteration: number,
  ): Promise<void> {
    const loop = step.loop;
    const label = loop.name ?? `循环（${loop.mode}）`;
    stepSeq++;

    const stepStarted = Date.now();
    let rounds = 0;
    let error: string | undefined;
    const before = outcomes.length;

    try {
      if (loop.mode === 'count') {
        const n = loop.count ?? 0;
        if (!Number.isInteger(n) || n < 0) throw new Error(`count 模式 count 非法：${String(n)}`);
        for (let i = 0; i < n; i++) {
          rounds++;
          for (const sub of loop.body) await this.execStep(sub, env, scope, outcomes, iteration);
        }
      } else if (loop.mode === 'forEach') {
        const listVar = loop.listVar ?? '';
        if (listVar === '') throw new Error('forEach 模式缺少 listVar');
        const raw = scope.resolve()[listVar];
        if (raw === undefined) throw new Error(`forEach 变量 ${listVar} 未定义`);
        const list = parseJson(raw);
        if (!Array.isArray(list)) throw new Error(`forEach 变量 ${listVar} 不是数组`);
        const itemVar = loop.itemVar ?? 'item';
        for (let i = 0; i < list.length; i++) {
          rounds++;
          scope.set(itemVar, stringifyValue(list[i]));
          for (const sub of loop.body) await this.execStep(sub, env, scope, outcomes, iteration);
        }
        // 循环变量作用域限循环内：结束后移除
        scope.delete(itemVar);
      } else if (loop.mode === 'while') {
        const condExpr = loop.condExpr ?? '';
        if (condExpr === '') throw new Error('while 模式缺少 condExpr');
        const max = loop.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        for (let i = 0; i < max; i++) {
          if (!evaluateExpression(condExpr, scope.resolve())) break;
          rounds++;
          for (const sub of loop.body) await this.execStep(sub, env, scope, outcomes, iteration);
        }
        if (rounds === max && evaluateExpression(condExpr, scope.resolve())) {
          throw new Error(`while 循环达到安全上限 ${String(max)} 轮后条件仍为真`);
        }
      } else {
        throw new Error(`不支持的循环模式：${String(loop.mode)}`);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const loopOutcomes = outcomes.slice(before);
    const passed = error === undefined && loopOutcomes.every((o) => o.passed);
    // 循环汇总插在循环体结果之前（阅读顺序与执行顺序一致：循环 → 循环体明细）
    outcomes.splice(before, 0, {
      kind: 'loop',
      name: `${stepSeq}. ${label}`,
      method: 'GET',
      path: '',
      url: '',
      status_code: null,
      latency_ms: Date.now() - stepStarted,
      passed,
      assertions: [],
      extracted: {},
      error,
      loop_mode: loop.mode,
      iterations: rounds,
      iteration,
    });
  }
}

/**
 * 运行时变量作用域：Map 结构 + 用例变量叠加解析。
 * 提取/数据行/循环变量直接写入；解析时叠加用例自带变量（不污染运行时层）。
 */
export type Scope = MapScope;

class MapScope {
  private readonly vars = new Map<string, string>();

  constructor(initial: Record<string, string>) {
    for (const [k, v] of Object.entries(initial)) this.vars.set(k, v);
  }

  set(name: string, value: string): void {
    this.vars.set(name, value);
  }

  delete(name: string): void {
    this.vars.delete(name);
  }

  /** 叠加用例变量后输出扁平字典（用例变量不写回运行时层） */
  resolve(caseVars?: Record<string, string>): Record<string, string> {
    return { ...Object.fromEntries(this.vars), ...caseVars };
  }
}
