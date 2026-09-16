/**
 * P2.4 测试方法论注入（checkbox → prompt 指令 + 规则引擎参数）。
 *
 * 两条生效路径：
 * 1. 有 LLM：buildMethodologyPrefix() 把勾选的方法论拼成明确的指令段，
 *    注入 assistant 的 system prompt，引导 LLM 按方法论设计用例；
 * 2. 无 LLM（项目常态）：methodologyRuleFlags() 把勾选结果转成规则参数，
 *    generateMethodologyCases() 按参数切换规则式生成维度——
 *    如勾「边界值分析」则对带约束字段生成 min-1 / min / max / max+1 类用例。
 *
 * 四方法论：等价类划分 / 边界值分析 / 判定表 / 场景法。
 */
import type { HttpMethod, JsonSchema } from '../types/models.js';
import { sampleValue, schemaType } from '../spec-test/sample.js';
import { objectProperties } from '../spec-test/edge.js';

/** 方法论主键 */
export type MethodologyKey = 'equivalence' | 'boundary' | 'decision_table' | 'scenario';

/** 单条方法论定义 */
export interface Methodology {
  key: MethodologyKey;
  /** 中文标签 */
  label: string;
  /** 英文名 */
  en: string;
  /** 一句话描述 */
  description: string;
  /** 注入 LLM prompt 的明确指令（每法一句） */
  directive: string;
}

/** 全部方法论（checkbox 列表数据源，顺序即展示顺序） */
export const METHODOLOGIES: readonly Methodology[] = [
  {
    key: 'equivalence',
    label: '等价类划分',
    en: 'Equivalence Partitioning',
    description: '把输入域划分成有效 / 无效等价类，每类取一个代表值',
    directive: '请按等价类划分设计用例：对每个输入字段分别给出有效等价类与无效等价类的代表值各一条。',
  },
  {
    key: 'boundary',
    label: '边界值分析',
    en: 'Boundary Value Analysis',
    description: '在等价类边界及其两侧取值（min-1 / min / max / max+1）',
    directive: '请按边界值分析设计用例：对每个带边界约束的字段生成 min-1、min、max、max+1 四类边界取值。',
  },
  {
    key: 'decision_table',
    label: '判定表',
    en: 'Decision Table',
    description: '把多条件组合列成判定表，每行组合对应一条用例',
    directive: '请按判定表设计用例：对布尔 / 枚举条件字段做组合覆盖，每行组合生成一条用例。',
  },
  {
    key: 'scenario',
    label: '场景法',
    en: 'Scenario Method',
    description: '从业务流程出发串接多接口，覆盖基本流与备选流',
    directive: '请按场景法设计用例：围绕业务主流程串接多个接口成端到端场景，并给出基本流与备选流。',
  },
];

/** 按 key 取方法论定义 */
export function methodologyByKey(key: MethodologyKey): Methodology {
  const found = METHODOLOGIES.find((m) => m.key === key);
  if (!found) throw new Error(`未知方法论: ${key}`);
  return found;
}

/** 规则引擎参数：勾选结果 → 各方法论维度的开关（无 LLM 时驱动规则式生成） */
export interface MethodologyRuleFlags {
  boundary: boolean;
  equivalence: boolean;
  decision_table: boolean;
  scenario: boolean;
}

/** 勾选的方法论 → 规则引擎维度开关 */
export function methodologyRuleFlags(selected: readonly Methodology[]): MethodologyRuleFlags {
  return {
    boundary: selected.some((m) => m.key === 'boundary'),
    equivalence: selected.some((m) => m.key === 'equivalence'),
    decision_table: selected.some((m) => m.key === 'decision_table'),
    scenario: selected.some((m) => m.key === 'scenario'),
  };
}

/**
 * 勾选的方法论 → prompt 指令段（拼进 LLM system prompt）。
 * 全不选返回空串（不注入）。
 */
export function buildMethodologyPrefix(selected: readonly Methodology[]): string {
  if (selected.length === 0) return '';
  const lines = selected.map((m) => `- ${m.label}（${m.en}）：${m.directive}`);
  return ['【方法论指导】', '本次生成已勾选以下测试方法论，设计用例时务必逐条遵循：', ...lines].join('\n');
}

/* ------------------------------------------------------------------ */
/* 规则式生成维度（无 LLM 也生效）                                       */
/* ------------------------------------------------------------------ */

/** 期望结果档位（决定生成用例的 status 断言） */
export type ExpectBand = '2xx' | '4xx';

