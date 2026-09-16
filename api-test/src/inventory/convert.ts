/**
 * OpenAPI 解析结果 → ApiDefinition 转换。
 *
 * 把 openapi.ts 产出的 `OpenApiDocument` 转成 `api_definition` 表条目：
 * - host 解析：优先 opts.host，其次 spec 的 servers[0]；
 * - 请求/响应 schema 各取一个代表（响应优先 2xx）；
 * - auth_type 由引用的安全方案判定；
 * - 其余字段（id/时间戳/默认值）在此补齐。
 */
import { randomUUID } from 'node:crypto';
import type { ApiDefinition, AuthType, JsonSchema } from '../types/models.js';
import type { OpenApiDocument, OpenApiOperation, OpenApiResponse, OpenApiSecurityScheme } from './openapi.js';

/** 导入选项：可用显式 host 覆盖 spec 的 servers */
export interface ImportOptions {
  host?: string;
}

/** 解析出首个 host（含 scheme），如 https://api.example.com */
export function resolveHost(doc: OpenApiDocument, opts?: ImportOptions): string {
  return opts?.host ?? doc.servers[0] ?? '';
}

/** 将整个 OpenAPI 文档转换为 api_definition 条目列表 */
export function operationsToDefinitions(doc: OpenApiDocument, opts?: ImportOptions): ApiDefinition[] {
  const host = resolveHost(doc, opts);
  const now = new Date().toISOString();
  return doc.operations.map((op) => operationToDefinition(op, host, doc.security_schemes, now));
}

function operationToDefinition(
  op: OpenApiOperation,
  host: string,
  schemes: Record<string, OpenApiSecurityScheme>,
  now: string,
): ApiDefinition {
  return {
    id: randomUUID(),
    method: op.method,
    path: op.normalized_path,
    host,
    version: undefined,
    spec_source: 'openapi',
    request_schema: op.request_body?.schema,
    response_schema: pickResponseSchema(op.responses),
    content_type: op.request_body?.content_type ?? firstResponseContentType(op.responses),
    auth_type: detectAuthType(op.security, schemes),
    tags: op.tags,
    scope: undefined,
    status: op.deprecated === true ? 'deprecated' : 'active',
    sample_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/** 响应 schema 代表：优先 2xx，其次任意首个 */
function pickResponseSchema(responses: OpenApiResponse[]): JsonSchema | undefined {
  const target = pickResponse(responses);
  return target?.schema;
}

function firstResponseContentType(responses: OpenApiResponse[]): string | undefined {
  return pickResponse(responses)?.content_type;
}

function pickResponse(responses: OpenApiResponse[]): OpenApiResponse | undefined {
  return responses.find((r) => r.status_code >= 200 && r.status_code < 300) ?? responses[0];
}

/** 根据引用的安全方案判定 auth_type（无安全方案 → none） */
export function detectAuthType(
  security: string[],
  schemes: Record<string, OpenApiSecurityScheme>,
): AuthType {
  if (security.length === 0) return 'none';
  for (const name of security) {
    const scheme = schemes[name];
    if (!scheme) continue;
    if (scheme.type === 'http') {
      if (scheme.scheme === 'bearer') return 'bearer';
      if (scheme.scheme === 'basic') return 'basic';
      return 'custom';
    }
    if (scheme.type === 'apiKey') return 'api_key';
    if (scheme.type === 'oauth2' || scheme.type === 'openIdConnect') return 'oauth2';
  }
  return 'custom';
}
