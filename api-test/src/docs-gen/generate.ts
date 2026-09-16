/**
 * P2.6 AI 文档生成（Postbot 式）。
 *
 * 设计说明：
 * - 输入是「用例 collection」：TestCase[] 与 ApiDefinition[] 可混合（同一 API 的
 *   spec 定义与用例互为补充：schema 来自定义，示例/断言来自用例）；
 * - 项目常态是无 LLM：文档主体全部规则式生成（路径语义推断 + schema 模板渲染），
 *   polishWithLlm 仅作为预留接口，本票不实现调用；
 * - 输出为可直读的中文 Markdown：按 method+path 分组，每组含简介、参数表、
 *   响应示例、断言覆盖摘要、相关用例列表；
 * - 空 collection 输出诚实空态说明，不硬凑内容。
 *
 * 分组判据与 inventory 对齐：TestCase 的真实路径（如 /users/123）先经
 * normalizeTrafficPath 归一为 /users/:id，再与 ApiDefinition 的规范化路径合并。
 */
import type { ApiDefinition, HttpMethod, JsonSchema, TestCase } from '../types/models.js';
import { normalizeTrafficPath } from '../inventory/normalize.js';

/** 文档输入条目：测试用例或 API 定义，可混合 */
export type DocEntry = TestCase | ApiDefinition;

/** LLM 润色器（预留接口，本票不实现调用）：入参为规则式产出，返回润色后的中文概述 */
export type LlmPolisher = (input: { method: string; path: string; summary: string }) => Promise<string>;

/** 生成选项 */
export interface DocGenerateOptions {
  /** 文档大标题（默认「API 接口文档」） */
  title?: string;
  /** LLM 润色器（预留：传入后由后续版本在生成时调用，本票不实现） */
  polishWithLlm?: LlmPolisher;
}

/** 一个 API 分组：归一化 method+path 下的定义与用例 */
interface ApiGroup {
  method: HttpMethod;
  path: string;
  defs: ApiDefinition[];
  cases: TestCase[];
}

/** 参数表行：参数/位置/类型/必填/说明/示例 */
interface ParamRow {
  name: string;
  location: 'path' | 'query' | 'header' | 'body';
  type: string;
  required: string;
  description: string;
  example: string;
}

