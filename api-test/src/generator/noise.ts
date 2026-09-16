/**
 * 噪音检测（A3 核心）：自动识别 volatile 字段。
 *
 * 识别三类噪音（对标 Keploy 的 traffic-to-tests 降 flake）：
 * - 时间戳：ISO8601 字符串 / 数字时间戳（秒级/毫秒级）；
 * - 随机 ID：UUID / 长 hex（mongo ObjectId 等）/ 自增整数 ID（id / *_id）；
 * - token：authorization 等 header、body/query 里的 token/secret/password 字段。
 *
 * 命中结果用于两处：
 * - 断言生成：噪音字段标为「忽略」（仅断言存在性），非噪音字段严格相等；
 * - 请求/依赖快照脱敏：token 等敏感值打码，不把真实凭据写进用例。
 *
 * 诚实说明：以上均为启发式，存在误判（如把普通日期当时间戳、把长数字当 ID），
 * 因此生成结果默认 review_status=pending，仍需人工审阅（见 README caveat）。
 */
import type { NoiseRule } from './types.js';

/** token 类 header（大小写不敏感）：命中则整个 header 值视为敏感，脱敏处理 */
const TOKEN_HEADER_RE =
  /^(authorization|proxy-authorization|x-api-key|x-api-secret|x-auth-token|x-access-token|cookie|set-cookie)$/i;

/** token 类字段名（body/query）：命中则字段值视为敏感 */
const TOKEN_KEY_RE =
  /token|secret|password|passwd|api[_-]?key|apikey|session|credential|authorization|jwt|cookie|bearer/i;

/** 时间类字段名：命中则数字值视为时间戳、裸日期视为时间戳 */
const TIME_KEY_RE =
  /timestamp|datetime|epoch|expire|expires|created|updated|modified|deleted|last_seen|seen_at|issued|expiry|(^|_)(time|date|ts)$/i;

/** ID 类字段名：id / *_id / uuid / uid / guid */
const ID_KEY_RE = /(^|_)id$|^uuid$|^uid$|^guid$/i;

/** UUID：8-4-4-4-12 十六进制 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 长 hex（mongo ObjectId 24 位 / 长随机 hex） */
const HEX_ID_RE = /^[0-9a-f]{16,}$/i;

/** ISO8601 日期时间：含时间部分（T/空格 + 时:分:秒） */
const ISO_DATETIME_RE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})?$/;

/** ISO8601 裸日期：YYYY-MM-DD（仅配合时间类字段名命中，避免误判普通日期） */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 数字时间戳安全区间：秒级约 2001~2036、毫秒级约 2001~2036，避免误判手机号等 11 位数字 */
const SEC_MIN = 1_000_000_000;
const SEC_MAX = 2_100_000_000;
const MS_MIN = 1_000_000_000_000;
const MS_MAX = 2_100_000_000_000;

function isTimeKey(key: string): boolean {
  return TIME_KEY_RE.test(key);
}

function isIdKey(key: string): boolean {
  return ID_KEY_RE.test(key);
}

/** 判定字段名是否为 token 类（敏感）；供 query/body 脱敏复用 */
export function isTokenKey(key: string): boolean {
  return TOKEN_KEY_RE.test(key);
}

/** 判定某个 header 是否为 token 类（敏感） */
export function isTokenHeader(name: string): boolean {
  return TOKEN_HEADER_RE.test(name);
}

/** 对单个（key, value）叶子做噪音分类；非噪音返回 null */
export function classifyValue(key: string, value: unknown): NoiseRule | null {
  // 1. 字段名命中 token → token_field（优先于值判断，避免把 token 值误判成 UUID/hex）
  if (isTokenKey(key)) return 'token_field';

  // 2. 值形态判断
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (isTimeKey(key)) return 'numeric_timestamp';
      if (isIdKey(key)) return 'integer_id';
      if (value >= SEC_MIN && value <= SEC_MAX) return 'numeric_timestamp';
      if (value >= MS_MIN && value <= MS_MAX) return 'numeric_timestamp';
    }
    return null;
  }

  if (typeof value === 'string') {
    const v = value.trim();
    if (v === '') return null;

    if (UUID_RE.test(v)) return 'uuid';
    if (ISO_DATETIME_RE.test(v)) return 'iso_timestamp';
    if (isTimeKey(key) && ISO_DATE_RE.test(v)) return 'iso_timestamp';
    if (isIdKey(key) && HEX_ID_RE.test(v)) return 'hex_id';
  }

  return null;
}

/** 生成脱敏样例（token 类只给前缀+长度，其余给原始值截断） */
export function redactSample(value: unknown, rule: NoiseRule): string {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return typeof value;
  if (rule === 'token_field' || rule === 'token_header') {
    const prefix = value.slice(0, 4);
    return `${prefix}***(${value.length} chars)`;
  }
  return value.length > 32 ? `${value.slice(0, 32)}...` : value;
}

/** 人读规则说明（用于 NoiseFinding.reason） */
export function describeRule(rule: NoiseRule): string {
  switch (rule) {
    case 'iso_timestamp':
      return 'ISO8601 时间戳，易变';
    case 'numeric_timestamp':
      return '数字时间戳，易变';
    case 'uuid':
      return 'UUID 随机 ID，易变';
    case 'hex_id':
      return '长 hex 随机 ID，易变';
    case 'integer_id':
      return '自增整数 ID，易变';
    case 'token_field':
      return 'token/secret 类字段，敏感且易变';
    case 'token_header':
      return 'token 类请求头，敏感且易变';
  }
}