/** 一条方法论生成的用例草稿（assistant 会转成 TestCase 候选卡片） */
export interface MethodologyCaseDraft {
  /** 依据的方法论 */
  category: MethodologyKey;
  /** 用例标题（人读） */
  title: string;
  /** 方法论依据（一句话，作为候选卡片的 reason） */
  detail: string;
  method: HttpMethod;
  path: string;
  /** 请求体字段 → 变异值（在合法样例的基础上覆盖） */
  bodyOverrides: Record<string, unknown>;
  /** 期望结果档位：合法取值 2xx / 非法取值 4xx */
  expect: ExpectBand;
  /** 场景法专用：串接的步骤列表（其它方法论缺省） */
  steps?: Array<{ method: HttpMethod; path: string }>;
}

/** 生成目标（某个 API 的定义 + 场景法可用的同集合 API） */
export interface MethodologyTarget {
  method: HttpMethod;
  path: string;
  /** 请求体 schema（等价类 / 边界值 / 判定表的变异依据） */
  request_schema?: JsonSchema;
  /** 场景法串接的 API 列表（同集合其它 API，可选） */
  scenario_apis?: Array<{ method: HttpMethod; path: string; summary?: string }>;
}

/** 顶层数值字段的边界取值组 */
function boundaryDrafts(target: MethodologyTarget): MethodologyCaseDraft[] {
  const out: MethodologyCaseDraft[] = [];
  for (const [name, schema] of Object.entries(objectProperties(target.request_schema))) {
    const label = `${target.method} ${target.path}`;
    if (typeof schema.minimum === 'number') {
      out.push(
        { category: 'boundary', title: `边界值：${name} 取 min-1（${schema.minimum - 1}）`, detail: '边界值分析：越下界（min-1），预期被拒绝', method: target.method, path: target.path, bodyOverrides: { [name]: schema.minimum - 1 }, expect: '4xx' },
        { category: 'boundary', title: `边界值：${name} 取 min（${schema.minimum}）`, detail: '边界值分析：下界值（min），预期合法', method: target.method, path: target.path, bodyOverrides: { [name]: schema.minimum }, expect: '2xx' },
      );
    }
    if (typeof schema.maximum === 'number') {
      out.push(
        { category: 'boundary', title: `边界值：${name} 取 max（${schema.maximum}）`, detail: '边界值分析：上界值（max），预期合法', method: target.method, path: target.path, bodyOverrides: { [name]: schema.maximum }, expect: '2xx' },
        { category: 'boundary', title: `边界值：${name} 取 max+1（${schema.maximum + 1}）`, detail: '边界值分析：越上界（max+1），预期被拒绝', method: target.method, path: target.path, bodyOverrides: { [name]: schema.maximum + 1 }, expect: '4xx' },
      );
    }
    // 字符串长度边界
    if (schemaType(schema) === 'string') {
      const minLen = typeof schema.minLength === 'number' ? schema.minLength : undefined;
      const maxLen = typeof schema.maxLength === 'number' ? schema.maxLength : undefined;
      if (minLen !== undefined && minLen > 0) {
        out.push({ category: 'boundary', title: `边界值：${name} 长度取 minLength-1（${minLen - 1} 个字符）`, detail: '边界值分析：字符串长度越下界', method: target.method, path: target.path, bodyOverrides: { [name]: 'a'.repeat(minLen - 1) }, expect: '4xx' });
      }
      if (maxLen !== undefined) {
        out.push({ category: 'boundary', title: `边界值：${name} 长度取 maxLength+1（${maxLen + 1} 个字符）`, detail: '边界值分析：字符串长度越上界', method: target.method, path: target.path, bodyOverrides: { [name]: 'a'.repeat(maxLen + 1) }, expect: '4xx' });
      }
    }
  }
  return out;
}

/** 顶层数值字段无显式边界时，从类型维度补最小边界组（保证勾了边界值一定有产出） */
function boundaryFallbackDrafts(target: MethodologyTarget): MethodologyCaseDraft[] {
  if (boundaryDrafts(target).length > 0) return [];
  const out: MethodologyCaseDraft[] = [];
  for (const [name, schema] of Object.entries(objectProperties(target.request_schema))) {
    if (schemaType(schema) === 'integer' || schemaType(schema) === 'number') {
      out.push(
        { category: 'boundary', title: `边界值：${name} 取 -1（常规下界探测）`, detail: '边界值分析：schema 未声明边界，用常规下界 -1 探测', method: target.method, path: target.path, bodyOverrides: { [name]: -1 }, expect: '4xx' },
      );
    }
  }
  return out;
}

