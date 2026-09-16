/**
 * P2.5 Spec Diff AI 审查：两版 OpenAPI（v1/v2）diff + 破坏性变更判定 + 中文审查报告。
 *
 * 设计（项目常态无 LLM 配置，纯规则式实现）：
 * 1. diffSpecs(oldSpec, newSpec)：端点级（新增/删除/修改）+ 修改端点的变化点级对比——
 *    参数级（新增必填/删参数/改类型/改 required/改名）、请求体与响应的 schema 字段级
 *    （删字段/类型变更/optional 变 required/枚举增删）、响应码级（增/删）、纯文档变更。
 *    端点配对复用 inventory/normalize.ts 的 keyOf 主键（method + 规范化路径）；
 *    注意与 inventory/drift.ts 的差异：drift 的签名只含参数表/响应码/请求体 content-type，
 *    看不见 schema 内部变化（如 required 数组、枚举值），本模块做的是深度对比。
 * 2. 破坏性分级 severity：'breaking' | 'warning' | 'info'
 *    - breaking：删端点、删参数、加必填参数（含 optional→required）、改参数类型、
 *                删响应字段、响应字段类型变更、请求体字段 optional→required；
 *    - warning：参数改名、删请求体字段（服务端通常忽略，但契约已变）、枚举删值、删响应码；
 *    - info：新增端点、加可选参数/字段、新增响应码、枚举增值、描述类（summary）变更、
 *            required→optional（放宽）。
 * 3. reviewDiff(diff)：中文审查报告——变更计数、按 breaking 优先列出，
 *    并给出「建议更新用例」的方向（哪些测试需要重跑/修复）。
 *
 * 解析复用 src/inventory/openapi.ts 的 parseOpenApiText（调用方先解析成
 * OpenApiOperation[] 再传入），本模块不重复造解析器。
 */
import type { HttpMethod, JsonSchema } from '../types/models.js';
import type { OpenApiOperation, OpenApiParameter } from '../inventory/openapi.js';
import { keyOf } from '../inventory/normalize.js';

/** 破坏性分级 */
export type DiffSeverity = 'breaking' | 'warning' | 'info';

/** 变化点归属范围 */
export type ChangeScope = 'parameter' | 'request_field' | 'response_field' | 'response_code' | 'documentational';

/** 单个变化点（modified 端点内的一条具体差异） */
export interface SpecChange {
  scope: ChangeScope;
  severity: DiffSeverity;
  /** 中文人话描述，如「参数 verbose: optional → required」 */
  detail: string;
}

/** 端点级差异 */
export interface EndpointDiff {
  method: HttpMethod;
  /** 规范化路径（动态段 :param） */
  path: string;
  kind: 'added' | 'removed' | 'modified';
  /** 端点级严重度：added=info、removed=breaking、modified=其变化点最高级 */
  severity: DiffSeverity;
  /** modified 时的具体变化点（added/removed 为空数组） */
  changes: SpecChange[];
}

/** 两版 spec 的 diff 结果 */
export interface SpecDiff {
  /** 所有发生变更的端点（added/removed/modified），breaking 优先 */
  endpoints: EndpointDiff[];
  /** 变化点级计数（端点 added/removed 各计 1 条） */
  counts: { breaking: number; warning: number; info: number };
}

/** severity 排序权重（breaking > warning > info） */
const SEVERITY_RANK: Record<DiffSeverity, number> = { breaking: 3, warning: 2, info: 1 };

/** 取两者中更严重的级别 */
function maxSeverity(a: DiffSeverity, b: DiffSeverity): DiffSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

// ---------- JsonSchema 取值工具（宽松类型，缺省安全回退） ----------

function propsOf(schema: JsonSchema | undefined): Record<string, JsonSchema> {
  const p = schema?.properties;
  return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Record<string, JsonSchema>) : {};
}

function requiredOf(schema: JsonSchema | undefined): Set<string> {
  const r = schema?.required;
  return new Set(Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []);
}

function typeOf(schema: JsonSchema | undefined): string {
  return typeof schema?.type === 'string' ? schema.type : '';
}

