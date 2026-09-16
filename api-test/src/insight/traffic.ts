/**
 * P2.2 流量 AI 洞察：录制完成（或 HAR 导入）后自动生成中文总结，替代用户肉眼翻请求列表。
 *
 * 设计（项目常态无 LLM 配置，本模块为纯规则式实现）：
 * 1. analyzeTraffic(records)：把 TrafficRecord[] 聚合成 TrafficInsight——
 *    - apiCount：去重后的 API 数（method + 规范化路径；噪音与页面文档不计入）；
 *    - methodDistribution / domainDistribution：有效流量的方法与域名分布；
 *    - noiseCount：噪音流量条数（静态资源等，单出提示不参与统计）；
 *    - suggestions：建议优先测试清单（分层，每层一条中文建议），优先级规则：
 *      security 标注（复用 P1.4 inventory/classify 的敏感路径规则）
 *      > 写操作（POST/PUT/PATCH/DELETE）
 *      > 有错误响应（4xx/5xx）
 *      > 页面依赖接口（请求带 referer，页面加载即调用）
 *      > 其余。
 *      每个 API 只归入其命中的最高优先级层，避免重复。
 * 2. analyzeHar(har)：支持原始 HAR entry 输入——转换复用 recorder/classify.ts 的
 *    classifyRequest 分级启发式（与 cli/import-har.ts 同一套规则），再走 analyzeTraffic。
 * 3. renderInsight(insight)：控制台友好的自然中文总结。
 *
 * LLM 增强位（预留，本票不实现调用）：AnalyzeTrafficOptions.polishWithLlm。
 */
import type { HttpMethod, TrafficRecord } from '../types/models.js';
import { isSensitivePath } from '../inventory/classify.js';
import { normalizeTrafficPath } from '../inventory/normalize.js';
import { classifyRequest } from '../recorder/classify.js';

/** 方法分布条目 */
export interface MethodStat {
  method: HttpMethod;
  count: number;
}

/** 域名分布条目 */
export interface DomainStat {
  domain: string;
  count: number;
}

/** 流量洞察结果（renderInsight 的输入） */
export interface TrafficInsight {
  /** 去重后的 API 数（噪音与页面文档不计入） */
  apiCount: number;
  /** 有效流量的方法分布（按次数降序） */
  methodDistribution: MethodStat[];
  /** 有效流量的域名分布（按次数降序） */
  domainDistribution: DomainStat[];
  /** 噪音流量条数（is_noise / noise_flag / embedded 任一命中） */
  noiseCount: number;
  /** 建议优先测试清单（分层中文建议，优先级从高到低） */
  suggestions: string[];
}

/**
 * LLM 增强位（预留）。
 * 后续实现方向：传入 polishWithLlm 后，renderInsight 的中文总结可先交由
 * LLM 润色（输入 = 规则式统计数据 + 初稿文本，输出 = 润色后文本），
 * 数据段（分布统计）保持规则式不变；LLM 失败时回退规则式文本。
 * 本票不实现调用，字段仅作接口预留。
 */
export interface AnalyzeTrafficOptions {
  polishWithLlm?: (prompt: string) => Promise<string>;
}

/** 建议优先级分层（值越小优先级越高，与任务书规则一一对应） */
type SuggestionTier = 'security' | 'write' | 'error' | 'page_dependent' | 'rest';

const TIER_ORDER: SuggestionTier[] = ['security', 'write', 'error', 'page_dependent', 'rest'];

/** 敏感关键词 → 中文标签（用于建议文案；判定本身复用 isSensitivePath） */
const SENSITIVE_LABELS: Record<string, string> = {
  auth: '认证',
  login: '登录',
  token: '令牌',
  user: '用户',
  account: '账户',
  password: '密码',
  payment: '支付',
  order: '订单',
  pay: '支付',
};

/** 写操作方法集合 */
const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 单个 API（method + 规范化路径）在会话内的聚合 */
interface ApiAgg {
  method: HttpMethod;
  path: string;
  count: number;
  /** 命中的敏感关键词（小写，来自 SENSITIVE_LABELS） */
  sensitiveWords: string[];
  /** 4xx/5xx 次数（按状态码累计） */
  errors: Map<number, number>;
  /** 是否有带 referer 的调用（页面依赖信号） */
  hasReferer: boolean;
}

/** 判断一条记录是否噪音（P1.2 整条噪音标记 / A3 noise_flag / embedded 静态资源） */
function isNoiseRecord(r: TrafficRecord): boolean {
  return r.is_noise === true || r.noise_flag === true || r.request_class === 'embedded';
}