/** 等价类：每字段有效代表值 + 无效代表值（类型冲突） */
function equivalenceDrafts(target: MethodologyTarget): MethodologyCaseDraft[] {
  const out: MethodologyCaseDraft[] = [];
  for (const [name, schema] of Object.entries(objectProperties(target.request_schema))) {
    const valid = sampleValue(schema);
    const invalid = schemaType(schema) === 'string' ? 123 : 'not-a-valid-type';
    out.push(
      { category: 'equivalence', title: `等价类：${name} 有效代表值 ${JSON.stringify(valid)}`, detail: '等价类划分：有效等价类代表值，预期成功', method: target.method, path: target.path, bodyOverrides: { [name]: valid }, expect: '2xx' },
      { category: 'equivalence', title: `等价类：${name} 无效代表值 ${JSON.stringify(invalid)}（类型不符）`, detail: '等价类划分：无效等价类代表值（类型冲突），预期被拒绝', method: target.method, path: target.path, bodyOverrides: { [name]: invalid }, expect: '4xx' },
    );
  }
  return out;
}

/** 判定表：布尔 / 枚举条件字段的组合行（最多 3 个条件、6 行，防组合爆炸） */
function decisionTableDrafts(target: MethodologyTarget): MethodologyCaseDraft[] {
  const conditions: Array<{ name: string; values: unknown[] }> = [];
  for (const [name, schema] of Object.entries(objectProperties(target.request_schema))) {
    if (conditions.length >= 3) break;
    if (schemaType(schema) === 'boolean') {
      conditions.push({ name, values: [true, false] });
    } else if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.length <= 3) {
      conditions.push({ name, values: [...schema.enum] });
    }
  }
  if (conditions.length === 0) return [];

  // 笛卡尔积（上限 6 行）
  let rows: Array<Record<string, unknown>> = [{}];
  for (const cond of conditions) {
    const next: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      for (const v of cond.values) next.push({ ...row, [cond.name]: v });
    }
    rows = next;
    if (rows.length > 6) {
      rows = rows.slice(0, 6);
      break;
    }
  }

  return rows.map((row, i) => {
    const combo = Object.entries(row).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
    return {
      category: 'decision_table' as const,
      title: `判定表第 ${i + 1} 行：${combo}`,
      detail: `判定表：条件组合行（${conditions.map((c) => c.name).join(' × ')}），预期成功`,
      method: target.method,
      path: target.path,
      bodyOverrides: row,
      expect: '2xx' as const,
    };
  });
}

/** 场景法：同集合 API 串接成端到端主流程（至少 2 个 API 才有意义） */
function scenarioDrafts(target: MethodologyTarget): MethodologyCaseDraft[] {
  const apis = target.scenario_apis ?? [];
  if (apis.length < 2) {
    return [{
      category: 'scenario',
      title: `场景法：${target.method} ${target.path} 单接口基本流`,
      detail: '场景法：集合内 API 不足 2 个，退化为单接口基本流',
      method: target.method,
      path: target.path,
      bodyOverrides: {},
      expect: '2xx',
      steps: [{ method: target.method, path: target.path }],
    }];
  }
  const chain = apis.slice(0, 3);
  const title = `场景法：${chain.map((a) => `${a.method} ${a.path}`).join(' -> ')} 主流程`;
  return [{
    category: 'scenario',
    title,
    detail: `场景法：按业务顺序串接 ${chain.length} 个接口的端到端主流程`,
    method: chain[0]!.method,
    path: chain[0]!.path,
    bodyOverrides: {},
    expect: '2xx',
    steps: chain.map((a) => ({ method: a.method, path: a.path })),
  }];
}

/**
 * 按勾选的方法论生成规则式用例草稿（无 LLM 路径的核心）。
 * 勾什么生成什么维度；全不选返回空数组（由 assistant 走默认策略）。
 */
export function generateMethodologyCases(
  target: MethodologyTarget,
  selected: readonly Methodology[],
): MethodologyCaseDraft[] {
  const flags = methodologyRuleFlags(selected);
  const hasSchema = target.request_schema !== undefined;
  const out: MethodologyCaseDraft[] = [];
  if (flags.boundary && hasSchema) out.push(...boundaryDrafts(target), ...boundaryFallbackDrafts(target));
  if (flags.equivalence && hasSchema) out.push(...equivalenceDrafts(target));
  if (flags.decision_table && hasSchema) out.push(...decisionTableDrafts(target));
  if (flags.scenario) out.push(...scenarioDrafts(target));
  return out;
}