function enumOf(schema: JsonSchema | undefined): unknown[] {
  return Array.isArray(schema?.enum) ? schema.enum : [];
}

/** 枚举值展示（字符串原样，其余 JSON 化） */
function fmtValue(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// ---------- 变化点构造 ----------

function change(scope: ChangeScope, severity: DiffSeverity, detail: string): SpecChange {
  return { scope, severity, detail };
}

/**
 * 两个同名字段的对比（类型 / 枚举 / required 翻转），产出 0..n 条变化点。
 * fieldDesc 为该字段的人话标识（如「请求体字段 email」「参数 query:verbose」）。
 */
function diffField(
  scope: ChangeScope,
  fieldDesc: string,
  oldProp: JsonSchema,
  newProp: JsonSchema,
  oldRequired: boolean,
  newRequired: boolean,
): SpecChange[] {
  const out: SpecChange[] = [];
  const oldType = typeOf(oldProp);
  const newType = typeOf(newProp);
  if (oldType && newType && oldType !== newType) {
    out.push(change(scope, 'breaking', `${fieldDesc} 类型 ${oldType} → ${newType}`));
  }
  // 枚举对比：删值更严重（旧调用方仍可能传被删的值）
  const oldEnum = enumOf(oldProp);
  const newEnum = enumOf(newProp);
  if (oldEnum.length > 0 || newEnum.length > 0) {
    const removed = oldEnum.filter((v) => !newEnum.includes(v));
    const added = newEnum.filter((v) => !oldEnum.includes(v));
    if (removed.length > 0) {
      out.push(change(scope, 'warning', `${fieldDesc} 枚举删除值 ${removed.map(fmtValue).join('、')}`));
    } else if (added.length > 0) {
      out.push(change(scope, 'info', `${fieldDesc} 枚举新增值 ${added.map(fmtValue).join('、')}`));
    }
  }
  // required 翻转：收紧为 breaking（旧调用方不传会失败），放宽为 info
  if (!oldRequired && newRequired) {
    out.push(change(scope, 'breaking', `${fieldDesc}: optional → required`));
  } else if (oldRequired && !newRequired) {
    out.push(change(scope, 'info', `${fieldDesc}: required → optional（放宽）`));
  }
  return out;
}

/** 一段 schema（请求体或某状态码响应）的字段级对比 */
function diffSchema(scope: ChangeScope, where: string, oldSchema: JsonSchema | undefined, newSchema: JsonSchema | undefined): SpecChange[] {
  const out: SpecChange[] = [];
  const oldProps = propsOf(oldSchema);
  const newProps = propsOf(newSchema);
  const oldReq = requiredOf(oldSchema);
  const newReq = requiredOf(newSchema);

  for (const [field, newProp] of Object.entries(newProps)) {
    const oldProp = oldProps[field];
    if (!oldProp) {
      // 新增字段：必填为 breaking，可选为 info
      if (newReq.has(field)) {
        out.push(change(scope, 'breaking', `${where}新增必填字段 ${field}`));
      } else {
        out.push(change(scope, 'info', `${where}新增可选字段 ${field}`));
      }
      continue;
    }
    out.push(...diffField(scope, `${where}字段 ${field}`, oldProp, newProp, oldReq.has(field), newReq.has(field)));
  }
  // 删除字段：响应字段删除 = breaking（消费方读不到）；请求字段删除 = warning（服务端一般忽略）
  for (const field of Object.keys(oldProps)) {
    if (!(field in newProps)) {
      out.push(change(scope, scope === 'response_field' ? 'breaking' : 'warning', `${where}字段 ${field} 被移除`));
    }
  }
  return out;
}

/** 参数表对比（含改名启发式：同 in + 同类型的删增配对视为改名） */
function diffParameters(oldOp: OpenApiOperation, newOp: OpenApiOperation): SpecChange[] {
  const out: SpecChange[] = [];
  const paramKey = (p: OpenApiParameter) => `${p.in}:${p.name}`;
  const oldMap = new Map(oldOp.parameters.map((p) => [paramKey(p), p]));
  const newMap = new Map(newOp.parameters.map((p) => [paramKey(p), p]));

  let removed = oldOp.parameters.filter((p) => !newMap.has(paramKey(p)));
  const added = newOp.parameters.filter((p) => !oldMap.has(paramKey(p)));

  // 改名配对：同 in 且 schema 类型一致 → 视为一次改名（warning）；配对成功的从删/增两边剔除
  const addedPending = [...added];
  const removedPending: OpenApiParameter[] = [];
  for (const rp of removed) {
    const idx = addedPending.findIndex((ap) => ap.in === rp.in && typeOf(ap.schema) === typeOf(rp.schema));
    const renamedTo = idx !== -1 ? addedPending[idx] : undefined;
    if (renamedTo) {
      addedPending.splice(idx, 1);
      out.push(change('parameter', 'warning', `参数 ${rp.in}:${rp.name} 改名为 ${renamedTo.name}（旧名调用将失效）`));
    } else {
      removedPending.push(rp);
    }
  }
  removed = removedPending;

  for (const p of removed) {
    out.push(change('parameter', 'breaking', `参数 ${p.in}:${p.name} 被移除`));
  }
  for (const p of addedPending) {
    out.push(
      p.required
        ? change('parameter', 'breaking', `新增必填参数 ${p.in}:${p.name}（旧调用方不传会失败）`)
        : change('parameter', 'info', `新增可选参数 ${p.in}:${p.name}`),
    );
  }

  // 同名参数的 required / 类型 / 枚举 变化（required 翻转单独判，diffField 传相同标志避免重复）
  for (const [key, oldP] of oldMap) {
    const newP = newMap.get(key);
    if (!newP) continue;
    const fieldDesc = `参数 ${oldP.in}.${oldP.name}`;
    if (oldP.required !== newP.required) {
      out.push(
        newP.required
          ? change('parameter', 'breaking', `${fieldDesc}: optional → required`)
          : change('parameter', 'info', `${fieldDesc}: required → optional（放宽）`),
      );
    }
    out.push(...diffField('parameter', fieldDesc, oldP.schema ?? {}, newP.schema ?? {}, oldP.required, oldP.required));
  }
  return out;
}

/** 单个端点（主键相同）的深度对比：参数 / 响应码 / 响应 schema / 请求体 / 文档 */
function diffOperation(oldOp: OpenApiOperation, newOp: OpenApiOperation): SpecChange[] {
  const out: SpecChange[] = [];
  out.push(...diffParameters(oldOp, newOp));

  // 响应码级：删 = warning，增 = info；共有响应码对齐做 schema 对比
  const oldResp = new Map(oldOp.responses.map((r) => [r.status_code, r]));
  const newResp = new Map(newOp.responses.map((r) => [r.status_code, r]));
  for (const [code, resp] of oldResp) {
    if (!newResp.has(code)) {
      out.push(change('response_code', 'warning', `响应码 ${code} 被移除`));
    } else {
      out.push(...diffSchema('response_field', `响应 ${code} `, resp.schema, newResp.get(code)?.schema));
    }
  }
  for (const code of newResp.keys()) {
    if (!oldResp.has(code)) {
      out.push(change('response_code', 'info', `新增响应码 ${code}`));
    }
  }

  // 请求体 schema（请求体有无的翻转也计变化点）
  if (oldOp.request_body?.schema && newOp.request_body?.schema) {
    out.push(...diffSchema('request_field', '请求体 ', oldOp.request_body.schema, newOp.request_body.schema));
  } else if (oldOp.request_body?.schema && !newOp.request_body?.schema) {
    out.push(change('request_field', 'warning', '请求体被移除'));
  } else if (!oldOp.request_body?.schema && newOp.request_body?.schema) {
    out.push(change('request_field', 'info', '新增请求体'));
  }

  // 纯文档变更（summary / operationId）
  if (oldOp.summary !== newOp.summary || oldOp.operation_id !== newOp.operation_id) {
    out.push(change('documentational', 'info', '文档变更（summary / operationId），不影响契约'));
  }
  return out;
}

/**
 * 核心入口：对比两版 spec（parseOpenApiText 产出的 operations 数组）。
 * 输出所有变更端点（breaking 优先、同级按 method+path 稳定排序）与变化点计数。
 */
export function diffSpecs(oldSpec: OpenApiOperation[], newSpec: OpenApiOperation[]): SpecDiff {
  const oldMap = new Map(oldSpec.map((op) => [keyOf(op.method, op.normalized_path), op]));
  const newMap = new Map(newSpec.map((op) => [keyOf(op.method, op.normalized_path), op]));

  const endpoints: EndpointDiff[] = [];
  const counts = { breaking: 0, warning: 0, info: 0 };

  for (const [key, op] of newMap) {
    const old = oldMap.get(key);
    if (!old) {
      endpoints.push({ method: op.method, path: op.normalized_path, kind: 'added', severity: 'info', changes: [] });
      counts.info += 1;
      continue;
    }
    const changes = diffOperation(old, op);
    if (changes.length === 0) continue; // 深度对比无差异：不算变更
    const severity = changes.reduce<DiffSeverity>((acc, c) => maxSeverity(acc, c.severity), 'info');
    endpoints.push({ method: op.method, path: op.normalized_path, kind: 'modified', severity, changes });
    for (const c of changes) counts[c.severity] += 1;
  }

  for (const [key, op] of oldMap) {
    if (!newMap.has(key)) {
      endpoints.push({ method: op.method, path: op.normalized_path, kind: 'removed', severity: 'breaking', changes: [] });
      counts.breaking += 1;
    }
  }

  endpoints.sort((a, b) => {
    const rank = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (rank !== 0) return rank;
    return `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`);
  });
  return { endpoints, counts };
}

