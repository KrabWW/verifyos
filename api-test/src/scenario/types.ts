/**
 * 场景编排层（A8）专属类型。
 *
 * 对标 MeterSphere / Apifox 的「场景」与「环境」概念：
 * - Scenario 把多个接口（复用 A3 的 TestCase）按序串成一个场景，支持前置提取变量传递；
 * - Environment 表达多环境（baseURL + 变量字典），跑场景时可切换；
 * - ScenarioReport 是跑完场景后的报告（每接口 pass/fail + 断言明细 + 耗时），可导出 md/json/junit。
 *
 * 与 models.ts 里 TestCase.variables 字段的关系：
 * - TestCase.variables 是「用例自带变量」（场景编排用），运行时优先级介于环境变量与提取变量之间；
 * - 变量提取（VariableExtraction）是场景级的编排配置，不写进 TestCase，挂在 ScenarioStep 上。
 */
import type { Assertion, HttpMethod, TestCase } from '../types/models.js';

/** 变量提取：从前一个接口响应体中按 JSONPath 取字段存为变量，供后续接口 {{name}} 引用 */
export interface VariableExtraction {
  /** 变量名（后续用 {{name}} 引用） */
  name: string;
  /** JSONPath，如 $.data.token */
  jsonpath: string;
}

/** 场景步骤（接口调用）：一个接口调用（复用 TestCase 的 request + assertions）+ 前置提取变量 */
export interface ScenarioStep {
  /** 复用的 A3 测试用例（request 快照 + 断言列表 + 用例级 variables） */
  test_case: TestCase;
  /** 执行成功后从响应体提取的变量（JSONPath → 变量名） */
  extract?: VariableExtraction[];
}

/**
 * 条件步骤（P1.6）：对表达式求值，为真走 thenSteps，为假走 elseSteps。
 *
 * 表达式由安全求值器解析（不用 eval）：比较/逻辑/算术运算 + 变量替换，
 * 详见 expr.ts。分支体内步骤可读写外层变量（共享同一运行时作用域）。
 */
export interface ConditionStep {
  condition: {
    /** 步骤名（报告展示用，缺省展示表达式原文） */
    name?: string;
    /** 条件表达式，如 "balance >= price"；支持裸变量名与 {{var}} 占位两种写法 */
    expr: string;
    /** 真分支步骤（按序执行） */
    thenSteps: Step[];
    /** 假分支步骤（按序执行） */
    elseSteps: Step[];
  };
}

/**
 * 循环节点（P1.6）三种模式：
 * - count：固定次数（count 轮）；
 * - forEach：遍历 listVar 指向的 JSON 数组（通常由前置步骤 extract 提取），
 *   每轮把当前元素写入 itemVar（默认 item），itemVar 作用域限循环内；
 * - while：每轮开始前对 condExpr 求值，为真继续（maxIterations 安全上限，默认 1000）。
 */
export interface LoopStep {
  loop: {
    /** 步骤名（报告展示用，缺省展示模式） */
    name?: string;
    /** 循环模式 */
    mode: 'count' | 'forEach' | 'while';
    /** count 模式：循环轮数（非负整数） */
    count?: number;
    /** forEach 模式：数组变量名（值为 JSON 数组字符串） */
    listVar?: string;
    /** forEach 模式：循环变量名（默认 item，作用域限循环内） */
    itemVar?: string;
    /** while 模式：继续条件表达式 */
    condExpr?: string;
    /** while 模式：安全上限（防死循环，默认 1000） */
    maxIterations?: number;
    /** 循环体步骤（每轮按序执行） */
    body: Step[];
  };
}

/** 场景步骤联合类型：接口调用 / 条件分支 / 循环（按字段形状区分） */
export type Step = ScenarioStep | ConditionStep | LoopStep;

/**
 * CSV 数据驱动（P1.6）：场景级数据集，rows 每行是一条用例数据。
 *
 * 运行时逐行迭代（相当于场景级 loop）：每行把字段注入变量作用域，
 * 步骤用 {{field}} 引用平铺字段，或 {{dataset.<name>.<field>}} 引用命名空间字段；
 * 多个数据集按笛卡尔积组合迭代（2x2 = 4 轮）；某数据集 rows 为空则场景不执行。
 * 数据行变量写入运行时作用域（优先级高于用例变量与环境变量）。
 */
