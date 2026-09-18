/**
 * 插件示例 D：失败取证 · 代码逆向分析（code-forensics）
 *
 * 解决的问题：验证步骤反复失败时，使用者要人工去代码仓库找对应片段、逆向分析
 * 「页面到底长什么样、该怎么测」。本插件把这条链路自动化：
 *   失败 run（自动计数 ≥ 阈值，或手动触发）→ 提取关键词 → 检索代码仓库
 *   （gitlab REST / local 目录）→ 剪取片段 → LLM 逆向分析 → 取证报告落盘。
 *
 * 仓库映射 key 解析优先级：verification 短 id → application 短 id → 目标 host → '*'。
 * 环境：GITLAB_TOKEN（gitlab 提供商）；LLM_API_KEY/LLM_BASE_URL/LLM_MODEL（分析用，与 runner 同配置）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const state = { threshold: 2, autoAnalyze: true };
// 诊断计数：/stats 直接可观测 onRunEvent 是否被宿主分发、guard 命中、自动取证错误
const stats = { eventsSeen: 0, byType: {}, failEvents: 0, lastFailEvent: null, autoTriggered: 0, autoErrors: [], lastEventAt: null };
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.pnpm']);
const TEXT_EXT = /\.(js|jsx|ts|tsx|vue|html?|css|scss|less|json|md|txt|py|java|go|rb|php|ya?ml)$/i;
let ctxRef = null;

const q = (text, params) => ctxRef.pg.query(text, params);
const normRun = (raw) => { const s = String(raw || ''); return s.startsWith('run_') || s.startsWith('dry_') ? s : 'run_' + s; };
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); } finally { clearTimeout(t); }
}

/** 扫描文本中所有平衡的 {...} 并解析（字符串感知）；模型常在分析文字里引用步骤 JSON 示例 */
function extractJsonCandidates(text) {
  const s = String(text || '');
  const out = [];
  let i = s.indexOf('{');
  while (i >= 0) {
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) break;
    try { out.push(JSON.parse(s.slice(i, end + 1))); } catch { /* 非法片段跳过 */ }
    i = s.indexOf('{', end + 1);
  }
  return out;
}
/** 选含取证契约键最多的候选对象；兜底最后一个 */
function pickLlmJson(text) {
  const cands = extractJsonCandidates(String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, ''));
  if (cands.length === 0) return null;
  const KEYS = ['rootCauseHypothesis', 'realUiStructure', 'suggestedSteps', 'confidence', 'humanCheck'];
  let best = null, bestScore = -1;
  for (const c of cands) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const score = KEYS.filter((k) => k in c).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  if (best && bestScore >= 1) return best;
  return cands[cands.length - 1];
}

function extractKeywords(parts) {
  const stop = new Set(['请输入', '页面', '按钮', '输入框', '点击', '填入', '如果', '没有', '存在', '测试', '验证', '失败', '错误', 'undefined', 'null', 'true', 'false', 'https', 'http', 'localhost', 'error', 'timeout', 'stagehand', 'playwright']);
  const out = [];
  const push = (s) => { s = String(s).trim(); if (s.length >= 2 && s.length <= 24 && !/^\d+$/.test(s) && !stop.has(s.toLowerCase()) && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s); };
  for (const p of parts) {
    if (!p) continue;
    const str = String(p);
    for (const m of str.matchAll(/"([^"]{2,24})"/g)) push(m[1]);
    for (const m of str.matchAll(/[\u4e00-\u9fa5]{2,12}/g)) push(m[0]);
    for (const m of str.matchAll(/[A-Za-z][A-Za-z0-9]{3,24}/g)) push(m[0]);
  }
  return out.slice(0, 6);
}

function snippetAround(text, lineHits, ctxLines = 6, cap = 50) {
  const lines = text.split(/\r?\n/);
  const want = new Set();
  for (const i of lineHits) for (let j = Math.max(0, i - ctxLines); j <= Math.min(lines.length - 1, i + ctxLines); j++) want.add(j);
  const idx = [...want].sort((a, b) => a - b).slice(0, cap);
  return idx.map((i) => 'L' + (i + 1) + ': ' + lines[i]).join('\n');
}

