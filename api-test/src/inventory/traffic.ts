/**
 * 流量聚合：无 spec 时，从录制流量（TrafficRecord）反推 API 清单。
 *
 * 复用 A2 的 TrafficRecord 模型/数据。同 method + 规范化 path 聚合为一条 api_definition，
 * 例如 `/users/123` 与 `/users/456` 聚合为 `/users/:id`。sample_count 记录该组流量样本数。
 */
import { randomUUID } from 'node:crypto';
import type { ApiDefinition, HttpMethod, TrafficRecord } from '../types/models.js';
import { keyOf, normalizeTrafficPath } from './normalize.js';

/** 聚合选项：可用显式 host 覆盖（缺省取该组流量自身的 host） */
export interface TrafficAggregateOptions {
  host?: string;
}

interface TrafficGroup {
  method: HttpMethod;
  path: string;
  host: string;
  records: TrafficRecord[];
}

/** 从录制流量聚合出 api_definition 条目列表 */
export function aggregateTraffic(records: TrafficRecord[], opts?: TrafficAggregateOptions): ApiDefinition[] {
  const groups = new Map<string, TrafficGroup>();
  for (const record of records) {
    const path = normalizeTrafficPath(record.path);
    const key = keyOf(record.method, path);
    const group = groups.get(key);
    if (group) {
      group.records.push(record);
      continue;
    }
    groups.set(key, { method: record.method, path, host: record.host, records: [record] });
  }

  const now = new Date().toISOString();
  const out: ApiDefinition[] = [];
  for (const group of groups.values()) {
    out.push({
      id: randomUUID(),
      method: group.method,
      path: group.path,
      host: opts?.host ?? group.host,
      version: undefined,
      spec_source: 'recorded',
      request_schema: undefined,
      response_schema: undefined,
      content_type: inferContentType(group.records),
      auth_type: 'none',
      tags: [],
      scope: undefined,
      status: 'active',
      sample_count: group.records.length,
      created_at: now,
      updated_at: now,
    });
  }
  return out;
}

/** 大小写不敏感地读取 header 值 */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/** 从该组流量样本里推断 content-type（请求头优先，其次响应头） */
function inferContentType(records: TrafficRecord[]): string | undefined {
  for (const record of records) {
    const fromRequest = headerValue(record.request_headers, 'content-type');
    if (fromRequest) return fromRequest;
    const fromResponse = headerValue(record.response_headers, 'content-type');
    if (fromResponse) return fromResponse;
  }
  return undefined;
}
