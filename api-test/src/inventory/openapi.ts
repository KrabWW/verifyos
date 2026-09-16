/**
 * OpenAPI v3 极简解析器（手写，无重依赖）。
 *
 * 只关心构建 API inventory 所需的子集：paths → operations（method / path / 参数 / 响应码 /
 * 请求体 schema / 安全方案），其余字段一律忽略，避免引入完整 OpenAPI schema 校验的复杂度。
 *
 * 输入支持 JSON 与 YAML：JSON 先走 JSON.parse（快速、严格），失败再回退 `yaml` 库解析。
 */
import { parse as parseYaml } from 'yaml';
import type { HttpMethod, JsonSchema } from '../types/models.js';
import { normalizeSpecPath } from './normalize.js';

/** OpenAPI 参数（宽松） */
export interface OpenApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required: boolean;
  schema?: JsonSchema;
}

/** 单个响应（按状态码） */
export interface OpenApiResponse {
  status_code: number;
  description?: string;
  content_type?: string;
  schema?: JsonSchema;
}

/** 请求体 */
export interface OpenApiRequestBody {
  content_type?: string;
  schema?: JsonSchema;
}

/** 一个 operation 的规范化中间表示（漂移检测的最小单位） */
export interface OpenApiOperation {
  method: HttpMethod;
  /** 原始 spec 路径（动态段用 `{id}`） */
  path: string;
  /** 规范化后路径（动态段 `:id`），作为 inventory 主键的一部分 */
  normalized_path: string;
  operation_id?: string;
  summary?: string;
  tags: string[];
  parameters: OpenApiParameter[];
  request_body?: OpenApiRequestBody;
  responses: OpenApiResponse[];
  /** 引用的安全方案名列表 */
  security: string[];
  /** spec 里标记的 deprecated（P1.4 自动分类依据，转 status 时使用） */
  deprecated?: boolean;
}

/** 安全方案（仅取判定 auth_type 需要的字段） */
export interface OpenApiSecurityScheme {
  type: string;
  scheme?: string;
}

/** 解析出的 OpenAPI 文档（子集） */
export interface OpenApiDocument {
  openapi: string;
  title?: string;
  version?: string;
  servers: string[];
  operations: OpenApiOperation[];
  security_schemes: Record<string, OpenApiSecurityScheme>;
}

/** 受支持的 HTTP method（`trace`/`connect` 不在 HttpMethod 内，忽略） */
const SUPPORTED_METHODS: Record<string, HttpMethod> = {
  get: 'GET',
  put: 'PUT',
  post: 'POST',
  delete: 'DELETE',
  options: 'OPTIONS',
  head: 'HEAD',
  patch: 'PATCH',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 解析文本为原始对象：先 JSON 快速路径，失败回退 YAML */
function parseToObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const parsed = parseYaml(text);
    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('OpenAPI 解析失败：内容为空或非对象');
    }
    return parsed as Record<string, unknown>;
  }
}

/** 解析 OpenAPI 文本（JSON 或 YAML），产出文档子集 */
export function parseOpenApiText(text: string): OpenApiDocument {
  return extractDocument(parseToObject(text));
}

function extractDocument(raw: Record<string, unknown>): OpenApiDocument {
  const info = asRecord(raw.info);
  const securitySchemes = extractSecuritySchemes(asRecord(raw.components)?.securitySchemes);
  const docSecurity = raw.security;
  const operations: OpenApiOperation[] = [];

  const paths = asRecord(raw.paths) ?? {};
  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = asRecord(pathItemRaw);
    if (!pathItem) continue;
    // path 级参数（对路径下所有 operation 生效）
    const pathLevelParams = extractParameters(pathItem.parameters);
    for (const [key, operationRaw] of Object.entries(pathItem)) {
      const method = SUPPORTED_METHODS[key.toLowerCase()];
      if (!method) continue;
      const op = asRecord(operationRaw);
      if (!op) continue;

      const params = mergeParameters(pathLevelParams, extractParameters(op.parameters));
      operations.push({
        method,
        path,
        normalized_path: normalizeSpecPath(path),
        operation_id: typeof op.operationId === 'string' ? op.operationId : undefined,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        tags: extractStringArray(op.tags),
        parameters: params,
        request_body: extractRequestBody(op.requestBody),
        responses: extractResponses(op.responses),
        security: extractSecurityNames(op, docSecurity),
        deprecated: op.deprecated === true,
      });
    }
  }

  return {
    openapi: typeof raw.openapi === 'string' ? raw.openapi : '',
    title: typeof info?.title === 'string' ? info.title : undefined,
    version: typeof info?.version === 'string' ? info.version : undefined,
    servers: extractServers(raw.servers),
    operations,
    security_schemes: securitySchemes,
  };
}