function searchLocal(repoDir, keywords) {
  const files = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(path.join(dir, e.name)); }
      else if (TEXT_EXT.test(e.name)) {
        const p = path.join(dir, e.name);
        try { if (fs.statSync(p).size <= 400 * 1024) files.push(p); } catch { /* 跳过 */ }
      }
    }
  })(repoDir);
  const lowers = keywords.map((k) => k.toLowerCase());
  const scored = [];
  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines2 = text.toLowerCase().split(/\r?\n/);
    const hits = [];
    lines2.forEach((ln, i) => { if (lowers.some((k) => ln.includes(k))) hits.push(i); });
    if (hits.length > 0) scored.push({ file: path.relative(repoDir, f).replace(/\\/g, '/'), abs: f, text, hits });
  }
  scored.sort((a, b) => b.hits.length - a.hits.length);
  return scored.slice(0, 3).map((s) => ({ path: s.file, hits: s.hits.length, snippet: snippetAround(s.text, s.hits) }));
}

async function searchGitlab(map, keywords) {
  const tokenEnvName = map.token_env || 'GITLAB_TOKEN';
  const token = process.env[tokenEnvName] || '';
  if (!token) throw new Error('缺少 GitLab 访问令牌：请设置环境变量 ' + tokenEnvName + '（GitLab → Preferences → Access Tokens，read_api 权限）后重启 API');
  const u = new URL(String(map.repo).replace(/\.git$/, ''));
  const api = u.origin + '/api/v4';
  const projectPath = encodeURIComponent(u.pathname.replace(/^\//, ''));
  const headers = { 'PRIVATE-TOKEN': token };
  const proj = await (await fetchWithTimeout(api + '/projects/' + projectPath, { headers })).json();
  if (!proj || proj.id === undefined) throw new Error('GitLab 项目解析失败（检查 repo 地址与 token 权限）: ' + JSON.stringify(proj).slice(0, 120));
  const tally = new Map();
  for (const kw of keywords) {
    const res = await fetchWithTimeout(api + '/projects/' + proj.id + '/search?scope=blobs&search=' + encodeURIComponent(kw) + '&per_page=20', { headers });
    if (!res.ok) continue;
    const rows = await res.json();
    for (const row of rows) tally.set(row.path, (tally.get(row.path) || 0) + 1);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p);
  const out = [];
  for (const p of top) {
    const raw = await fetchWithTimeout(api + '/projects/' + proj.id + '/repository/files/' + encodeURIComponent(p) + '/raw?ref=' + encodeURIComponent(map.branch || 'main'), { headers });
    if (!raw.ok) continue;
    const text = await raw.text();
    const lowers = keywords.map((k) => k.toLowerCase());
    const hits = [];
    text.toLowerCase().split(/\r?\n/).forEach((ln, i) => { if (lowers.some((k) => ln.includes(k))) hits.push(i); });
    if (hits.length > 0) out.push({ path: p, hits: hits.length, snippet: snippetAround(text, hits) });
  }
  return out;
}

async function llmAnalyze(payload) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return { llmError: '未配置 LLM_API_KEY，跳过逆向分析（代码片段已在报告中，可人工分析）' };
  const base = String(process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'glm-4.5v';
  const system = '你是资深 UI 自动化测试与前端逆向分析专家。对比失败的测试步骤与目标页面真实代码，只输出一个严格 JSON 对象（禁止 markdown 代码块）：{"rootCauseHypothesis":"根因假设：步骤预期 vs 代码现实的差异","realUiStructure":["从代码推断的真实 UI 结构要点"],"suggestedSteps":[{"kind":"deterministic|assertion|ai","action":"goto|click|fill|press|text_visible|element_visible","selector":"建议 selector","value":"值","instruction":"ai 步骤指令","why":"依据（引用代码文件与行号）"}],"confidence":"high|medium|low","humanCheck":["需人工确认的点"]}。引用步骤定义时用文字概述，不要复制其 JSON。';
  const body = { model, temperature: 0, max_tokens: 8192, messages: [ // glm-5.3-flash completion_tokens=推理+正文合并计费，4000 会在推理中途截断导致 content 为空
    { role: 'system', content: system },
    { role: 'user', content: '失败验证：' + payload.verTitle + '（' + payload.verShort + '）\n失败摘要：' + payload.failureSummary + '\n步骤定义：' + payload.stepsBrief + '\n\n相关代码片段：\n' + payload.snippetsText }
  ] };
  // 注意：glm-5.3-flash 加 thinking:{type:'disabled'} 会 400「该模型始终思考」——不要传 thinking 参数
  try {
    const res = await fetchWithTimeout(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey }, body: JSON.stringify(body) }, 90000);
    const data = await res.json();
    const msg = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
    // glm reasoning 模型可能 content 为空（token 耗在 reasoning）→ 回退 reasoning_content
    const content = String(msg.content || msg.reasoning_content || '').replace(/<think>[\s\S]*?<\/think>/gi, '');
    const parsed = pickLlmJson(content);
    if (parsed) return parsed;
    return { raw: content.slice(0, 2000), finish: (data && data.choices && data.choices[0] && data.choices[0].finish_reason) || null };
  } catch (err) { return { llmError: 'LLM 分析失败：' + (err && err.message) }; }
}