/** host（含 scheme）→ 域名（hostname），解析失败原样返回 */
function domainOf(host: string): string {
  try {
    return new URL(host).hostname;
  } catch {
    return host;
  }
}

/** 请求头里是否带 referer（页面加载发起的信号；头键统一小写存储） */
function hasReferer(r: TrafficRecord): boolean {
  const keys = Object.keys(r.request_headers);
  return keys.some((k) => k.toLowerCase() === 'referer' && r.request_headers[k] !== '');
}

/** 命中的敏感关键词列表（与 isSensitivePath 同一关键词集） */
function hitSensitiveWords(path: string): string[] {
  const lower = path.toLowerCase();
  return Object.keys(SENSITIVE_LABELS).filter((kw) => lower.includes(kw));
}

/** 单个 API 归入的最高优先级分层 */
function tierOf(agg: ApiAgg): SuggestionTier {
  if (agg.sensitiveWords.length > 0) return 'security';
  if (WRITE_METHODS.has(agg.method)) return 'write';
  if (agg.errors.size > 0) return 'error';
  if (agg.hasReferer) return 'page_dependent';
  return 'rest';
}

/** 分层 → 中文建议文案（apis 为该层的聚合列表） */
function tierSuggestion(tier: SuggestionTier, aggs: ApiAgg[]): string {
  const apiList = aggs.map((a) => `${a.method} ${a.path}`).join('、');
  switch (tier) {
    case 'security': {
      const words = new Set(aggs.flatMap((a) => a.sensitiveWords.map((w) => SENSITIVE_LABELS[w] ?? w)));
      return `登录鉴权类（security 标注）：${apiList} —— 涉及${[...words].join('/')}等敏感语义，建议优先测试`;
    }
    case 'write':
      return `写操作（POST/PUT/PATCH/DELETE）：${apiList} —— 状态变更类接口，需覆盖成功与失败分支`;
    case 'error': {
      const errorDetail = aggs
        .map((a) => `${a.method} ${a.path}（${[...a.errors.entries()].map(([c, n]) => `${c} x ${n}`).join('、')}）`)
        .join('、');
      return `有错误响应（4xx/5xx）：${errorDetail} —— 建议补异常场景与容错测试`;
    }
    case 'page_dependent':
      return `页面依赖接口：${apiList} —— 页面加载即调用，故障直接影响前端渲染，建议纳入冒烟`;
    default:
      return `其余接口：${apiList} —— 可按业务重要性补测`;
  }
}

/**
 * 核心分析：TrafficRecord[] → TrafficInsight。
 * 统计口径：method/domain 分布与 apiCount 均基于「有效流量」（噪音已剔除，
 * 页面文档 top_level 计入分布但不计入 apiCount）；噪音条数单列。
 */
export function analyzeTraffic(records: TrafficRecord[], _options: AnalyzeTrafficOptions = {}): TrafficInsight {
  // 1. 拆分有效流量与噪音
  const valid: TrafficRecord[] = [];
  let noiseCount = 0;
  for (const r of records) {
    if (isNoiseRecord(r)) {
      noiseCount += 1;
    } else {
      valid.push(r);
    }
  }

  // 2. 方法 / 域名分布（有效流量）
  const methodCounts = new Map<HttpMethod, number>();
  const domainCounts = new Map<string, number>();
  for (const r of valid) {
    methodCounts.set(r.method, (methodCounts.get(r.method) ?? 0) + 1);
    const domain = domainOf(r.host);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }
  const methodDistribution: MethodStat[] = [...methodCounts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method));
  const domainDistribution: DomainStat[] = [...domainCounts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

  // 3. 按 method + 规范化路径聚合 API（页面文档 top_level 不算 API）
  const apiMap = new Map<string, ApiAgg>();
  for (const r of valid) {
    if (r.request_class === 'top_level') continue;
    const path = normalizeTrafficPath(r.path);
    const key = `${r.method} ${path}`;
    let agg = apiMap.get(key);
    if (!agg) {
      agg = { method: r.method, path, count: 0, sensitiveWords: hitSensitiveWords(path), errors: new Map(), hasReferer: false };
      apiMap.set(key, agg);
    }
    agg.count += 1;
    if (r.status_code >= 400) {
      agg.errors.set(r.status_code, (agg.errors.get(r.status_code) ?? 0) + 1);
    }
    if (hasReferer(r)) agg.hasReferer = true;
  }

  // 4. 分层归组 → 建议清单（每 API 只归最高优先级层）
  const byTier = new Map<SuggestionTier, ApiAgg[]>();
  for (const agg of apiMap.values()) {
    const tier = tierOf(agg);
    const list = byTier.get(tier) ?? [];
    list.push(agg);
    byTier.set(tier, list);
  }
  const suggestions: string[] = [];
  for (const tier of TIER_ORDER) {
    const aggs = byTier.get(tier);
    if (aggs && aggs.length > 0) {
      suggestions.push(tierSuggestion(tier, aggs.sort((a, b) => a.path.localeCompare(b.path))));
    }
  }

  return {
    apiCount: apiMap.size,
    methodDistribution,
    domainDistribution,
    noiseCount,
    suggestions,
  };
}

