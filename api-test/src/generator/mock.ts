/**
 * 依赖 mock 生成（A3 → P1.3 结构化升级）：记录「该用例离线回放时依赖的下游响应快照」。
 *
 * 诚实范围说明：A2 代理录制的是「客户端 ↔ 目标服务」的请求/响应，看不到目标服务
 * 内部的 DB/下游调用。因此本阶段：
 * - 每个用例生成一个 http_downstream mock：以目标服务为「下游」，快照其响应，
 *   离线回放时用该快照 stub 目标服务；
 * - 若请求/响应体里出现指向「其它 host」的 URL（即目标服务转调下游的线索），
 *   额外生成一条 external mock 记录该下游引用。
 *
 * P1.3 结构化 mock（精度提升）：
 * - 旧版：响应 body 原样存死值——回放时动态字段（时间戳/随机 ID/token）必然过期；
 * - 新版：JSON body 解析为 schema 树（字段名 + 类型 + 样例值），mock 记录 schema
 *   而非死值；动态字段不存原值，回放时（materializeMockResponse）按 schema 生成
 *   「类型一致 + 动态占位」的响应，稳定字段保留录制样例值；
 * - 向后兼容：旧格式快照（无 format 字段的死值）仍可经 materializeMockResponse 原样回放。
 */
import type { TrafficRecord } from '../types/models.js';
import { classifyValue } from './noise.js';
import { parseJson, walkLeaves } from './schema.js';
import type { DependencyMock } from './types.js';

/**
 * mock schema 树节点：字段名由父节点的 properties 键承载，
 * 节点自身只记「类型 + 样例 + 动态标记」。
 */
export interface MockSchemaNode {
  /** 值类型（integer/number 拆分，回放时保持整数性） */
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  /** 标量样例值（稳定字段回放时直接复用；动态字段不存原值） */
  sample?: unknown;
  /** object 类型：子字段名 → 子节点 schema */
  properties?: Record<string, MockSchemaNode>;
  /** array 类型：元素 schema（取首个元素提取，空数组退化为 null 型） */
  items?: MockSchemaNode;
  /** 是否动态字段（时间戳/随机 ID/token 等噪音规则命中），回放时用占位生成 */
  dynamic?: boolean;
  /** 动态字段命中的噪音规则名（供占位生成选择形态） */
  noise_rule?: string;
}

/** 从 URL 提取 host；非法 URL 返回 null */
function hostOf(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/** 目标服务的 host（仅 host 部分，去掉 scheme） */
function targetHost(record: TrafficRecord): string {
  try {
    return new URL(record.host).host;
  } catch {
    return record.host;
  }
}

/**
 * 从 body 里发现指向「非目标 host」的 URL 引用（下游线索）。
 * 返回去重后的下游 host 列表。
 */
function detectDownstreamHosts(record: TrafficRecord, body: string | undefined): string[] {
  if (body === undefined) return [];
  const json = parseJson(body);
  if (json === undefined) return [];

  const self = targetHost(record);
  const hosts = new Set<string>();
  for (const leaf of walkLeaves(json)) {
    if (typeof leaf.value !== 'string') continue;
    const host = hostOf(leaf.value);
    if (host && host !== self) hosts.add(host);
  }
  return [...hosts];
}

/** JSON 值 → schema 树（叶子按噪音规则标注 dynamic；动态字段不存原值） */
export function extractSchemaTree(value: unknown, key = '$'): MockSchemaNode {
  // 数组：取首个元素作为元素 schema（多元素结构有差异时诚实取首例，人审兜底）
  if (Array.isArray(value)) {
    const item = value.length > 0 ? value[0] : undefined;
    return {
      type: 'array',
      items: item === undefined ? { type: 'null' } : extractSchemaTree(item, key),
    };
  }

  if (value === null) {
    return { type: 'null', sample: null };
  }

  if (typeof value === 'object') {
    const properties: Record<string, MockSchemaNode> = {};
    for (const [k, child] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = extractSchemaTree(child, k);
    }
    return { type: 'object', properties };
  }

  // 标量叶子：按（key, value）做噪音分类，命中则标 dynamic 且不存原值
  const rule = classifyValue(key, value);
  if (typeof value === 'boolean') {
    return { type: 'boolean', sample: value };
  }
  if (typeof value === 'number') {
    const node: MockSchemaNode = { type: Number.isInteger(value) ? 'integer' : 'number', sample: value };
    if (rule) {
      node.dynamic = true;
      node.noise_rule = rule;
    }
    return node;
  }
  // string：动态字段（时间戳/UUID/hex/token）不保存原值，仅记类型 + 规则
  const node: MockSchemaNode = { type: 'string' };
  if (rule) {
    node.dynamic = true;
    node.noise_rule = rule;
  } else {
    node.sample = value;
  }
  return node;
}

/** 动态字符串字段的形态保持占位（类型一致、值固定，便于识别为 mock 产物） */
function placeholderString(rule: string | undefined): string {
  switch (rule) {
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000';
    case 'hex_id':
      return '0'.repeat(24);
    case 'iso_timestamp':
      return '1970-01-01T00:00:00.000Z';
    case 'token_field':
    case 'token_header':
      return '<MOCK-TOKEN>';
    default:
      return '<MOCK-STRING>';
  }
}

/** 动态数字字段占位（类型一致即可，固定 0） */
function placeholderNumber(): number {
  return 0;
}

/** 按 schema 树生成回放值：结构递归、稳定字段用样例、动态字段用占位 */
export function generateMockValue(node: MockSchemaNode): unknown {
  switch (node.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(node.properties ?? {})) {
        out[k] = generateMockValue(child);
      }
      return out;
    }
    case 'array':
      // 回放生成单元素数组（元素结构完整保留）
      return [generateMockValue(node.items ?? { type: 'null' })];
    case 'null':
      return null;
    case 'boolean':
      return typeof node.sample === 'boolean' ? node.sample : false;
    case 'integer':
    case 'number': {
      if (node.dynamic) return placeholderNumber();
      return typeof node.sample === 'number' ? node.sample : 0;
    }
    case 'string': {
      if (node.dynamic) return placeholderString(node.noise_rule);
      return typeof node.sample === 'string' ? node.sample : '';
    }
  }
}