function buildMarkdown(r) {
  const L = [];
  L.push('# 取证报告 · ' + r.runId);
  L.push('');
  L.push('- 验证：' + (r.verShortId || '-') + ' ' + (r.verTitle || '') + '  触发：' + r.trigger + '  状态：' + r.status);
  L.push('- 失败摘要：' + (r.failureSummary || '-').slice(0, 300));
  L.push('- 关键词：' + (r.keywords || []).join('、'));
  L.push('');
  L.push('## 命中文件');
  for (const f of r.files || []) { L.push('### ' + f.path + '（命中 ' + f.hits + ' 处）'); L.push('```'); L.push(f.snippet); L.push('```'); }
  if ((r.files || []).length === 0) L.push('（无命中——检查仓库映射与关键词）');
  L.push('');
  L.push('## 逆向分析（LLM）');
  L.push('```json');
  L.push(JSON.stringify(r.llm || {}, null, 1));
  L.push('```');
  return L.join('\n');
}

async function analyzeRun(runIdRaw, trigger, opts) {
  const runId = normRun(runIdRaw);
  const rr = await q('SELECT short_id, target, verdict, failure_summary, verification_id FROM run WHERE short_id=$1', [runId]);
  if (rr.rows.length === 0) return { ok: false, error: 'run 不存在：' + runId };
  const run = rr.rows[0];
  let verShort = null, verTitle = null, steps = null;
  if (run.verification_id) {
    const v = await q('SELECT short_id, title, steps FROM verification WHERE id=$1', [run.verification_id]);
    if (v.rows.length > 0) { verShort = v.rows[0].short_id; verTitle = v.rows[0].title; steps = v.rows[0].steps; }
  }
  let appShort = null;
  try {
    const a = await q('SELECT a.short_id FROM verification v JOIN qa_point qp ON qp.id=v.qa_point_id JOIN application a ON a.id=qp.application_id WHERE v.short_id=$1', [verShort]);
    if (a.rows.length > 0) appShort = a.rows[0].short_id;
  } catch { /* 无关联时跳过 */ }
  let host = null;
  try { host = new URL(run.target).host; } catch { /* target 非 URL */ }
  const keys = [verShort, appShort, host, '*'].filter(Boolean);
  const maps = await q('SELECT * FROM forensics_repo_map WHERE key = ANY($1::text[])', [keys]);
  const map = keys.map((k) => maps.rows.find((m) => m.key === k)).find(Boolean);
  const report = { runId, verShortId: verShort, verTitle, trigger, failureSummary: run.failure_summary || '', keywords: [], files: [], llm: null };
  let status = 'ok';
  if (!map) {
    status = 'no_repo_map';
    report.note = '未找到仓库映射，可用的解析键：' + keys.join(', ') + '。先用 POST /repos 配置';
  } else {
    report.mappedKey = map.key; report.provider = map.provider; report.repo = map.repo;
    report.keywords = extractKeywords([run.failure_summary, JSON.stringify(steps || []), run.target, verTitle]);
    try {
      report.files = map.provider === 'gitlab' ? await searchGitlab(map, report.keywords) : searchLocal(map.repo, report.keywords);
      const snippetsText = (report.files || []).map((f) => '--- ' + f.path + ' ---\n' + f.snippet).join('\n\n');
      report.llm = await llmAnalyze({ verShort: verShort, verTitle: verTitle, failureSummary: report.failureSummary, stepsBrief: JSON.stringify(steps || []).slice(0, 1500), snippetsText: snippetsText || '（无代码片段命中）' });
    } catch (err) { status = 'error'; report.error = err && err.message; }
  }
  const dir = path.join(ctxRef.rootDir, 'out', 'code-forensics');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, runId + '.json'), JSON.stringify(report, null, 1));
  const mdPath = path.join(dir, runId + '.md');
  fs.writeFileSync(mdPath, buildMarkdown(report));
  await q('INSERT INTO forensics_report(run_id, ver_short_id, trigger, status, keywords, files, md_path) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [runId, verShort, trigger, status, JSON.stringify(report.keywords), JSON.stringify((report.files || []).map((f) => f.path)), mdPath]);
  if (trigger === 'auto' && verShort) {
    await q('UPDATE forensics_fail SET analyzed_run_ids = (CASE WHEN analyzed_run_ids = \'\' THEN $2 ELSE right(analyzed_run_ids || \'\,\' || $2, 400) END) WHERE ver_short_id = $1', [verShort, runId]);
  }
  ctxRef.log('取证完成 run=' + runId + ' ver=' + verShort + ' status=' + status + ' 命中=' + (report.files || []).length + ' 文件');
  return { ok: true, runId, status, report, markdownPath: mdPath };
}