/** 标准 HAR 的最小结构（只取转换所需字段，与 cli/import-har.ts 保持一致） */
export interface HarEntryLike {
  startedDateTime?: string;
  time?: number;
  request?: {
    method?: string;
    url?: string;
    headers?: Array<{ name: string; value: string }>;
    postData?: { text?: string };
  };
  response?: {
    status?: number;
    headers?: Array<{ name: string; value: string }>;
    content?: { text?: string; mimeType?: string };
  };
}

/** HAR entry → TrafficRecord（分级复用 recorder/classify.ts 的 classifyRequest，与 import-har.ts 同一套规则） */
function harEntryToRecord(entry: HarEntryLike, now: string): TrafficRecord | null {
  const urlRaw = entry.request?.url;
  if (!urlRaw) return null;
  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return null;
  }
  const headersToRecord = (headers: Array<{ name: string; value: string }> | undefined): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const h of headers ?? []) out[h.name.toLowerCase()] = h.value;
    return out;
  };
  const requestHeaders = headersToRecord(entry.request?.headers);
  const responseHeaders = headersToRecord(entry.response?.headers);
  const method = (entry.request?.method ?? 'GET').toUpperCase() as HttpMethod;
  const cls = classifyRequest({
    method,
    path: url.pathname,
    request_headers: requestHeaders,
    response_content_type: responseHeaders['content-type'],
  });
  const queryParams: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    (queryParams[k] ??= []).push(v);
  }
  return {
    id: `har-${now}-${Math.random().toString(36).slice(2, 10)}`,
    api_definition_id: null,
    timestamp: entry.startedDateTime ?? now,
    method,
    path: url.pathname,
    host: `${url.protocol}//${url.host}`,
    query_params: queryParams,
    request_headers: requestHeaders,
    request_body: entry.request?.postData?.text,
    status_code: entry.response?.status ?? 0,
    response_headers: responseHeaders,
    response_body: entry.response?.content?.text,
    latency_ms: Math.round(entry.time ?? 0),
    source: 'extension',
    request_class: cls.request_class,
    is_noise: cls.is_noise,
    noise_flag: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * HAR 输入的分析入口：{ log: { entries } } 或 entries 数组 → TrafficInsight。
 * 转换失败（无 URL / URL 非法）的条目跳过。
 */
export function analyzeHar(har: { log?: { entries?: HarEntryLike[] } } | HarEntryLike[], options: AnalyzeTrafficOptions = {}): TrafficInsight {
  const entries = Array.isArray(har) ? har : (har.log?.entries ?? []);
  const now = new Date().toISOString();
  const records: TrafficRecord[] = [];
  for (const entry of entries) {
    const r = harEntryToRecord(entry, now);
    if (r) records.push(r);
  }
  return analyzeTraffic(records, options);
}

/**
 * 渲染自然中文总结（控制台 / 报告友好）。
 * 结构：总览（记录数/去重 API/噪音）→ 分布 → 建议优先测试（编号列表）→ 噪音提示一句。
 */
export function renderInsight(insight: TrafficInsight): string {
  const lines: string[] = [];
  const validCount = insight.methodDistribution.reduce((sum, m) => sum + m.count, 0);
  lines.push(`本次录制共 ${validCount + insight.noiseCount} 条记录，有效 ${validCount} 条，去重后发现 ${insight.apiCount} 个 API。`);
  if (insight.methodDistribution.length > 0) {
    lines.push(`方法分布：${insight.methodDistribution.map((m) => `${m.method} ${m.count} 次`).join('、')}。`);
  }
  if (insight.domainDistribution.length > 0) {
    lines.push(`域名分布：${insight.domainDistribution.map((d) => `${d.domain} ${d.count} 条`).join('、')}。`);
  }
  if (insight.suggestions.length > 0) {
    lines.push('建议优先测试：');
    insight.suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  } else {
    lines.push('本次录制未发现可建议测试的接口。');
  }
  if (insight.noiseCount > 0) {
    lines.push(`噪音流量 ${insight.noiseCount} 条（静态资源等）已过滤，不参与统计。`);
  }
  return lines.join('\n');
}
