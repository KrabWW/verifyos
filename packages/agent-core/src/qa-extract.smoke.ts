/**
 * B5 冒烟：LLM QA 点提取（真实 GLM 调用）+ 落库
 *   [1] pg-mem 迁移 + 图数据（复用 e2e 探索结果的手工构造）
 *   [2] QaExtractor.extract：glm-4.5v generateObject → 候选结构/来源校验
 *   [3] QaPointStore.saveCandidates → qa_point 表断言（status/discount/source jsonb）
 *
 * 运行：npx tsx src/qa-extract.smoke.ts（需根目录 .env 含 LLM_API_KEY）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { newDb } from 'pg-mem';
import { GraphStore } from './graph.js';
import { QaExtractor, QaPointStore, QaCandidateSchema } from './qa-extract.js';
import type { CrawlResult } from './crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
    failures++;
  }
}

const BASE = 'http://127.0.0.1:9000';
const crawl: CrawlResult = {
  pages: [
    { url: `${BASE}/login.html`, title: '登录 · 演示 CRM', depth: 0, links: [`${BASE}/about.html`], loginWall: true, interactive: 5, headings: ['欢迎回来'] },
    { url: `${BASE}/list.html`, title: '员工列表 · 演示 CRM', depth: 1, links: [`${BASE}/detail1.html`, `${BASE}/detail2.html`], loginWall: false, interactive: 12, headings: ['员工列表'] },
    { url: `${BASE}/detail1.html`, title: '张伟 · 员工详情', depth: 2, links: [`${BASE}/list.html`], loginWall: false, interactive: 3, headings: ['张伟', '销售部 · ZS-001'] },
    { url: `${BASE}/detail2.html`, title: '李娜 · 员工详情', depth: 2, links: [`${BASE}/list.html`], loginWall: false, interactive: 3, headings: ['李娜', '技术部 · LN-002'] },
  ],
  edges: [
    { from: `${BASE}/login.html`, to: `${BASE}/list.html` },
    { from: `${BASE}/list.html`, to: `${BASE}/detail1.html` },
    { from: `${BASE}/list.html`, to: `${BASE}/detail2.html` },
    { from: `${BASE}/detail1.html`, to: `${BASE}/list.html` },
    { from: `${BASE}/detail2.html`, to: `${BASE}/list.html` },
  ],
  loginWallDetected: true,
  authenticated: true,
};

async function main() {
  // ---------- [1] 迁移 + 落图 ----------
  console.log('[1] pg-mem 迁移 + 探索结果落图');
  const db = newDb({ noFS: true });
  const pool = new (db.adapters.createPg().Pool)();
  const raw = fs.readFileSync(path.resolve(__dirname, '../../../apps/server/migrations/001_init.sql'), 'utf8');
  const sql = raw.split('\n').filter((l) => !/^\s*CREATE EXTENSION/i.test(l)).join('\n').replace(/vector\(1024\)/g, 'text');
  await pool.query(sql);
  await pool.query(`INSERT INTO organization(short_id, name) VALUES('org_demo', '演示组织')`);
  await pool.query(`INSERT INTO project(short_id, org_id, name) VALUES('prj_demo', 1, '演示项目')`);
  await pool.query(`INSERT INTO application(short_id, project_id, name, type) VALUES('app_demo', 1, '演示 CRM', 'web')`);
  const store = new GraphStore(pool);
  await store.saveCrawlGraph({ applicationId: 1, result: crawl, intent: '员工 管理 校验' });
  const g = await store.loadGraph(1);
  check('图就绪（4 节点 5 边）', g.nodes.length === 4 && g.edges.length === 5);

  // ---------- [2] LLM 提取 ----------
  console.log('\n[2] QaExtractor 提取（glm-4.5v · generateObject structured output）…');
  const extractor = new QaExtractor({
    apiKey: process.env.LLM_API_KEY ?? '',
    baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.LLM_MODEL ?? 'glm-4.5v',
  });
  const t0 = Date.now();
  const candidates = await extractor.extract({
    applicationName: '演示 CRM',
    intent: '员工管理：列表查看、详情查看，关注权限与输入校验',
    nodes: g.nodes,
    edges: g.edges,
    maxCandidates: 6,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  提取 ${candidates.length} 条（${secs}s）：`);
  for (const c of candidates) {
    console.log(`   · [${c.risk}] ${c.title}（${c.category} · ${c.actor} · 置信 ${c.confidence}）`);
  }
  check('候选 ≥ 3 条', candidates.length >= 3, `实际 ${candidates.length}`);
  const parsed = candidates.map((c) => QaCandidateSchema.safeParse(c));
  check('全部通过 zod 校验', parsed.every((p) => p.success));
  const urlsInGraph = new Set(g.nodes.map((n) => n.ref));
  check('sourceUrl 都来自图内页面', candidates.every((c) => urlsInGraph.has(c.sourceUrl)), JSON.stringify(candidates.map((c) => c.sourceUrl)));
  check('类别有分布（≥2 种 category）', new Set(candidates.map((c) => c.category)).size >= 2);

  // ---------- [3] 落库 ----------
  console.log('\n[3] QaPointStore 落库');
  const qaStore = new QaPointStore(pool);
  const ids = await qaStore.saveCandidates(1, candidates, 1);
  check('返回 short_id 数 = 候选数', ids.length === candidates.length);
  check('short_id 前缀 qa_', ids.every((id) => id.startsWith('qa_')));
  const rows = await qaStore.list(1);
  check('qa_point 表行数一致', rows.length === candidates.length);
  check('status 均为 discovered（状态机起点）', rows.every((r) => r.status === 'discovered'));
  check('source jsonb 含 rationale/actor/explorationId', rows.every((r) => !!(r.source as { rationale?: string; actor?: string; explorationId?: number }).rationale && !!(r.source as { actor?: string }).actor && (r.source as { explorationId?: number }).explorationId === 1));
  const risks = new Set(rows.map((r) => r.risk));
  check('risk 值合法（high/medium/low）', [...risks].every((r) => ['high', 'medium', 'low'].includes(r ?? '')));

  console.log(failures === 0 ? '\n✅ B5 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
