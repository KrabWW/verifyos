/**
 * P1.7 自然语言 -> 断言（NL to Assertions，规则式 + LLM 预留）。
 *
 * 输入一句/一段中文或英文的自然语言期望，输出结构化断言（Assertion[]）：
 * - 状态码：状态码应该是 200 / status code should be 200
 * - 存在性：X 应该存在 / X 应该有 / X should exist
 * - 非空：  X 不应该为空 / X 非空 / X not empty（产出 exists + 非空 schema 两条断言）
 * - 类型：  X 应该是字符串/数字/整数/布尔/数组/对象/空值（schema 断言）
 * - 相等：  X 应该是 Y / X 等于 Y / X should be Y（期望值类型自动推断：数字/布尔/null/字符串）
 * - 不等：  X 不等于 Y / X 不是 Y / X is not Y
 * - 比较：  X 应该大于 5 / X 应该小于 5 / X > 5（仅 gt/lt；大于等于暂不支持，落入未识别）
 * - 包含：  X 应该包含 Y / X contains Y
 *
 * 多个子句可用逗号/顿号/分号/句号/换行分隔，允许「并且/同时/and」等连接词开头。
 *
 * responseSample 提供时逐条校验 target 路径是否真实存在（提前发现路径写错），
 * 并给出响应样例中同名字段的候选路径建议（见 parseNlAssertions 的 invalid_targets）；
 * 断言本身不丢弃，仅上报供人审。
 *
 * LLM 预留：第三个参数 llm 为可选增强器，规则断言 + 未识别子句一起交给它，
 * 允许追加更聪明的语义断言（按 type+target+operator 去重合并）。
 * 同步入口 nlToAssertions 只接受同步增强器；异步增强器请用 nlToAssertionsAsync。
 */
import type { Assertion, JsonSchema } from '../types/models.js';
import { buildJsonPath, walkLeaves } from '../generator/schema.js';
import { evaluateJsonPath, parseJsonPath } from './jsonpath.js';

// ---------------------------------------------------------------------------
// LLM 预留接口
// ---------------------------------------------------------------------------

/** LLM 增强上下文：原文 + 响应样例 + 规则断言 + 未识别子句 */
export interface NlLlmContext {
  /** 原始自然语言输入 */
  text: string;
  /** 响应样例（未提供时为 undefined） */
  response_sample: unknown;
  /** 规则式已生成的断言 */
  rule_assertions: Assertion[];
  /** 规则式未能识别的子句（LLM 重点兜底对象） */
  unknown_clauses: string[];
}

/** 同步 LLM 增强器（nlToAssertions 用） */
export type NlSyncEnhancer = (ctx: NlLlmContext) => Assertion[];

/** LLM 增强器（允许异步，nlToAssertionsAsync 用） */
export type NlLlmEnhancer = (ctx: NlLlmContext) => Assertion[] | Promise<Assertion[]>;

// ---------------------------------------------------------------------------
// 解析结果
// ---------------------------------------------------------------------------

/** target 路径在 responseSample 中不存在的校验结果 */
export interface NlInvalidTarget {
  /** 校验失败的 JSONPath */
  target: string;
  /** 产出该断言的原子句（定位原文用） */
  raw: string;
  /** 响应样例中同名字段的候选路径（最多 3 个，提示可能的位置） */
  suggestions: string[];
}

/** 规则式解析结果（断言 + 诊断信息） */
export interface NlParseResult {
  /** 生成的断言（按 type+target+operator 去重） */
  assertions: Assertion[];
  /** 未识别的子句原文 */
  unknown_clauses: string[];
  /** responseSample 提供时，校验不通过的 target 列表 */
  invalid_targets: NlInvalidTarget[];
}

// ---------------------------------------------------------------------------
// 词表 / 正则
// ---------------------------------------------------------------------------

/** 类型词 -> JSON Schema type 名（整数单独区分，diagnose 的 integer 视为 number 子集） */
const TYPE_WORD_MAP: Record<string, string> = {
  '字符串': 'string',
  'string': 'string',
  'str': 'string',
  '整数': 'integer',
  'integer': 'integer',
  'int': 'integer',
  '数字': 'number',
  '数值': 'number',
  'number': 'number',
  'num': 'number',
  '布尔': 'boolean',
  '布尔值': 'boolean',
  'boolean': 'boolean',
  'bool': 'boolean',
  '数组': 'array',
  '列表': 'array',
  'array': 'array',
  'list': 'array',
  '对象': 'object',
  '字典': 'object',
  'object': 'object',
  'dict': 'object',
  'map': 'object',
  '空值': 'null',
};

