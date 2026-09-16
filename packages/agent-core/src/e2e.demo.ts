/**
 * 探索闭环端到端 demo（B2+B3+B4 组合实测）：
 *   Crawler 无凭据撞登录墙 → ApprovalManager 发凭据请求（模拟用户 1.2s 后提交）
 *   → Stagehand×glm-4.5v 自动续登 → 全站爬通 → GraphStore 落 pg-mem
 *   → loadGraph 输出应用地图数据（含 Intent Score 分档）
 *
 * 运行：npx tsx src/e2e.demo.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { newDb } from 'pg-mem';
import fs from 'node:fs';
import { Crawler } from './crawler.js';
import { ApprovalManager, type ApprovalRequest } from './approval.js';
import { GraphStore } from './graph.js';
import { serveStatic } from './static-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function main() {
  const srv = await serveStatic(path.resolve(__dirname, '../fixtures/site'));
  console.log(`▍目标站点：${srv.url}（演示 CRM：登录墙 → 员工列表 → 详情×2，about 公开）\n`);

  // ---------- 1. 探索：遇墙弹卡 → 用户提交 → 续登爬通 ----------
  console.log('▍[1/3] Agent 开始探索（未提供凭据）…');
  const approvals = new ApprovalManager();
  approvals.on('requested', (req: ApprovalRequest) => {
    console.log(`  ⏸ WAITING_FOR_APPROVAL：${req.title}`);
    console.log(`    原因：${req.reason}`);
    console.log(`    表单：${req.fields.map((f) => `${f.label}(${f.type})`).join(' + ')}`);
    setTimeout(() => {
      console.log('  ✎ 用户提交凭据（模拟 1.2s 后）…');
      approvals.submit(req.id, { approved: true, values: { username: 'admin', password: 'test123' } });
    }, 1200);
  });

  const t0 = Date.now();
  const result = await new Crawler().crawl({
    startUrl: `${srv.url}/login.html`,
    maxDepth: 3,
    maxPages: 20,
    approval: approvals,
    credentialRole: '管理员',
    llm: {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseURL: process.env.LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.LLM_MODEL ?? 'glm-4.5v',
    },
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ 探索完成（${secs}s）：${result.pages.length} 页 · ${result.edges.length} 条导航边 · 认证=${result.authenticated}`);
  console.log(`  页面：${result.pages.map((p) => p.url.replace(srv.url, '')).join(' → ')}\n`);

  // ---------- 2. 落图：Coverage Graph ----------
  console.log('▍[2/3] Coverage Graph 落库（pg-mem，intent=「员工 列表 管理」）…');
  const db = newDb();
  const pool = new (db.adapters.createPg().Pool)();
  const raw = fs.readFileSync(path.resolve(__dirname, '../../../apps/server/migrations/001_init.sql'), 'utf8');
  const sql = raw.split('\n').filter((l) => !/^\s*CREATE EXTENSION/i.test(l)).join('\n').replace(/vector\(1024\)/g, 'text');
  await pool.query(sql);
  await pool.query(`INSERT INTO organization(short_id, name) VALUES('org_demo', '演示组织')`);
  await pool.query(`INSERT INTO project(short_id, org_id, name) VALUES('prj_demo', 1, '演示项目')`);
  await pool.query(`INSERT INTO application(short_id, project_id, name, type) VALUES('app_demo', 1, '演示 CRM', 'web')`);
  const store = new GraphStore(pool);
  const saved = await store.saveCrawlGraph({ applicationId: 1, result, intent: '员工 列表 管理', explorationId: 1 });
  console.log(`  ✓ 节点 ${saved.nodes} · 边 ${saved.edges}\n`);

  // ---------- 3. 应用地图数据 ----------
  console.log('▍[3/3] 应用地图（loadGraph 输出）');
  const g = await store.loadGraph(1);
  for (const n of g.nodes) {
    const band = (n.meta.intentBand as string) ?? '-';
    const score = (n.meta.intentScore as number) ?? '-';
    const wall = n.meta.loginWall ? ' · 🔒登录墙' : '';
    console.log(`  ○ ${n.ref.replace(srv.url, '')}  [${n.title}]  intent=${score}(${band})${wall}`);
  }
  console.log('  边：');
  for (const e of g.edges) {
    console.log(`    ${e.fromRef.replace(srv.url, '')} ──navigate──▶ ${e.toRef.replace(srv.url, '')}`);
  }
  const high = g.nodes.filter((n) => n.meta.intentBand === 'high').length;
  console.log(`\n  分档统计：high=${high} / mid=${g.nodes.filter((n) => n.meta.intentBand === 'mid').length} / low=${g.nodes.filter((n) => n.meta.intentBand === 'low').length}`);
  console.log('  ▶ 下一步（B5）：把 high/mid 页面交给 LLM 提取 QA 点候选');

  if (result.outputStateJson) {
    console.log(`\n  💾 Output State 已产出（${result.outputStateJson.length}B）→ 6h 内 Resume From 可免登录复用`);
  }

  srv.close();
  console.log('\n✅ 端到端 demo 完成');
  process.exit(0);
}

main().catch((e) => {
  console.error('e2e error:', e);
  process.exit(1);
});