function extractStringArray(value: unknown): string[] {
  return asArray(value).filter((v): v is string => typeof v === 'string');
}

function extractServers(value: unknown): string[] {
  const out: string[] = [];
  for (const itemRaw of asArray(value)) {
    if (typeof itemRaw === 'string') {
      out.push(itemRaw);
      continue;
    }
    const item = asRecord(itemRaw);
    if (item && typeof item.url === 'string') out.push(item.url);
  }
  return out;
}

function extractParameters(value: unknown): OpenApiParameter[] {
  const out: OpenApiParameter[] = [];
  for (const itemRaw of asArray(value)) {
    const item = asRecord(itemRaw);
    if (!item) continue;
    const name = typeof item.name === 'string' ? item.name : '';
    if (!name) continue;
    const location = item.in;
    if (location !== 'query' && location !== 'header' && location !== 'path' && location !== 'cookie') continue;
    out.push({
      name,
      in: location,
      required: item.required === true,
      schema: asRecord(item.schema),
    });
  }
  return out;
}

/** operation 级参数覆盖 path 级同名（name+in）参数 */
function mergeParameters(base: OpenApiParameter[], override: OpenApiParameter[]): OpenApiParameter[] {
  const map = new Map<string, OpenApiParameter>();
  for (const p of base) map.set(`${p.in}:${p.name}`, p);
  for (const p of override) map.set(`${p.in}:${p.name}`, p);
  return [...map.values()];
}

function extractResponses(value: unknown): OpenApiResponse[] {
  const responses = asRecord(value) ?? {};
  const out: OpenApiResponse[] = [];
  for (const [codeStr, responseRaw] of Object.entries(responses)) {
    const code = Number.parseInt(codeStr, 10);
    if (Number.isNaN(code)) continue; // 跳过 `default` 等非数字键
    const response = asRecord(responseRaw);
    if (!response) continue;
    const content = asRecord(response.content);
    const firstEntry = content ? Object.entries(content)[0] : undefined;
    const media = firstEntry ? asRecord(firstEntry[1]) : undefined;
    out.push({
      status_code: code,
      description: typeof response.description === 'string' ? response.description : undefined,
      content_type: firstEntry ? firstEntry[0] : undefined,
      schema: media ? asRecord(media.schema) : undefined,
    });
  }
  return out;
}

function extractRequestBody(value: unknown): OpenApiRequestBody | undefined {
  const requestBody = asRecord(value);
  const content = asRecord(requestBody?.content);
  if (!content) return undefined;
  const firstEntry = Object.entries(content)[0];
  if (!firstEntry) return undefined;
  const media = asRecord(firstEntry[1]);
  return {
    content_type: firstEntry[0],
    schema: media ? asRecord(media.schema) : undefined,
  };
}

/** operation 级 security 优先，回退文档级 security */
function extractSecurityNames(operation: Record<string, unknown>, docSecurity: unknown): string[] {
  const source = operation.security !== undefined ? operation.security : docSecurity;
  const names = new Set<string>();
  for (const itemRaw of asArray(source)) {
    const item = asRecord(itemRaw);
    if (item) for (const name of Object.keys(item)) names.add(name);
  }
  return [...names];
}

function extractSecuritySchemes(value: unknown): Record<string, OpenApiSecurityScheme> {
  const schemes = asRecord(value) ?? {};
  const out: Record<string, OpenApiSecurityScheme> = {};
  for (const [name, schemeRaw] of Object.entries(schemes)) {
    const scheme = asRecord(schemeRaw);
    if (!scheme) continue;
    out[name] = {
      type: typeof scheme.type === 'string' ? scheme.type : '',
      scheme: typeof scheme.scheme === 'string' ? scheme.scheme : undefined,
    };
  }
  return out;
}