async function latestFailRun(verShortId) {
  const r = await q('SELECT r.short_id FROM run r JOIN verification v ON v.id=r.verification_id WHERE v.short_id=$1 AND r.verdict=\'fail\' ORDER BY r.finished_at DESC NULLS LAST, r.id DESC LIMIT 1', [verShortId]);
  return r.rows[0] && r.rows[0].short_id;
}

module.exports = {
  async activate(ctx) {
    ctxRef = ctx;
    await q('CREATE TABLE IF NOT EXISTS forensics_repo_map(key TEXT PRIMARY KEY, provider TEXT NOT NULL, repo TEXT NOT NULL, branch TEXT, token_env TEXT, updated_at TIMESTAMPTZ DEFAULT now())');
    await q('CREATE TABLE IF NOT EXISTS forensics_fail(ver_short_id TEXT PRIMARY KEY, fails INT NOT NULL DEFAULT 0, last_run_id TEXT, analyzed_run_ids TEXT NOT NULL DEFAULT \'\', updated_at TIMESTAMPTZ DEFAULT now())');
    await q('CREATE TABLE IF NOT EXISTS forensics_report(id SERIAL PRIMARY KEY, run_id TEXT NOT NULL, ver_short_id TEXT, trigger TEXT NOT NULL DEFAULT \'manual\', status TEXT NOT NULL, keywords TEXT, files TEXT, md_path TEXT, created_at TIMESTAMPTZ DEFAULT now())');

    ctx.onRunEvent((e) => {
      try {
        stats.eventsSeen++;
        stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
        stats.lastEventAt = new Date().toISOString();
        if (e.type !== 'run.completed') return;
        if (e.verdict !== 'fail') return;
        stats.failEvents++;
        stats.lastFailEvent = { runId: e.runId || null, verdict: e.verdict };
        if (!state.autoAnalyze || !e.runId) return;
      } catch (err) { stats.autoErrors.push('listener: ' + String(err && err.message).slice(0, 200)); }
      (async () => {
        // 竞态：run.completed 事件先于 runs.service 落库 INSERT（还隔着 ensureReady）→ 退避等行
        let vid = null;
        for (let i = 0; i < 20 && !vid; i++) {
          const r = await q('SELECT verification_id FROM run WHERE short_id=$1', [e.runId]);
          vid = r.rows[0] && r.rows[0].verification_id;
          if (!vid) await new Promise((res) => setTimeout(res, 500));
        }
        if (!vid) { stats.autoErrors.push('no run row/verification_id after 10s: ' + e.runId); return; }
        const v = await q('SELECT short_id FROM verification WHERE id=$1', [vid]);
        const ver = v.rows[0] && v.rows[0].short_id;
        if (!ver) { stats.autoErrors.push('no verification: ' + e.runId); return; }
        const f = await q('INSERT INTO forensics_fail(ver_short_id, fails, last_run_id) VALUES ($1,1,$2) ON CONFLICT (ver_short_id) DO UPDATE SET fails = forensics_fail.fails + 1, last_run_id = EXCLUDED.last_run_id, updated_at = now() RETURNING fails, analyzed_run_ids', [ver, e.runId]);
        const fails = Number(f.rows[0].fails);
        const done = String(f.rows[0].analyzed_run_ids || '').split(',').filter(Boolean);
        if (done.includes(e.runId)) return;
        if (fails < state.threshold) { ctx.log('ver ' + ver + ' 失败 ' + fails + '/' + state.threshold + ' 次，未达自动取证阈值'); return; }
        ctx.log('ver ' + ver + ' 已失败 ' + fails + ' 次 ≥ 阈值，自动取证 ' + e.runId);
        stats.autoTriggered++;
        await analyzeRun(e.runId, 'auto', {});
      })().catch((err) => { stats.autoErrors.push(String(err && err.message).slice(0, 200)); ctx.log('自动取证失败: ' + (err && err.message)); });
    });

    ctx.registerRoute('get', '/config', (_req, res) => res.json({ found: true, ...state, note: 'threshold=同一验证失败多少次后自动取证；autoAnalyze=是否自动' }));
    ctx.registerRoute('get', '/stats', (_req, res) => res.json({ found: true, state, ...stats }));

    ctx.registerRoute('post', '/config', (req, res) => {
      const b = req.body || {};
      if (Number.isFinite(Number(b.threshold)) && Number(b.threshold) >= 1) state.threshold = Number(b.threshold);
      if (typeof b.autoAnalyze === 'boolean') state.autoAnalyze = b.autoAnalyze;
      res.json({ ok: true, ...state });
    });

    ctx.registerRoute('get', '/repos', async (_req, res) => {
      const r = await q('SELECT key, provider, repo, branch, token_env, updated_at FROM forensics_repo_map ORDER BY key');
      res.json({ found: true, count: r.rows.length, repos: r.rows });
    });

    ctx.registerRoute('post', '/repos', async (req, res) => {
      const b = req.body || {};
      const key = String(b.key || '').trim();
      const provider = b.provider === 'gitlab' ? 'gitlab' : 'local';
      const repo = String(b.repo || '').trim();
      if (!key || !repo) { res.status(400).json({ ok: false, error: 'key 与 repo 必填（key：verification 短 id / application 短 id / host / *）' }); return; }
      if (provider === 'local' && !fs.existsSync(repo)) { res.status(400).json({ ok: false, error: '本地目录不存在：' + repo }); return; }
      await q('INSERT INTO forensics_repo_map(key, provider, repo, branch, token_env) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO UPDATE SET provider=EXCLUDED.provider, repo=EXCLUDED.repo, branch=EXCLUDED.branch, token_env=EXCLUDED.token_env, updated_at=now()',
        [key, provider, repo, b.branch || null, b.tokenEnv || null]);
      res.json({ ok: true, key, provider, repo });
    });

    ctx.registerRoute('delete', '/repos/:key', async (req, res) => {
      const r = await q('DELETE FROM forensics_repo_map WHERE key=$1', [req.params.key]);
      res.json({ ok: true, removed: r.rowCount || 0 });
    });

    ctx.registerRoute('post', '/analyze', async (req, res) => {
      const b = req.body || {};
      try {
        let rid = b.runId;
        if (!rid && b.verShortId) rid = await latestFailRun(String(b.verShortId));
        if (!rid) { res.status(400).json({ ok: false, error: '需要 runId 或 verShortId（后者取该验证最近一次失败 run）' }); return; }
        res.json(await analyzeRun(rid, 'manual', { force: !!b.force }));
      } catch (err) { res.status(500).json({ ok: false, error: err && err.message }); }
    });

    ctx.registerRoute('get', '/reports', async (req, res) => {
      const ver = req.query.ver; const run = req.query.run ? normRun(req.query.run) : null;
      const lim = Math.min(Number(req.query.limit) || 10, 50);
      const conds = []; const params = [];
      if (ver) { params.push(String(ver)); conds.push('ver_short_id = $' + params.length); }
      if (run) { params.push(run); conds.push('run_id = $' + params.length); }
      const r = await q('SELECT id, run_id, ver_short_id, trigger, status, keywords, files, md_path, created_at FROM forensics_report ' + (conds.length ? 'WHERE ' + conds.join(' AND ') + ' ' : '') + 'ORDER BY id DESC LIMIT ' + lim, params);
      res.json({ found: true, count: r.rows.length, reports: r.rows.map((row) => ({ ...row, keywords: JSON.parse(row.keywords || '[]'), files: JSON.parse(row.files || '[]') })) });
    });

    ctx.registerRoute('get', '/report/:runId', async (req, res) => {
      const rid = normRun(req.params.runId);
      const p = path.join(ctxRef.rootDir, 'out', 'code-forensics', rid + '.json');
      if (!fs.existsSync(p)) { res.json({ found: false, runId: rid, note: '该 run 无取证报告（GET /reports 查看已有列表）' }); return; }
      res.json({ found: true, report: JSON.parse(fs.readFileSync(p, 'utf8')) });
    });
  },
};