/** 响应码描述行 */
interface ResponseRow {
  code: string;
  description: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isTestCase(entry: DocEntry): entry is TestCase {
  return (entry as TestCase).request !== undefined;
}

/** 路径段 → 中文资源名（常见领域词典，未命中回退英文原文） */
const RESOURCE_ZH: Record<string, string> = {
  user: '用户',
  users: '用户',
  order: '订单',
  orders: '订单',
  product: '商品',
  products: '商品',
  post: '文章',
  posts: '文章',
  payment: '支付',
  payments: '支付',
  auth: '认证',
  session: '会话',
  sessions: '会话',
  file: '文件',
  files: '文件',
};

/** 末段是动作词时直接用动作（如 POST /auth/login → 登录） */
const ACTION_ZH: Record<string, string> = {
  login: '登录',
  logout: '登出',
  register: '注册',
  search: '搜索',
  export: '导出',
  import: '导入',
  upload: '上传',
  verify: '校验',
};

/** method → 中文动词（资源语义推断主依据） */
const METHOD_VERB_ZH: Record<string, string> = {
  GET: '查询',
  POST: '创建',
  PUT: '更新',
  PATCH: '部分更新',
  DELETE: '删除',
  HEAD: '检查',
  OPTIONS: '探测',
};

/** 常见 header 名的中文说明（参数表「说明」列兜底来源之一） */
const HEADER_DESC_ZH: Record<string, string> = {
  authorization: '认证凭据',
  'x-api-key': 'API 密钥',
  'x-request-id': '请求追踪 ID',
  accept: '可接受的内容类型',
};

/**
 * 规则式概述：从 method + path 推断一句话语义。
 * - 末段命中动作词典 → 直接用动作（登录/导出…）；
 * - 资源名取最后一个静态段（:param 段不算），去复数后查词典；
 * - GET/PUT/PATCH/DELETE 且路径带动态段 → 单资源（详情），否则 GET 视为列表。
 */
export function inferSummary(method: string, path: string): string {
  const segments = path.split('/').filter((s) => s !== '' && !s.startsWith(':'));
  const last = segments[segments.length - 1] ?? path;
  if (ACTION_ZH[last] !== undefined) return ACTION_ZH[last]!;
  const resourceRaw = segments.length > 0 ? last : '资源';
  const resource = RESOURCE_ZH[resourceRaw] ?? RESOURCE_ZH[resourceRaw.replace(/s$/, '')] ?? resourceRaw;
  const hasDynamic = /\/:[^/]+/.test(path);
  const verb = METHOD_VERB_ZH[method.toUpperCase()] ?? '调用';
  if (method.toUpperCase() === 'GET') {
    return hasDynamic ? `查询${resource}详情` : `查询${resource}列表`;
  }
  return `${verb}${resource}`;
}

/** 从 JsonSchema 递归生成响应示例（规则式 mock，规则同 generator 模块思路但保持独立轻量实现） */
function sampleFromSchema(schema: JsonSchema | undefined, depth = 0): unknown {
  const record = asRecord(schema);
  if (!record || depth > 4) return null;
  if (record.example !== undefined) return record.example;
  if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum[0];
  const type = record.type;
  if (type === 'string') {
    const format = typeof record.format === 'string' ? record.format : '';
    if (format === 'email') return 'user@example.com';
    if (format === 'date-time') return '2026-01-01T00:00:00Z';
    if (format === 'uri') return 'https://example.com';
    return 'string';
  }
  if (type === 'integer' || type === 'number') {
    if (typeof record.minimum === 'number') return record.minimum;
    return 0;
  }
  if (type === 'boolean') return true;
  if (type === 'array') {
    const item = sampleFromSchema(asRecord(record.items), depth + 1);
    return item === null ? [] : [item];
  }
  const properties = asRecord(record.properties);
  if (properties) {
    const out: Record<string, unknown> = {};
    for (const [name, raw] of Object.entries(properties)) {
      const prop = asRecord(raw);
      // 无类型且无子结构的字段（如 additionalProperties 型自由对象）给空对象占位
      out[name] = prop ? sampleFromSchema(prop, depth + 1) : null;
    }
    return out;
  }
  return null;
}

/** 表格单元格转义：竖线与换行会破坏 Markdown 表格结构 */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 参数表构建：path 段 → query/header（用例聚合）→ body（schema 属性） */
function buildParamRows(group: ApiGroup): ParamRow[] {
  const rows: ParamRow[] = [];

  // 1) path 参数：路径里的 :name 段，类型按 string，必填恒为是
  const pathParams = group.path.match(/\/:([^/]+)/g) ?? [];
  for (const seg of pathParams) {
    const name = seg.slice(2);
    rows.push({ name, location: 'path', type: 'string', required: '是', description: '路径参数', example: '-' });
  }

  // 2) query / header 参数：从用例的真实请求聚合（首个出现值为示例）
  const querySeen = new Map<string, string>();
  const headerSeen = new Map<string, string>();
  for (const c of group.cases) {
    for (const [name, values] of Object.entries(c.request.query_params)) {
      if (!querySeen.has(name) && values.length > 0) querySeen.set(name, values.join(','));
    }
    for (const [name, value] of Object.entries(c.request.headers)) {
      const lower = name.toLowerCase();
      // content-type/length 属于传输细节，不进参数表
      if (lower === 'content-type' || lower === 'content-length' || lower === 'host') continue;
      if (!headerSeen.has(lower)) headerSeen.set(lower, value);
    }
  }
  for (const [name, example] of querySeen) {
    const isNumeric = example !== '' && /^\d+$/.test(example);
    rows.push({ name, location: 'query', type: isNumeric ? 'integer' : 'string', required: '否', description: '查询参数（来自用例）', example });
  }
  for (const [name, example] of headerSeen) {
    rows.push({ name, location: 'header', type: 'string', required: '否', description: HEADER_DESC_ZH[name] ?? '请求头（来自用例）', example });
  }

  // 3) body 参数：取第一个带 request_schema 的定义，字段名/类型/必填/说明来自 schema
  const schemaDef = group.defs.find((d) => asRecord(d.request_schema) !== undefined);
  const schema = asRecord(schemaDef?.request_schema);
  const properties = asRecord(schema?.properties);
  const requiredFields = new Set(Array.isArray(schema?.required) ? (schema?.required as unknown[]).filter((v): v is string => typeof v === 'string') : []);
  // 示例值优先取用例真实请求体里的同名字段
  let caseBody: Record<string, unknown> | undefined;
  for (const c of group.cases) {
    if (!c.request.body) continue;
    try {
      const parsed: unknown = JSON.parse(c.request.body);
      const rec = asRecord(parsed);
      if (rec) {
        caseBody = rec;
        break;
      }
    } catch {
      // 非 JSON 请求体，跳过
    }
  }
  if (properties) {
    for (const [name, raw] of Object.entries(properties)) {
      const prop = asRecord(raw);
      const type = typeof prop?.type === 'string' ? prop.type : 'unknown';
      const description = typeof prop?.description === 'string' ? prop.description : inferFieldDescription(name);
      const example = caseBody && caseBody[name] !== undefined ? formatExample(caseBody[name]) : '-';
      rows.push({ name, location: 'body', type, required: requiredFields.has(name) ? '是' : '否', description, example });
    }
  }
  return rows;
}

/** 字段名 → 中文说明（schema 无 description 时的兜底猜测） */
function inferFieldDescription(name: string): string {
  const dict: Record<string, string> = {
    id: '唯一标识',
    name: '名称',
    email: '邮箱',
    password: '密码',
    age: '年龄',
    phone: '手机号',
    status: '状态',
    page: '页码',
    limit: '每页数量',
    offset: '偏移量',
    token: '令牌',
    created_at: '创建时间',
    updated_at: '更新时间',
  };
  return dict[name.toLowerCase()] ?? `字段 ${name}`;
}

function formatExample(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** 响应码表：ApiDefinition 无逐码信息（schema 只取代表），此处从用例断言的 status 期望聚合 */
function buildResponseRows(group: ApiGroup): ResponseRow[] {
  const rows = new Map<string, string>();
  for (const c of group.cases) {
    for (const a of c.assertions) {
      if (a.type === 'status' && a.expected !== undefined) {
        const code = String(a.expected);
        if (!rows.has(code)) rows.set(code, `用例「${c.name}」期望的响应码`);
      }
    }
  }
  // 无用例时若定义带响应 schema，给出 200 占位说明
  if (rows.size === 0 && group.defs.some((d) => d.response_schema !== undefined)) {
    rows.set('200', '定义中声明了响应体 schema（成功响应）');
  }
  return [...rows.entries()].map(([code, description]) => ({ code, description }));
}

/** 断言覆盖摘要：按 type 计数 */
function assertionSummary(group: ApiGroup): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of group.cases) {
    for (const a of c.assertions) {
      counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    }
  }
  return counts;
}