/** 成对引号（值/字段名包裹时剥掉） */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
];

/** 状态码子句：状态码/返回码/status code + 可选系词 + 3 位数字 */
const STATUS_RE =
  /^(?:http\s*)?(?:状态码|状态代码|返回码|http[ _-]?code|status[ _-]?code|status)\s*(?:应该是|应当是|应是|必须是|应该为|应当为|应为|必须为|应该|应当|必须|等于|是|为|should\s+be|must\s+be|is|equals|equal\s+to|=|==)?\s*(\d{3})$/i;

/** 非空（中文）：X (不应该|不应|不能|不得|不可)为空 / X 不为空 / X 非空 */
const NON_EMPTY_CN_RE = /^(.+?)\s*(?:(?:不应该|不应|不能|不得|不可)为空|不为空|非空)$/;
/** 非空（英文）：X should not be empty / X is not null / X not blank */
const NON_EMPTY_EN1_RE =
  /^(.+?)\s+(?:should\s+not\s+be|is\s+not|must\s+not\s+be|cannot\s+be|can't\s+be|not)\s+(?:empty|null|blank)$/i;
/** 非空（英文）：X non-empty / X nonempty */
const NON_EMPTY_EN2_RE = /^(.+?)\s+non-?empty$/i;

/** 存在性（中文）：X (应该|应当|必须|需要|得)存在 / 有 */
const EXISTS_CN_RE = /^(.+?)\s*(?:应该|应当|必须|需要|得)?\s*(?:存在|有)$/;
/** 存在性（英文）：X should exist / X exists / X must be present */
const EXISTS_EN_RE = /^(.+?)\s+(?:should\s+|must\s+)?(?:exist|exists|be\s+present|is\s+present)$/i;

/** 大于（中文）：X (应该)大于/超过/高于 N */
const GT_CN_RE = /^(.+?)\s*(?:应该|应当|应|必须|得|要)?\s*(?:大于|超过|高于|>)\s*(.+)$/;
/** 大于（英文）：X should be greater than N / X > N */
const GT_EN_RE =
  /^(.+?)\s+(?:should\s+(?:be\s+)?)?(?:greater\s+than|more\s+than|above|over|>|gt)\s+(.+)$/i;
/** 小于（中文）：X (应该)小于/低于 N */
const LT_CN_RE = /^(.+?)\s*(?:应该|应当|应|必须|得|要)?\s*(?:小于|低于|<)\s*(.+)$/;
/** 小于（英文）：X less than N / X < N */
const LT_EN_RE =
  /^(.+?)\s+(?:should\s+(?:be\s+)?)?(?:less\s+than|below|under|<|lt)\s+(.+)$/i;

/** 包含（中文）：X (应该)包含 Y */
const CONTAINS_CN_RE = /^(.+?)\s*(?:应该|应当|应|必须|得|要)?\s*包含\s*(.+)$/;
/** 包含（英文）：X should contain Y / X includes Y */
const CONTAINS_EN_RE = /^(.+?)\s+(?:should\s+)?(?:contain|contains|include|includes)\s+(.+)$/i;

/** 否定系词（不等）：不等于 / 不是 / 不应该是 / should not be / != 等 */
const NE_RE =
  /^(.+?)\s*(?:不应该等于|不应等于|不能等于|不得等于|不等于|不应该是|不应是|不能是|不可是|不得是|不是|不应该为|不应为|不能为|不为|should\s+not\s+be|is\s+not|must\s+not\s+be|cannot\s+be|can't\s+be|does\s+not\s+equal|not\s+equal\s+to|!=)\s*(.+)$/i;

/** 肯定系词（相等/类型）：应该是 / 等于 / 是 / should be / is / = 等（多字符在前） */
const COPULA_RE =
  /^(.+?)\s*(?:应该是|应当是|应是|必须是|得是|应该等于|应当等于|应等于|必须等于|等于|应该为|应当为|应为|必须为|should\s+be|must\s+be|needs?\s+to\s+be|is|equals|equal\s+to|==|=|是)\s*(.+)$/i;

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

/** 断言签名（与 review.ts 一致）：type + target + operator */
function assertionKey(a: Assertion): string {
  return `${a.type}|${a.target ?? ''}|${a.operator ?? ''}`;
}

/** 按签名去重（保留首条） */
function dedupeAssertions(list: Assertion[]): Assertion[] {
  const seen = new Set<string>();
  const out: Assertion[] = [];
  for (const a of list) {
    const key = assertionKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** 子句切分：标点/换行分隔，并剥掉子句开头的连接词（并且/同时/and 等） */
function splitClauses(text: string): string[] {
  return text
    .split(/[,，。;；、\n\r]+/)
    .map((c) =>
      c
        .replace(/^(?:并且|而且|且|同时|然后|以及|另外)\s*/, '')
        .replace(/^(?:and|also|then)\s+/i, '')
        .trim(),
    )
    .filter((c) => c.length > 0);
}

/** 剥引号/「字段」包装；空字段或以「不/没」结尾（否定词误切入字段名）返回 null */
function cleanField(raw: string): string | null {
  let f = raw.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (f.length >= 2 && f.startsWith(open) && f.endsWith(close)) {
      f = f.slice(1, -1).trim();
      break;
    }
  }
  f = f
    .replace(/^字段\s*[:：]?\s*/, '')
    .replace(/\s*字段$/, '')
    .trim();
  if (f === '') return null;
  // 以「不/没」结尾说明匹配到了不支持的否定句式（如「不包含」「不应该存在」），交给未识别
  if (/[不没]$/.test(f)) return null;
  return f;
}

/** 字段名 -> JSONPath target：'name' -> $.name；'data.items[0].id' -> $.data.items[0].id；已带 $ 原样规范化 */
function fieldToTarget(field: string): string {
  let f = field.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (f.length >= 2 && f.startsWith(open) && f.endsWith(close)) {
      f = f.slice(1, -1).trim();
      break;
    }
  }
  if (f === '') return '$';
  if (f === '响应体' || f === '响应' || f === '整个响应' || f === 'body' || f === 'response body' || f === 'root') {
    return '$';
  }
  if (f.startsWith('$')) {
    const segs = parseJsonPath(f);
    return segs === null ? f : buildJsonPath(segs);
  }
  const segs = parseJsonPath(`$.${f.replace(/^\./, '')}`);
  // 逐段解析成功则规范化重拼；失败（如含空格的英文字段）退化为单个括号记法键
  return segs === null ? buildJsonPath([f]) : buildJsonPath(segs);
}

/** 期望值类型推断：引号串 -> string；true/false/真/假 -> boolean；null/nil/none -> null；整数/小数 -> number；其余原样字符串 */
function inferValue(raw: string): unknown {
  const v = raw.trim();
  for (const [open, close] of QUOTE_PAIRS) {
    if (v.length >= 2 && v.startsWith(open) && v.endsWith(close)) return v.slice(1, -1);
  }
  const lower = v.toLowerCase();
  if (v === '真' || lower === 'true') return true;
  if (v === '假' || lower === 'false') return false;
  if (lower === 'null' || lower === 'nil' || lower === 'none') return null;
  if (/^[+-]?\d+$/.test(v) || /^[+-]?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

/** 系词后的 remainder 是否为类型词；是则返回 JSON Schema type 名 */
function typeNameOfRest(rest: string): string | undefined {
  const probe = (s: string): string | undefined => TYPE_WORD_MAP[s] ?? TYPE_WORD_MAP[s.toLowerCase()];
  const direct = probe(rest.trim());
  if (direct !== undefined) return direct;
  // 「一个字符串」/「一种数字」等量词前缀
  return probe(rest.trim().replace(/^(?:一个|一种|个)/, ''));
}

/** 响应样例中取 target 处的值（无样例/路径不存在返回 undefined） */
function sampleValueAt(sample: unknown, target: string): unknown {
  if (sample === undefined) return undefined;
  const segs = parseJsonPath(target);
  if (segs === null) return undefined;
  const got = evaluateJsonPath(sample, segs);
  return got.found ? got.value : undefined;
}

/** 非空 schema：样例可知类型时给精确约束（string -> minLength、array -> minItems），否则通用「非 null/非空串/非空数组」 */
function nonEmptySchema(sampleValue: unknown): JsonSchema {
  if (Array.isArray(sampleValue)) return { type: 'array', minItems: 1 };
  if (typeof sampleValue === 'string') return { type: 'string', minLength: 1 };
  return { not: { anyOf: [{ type: 'null' }, { const: '' }, { const: [] }] } };
}

// ---------------------------------------------------------------------------
// 子句匹配（按特异性排序：状态码 > 非空 > 存在性 > 大小于 > 包含 > 不等 > 相等/类型）
// ---------------------------------------------------------------------------

/** 非空子句 -> exists + 非空 schema 两条断言 */
function matchNonEmpty(clause: string, sample: unknown): Assertion[] | null {
  const m =
    NON_EMPTY_CN_RE.exec(clause) ?? NON_EMPTY_EN1_RE.exec(clause) ?? NON_EMPTY_EN2_RE.exec(clause);
  if (m === null) return null;
  const field = cleanField(m[1] ?? '');
  if (field === null) return null;
  const target = fieldToTarget(field);
  return [
    { type: 'jsonpath', target, operator: 'exists', mode: 'strict' },
    { type: 'schema', target, schema: nonEmptySchema(sampleValueAt(sample, target)), mode: 'strict' },
  ];
}

/** 单个子句 -> 断言列表；不识别返回 null */
function matchClause(clause: string, sample: unknown): Assertion[] | null {
  // 1. 状态码
  const st = STATUS_RE.exec(clause);
  if (st !== null) {
    return [{ type: 'status', operator: 'eq', expected: Number(st[1] ?? ''), mode: 'strict' }];
  }

  // 2. 非空（exists + 非空 schema）
  const nonEmpty = matchNonEmpty(clause, sample);
  if (nonEmpty !== null) return nonEmpty;

  // 3. 存在性
  const ex = EXISTS_CN_RE.exec(clause) ?? EXISTS_EN_RE.exec(clause);
  if (ex !== null) {
    const field = cleanField(ex[1] ?? '');
    if (field === null) return null;
    return [{ type: 'jsonpath', target: fieldToTarget(field), operator: 'exists', mode: 'strict' }];
  }

  // 4. 大于 / 小于（期望值必须是数字，否则视为未识别，如「大于等于」）
  const gt = GT_CN_RE.exec(clause) ?? GT_EN_RE.exec(clause);
  if (gt !== null) {
    const field = cleanField(gt[1] ?? '');
    const v = inferValue(gt[2] ?? '');
    if (field === null || typeof v !== 'number') return null;
    return [{ type: 'jsonpath', target: fieldToTarget(field), operator: 'gt', expected: v, mode: 'strict' }];
  }
  const lt = LT_CN_RE.exec(clause) ?? LT_EN_RE.exec(clause);
  if (lt !== null) {
    const field = cleanField(lt[1] ?? '');
    const v = inferValue(lt[2] ?? '');
    if (field === null || typeof v !== 'number') return null;
    return [{ type: 'jsonpath', target: fieldToTarget(field), operator: 'lt', expected: v, mode: 'strict' }];
  }

  // 5. 包含
  const ct = CONTAINS_CN_RE.exec(clause) ?? CONTAINS_EN_RE.exec(clause);
  if (ct !== null) {
    const field = cleanField(ct[1] ?? '');
    if (field === null) return null;
    return [
      { type: 'jsonpath', target: fieldToTarget(field), operator: 'contains', expected: inferValue(ct[2] ?? ''), mode: 'strict' },
    ];
  }

  // 6. 不等（必须先于肯定系词：「X 不应该是 Y」里也含「是」）
  const ne = NE_RE.exec(clause);
  if (ne !== null) {
    const field = cleanField(ne[1] ?? '');
    if (field === null) return null;
    return [
      { type: 'jsonpath', target: fieldToTarget(field), operator: 'ne', expected: inferValue(ne[2] ?? ''), mode: 'strict' },
    ];
  }

  // 7. 相等 / 类型（remainder 是类型词 -> schema 断言；否则 eq + 类型推断）
  const eq = COPULA_RE.exec(clause);
  if (eq !== null) {
    const field = cleanField(eq[1] ?? '');
    const rest = (eq[2] ?? '').trim();
    if (field === null || rest === '') return null;
    const tname = typeNameOfRest(rest);
    if (tname !== undefined) {
      return [{ type: 'schema', target: fieldToTarget(field), schema: { type: tname }, mode: 'strict' }];
    }
    return [
      { type: 'jsonpath', target: fieldToTarget(field), operator: 'eq', expected: inferValue(rest), mode: 'strict' },
    ];
  }

  return null;
}

// ---------------------------------------------------------------------------
// target 路径校验（responseSample 提供时）
// ---------------------------------------------------------------------------

function checkTargets(
  perClause: ReadonlyArray<{ clause: string; list: Assertion[] }>,
  assertions: ReadonlyArray<Assertion>,
  sample: unknown,
): NlInvalidTarget[] {
  if (sample === undefined) return [];
  const leaves = walkLeaves(sample);
  const checked = new Set<string>();
  const out: NlInvalidTarget[] = [];
  for (const a of assertions) {
    const target = a.target;
    if (target === undefined || !target.startsWith('$') || checked.has(target)) continue;
    checked.add(target);
    const segs = parseJsonPath(target);
    if (segs !== null && evaluateJsonPath(sample, segs).found) continue;
    const lastSeg = segs === null || segs.length === 0 ? undefined : segs[segs.length - 1];
    const lastKey = lastSeg === undefined ? '' : String(lastSeg);
    const suggestions =
      lastKey === ''
        ? []
        : leaves
            .filter((l) => l.key === lastKey)
            .slice(0, 3)
            .map((l) => buildJsonPath(l.path));
    const raw = perClause.find(({ list }) => list.some((x) => x.target === target))?.clause ?? '';
    out.push({ target, raw, suggestions });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

/**
 * 规则式解析（含诊断信息）：自然语言 -> 断言 + 未识别子句 + target 校验结果。
 * 不调用 LLM；LLM 增强见 nlToAssertions / nlToAssertionsAsync。
 */
export function parseNlAssertions(text: string, responseSample?: unknown): NlParseResult {
  const perClause: Array<{ clause: string; list: Assertion[] }> = [];
  const unknown_clauses: string[] = [];
  for (const clause of splitClauses(text)) {
    const list = matchClause(clause, responseSample);
    if (list === null || list.length === 0) unknown_clauses.push(clause);
    else perClause.push({ clause, list });
  }

  const flattened: Assertion[] = [];
  for (const { list } of perClause) flattened.push(...list);
  const assertions = dedupeAssertions(flattened);
  const invalid_targets = checkTargets(perClause, assertions, responseSample);
  return { assertions, unknown_clauses, invalid_targets };
}

/** 构造 LLM 上下文（两个入口共用） */
function llmContext(text: string, sample: unknown, result: NlParseResult): NlLlmContext {
  return {
    text,
    response_sample: sample,
    rule_assertions: result.assertions,
    unknown_clauses: result.unknown_clauses,
  };
}

/**
 * 自然语言 -> 断言（主入口，规则式 + 可选同步 LLM 增强）。
 * @param text 自然语言期望（中/英文，多子句用标点分隔）
 * @param responseSample 响应样例（提供时校验 target 路径，见 parseNlAssertions）
 * @param llm 同步增强器（预留；异步增强器用 nlToAssertionsAsync）
 */
export function nlToAssertions(
  text: string,
  responseSample?: unknown,
  llm?: NlSyncEnhancer,
): Assertion[] {
  const result = parseNlAssertions(text, responseSample);
  const extra = llm?.(llmContext(text, responseSample, result)) ?? [];
  return dedupeAssertions([...result.assertions, ...extra]);
}

/** 自然语言 -> 断言（异步 LLM 增强版，await 增强器） */
export async function nlToAssertionsAsync(
  text: string,
  responseSample?: unknown,
  llm?: NlLlmEnhancer,
): Promise<Assertion[]> {
  const result = parseNlAssertions(text, responseSample);
  const extra = (await llm?.(llmContext(text, responseSample, result))) ?? [];
  return dedupeAssertions([...result.assertions, ...extra]);
}