/** severity → 中文标签 */
const SEVERITY_LABEL: Record<DiffSeverity, string> = {
  breaking: 'BREAKING（破坏性）',
  warning: 'WARNING（需关注）',
  info: 'INFO（可安全合入）',
};

/**
 * 中文审查报告：变更计数 + 按 breaking 优先列出变化点 + 用例影响建议。
 * 报告结尾给出「建议更新用例」方向：breaking 项对应用例需修复重跑，
 * warning 项建议复核断言，info 项无需动作。
 */
export function reviewDiff(diff: SpecDiff): string {
  const { breaking, warning, info } = diff.counts;
  const total = breaking + warning + info;
  const lines: string[] = [];
  lines.push(`Spec Diff 审查：共 ${total} 处变更，其中破坏性 ${breaking} 处、需关注 ${warning} 处、可安全合入 ${info} 处。`);

  if (total === 0) {
    lines.push('两版 spec 无契约差异，无需更新用例。');
    return lines.join('\n');
  }

  lines.push('变更明细（breaking 优先）：');
  let index = 1;
  for (const ep of diff.endpoints) {
    const api = `${ep.method} ${ep.path}`;
    if (ep.kind === 'added') {
      lines.push(`${index}. [${ep.severity.toUpperCase()}] ${api} —— 新增端点`);
      index += 1;
    } else if (ep.kind === 'removed') {
      lines.push(`${index}. [${ep.severity.toUpperCase()}] ${api} —— 端点被移除，相关用例将全部失效`);
      index += 1;
    } else {
      for (const c of ep.changes) {
        lines.push(`${index}. [${c.severity.toUpperCase()}] ${api} —— ${c.detail}`);
        index += 1;
      }
    }
  }

  // 用例影响建议（breaking 优先给出动作方向）
  lines.push('建议更新用例：');
  if (breaking > 0) {
    lines.push(`- ${breaking} 处破坏性变更涉及的用例需要修复并重跑（断言目标 / 必填参数 / 响应字段已变化）。`);
  }
  if (warning > 0) {
    lines.push(`- ${warning} 处需关注变更建议复核相关断言（改名 / 删字段 / 枚举收窄可能命中旧断言）。`);
  }
  if (info > 0) {
    lines.push(`- ${info} 处 info 级变更为向后兼容，现有用例无需调整。`);
  }
  return lines.join('\n');
}