/** 响应示例：优先定义的 response_schema，其次从断言期望拼最小对象，都没有则空态说明 */
function buildResponseExample(group: ApiGroup): string | null {
  const schemaDef = group.defs.find((d) => asRecord(d.response_schema) !== undefined);
  const schema = asRecord(schemaDef?.response_schema);
  if (schema) {
    const sample = sampleFromSchema(schema);
    return sample === null ? null : `${JSON.stringify(sample, null, 2)}`;
  }
  // 从断言的 field/jsonpath 期望值拼一个最小示例对象
  const fields: Record<string, unknown> = {};
  for (const c of group.cases) {
    for (const a of c.assertions) {
      if ((a.type === 'field' || a.type === 'jsonpath') && a.target && a.expected !== undefined) {
        const key = a.type === 'jsonpath' ? a.target.replace(/^\$\.?/, '') : a.target;
        if (!(key in fields)) fields[key] = a.expected;
      }
    }
  }
  return Object.keys(fields).length > 0 ? JSON.stringify(fields, null, 2) : null;
}

/** 分组：TestCase 真实路径归一后与 ApiDefinition 规范路径按 method+path 合并 */
function groupEntries(entries: DocEntry[]): ApiGroup[] {
  const groups = new Map<string, ApiGroup>();
  for (const entry of entries) {
    if (isTestCase(entry)) {
      const path = normalizeTrafficPath(entry.request.path);
      const key = `${entry.request.method} ${path}`;
      const group = groups.get(key) ?? { method: entry.request.method, path, defs: [], cases: [] };
      group.cases.push(entry);
      groups.set(key, group);
    } else {
      const key = `${entry.method} ${entry.path}`;
      const group = groups.get(key) ?? { method: entry.method, path: entry.path, defs: [], cases: [] };
      group.defs.push(entry);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

/** 单个 API 分组渲染为 Markdown 段落 */
function renderGroup(group: ApiGroup): string {
  const lines: string[] = [];
  const summary = inferSummary(group.method, group.path);
  lines.push(`## ${group.method} ${group.path}`);
  lines.push('');
  // 简介行：一句话语义 + 元信息（tags / auto_tags / 用例数 / 断言数）
  const meta: string[] = [summary];
  const tags = [...new Set(group.defs.flatMap((d) => d.tags))];
  if (tags.length > 0) meta.push(`标签：${tags.join(', ')}`);
  const autoTags = [...new Set(group.defs.flatMap((d) => d.auto_tags ?? []))];
  if (autoTags.length > 0) meta.push(`自动标注：${autoTags.join(', ')}`);
  meta.push(`用例 ${group.cases.length} 个`);
  meta.push(`断言 ${group.cases.reduce((sum, c) => sum + c.assertions.length, 0)} 条`);
  lines.push(`${group.method} ${group.path} —— ${meta.join('；')}`);
  lines.push('');

  // 参数表
  const rows = buildParamRows(group);
  lines.push('### 请求参数');
  lines.push('');
  if (rows.length === 0) {
    lines.push('> 无参数（未从定义或用例中发现任何 path/query/header/body 参数）。');
  } else {
    lines.push('| 参数 | 位置 | 类型 | 必填 | 说明 | 示例 |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const r of rows) {
      lines.push(`| ${cell(r.name)} | ${r.location} | ${r.type} | ${r.required} | ${cell(r.description)} | ${cell(r.example)} |`);
    }
  }
  lines.push('');

  // 响应码表
  const responses = buildResponseRows(group);
  lines.push('### 响应码');
  lines.push('');
  if (responses.length === 0) {
    lines.push('> 暂无响应码信息（定义未声明响应 schema，用例也未断言 status）。');
  } else {
    lines.push('| 状态码 | 说明 |');
    lines.push('| --- | --- |');
    for (const r of responses) {
      lines.push(`| ${r.code} | ${cell(r.description)} |`);
    }
  }
  lines.push('');

  // 响应示例
  lines.push('### 响应示例');
  lines.push('');
  const example = buildResponseExample(group);
  if (example === null) {
    lines.push('> 暂无响应示例（无 response_schema，用例也未携带可拼装的字段期望）。');
  } else {
    lines.push('```json');
    lines.push(example);
    lines.push('```');
  }
  lines.push('');

  // 断言覆盖摘要
  const summaryCounts = assertionSummary(group);
  lines.push('### 断言覆盖摘要');
  lines.push('');
  if (summaryCounts.size === 0) {
    lines.push('> 暂无断言（该 API 下无用例，或用例未配置断言）。');
  } else {
    for (const [type, count] of [...summaryCounts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`- ${type}：${count} 条`);
    }
  }
  lines.push('');

  // 相关用例列表
  lines.push('### 相关用例');
  lines.push('');
  if (group.cases.length === 0) {
    lines.push('> 暂无用例（仅有 API 定义，尚未生成或录制用例）。');
  } else {
    lines.push('| 用例 | 来源 | 最近结果 | 审阅状态 |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of group.cases) {
      lines.push(`| ${cell(c.name)} | ${c.source} | ${c.last_result} | ${c.review_status} |`);
    }
  }
  return lines.join('\n');
}

/**
 * 生成整个 collection 的 API 文档（Markdown）。
 *
 * @param entries 用例与 API 定义的混合列表（可只传其一）
 * @param opts   可选项：title 文档标题；polishWithLlm 预留（本票不实现调用）
 * @returns 完整 Markdown 字符串；空输入时返回空态说明
 */
export function generateApiDoc(entries: DocEntry[], opts?: DocGenerateOptions): string {
  const title = opts?.title ?? 'API 接口文档';
  // 空态：诚实说明而不是输出半截结构
  if (!Array.isArray(entries) || entries.length === 0) {
    return [
      `# ${title}`,
      '',
      '> 暂无可生成文档的内容：输入的 collection 为空（没有用例，也没有 API 定义）。',
      '> 请先录制流量生成用例，或导入 OpenAPI spec / API 定义后再试。',
      '',
    ].join('\n');
  }

  const groups = groupEntries(entries);
  const header: string[] = [];
  header.push(`# ${title}`);
  header.push('');
  header.push(`- 生成时间：${new Date().toISOString()}`);
  header.push(`- API 数量：${groups.length}`);
  header.push(`- 用例数量：${entries.filter(isTestCase).length}`);
  header.push(`- 生成方式：规则式模板渲染（无 LLM 依赖）`);
  header.push('');
  header.push('## 目录');
  header.push('');
  for (const g of groups) {
    const anchor = `${g.method}-${g.path}`.replace(/[^a-zA-Z0-9\u4e00-\u9fa5-]+/g, '-');
    header.push(`- [${g.method} ${g.path}](#${anchor.toLowerCase()})`);
  }
  header.push('');
  header.push('---');
  header.push('');

  const body = groups.map((g) => renderGroup(g)).join('\n---\n\n');
  return header.join('\n') + body;
}
