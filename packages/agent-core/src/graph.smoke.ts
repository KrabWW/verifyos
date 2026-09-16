/**
 * B4 冒烟：Coverage Graph v1
 *   [1] pg-mem 迁移（001 全文）+ 最小数据链
 *   [2] CrawlResult 落库：5 页 8 边
 *   [3] 幂等：二次落库（2 重复页 + 1 新页 + 重复边 + 新边）→ 节点去重、边只增新
 *   [4] loadGraph 读回（应用地图数据源结构）
 *   [5] Intent Score 分档（高/中/低 + band 边界）
 *
 * 运行：npx tsx src/graph.smoke.ts（纯 pg-mem，无需外部服务）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { GraphStore, scoreIntent, bandOf } from './graph.js';
import type { CrawlResult } from './crawler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    { url: `${BASE}/list.html`, title: '员工列表 · 演示 CRM', depth: 1, links: [`${BASE}/detail1.html`, `${BASE}/detail2.html`, `${BASE}/about.html`], loginWall: false, interactive: 12, headings: ['员工列表'] },
    { url: `${BASE}/detail1.html`, title: '张伟 · 员工详情', depth: 2, links: [`${BASE}/list.html`], loginWall: false, interactive: 3, headings: ['张伟'] },
    { url: `${BASE}/detail2.html`, title: '李娜 · 员工详情', depth: 2, links: [`${BASE}/list.html`], loginWall: false, interactive: 3, headings: ['李娜'] },
    { url: `${BASE}/about.html`, title: '关于 · 演示 CRM', depth: 1, links: [`${BASE}/list.html`, `${BASE}/login.html`], loginWall: false, interactive: 2, headings: ['关于演示 CRM'] },
  ],
  edges: [
    { from: `${BASE}/login.html`, to: `${BASE}/about.html` },
    { from: `${BASE}/list.html`, to: `${BASE}/detail1.html` },
    { from: `${BASE}/list.html`, to: `${BASE}/detail2.html` },
    { from: `${BASE}/list.html`, to: `${BASE}/about.html` },
    { from: `${BASE}/detail1.html`, to: `${BASE}/list.html` },
    { from: `${BASE}/detail2.html`, to: `${BASE}/list.html` },
    { from: `${BASE}/about.html`, to: `${BASE}/list.html` },
    { from: `${BASE}/about.html`, to: `${BASE}/login.html` },
  ],
  loginWallDetected: true,
  authenticated: true,
};

async function main() {
  // ---------- [1] 迁移 + 最小数据链 ----------
  console.log('[1] pg-mem 迁移 + 最小数据链');
  const db = newDb({ noFS: true });
  const pool = new (db.adapters.createPg().Pool)();
  const raw = fs.readFileSync(path.resolve(__dirname, '../../../apps/server/migrations/001_init.sql'), 'utf8');
  const sql = raw
    .split('\n')
    .filter((l) => !/^\s*CREATE EXTENSION/i.test(l))
    .join('\n')
    .replace(/vector\(1024\)/g, 'text');
  await pool.query(sql);
  await pool.query(`INSERT INTO organization(short_id, name) VALUES('org_demo', '演示组织')`);
  await pool.query(`INSERT INTO project(short_id, org_id, name) VALUES('prj_demo', 1, '演示项目')`);
  await pool.query(`INSERT INTO application(short_id, project_id, name, type) VALUES('app_demo', 1, '演示 CRM', 'web')`);
  const appId = 1;
  check('迁移与最小链就绪', true);

  const store = new GraphStore(pool);

  // ---------- [2] 首次落库 ----------
  console.log('\n[2] CrawlResult 落库（5 页 8 边，intent=「员工 列表 管理」）');
  const r1 = await store.saveCrawlGraph({ applicationId: appId, result: crawl, intent: '员工 列表 管理', explorationId: 1 });
  check('节点写入 5', r1.nodes === 5, `实际 ${r1.nodes}`);
  check('边写入 8', r1.edges === 8, `实际 ${r1.edges}`);
  const cnt1 = await pool.query(`SELECT count(*)::int AS n FROM graph_node WHERE application_id = $1`, [appId]);
  check('库内节点数 5', cnt1.rows[0].n === 5);

  // ---------- [3] 幂等：二次落库 ----------
  console.log('\n[3] 二次落库（2 重复页 + 1 新页 + 重复边/新边混合）');
  const crawl2: CrawlResult = {
    ...crawl,
    pages: [
      crawl.pages[1], // list 重复
      crawl.pages[2], // detail1 重复
      { url: `${BASE}/settings.html`, title: '设置 · 演示 CRM', depth: 2, links: [`${BASE}/list.html`], loginWall: false, interactive: 6, headings: ['系统设置'] },
    ],
    edges: [
      { from: `${BASE}/list.html`, to: `${BASE}/detail1.html` }, // 重复边
      { from: `${BASE}/list.html`, to: `${BASE}/settings.html` }, // 新边
      { from: `${BASE}/settings.html`, to: `${BASE}/list.html` }, // 新边
    ],
  };
  const r2 = await store.saveCrawlGraph({ applicationId: appId, result: crawl2, intent: '员工 列表 管理' });
  const cnt2 = await pool.query(`SELECT count(*)::int AS n FROM graph_node WHERE application_id = $1`, [appId]);
  const ecnt2 = await pool.query(`SELECT count(*)::int AS n FROM graph_edge WHERE application_id = $1`, [appId]);
  check('节点去重：库内总数 6（5+1 新）', cnt2.rows[0].n === 6, `实际 ${cnt2.rows[0].n}`);
  check('边去重：库内总数 10（8+2 新）', ecnt2.rows[0].n === 10, `实际 ${ecnt2.rows[0].n}`);
  check('本次仅新增 2 条边', r2.edges === 2, `实际 ${r2.edges}`);

  // ---------- [4] loadGraph 读回 ----------
  console.log('\n[4] loadGraph 读回（应用地图数据源）');
  const g = await store.loadGraph(appId);
  check('读回 6 节点', g.nodes.length === 6);
  check('读回 10 边', g.edges.length === 10);
  const listNode = g.nodes.find((n) => n.ref.includes('list.html'));
  check('list 节点 meta 含 intentScore/intentBand', !!listNode && typeof listNode.meta.intentScore === 'number' && typeof listNode.meta.intentBand === 'string');
  check('边带 ref 可直接渲染', g.edges.every((e) => e.fromRef.startsWith(BASE) && e.toRef.startsWith(BASE)));
  const loginNode = g.nodes.find((n) => n.ref.includes('login.html'));
  check('login 节点标记 loginWall', loginNode?.meta.loginWall === true);

  // ---------- [5] Intent Score 分档 ----------
  console.log('\n[5] Intent Score 分档（0-40 / 41-70 / 71-100）');
  const high = scoreIntent('员工 列表 管理', { title: '员工列表 · 演示 CRM', headings: ['员工列表'], links: [] });
  const mid = scoreIntent('员工 订单 退款', { title: '员工列表', headings: ['员工列表'], links: [] });
  const low = scoreIntent('退款 回调 幂等', { title: '关于我们', headings: ['公司介绍'], links: [] });
  console.log(`  样例分：高=${high} 中=${mid} 低=${low}`);
  check('高分样例 ≥ 71 且 band=high', high >= 71 && bandOf(high) === 'high', `实际 ${high}`);
  check('低分样例 ≤ 40 且 band=low', low <= 40 && bandOf(low) === 'low', `实际 ${low}`);
  check('band 边界：40→low 41→mid 70→mid 71→high', bandOf(40) === 'low' && bandOf(41) === 'mid' && bandOf(70) === 'mid' && bandOf(71) === 'high');
  check('list 节点 band=high（intent 强相关）', listNode?.meta.intentBand === 'high', `实际 ${listNode?.meta.intentBand}`);

  console.log(failures === 0 ? '\n✅ B4 冒烟全部通过' : `\n❌ ${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('smoke error:', e);
  process.exit(1);
});