export interface DataSet {
  /** 数据集名（命名空间引用与报告标记用） */
  name: string;
  /** 数据行（字段名 → 字符串值） */
  rows: Record<string, string>[];
}

/** 场景：有序步骤列表 + 变量提取/传递 + 可选数据集驱动 */
export interface Scenario {
  /** 主键，UUID */
  id: string;
  /** 场景名 */
  name: string;
  /** 场景描述 */
  description?: string;
  /** 有序步骤（按数组顺序执行） */
  steps: Step[];
  /** 场景级数据集（CSV 数据驱动，逐行迭代整个场景） */
  data_sets?: DataSet[];
}

/** 环境：多环境切换（baseURL / token 等复用） */
export interface Environment {
  /** 环境名，如 dev / staging / prod */
  name: string;
  /** 基础地址（含 scheme），如 https://api.example.com */
  base_url: string;
  /** 变量字典（token / tenant 等复用） */
  vars: Record<string, string>;
}

/** 单条断言的执行结果 */
export interface AssertionOutcome {
  /** 断言类型 */
  type: Assertion['type'];
  /** 目标表达式（jsonpath/field/header 时的目标） */
  target?: string;
  /** 操作符 */
  operator?: string;
  /** 期望值 */
  expected?: unknown;
  /** 实际值 */
  actual?: unknown;
  /** 是否通过 */
  passed: boolean;
  /** 人读说明 */
  message: string;
}

/**
 * 单个步骤（接口）的执行结果。
 *
 * kind = api 的结果必填 method/path/url 等；condition/loop 步骤这些字段无意义，
 * 填占位值（method GET / path ''），结果语义看 branch / iterations 字段。
 */
export interface StepOutcome {
  /** 步骤种类（P1.6：api / condition / loop） */
  kind: 'api' | 'condition' | 'loop';
  /** 步骤名（用例名 / 条件表达式 / 循环标识） */
  name: string;
  method: HttpMethod;
  /** 渲染变量后的路径（condition/loop 为空串） */
  path: string;
  /** 完整 URL（base_url + 渲染后路径；condition/loop 为空串） */
  url: string;
  /** 响应状态码（执行失败或非 api 步骤为 null） */
  status_code: number | null;
  /** 耗时（毫秒） */
  latency_ms: number;
  /** 该步骤整体是否通过（无执行错误且全部断言通过；condition/loop 为分支/循环体全部通过） */
  passed: boolean;
  /** 断言明细（condition/loop 为空数组，其分支/循环体的断言在各自 StepOutcome 里） */
  assertions: AssertionOutcome[];
  /** 本步骤提取到的变量（name → 字符串值） */
  extracted: Record<string, string>;
  /** 执行错误信息（网络/解析/表达式求值失败等，无则 undefined） */
  error?: string;
  /** P1.6 条件步骤：实际走的分支（then / else / none=求值失败） */
  branch?: 'then' | 'else' | 'none';
  /** P1.6 条件步骤：求值用的表达式（变量替换后原文） */
  condition_expr?: string;
  /** P1.6 循环步骤：迭代模式 */
  loop_mode?: LoopStep['loop']['mode'];
  /** P1.6 循环步骤：实际执行轮数（含被 while 条件拦下的最后一次检查） */
  iterations?: number;
  /** P1.6 数据驱动：该步骤属于第几轮数据迭代（无数据集时为 0） */
  iteration?: number;
}

/** 场景运行报告（每接口 pass/fail + 断言明细 + 耗时） */
export interface ScenarioReport {
  scenario_id: string;
  scenario_name: string;
  /** 本次运行使用的环境 */
  environment_name: string;
  base_url: string;
  /** 开始时间（ISO 8601） */
  started_at: string;
  /** 结束时间（ISO 8601） */
  finished_at: string;
  /** 总耗时（毫秒） */
  duration_ms: number;
  /** 场景整体是否通过（所有步骤通过） */
  passed: boolean;
  total_steps: number;
  passed_steps: number;
  failed_steps: number;
  total_assertions: number;
  passed_assertions: number;
  failed_assertions: number;
  /** P1.6 数据驱动：数据迭代总轮数（无数据集为 0，即只跑一轮） */
  total_iterations: number;
  /** 步骤明细（有序；数据驱动时每轮数据各步骤各一条） */
  steps: StepOutcome[];
}
