/**
 * P1.4 AI 语义标注：inventory 自动分类（规则式实现 + LLM 接口预留）。
 *
 * 给每条 api_definition 推导 auto_tags（自动标签，人工标注的补充而非替代）：
 * - security  : path 命中敏感关键词（auth/login/token/user/account/password/payment/order/pay）
 *               或需要认证（auth_type != none）；
 * - external  : host 与 spec servers 主域不同，或 path 前缀 /public/ /open/；
 * - deprecated: spec 里标记 deprecated 的 operation（status == deprecated）；
 * - internal  : 以上都不命中时的默认归类。
 *
 * 一个 API 可同时命中多类（如 login 接口既 security 又 internal 域）；internal 仅在
 * 没有任何其它命中时作为兜底，避免无信息量的重复标签。
 *
 * LLM 预留：classifyWithLLM(defs, llm)，llm 为 (prompt) => Promise<string> 的调用器，
 * 返回 JSON 行（{"id": ..., "tags": [...]}）；未传 llm 时退回规则式，行为与 classifyByRules 一致。
 */
import type { ApiDefinition } from '../types/models.js';

/** 自动标签类别 */
export type AutoTag = 'security' | 'external' | 'deprecated' | 'internal';

/** security 敏感路径关键词（命中即视为安全敏感接口） */
const SECURITY_KEYWORDS = ['auth', 'login', 'token', 'user', 'account', 'password', 'payment', 'order', 'pay'];

/** external 路径前缀（开放接口惯例） */
const EXTERNAL_PREFIXES = ['/public/', '/open/'];

/** 主域提取：取 hostname 第一段（api.example.com / v2.example.com → example.com） */
function registrableDomain(host: string): string {
  try {
    const url = new URL(host.includes('://') ? host : `https://${host}`);
    const parts = url.hostname.split('.');
    // 至少两段才裁剪子域；形如 localhost / 内网名原样返回
    return parts.length > 2 ? parts.slice(-2).join('.') : url.hostname;
  } catch {
    return host;
  }
}

/** host 的主域是否与 base 不同（空 base 视为同域，无法判定时不打 external） */
export function isExternalHost(host: string, baseHost: string): boolean {
  if (!host || !baseHost) return false;
  return registrableDomain(host) !== registrableDomain(baseHost);
}

/** path 是否命中敏感关键词 */
export function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SECURITY_KEYWORDS.some((kw) => lower.includes(kw));
}

/** 是否 external 前缀（兼容 path 本身就是 /public 或 /open 的写法） */
export function hasExternalPrefix(path: string): boolean {
  const p = path.endsWith('/') ? path : `${path}/`;
  return EXTERNAL_PREFIXES.some((prefix) => p.startsWith(prefix) || p === prefix);
}

/** 分类选项 */
export interface ClassifyOptions {
  /**
   * 对比基准 host（主域），用于判定 external。
   * 缺省取全体 defs 中出现次数最多的 host（默认主域）；
   * 传 spec servers[0] 或网关域名更准确。
   */
  baseHost?: string;
}

/** 规则式分类：为一条 API 定义推导自动标签 */
export function classifyByRules(def: ApiDefinition, opts: ClassifyOptions = {}): AutoTag[] {
  const tags = new Set<AutoTag>();
  if (isSensitivePath(def.path) || def.auth_type !== 'none') tags.add('security');
  if (isExternalHost(def.host, opts.baseHost ?? '') || hasExternalPrefix(def.path)) tags.add('external');
  if (def.status === 'deprecated') tags.add('deprecated');
  if (tags.size === 0) tags.add('internal');
  return [...tags];
}

/** 推断默认基准 host：取 defs 中出现次数最多的 host（并列取字典序最小，保证稳定） */
function inferBaseHost(defs: ApiDefinition[]): string {
  const counts = new Map<string, number>();
  for (const def of defs) {
    if (!def.host) continue;
    counts.set(def.host, (counts.get(def.host) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [host, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = host;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 批量规则式分类：返回打上 auto_tags 的新数组（不修改入参，同 id 保留）。
 * baseHost 缺省用「多数派 host」推断。
 */
export function classifyDefinitions(defs: ApiDefinition[], opts: ClassifyOptions = {}): ApiDefinition[] {
  const baseHost = opts.baseHost ?? inferBaseHost(defs);
  return defs.map((def) => ({ ...def, auto_tags: classifyByRules(def, { baseHost }) }));
}

/** LLM 单次调用器：入参 prompt，出参期望为 JSON 行数组文本 */
export type LlmCaller = (prompt: string) => Promise<string>;

/** 构建分类 prompt（导出以便测试/调试检查 LLM 收到的指令） */
export function buildClassifyPrompt(defs: ApiDefinition[]): string {
  const items = defs.map((d) => ({ id: d.id, method: d.method, path: d.path, host: d.host, summary_hint: d.tags }));
  return [
    '你是 API 资产分类助手。给下列 API 打自动标签，可选值：security（敏感：认证/登录/令牌/用户/账务/支付/订单）、',
    'external（对外开放：非本域 host 或 /public/ /open/ 前缀）、deprecated（已废弃）、internal（默认内部接口）。',
    '一个 API 可多个标签；除 internal 外可并存，internal 仅作兜底。',
    '只输出 JSON 数组，每行形如 {"id":"...","tags":["..."]}，不要其它文本。',
    JSON.stringify(items),
  ].join('\n');
}

/** 解析 LLM 输出为 id → tags 映射（容错：截取首个 JSON 数组段） */
function parseLlmOutput(text: string): Map<string, AutoTag[]> {
  const map = new Map<string, AutoTag[]>();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end <= start) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return map;
  }
  if (!Array.isArray(parsed)) return map;
  const valid: AutoTag[] = ['security', 'external', 'deprecated', 'internal'];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    if (!id) continue;
    const tags = Array.isArray(rec.tags)
      ? rec.tags.filter((t): t is AutoTag => typeof t === 'string' && (valid as string[]).includes(t))
      : [];
    map.set(id, tags);
  }
  return map;
}

/**
 * P1.4 主接口：自动分类（规则式 + LLM 可选增强）。
 * - 未传 llm：等价 classifyDefinitions；
 * - 传了 llm：以规则结果为兜底，LLM 结果覆盖/补充（解析失败或缺失的条目保持规则值）。
 * 约束同 classifyDefinitions：只产出新数组，不改入参。
 */
export async function classifyWithLLM(
  defs: ApiDefinition[],
  llm?: LlmCaller,
  opts: ClassifyOptions = {},
): Promise<ApiDefinition[]> {
  const ruled = classifyDefinitions(defs, opts);
  if (!llm) return ruled;
  let llmTags: Map<string, AutoTag[]>;
  try {
    llmTags = parseLlmOutput(await llm(buildClassifyPrompt(defs)));
  } catch {
    return ruled; // LLM 调用失败：整体退回规则式
  }
  return ruled.map((def) => {
    const tags = llmTags.get(def.id);
    return tags && tags.length > 0 ? { ...def, auto_tags: tags } : def;
  });
}
