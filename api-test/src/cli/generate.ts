/**
 * 测试生成 CLI：读取 A2 录制的会话导出（data/recording.json）→ 生成测试用例 → 落盘 data/test-cases.json。
 *
 * 用法：
 *   npm run gen            # 从 data/recording.json 生成 data/test-cases.json
 *   npm run gen -- --in data/recording.json --out data/test-cases.json
 *
 * 输入兼容两种格式（P1.1 起插件导入也走同一文件）：
 *   1. SessionExport（npm run record 导出：{ session, records, apis }）；
 *   2. JsonFileRecordStore 格式（import:har 写入：{ records: [...] }）——
 *      缺省的 session/apis 用「导入会话」元数据 + 临时 RecordingSession 重建。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SessionExport } from '../recorder/types.js';
import { convertSessionToCases } from '../generator/convert.js';

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

function main(): void {
  const inPath = resolve(argValue(process.argv, '--in') ?? 'data/recording.json');
  const outPath = resolve(argValue(process.argv, '--out') ?? 'data/test-cases.json');

  if (!existsSync(inPath)) {
    console.error(`未找到录制导出文件：${inPath}`);
    console.error('请先运行 npm run record（代理录制）或 npm run import:har -- <file>（插件导入）。');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(inPath, 'utf-8')) as Partial<SessionExport> & { records?: SessionExport['records'] };

  // SessionExport 格式（record CLI 导出）需含 apis；JsonFileRecordStore 格式（import:har）只有 records
  const exported: SessionExport = Array.isArray(raw.apis)
    ? (raw as SessionExport)
    : {
        session: {
          id: 'imported-session',
          status: 'stopped',
          started_at: null,
          ended_at: null,
          record_count: raw.records?.length ?? 0,
        },
        records: raw.records ?? [],
        apis: groupApis(raw.records ?? []),
      };

  const result = convertSessionToCases(exported);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

  console.log('='.repeat(60));
  console.log(`会话 ${result.session_id} → 测试用例生成完成`);
  console.log('='.repeat(60));
  console.log(`用例数        : ${result.summary.total_cases}`);
  console.log(`断言总数      : ${result.summary.total_assertions}`);
  console.log(`噪音字段(忽略): ${result.summary.total_noise_ignored}`);
  console.log(`依赖 mock     : ${result.summary.total_mocks}`);
  console.log();
  for (const c of result.cases) {
    const ignored = c.noise_findings.length;
    console.log(`  - ${c.test_case.name}  断言=${c.test_case.assertions.length} 噪音忽略=${ignored} mock=${c.mocks.length}`);
  }
  console.log();
  console.log(`已导出到 ${outPath}`);
  console.log('提示：AI 生成仍需人审，请 review 每个用例的噪音判定与 mock 描述后再入库。');
}

/** 与 RecordingSession.groupByApi 同逻辑的归组（导入文件无 apis 时本地重建） */
function groupApis(records: SessionExport['records']): SessionExport['apis'] {
  const map = new Map<string, { method: (typeof records)[number]['method']; path: string; count: number; sample_ids: string[]; status_codes: number[]; last_seen_at: string }>();
  for (const r of records) {
    const key = `${r.method} ${r.path}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.sample_ids.push(r.id);
      if (!existing.status_codes.includes(r.status_code)) existing.status_codes.push(r.status_code);
      if (r.timestamp > existing.last_seen_at) existing.last_seen_at = r.timestamp;
    } else {
      map.set(key, {
        method: r.method,
        path: r.path,
        count: 1,
        sample_ids: [r.id],
        status_codes: [r.status_code],
        last_seen_at: r.timestamp,
      });
    }
  }
  return [...map.values()].sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

main();