/** 新格式响应快照（schema 型）；旧格式为 { status_code, body } 死值（无 format 字段） */
export interface MockResponseSnapshot {
  status_code: number;
  /** 'schema' = 结构化（P1.3+）；'raw' = 非 JSON 原文；缺省 = 旧版死值快照 */
  format?: 'schema' | 'raw';
  /** format='schema' 时的 schema 树 */
  schema_tree?: MockSchemaNode;
  /** format='raw' / 旧格式时的原始 body */
  body?: unknown;
}

/**
 * 回放快照物化：把 mock 的响应快照转成可下发的响应体。
 * - 新格式（format='schema'）：按 schema 树生成（动态字段占位、稳定字段样例值）；
 * - 旧格式（无 format 字段的死值快照）：原样返回，向后兼容。
 */
export function materializeMockResponse(snapshot: unknown): { status_code: number; body: unknown } {
  const snap = (snapshot ?? {}) as Partial<MockResponseSnapshot>;
  if (snap.format === 'schema' && snap.schema_tree) {
    return {
      status_code: snap.status_code ?? 200,
      body: generateMockValue(snap.schema_tree),
    };
  }
  // 旧格式：死值原样回放（向后兼容）
  return { status_code: snap.status_code ?? 200, body: snap.body };
}

/**
 * 为一条录制记录生成依赖 mock 列表。
 * 至少包含「目标服务响应快照」一条，满足「该用例依赖的下游响应快照」的最低要求。
 * P1.3：JSON 响应存 schema 树而非死值；非 JSON 响应存原文（format='raw'）。
 */
export function generateMocks(record: TrafficRecord): DependencyMock[] {
  const mocks: DependencyMock[] = [];
  const parsed = parseJson(record.response_body);

  // 1. 目标服务响应快照（离线回放时 stub 目标服务）
  mocks.push({
    name: `target-${record.method.toLowerCase()}-${record.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
    kind: 'http_downstream',
    target: record.host,
    request_snapshot: {
      method: record.method,
      path: record.path,
      query_params: record.query_params,
    },
    response_snapshot:
      parsed !== undefined
        ? {
            status_code: record.status_code,
            format: 'schema',
            schema_tree: extractSchemaTree(parsed),
          }
        : {
            status_code: record.status_code,
            format: 'raw',
            body: record.response_body,
          },
    note: '录制自代理流量：离线回放时用该响应快照作为目标服务的 stub（P1.3 结构化：JSON 存 schema 树，回放按 schema 生成）。',
  });

  // 2. 下游引用线索（body 中出现指向其它 host 的 URL）
  for (const host of detectDownstreamHosts(record, record.response_body ?? '')) {
    mocks.push({
      name: `downstream-${host.replace(/[^a-zA-Z0-9]/g, '-')}`,
      kind: 'external',
      target: host,
      note: '响应体中发现指向其它 host 的引用，疑似目标服务转调的下游依赖，需人工确认。',
    });
  }

  return mocks;
}
