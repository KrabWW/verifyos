/**
 * 插件流量导入 CLI（P1.1）：把 Chrome 插件导出的 TrafficRecord JSON（或标准 HAR）
 * 导入现有录制会话存储（data/recording.json，与 JsonFileRecordStore 格式互通）。
 *
 * 背景：代理模式对 HTTPS 只能拿到 CONNECT 元数据（TLS 端到端加密）。
 * Chrome 插件走 DevTools network.getHAR()，在浏览器内部解码后可见明文 body，
 * 导出的 JSON 可直接导入本工具的会话存储，补齐 HTTPS 明文录制通道。
 *
 * 用法：
 *   npm run import:har -- <file>                    # 默认导入 data/recording.json
 *   npm run import:har -- <file> --out data/recording.json
 *
 * 输入格式（两种皆可，自动识别）：
 *   1. 插件导出格式：{ records: TrafficRecord[] }（panel.js「导出 JSON」产物）；
 *   2. 标准 HAR 1.2：{ log: { entries: [...] } }（DevTools 手动导出的 .har）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HttpMethod, TrafficRecord } from '../types/models.js';
import { classifyRequest } from '../recorder/classify.js';

/** HAR entry 的最小结构（只取本工具关心的字段） */
interface HarEntry {
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
  _resourceType?: string;
}

/** HAR/插件导出文件的顶层结构 */
interface ImportFile {
  records?: unknown[];
  log?: { entries?: HarEntry[] };
}

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

function argPositional(argv: string[]): string | undefined {
  const first = argv.find((a, i) => i > 0 && !a.startsWith('--') && argv[i - 1] !== '--out');
  // 排除 npm run 传入的 tsx 脚本名（第一个非 flag 参数若以 .ts 结尾则跳过）
  const candidates = argv.filter((a, i) => i > 0 && !a.startsWith('--') && argv[i - 1] !== '--out');
  const nonScript = candidates.find((a) => !a.endsWith('.ts'));
  return nonScript ?? first;
}

/** headers 数组 → 小写键 Record（与代理录制归一化一致） */
function headersToRecord(headers: Array<{ name: string; value: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

/** 单条 HAR entry → TrafficRecord（分级复用 recorder/classify.ts 同一套启发式） */
function entryToRecord(entry: HarEntry): TrafficRecord | null {
  const urlRaw = entry.request?.url;
  if (!urlRaw) return null;

  let url: URL;
  try {
    url = new URL(urlRaw);
  } catch {
    return null;
  }

  const now = new Date().toISOString();
  const requestHeaders = headersToRecord(entry.request?.headers);
  const responseHeaders = headersToRecord(entry.response?.headers);

  // 分级：插件导出的标准 HAR 带 _resourceType（DevTools 内部资源类型），优先纳入判定
  const resourceType = entry._resourceType;
  let cls = classifyRequest({
    method: (entry.request?.method ?? 'GET').toUpperCase() as HttpMethod,
    path: url.pathname,
    request_headers: requestHeaders,
    response_content_type: responseHeaders['content-type'],
  });
  if (resourceType === 'xhr' || resourceType === 'fetch') {
    cls = { request_class: 'ajax', is_noise: false, reason: `resourceType=${resourceType}` };
  } else if (resourceType === 'document') {
    cls = { request_class: 'top_level', is_noise: false, reason: 'resourceType=document' };
  } else if (resourceType !== undefined && ['script', 'stylesheet', 'image', 'font', 'media'].includes(resourceType)) {
    cls = { request_class: 'embedded', is_noise: true, reason: `resourceType=${resourceType}` };
  }

  const queryParams: Record<string, string[]> = {};
  for (const [k, v] of url.searchParams.entries()) {
    (queryParams[k] ??= []).push(v);
  }

  return {
    id: randomUUID(),
    api_definition_id: null,
    timestamp: entry.startedDateTime ?? now,
    method: (entry.request?.method ?? 'GET').toUpperCase() as HttpMethod,
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

/** 校验一条记录是否为合法 TrafficRecord（缺关键字段的条目跳过并计数） */
function isValidTrafficRecord(r: unknown): r is TrafficRecord {
  if (r === null || typeof r !== 'object') return false;
  const rec = r as Partial<TrafficRecord>;
  return (
    typeof rec.method === 'string' &&
    typeof rec.path === 'string' &&
    typeof rec.host === 'string' &&
    typeof rec.status_code === 'number'
  );
}

function main(): void {
  const input = argPositional(process.argv);
  if (!input || !existsSync(resolve(input))) {
    console.error('用法：npm run import:har -- <file> [--out data/recording.json]');
    console.error('  <file>：Chrome 插件导出的 TrafficRecord JSON，或 DevTools 导出的标准 HAR 文件');
    process.exit(1);
  }
  const inPath = resolve(input);
  const outPath = resolve(argValue(process.argv, '--out') ?? 'data/recording.json');

  const parsed = JSON.parse(readFileSync(inPath, 'utf-8')) as ImportFile;

  let records: TrafficRecord[] = [];
  let skipped = 0;

  if (Array.isArray(parsed.records)) {
    // 格式 1：插件导出（TrafficRecord 数组）
    for (const r of parsed.records) {
      if (isValidTrafficRecord(r)) {
        records.push(r);
      } else {
        skipped += 1;
      }
    }
  } else if (Array.isArray(parsed.log?.entries)) {
    // 格式 2：标准 HAR
    for (const entry of parsed.log.entries) {
      const r = entryToRecord(entry);
      if (r) {
        records.push(r);
      } else {
        skipped += 1;
      }
    }
  } else {
    console.error('无法识别的文件格式：既不是 { records: [...] }（插件导出）也不是 { log: { entries: [...] } }（标准 HAR）');
    process.exit(1);
  }

  // 落盘为 JsonFileRecordStore 兼容格式（与 verify:record / record CLI 同一消费路径）
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ records }, null, 2), 'utf-8');

  const ajax = records.filter((r) => r.request_class === 'ajax').length;
  const topLevel = records.filter((r) => r.request_class === 'top_level').length;
  const noise = records.filter((r) => r.is_noise).length;

  console.log('='.repeat(60));
  console.log(`导入完成：${inPath}`);
  console.log('='.repeat(60));
  console.log(`总记录数    : ${records.length}${skipped > 0 ? `（跳过无效条目 ${skipped}）` : ''}`);
  console.log(`分级统计    : ajax=${ajax}  top_level=${topLevel}  噪音=${noise}`);
  console.log(`含请求体    : ${records.filter((r) => r.request_body !== undefined).length}`);
  console.log(`含响应体    : ${records.filter((r) => r.response_body !== undefined).length}`);
  console.log(`已写入      : ${outPath}`);
  console.log('后续：npm run gen 可从该会话生成测试用例。');
}

main();
