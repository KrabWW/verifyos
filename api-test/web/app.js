/**
 * api-test 工作台主逻辑（纯原生 JS，无框架）。
 * 职责：渲染左栏 API 树 / 中栏四个视图（API 详情、测试用例、覆盖率看板、场景编排）/ 右栏 AI 面板。
 * 数据来自 data.js 的 window.API_DATA（静态演示，字段对齐各引擎模块）。
 */
"use strict";

/* ------------------------------ 全局状态 ------------------------------ */
const DATA = window.API_DATA;
const state = {
  view: "api",           // 当前主视图：api / cases / coverage / scenario
  selectedApiId: null,   // 左栏选中的 API id
  search: "",            // 左栏搜索词
  env: "dev",            // 环境：dev / prod
  caseTab: "all",        // 测试用例来源 tab
  caseOpenId: null,      // 展开断言明细的用例
  scenarioId: null,      // 选中的场景
  scnNodeId: null,       // 步骤树中选中的节点 id（检查器显示它）
  scnCollapsed: new Set(), // 折叠的容器节点 id
  scnMenu: null,         // 原语面板：'add' | 'add-api' | 'add-ref' | null
  scnVarsOpen: false,    // 变量面板
  scnReportOpen: false,  // 报告预览
  scnRunning: false,     // 运行动画进行中
  scnSummary: null,      // 运行汇总 { pass, fail, skipped, totalMs }
  demo: null,            // 右栏当前演示：recordToCase / edgeCases / diagnosis
};

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** HTML 转义，防注入 */
function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** 按 method 着色徽章 class */
function methodClass(m) { return "method-" + esc(m); }

/** 简易 JSON 语法高亮（key/string/number/布尔空值） */
function highlightJson(obj) {
  const json = JSON.stringify(obj, null, 2) || "";
  return esc(json)
    .replace(/"([^"]+)":/g, '"<span class="jk">$1</span>:')
    .replace(/: "([^"]*)"/g, ': "<span class="js">$1</span>"')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="jn">$1</span>')
    .replace(/: (true|false|null)/g, ': <span class="jb">$1</span>');
}

/** ISO 时间 → 短显示 */
function fmtTime(iso) {
  if (!iso) return "-";
  return iso.replace("T", " ").replace(/\.\d+Z$/, "").slice(5, 16);
}

/** 根据 id 找 API 定义 */
function apiById(id) { return DATA.API_DEFINITIONS.find((a) => a.id === id); }

/** 根据 API id 找覆盖明细 */
function covByApiId(id) { return DATA.COVERAGE.operations.find((o) => o.api_definition_id === id); }

/** 覆盖状态：covered / partial / uncovered */
function covState(op) {
  if (!op || !op.covered) return "uncovered";
  return op.codes_fully_covered ? "covered" : "partial";
}
function covLabel(s) { return s === "covered" ? "已覆盖" : s === "partial" ? "部分覆盖" : "未覆盖"; }

/** 某用例是否属于当前来源 tab */
function caseInTab(tc, tab) {
  if (tab === "all") return true;
  if (tab === "edge") return tc.source === "spec" || tc.source === "ai";
  return tc.source === tab;
}

/* ------------------------------ 左栏：API 树 ------------------------------ */
function renderTree() {
  const tree = $("#apiTree");
  const kw = state.search.trim().toLowerCase();
  // 搜索：匹配 path / method / tags / summary
  const filtered = DATA.API_DEFINITIONS.filter((a) => {
    if (!kw) return true;
    return (
      a.path.toLowerCase().includes(kw) ||
      a.method.toLowerCase().includes(kw) ||
      (a.summary || "").toLowerCase().includes(kw) ||
      a.tags.some((t) => t.toLowerCase().includes(kw))
    );
  });

  // 按 path 首段（或 tag）分组
  const groups = new Map();
  for (const api of filtered) {
    const g = api.tags[0] || api.path.split("/")[1] || "default";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(api);
  }

  let html = "";
  for (const [name, apis] of groups) {
    html += '<div class="tree-group">';
    html += '<div class="tree-group-head"><span class="arrow">▼</span><span>' + esc(name) + '</span><span class="grp-count">' + apis.length + "</span></div>";
    html += '<div class="tree-items">';
    for (const api of apis) {
      const st = covState(covByApiId(api.id));
      html +=
        '<div class="tree-item' + (api.id === state.selectedApiId ? " selected" : "") + '" data-api="' + esc(api.id) + '">' +
        '<span class="method-badge ' + methodClass(api.method) + '">' + esc(api.method) + "</span>" +
        '<span class="item-path">' + esc(api.path) + "</span>" +
        '<span class="item-dot ' + st + '" title="' + covLabel(st) + '"></span>' +
        "</div>";
    }
    html += "</div></div>";
  }
  tree.innerHTML = html;
  $("#apiCount").textContent = filtered.length + "/" + DATA.API_DEFINITIONS.length;

  $$(".tree-item", tree).forEach((el) => {
    el.addEventListener("click", () => {
      state.selectedApiId = el.dataset.api;
      state.view = "api";
      renderTree(); renderTabs(); renderWorkspace(); renderCtxSelected();
    });
  });
  $$(".tree-group-head", tree).forEach((el) => {
    el.addEventListener("click", () => el.parentElement.classList.toggle("collapsed"));
  });
}

/* ------------------------------ 顶部 tab ------------------------------ */
function renderTabs() {
  $$("#mainTabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.view === state.view));
}

/* ------------------------------ 视图 1：API 详情 ------------------------------ */
function viewApiDetail() {
  const api = apiById(state.selectedApiId) || DATA.API_DEFINITIONS[0];
  if (!api) return '<div class="view-sub">暂无 API 数据</div>';
  const cov = covByApiId(api.id);
  const st = covState(cov);
  const env = DATA.ENVIRONMENTS.find((e) => e.name === state.env);
  const cases = DATA.TEST_CASES.filter((tc) => tc.api_definition_id === api.id);

  let html = "";
  html += '<div class="view-title">' + esc(api.summary || api.path) + "</div>";
  html += '<div class="view-sub">' + esc(api.description || "来自 inventory 的 API 定义（ApiDefinition）") + "</div>";

  // 请求构建器形态
  html += '<div class="req-bar">' +
    '<span class="method-badge ' + methodClass(api.method) + '">' + esc(api.method) + "</span>" +
    '<span class="url">' + esc(env.base_url) + esc(api.path) + "</span>" +
    '<button class="send-btn">发送</button></div>';

  // 元信息条
  html += '<div class="meta-row">' +
    '<span class="meta-chip">来源 <b>' + esc(api.spec_source) + "</b></span>" +
    '<span class="meta-chip">认证 <b>' + esc(api.auth_type) + "</b></span>" +
    '<span class="meta-chip">标签 <b>' + esc(api.tags.join(", ")) + "</b></span>" +
    (api.scope ? '<span class="meta-chip">范围 <b>' + esc(api.scope) + "</b></span>" : "") +
    '<span class="meta-chip">状态 <b>' + esc(api.status) + "</b></span>" +
    '<span class="meta-chip">样本 <b>' + api.sample_count + "</b></span>" +
    '<span class="meta-chip">用例 <b>' + cases.length + "</b></span>" +
    "</div>";

  // 参数表
  if (api.parameters && api.parameters.length) {
    html += '<div class="panel"><div class="panel-head">Params<span class="hint">from OpenAPI parameters</span></div><div class="panel-body"><table class="kv-table"><tr><th>名称</th><th>位置</th><th>必填</th><th>类型</th><th>约束</th></tr>';
    for (const p of api.parameters) {
      const sc = p.schema || {};
      const cons = ["minimum", "maximum", "minLength", "maxItems", "format", "enum"]
        .filter((k) => sc[k] !== undefined).map((k) => k + "=" + JSON.stringify(sc[k])).join(", ");
      html += "<tr><td class=\"k\">" + esc(p.name) + '</td><td class="v">' + esc(p.in) + '</td><td class="v">' + (p.required ? "是" : "否") + '</td><td class="v">' + esc(sc.type || "-") + '</td><td class="desc">' + esc(cons || "-") + "</td></tr>";
    }
    html += "</table></div></div>";
  }

  // 请求体 schema
  if (api.request_schema) {
    html += '<div class="panel"><div class="panel-head">Body（请求体 Schema）</div><div class="panel-body"><div class="code-block">' + highlightJson(api.request_schema) + "</div></div></div>";
  }

  // 响应码 + 覆盖状态
  html += '<div class="panel"><div class="panel-head">响应与覆盖<span class="hint">from coverage engine</span></div><div class="panel-body"><div class="cov-strip">';
  html += '<span class="cov-status ' + st + '">' + covLabel(st) + "</span>";
  if (cov) {
    html += '<div class="cov-codes">' + cov.codes.map((c) =>
      '<span class="code-dot' + (c.covered ? " on" : "") + '">' + c.status_code + (c.covered ? " ✓" : " ·") + "</span>").join("") + "</div>";
    html += '<span class="meta-chip">用例数 <b>' + cov.test_case_count + "</b></span>";
    html += '<span class="meta-chip">最近测试 <b>' + fmtTime(cov.last_tested_at) + "</b></span>";
  }
  html += "</div></div></div>";

  // 关联用例
  if (cases.length) {
    html += '<div class="panel"><div class="panel-head">关联测试用例<span class="hint">' + cases.length + " 条</span></div><div class=\"panel-body\">";
    for (const tc of cases) {
      html += caseCardHtml(tc, false);
    }
    html += "</div></div>";
  }
  return html;
}

/** 用例卡片（列表与详情复用；expandable=是否可展开明细） */
function caseCardHtml(tc, expandable) {
  const api = apiById(tc.api_definition_id);
  const open = expandable && tc.id === state.caseOpenId;
  let html = '<div class="case-card' + (open ? " open" : "") + '" data-case="' + esc(tc.id) + '">';
  html += '<div class="case-head">' +
    '<span class="method-badge ' + methodClass(tc.request.method) + '">' + esc(tc.request.method) + "</span>" +
    '<span class="case-name">' + esc(tc.name) + "</span>" +
    (tc.kind ? '<span class="meta-chip">' + esc(tc.kind) + "</span>" : "") +
    '<span class="src-pill src-' + esc(tc.source) + '">' + esc(tc.source) + "</span>" +
    '<span class="case-req">' + esc(tc.request.path) + "</span>" +
    '<span class="result-pill result-' + esc(tc.last_result) + '">' + esc(tc.last_result) + "</span>" +
    '<span class="review-pill ' + esc(tc.review_status) + '">' + esc(tc.review_status) + "</span>" +
    "</div>";
  if (expandable) {
    html += '<div class="case-detail">';
    if (tc.description) html += '<div class="view-sub" style="margin-bottom:8px">' + esc(tc.description) + "</div>";
    if (tc.expectation) html += '<div class="view-sub" style="margin-bottom:8px">期望：' + esc(tc.expectation) + "</div>";
    // 断言明细（assertion 的 target/operator/expected/mode）
    html += '<div style="font-size:11px;color:var(--fg-faint);margin-bottom:4px">断言（' + tc.assertions.length + "）</div>";
    for (const a of tc.assertions) {
      html += '<div class="assert-row">' +
        '<span class="atype">' + esc(a.type) + "</span>" +
        (a.target ? '<span class="atarget">' + esc(a.target) + "</span>" : "") +
        (a.operator ? '<span class="aop">' + esc(a.operator) + "</span>" : "") +
        (a.expected !== undefined ? '<span class="aexp">' + esc(JSON.stringify(a.expected)) + "</span>" : "") +
        (a.mode === "ignore" ? '<span class="amode" title="噪音字段：仅断言存在性">ignore</span>' : "") +
        "</div>";
    }
    // 请求预览
    html += '<div style="font-size:11px;color:var(--fg-faint);margin:10px 0 4px">请求</div>';
    html += '<div class="code-block">' + highlightJson(tc.request) + "</div>";
    if (api) html += '<div class="view-sub" style="margin-top:8px">关联 API：' + esc(api.method + " " + api.path) + " · 生成于 " + fmtTime(tc.created_at) + "</div>";
    html += "</div>";
  }
  html += "</div>";
  return html;
}

/* ------------------------------ 视图 2：测试用例 ------------------------------ */
function viewCases() {
  const tabs = [
    { key: "all", label: "全部" },
    { key: "recorded", label: "录制" },
    { key: "spec", label: "spec 生成" },
    { key: "ai", label: "AI 生成" },
    { key: "edge", label: "edge-case" },
  ];
  let html = '<div class="view-title">测试用例</div>';
  html += '<div class="view-sub">来源：录制回放 / spec 生成 / AI 生成，点击卡片查看断言明细（assertion：target / operator / expected / mode）</div>';
  html += '<div class="sub-tabs">';
  for (const t of tabs) {
    const n = DATA.TEST_CASES.filter((tc) => caseInTab(tc, t.key)).length;
    html += '<button class="subtab' + (state.caseTab === t.key ? " active" : "") + '" data-tab="' + t.key + '">' + t.label + "<b>" + n + "</b></button>";
  }
  html += "</div>";

  const list = DATA.TEST_CASES.filter((tc) => caseInTab(tc, state.caseTab));
  html += '<div class="case-list">';
  for (const tc of list) html += caseCardHtml(tc, true);
  html += "</div>";
  return html;
}

/* ------------------------------ 视图 3：覆盖率看板 ------------------------------ */
function viewCoverage() {
  const c = DATA.COVERAGE;
  let html = '<div class="view-title">覆盖率看板</div>';
  html += '<div class="view-sub">数据源：coverage 引擎 renderBoard（operation 维度 + 响应码维度）</div>';

  // 顶部大数字
  html += '<div class="cov-hero">';
  html += '<div class="cov-big"><div class="num">' + Math.round(c.rate * 100) + "<small>%</small></div><div class=\"lbl\">API 覆盖率（" + c.covered_count + "/" + c.total + "）</div></div>";
  html += '<div class="cov-stats">';
  html += '<div class="cov-stat ok"><span class="v">' + c.covered_count + '</span><span class="l">已覆盖 API</span></div>';
  html += '<div class="cov-stat warn"><span class="v">' + c.partially_covered.length + '</span><span class="l">部分覆盖（响应码缺口）</span></div>';
  html += '<div class="cov-stat err"><span class="v">' + c.uncovered.length + '</span><span class="l">未覆盖（按风险优先补测）</span></div>';
  html += '<div class="cov-stat"><span class="v">' + DATA.TEST_CASES.length + '</span><span class="l">测试用例总数</span></div>';
  html += "</div></div>";

  // 每 API 覆盖行
  html += '<div class="panel"><div class="panel-head">API 覆盖明细<span class="hint">点阵 = 预期响应码覆盖情况（✓ 已测 / · 未测）</span></div>';
  for (const op of c.operations) {
    const st = covState(op);
    const onCount = op.codes.filter((x) => x.covered).length;
    html += '<div class="cov-row">' +
      '<span class="method-badge ' + methodClass(op.method) + '">' + esc(op.method) + "</span>" +
      '<span class="cov-path">' + esc(op.path) + "</span>" +
      '<span class="trend-gaps">' + op.codes.map((x) =>
        '<span class="code-dot' + (x.covered ? " on" : "") + '" title="' + x.status_code + (x.covered ? " 已测" : " 未测") + '">' + x.status_code + (x.covered ? " ✓" : " ·") + "</span>").join("") + "</span>" +
      '<span class="cov-cases">' + onCount + "/" + op.codes.length + ' 码</span>' +
      '<span class="cov-bar"><i style="width:' + (op.codes.length ? Math.round((onCount / op.codes.length) * 100) : 0) + '%"></i></span>' +
      '<span class="cov-status ' + st + '">' + covLabel(st) + "</span>" +
      "</div>";
  }
  html += "</div>";

  // 未覆盖清单（按 risk 降序）
  html += '<div class="panel"><div class="panel-head">未覆盖清单（按 risk 降序）</div>';
  const sorted = [...c.uncovered].sort((a, b) => b.risk - a.risk);
  for (const u of sorted) {
    html += '<div class="cov-row">' +
      '<span class="method-badge ' + methodClass(u.method) + '">' + esc(u.method) + "</span>" +
      '<span class="cov-path">' + esc(u.path) + "</span>" +
      '<span class="cov-cases">risk ' + u.risk + "</span>" +
      '<span class="cov-codes">' + u.uncovered_codes.map((cd) => '<span class="code-dot">' + cd + "</span>").join("") + "</span>" +
      '<span class="cov-status uncovered">' + (u.operation_uncovered ? "整接口未测" : "部分未测") + "</span>" +
      "</div>";
  }
  html += "</div>";

  // 覆盖趋势点阵（两轮快照）
  html += '<div class="panel"><div class="panel-head">覆盖趋势（最近两轮）</div>';
  for (const t of c.trend) {
    html += '<div class="cov-row">' +
      '<span class="cov-path" style="flex:0 0 190px">' + esc(t.api_key) + "</span>" +
      '<span class="trend-gaps">' + t.points.map((p) =>
        '<span class="trend-dot ' + (p.covered ? "on" : "off") + '" title="' + esc(p.tested_at) + (p.covered ? " 已覆盖" : " 未覆盖") + '"></span>').join("") + "</span>" +
      "</div>";
  }
  html += "</div>";
  return html;
}

/* ------------------------------ 视图 4：场景编排（MeterSphere 式步骤树） ------------------------------ */

/** 六种步骤原语元数据 */
const STEP_TYPES = {
  request:   { label: "请求",    icon: "◈", cls: "t-request",   desc: "引用 API 清单发送请求" },
  condition: { label: "条件分支", icon: "⑃", cls: "t-condition", desc: "表达式成立走 then，否则走 else" },
  loop:      { label: "循环",    icon: "⑂", cls: "t-loop",      desc: "按次数 / forEach 重复执行子步骤" },
  wait:      { label: "等待",    icon: "◷", cls: "t-wait",      desc: "固定延时后继续" },
  assert:    { label: "断言",    icon: "✓", cls: "t-assert",    desc: "独立步骤级断言" },
  reference: { label: "引用场景", icon: "❝", cls: "t-reference", desc: "复用其它场景（引用不复制）" },
};

/** 深度优先遍历步骤树 */
function walkSteps(nodes, fn) {
  for (const n of nodes || []) {
    fn(n);
    if (n.children) walkSteps(n.children, fn);
  }
}

/** 递归渲染一行步骤节点（容器节点后跟 children 包裹层） */
function stepRowHtml(node, depth) {
  const meta = STEP_TYPES[node.type] || { label: node.type, icon: "·", cls: "" };
  const hasKids = node.children && node.children.length;
  const collapsed = state.scnCollapsed.has(node.id);
  const st = node.status || "pending";
  const dur = node.durationMs != null ? node.durationMs + "ms" : "";
  const branch = node.branch ? '<span class="branch-tag ' + node.branch + '">' + node.branch + "</span>" : "";
  const stDot = '<span class="step-status ' + st + '" title="' + st + '"></span>';

  let html = '<div class="step-row st-' + st + (state.scnNodeId === node.id ? " selected" : "") + '" data-node="' + esc(node.id) + '" style="--d:' + depth + '">';
  html += '<span class="twist' + (hasKids ? "" : " leaf") + (collapsed ? " closed" : "") + '">' + (hasKids ? "▾" : "") + "</span>";
  html += '<span class="step-tbadge ' + meta.cls + '">' + meta.icon + " " + meta.label + "</span>";
  html += '<span class="step-nm">' + esc(node.name) + "</span>" + branch;
  if (node.type === "request" && node.config) {
    html += '<span class="method-badge ' + methodClass(node.config.method) + '">' + esc(node.config.method) + "</span>";
    html += '<span class="step-u">' + esc((node.config.url || "").replace(/^https?:\/\/[^/]+/, "")) + "</span>";
  }
  if (node.type === "loop" && node.config) {
    html += '<span class="step-u">' + (node.config.loopType === "forEach" ? "forEach " + esc(node.config.variable || "") : esc(node.config.count || 1) + " 次") + "</span>";
  }
  if (node.type === "wait" && node.config) {
    html += '<span class="step-u">' + esc(node.config.durationMs || 0) + "ms</span>";
  }
  html += '<span class="step-right">' + (dur ? '<span class="step-dur">' + dur + "</span>" : "") + stDot + "</span>";
  html += "</div>";
  if (hasKids) {
    html += '<div class="step-children' + (collapsed ? " hide" : "") + '" data-owner="' + esc(node.id) + '">' +
      node.children.map((c) => stepRowHtml(c, depth + 1)).join("") + "</div>";
  }
  return html;
}

/** 检查器：步骤配置 + 执行结果 */
function inspectorHtml(node) {
  const meta = STEP_TYPES[node.type] || {};
  const sc = DATA.SCENARIOS.find((s) => s.id === state.scenarioId) || DATA.SCENARIOS[0];
  let h = '<div class="insp-head"><span class="step-tbadge ' + (meta.cls || "") + '">' + (meta.icon || "") + " " + esc(meta.label || node.type) + '</span><b>' + esc(node.name) + "</b></div>";

  h += '<div class="insp-sec">配置</div>';
  if (node.type === "request") {
    const c = node.config || {};
    h += '<div class="insp-req"><span class="method-badge ' + methodClass(c.method) + '">' + esc(c.method || "GET") + '</span><span class="insp-url">' + esc(c.url || "") + "</span></div>";
    if (c.headers && Object.keys(c.headers).length) {
      h += '<div class="insp-kv">' + Object.entries(c.headers).map(([k, v]) =>
        '<div class="kv-line"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + "</span></div>").join("") + "</div>";
    }
    if (c.body) h += '<div class="code-block insp-code">' + esc(c.body) + "</div>";
    if (c.assertions && c.assertions.length) {
      h += '<div class="insp-sub">断言（' + c.assertions.length + "）</div>";
      for (const a of c.assertions) h += assertLine(a);
    }
    if (c.extract && c.extract.length) {
      h += '<div class="insp-sub">变量提取</div>';
      h += c.extract.map((e) => '<div class="kv-line"><span class="k">' + esc(e.name) + '</span><span class="v">← ' + esc(e.jsonpath) + "</span></div>").join("");
    }
  } else if (node.type === "condition") {
    const c = node.config || {};
    h += '<div class="code-block insp-code">' + esc(c.expression || (c.variable + " " + (c.operator || "?") + " " + (c.value || ""))) + "</div>";
    h += '<div class="kv-line"><span class="k">变量</span><span class="v">' + esc(c.variable || "-") + '</span></div>';
    h += '<div class="kv-line"><span class="k">判断</span><span class="v">' + esc(c.variable + " " + (c.operator || "?") + " " + (c.value || "")) + "</span></div>";
  } else if (node.type === "loop") {
    const c = node.config || {};
    if (c.loopType === "forEach") {
      h += '<div class="kv-line"><span class="k">类型</span><span class="v">forEach</span></div>';
      h += '<div class="kv-line"><span class="k">遍历变量</span><span class="v">' + esc(c.variable || "-") + "</span></div>";
    } else {
      h += '<div class="kv-line"><span class="k">类型</span><span class="v">次数循环</span></div>';
      h += '<div class="kv-line"><span class="k">次数</span><span class="v">' + esc(c.count || 1) + '</span></div>';
      h += '<div class="kv-line"><span class="k">轮间隔</span><span class="v">' + esc(c.intervalMs || 0) + "ms</span></div>";
    }
  } else if (node.type === "wait") {
    h += '<div class="kv-line"><span class="k">等待时长</span><span class="v">' + esc((node.config || {}).durationMs || 0) + "ms</span></div>";
  } else if (node.type === "assert") {
    h += assertLine(node.config || {});
  } else if (node.type === "reference") {
    const c = node.config || {};
    const ref = DATA.SCENARIOS.find((s) => s.id === c.scenarioId);
    h += '<div class="kv-line"><span class="k">引用</span><span class="v">' + esc(ref ? ref.name : c.scenarioId || "-") + "</span></div>";
    h += '<div class="kv-line"><span class="k">方式</span><span class="v">' + (c.refMode === "ref" ? "引用（源更新自动生效）" : "复制") + "</span></div>";
    if (ref) h += '<div class="kv-line"><span class="k">子步骤数</span><span class="v">' + countSteps(ref.steps) + "</span></div>";
    if (c.note) h += '<div class="insp-note">' + esc(c.note) + "</div>";
  }

  const st = node.status || "pending";
  h += '<div class="insp-sec">执行结果</div>';
  h += '<div class="insp-res"><span class="result-pill result-' + (st === "pass" ? "pass" : st === "fail" ? "fail" : "pending") + '">' + st.toUpperCase() + "</span>" +
    (node.durationMs != null ? '<span class="step-dur">' + node.durationMs + "ms</span>" : "") + "</div>";
  if (st === "skipped" && node.result && node.result.message) {
    h += '<div class="insp-note">⊘ ' + esc(node.result.message) + "</div>";
  } else if (node.result && node.result.status_code != null) {
    h += '<div class="kv-line"><span class="k">状态码</span><span class="v">' + node.result.status_code + "</span></div>";
    if (node.result.extracted && Object.keys(node.result.extracted).length) {
      h += '<div class="insp-sub">提取到的变量</div>';
      h += Object.entries(node.result.extracted).map(([k, v]) =>
        '<div class="kv-line"><span class="k">' + esc(k) + '</span><span class="v">' + esc(String(v)) + "</span></div>").join("");
    }
    if (node.result.assertions) {
      h += '<div class="insp-sub">断言明细</div>';
      for (const a of node.result.assertions) {
        h += '<div class="assert-row' + (a.passed ? "" : " bad") + '"><span class="atype">' + esc(a.type) + "</span>" +
          (a.target ? '<span class="atarget">' + esc(a.target) + "</span>" : "") +
          (a.operator ? '<span class="aop">' + esc(a.operator) + "</span>" : "") +
          '<span class="aexp">' + esc(JSON.stringify(a.expected)) + "</span>" +
          '<span class="aact">' + esc(JSON.stringify(a.actual)) + "</span>" +
          '<span class="res-mark ' + (a.passed ? "ok" : "no") + '">' + (a.passed ? "✓" : "✗") + "</span></div>";
        if (!a.passed && a.message) h += '<div class="fail-msg">✗ ' + esc(a.message) + "</div>";
      }
    }
  } else if (node.result && node.result.message) {
    h += (node.result.passed === false ? '<div class="fail-msg">✗ ' : '<div class="insp-note">') + esc(node.result.message) + "</div>";
  } else if (st === "pending") {
    h += '<div class="insp-note">尚未执行</div>';
  }

  if (node.type === "loop" && node.iterations && node.iterations.length) {
    h += '<div class="insp-sub">分轮结果</div><div class="iter-list">';
    for (const it of node.iterations) {
      h += '<div class="iter-row' + (it.status === "fail" ? " bad" : "") + '"><b>#' + it.index + "</b>" +
        '<span class="result-pill result-' + (it.status === "pass" ? "pass" : it.status === "fail" ? "fail" : "pending") + '">' + it.status + "</span>" +
        '<span class="step-dur">' + it.durationMs + "ms</span>";
      const flat = Object.entries(it.childResults || {}).map(([id, r]) => {
        const nd = findNode(sc.steps, id);
        return (nd ? nd.name : id).slice(0, 10) + ":" + r.status.slice(0, 4);
      }).join(" · ");
      h += '<span class="iter-kids">' + esc(flat) + "</span></div>";
    }
    h += "</div>";
  }
  return h;
}

function assertLine(a) {
  return '<div class="assert-row"><span class="atype">' + esc(a.type) + "</span>" +
    (a.target ? '<span class="atarget">' + esc(a.target) + "</span>" : "") +
    '<span class="aop">' + esc(a.operator || "?") + "</span>" +
    '<span class="aexp">' + esc(JSON.stringify(a.expected)) + "</span></div>";
}

function findNode(steps, id) {
  let hit = null;
  walkSteps(steps, (n) => { if (!hit && n.id === id) hit = n; });
  return hit;
}

function countSteps(steps) {
  let n = 0;
  walkSteps(steps, () => n++);
  return n;
}

function scnTreeMaxDepth(steps) {
  let max = 0;
  (function rec(arr, d) {
    for (const n of arr || []) {
      if (d + 1 > max) max = d + 1;
      if (n.children) rec(n.children, d + 1);
    }
  })(steps, 0);
  return max;
}

/** 顶部工具条：运行 / 添加步骤 / 变量 / 报告 */
function scnToolbarHtml() {
  let h = '<div class="scn-toolbar">';
  h += '<button class="run-btn" id="scnRun"' + (state.scnRunning ? " disabled" : "") + ">" + (state.scnRunning ? "执行中…" : "▶ 运行") + "</button>";
  h += '<button class="tool-btn" id="scnAddBtn">＋ 添加步骤 ▾</button>';
  h += '<button class="tool-btn" id="scnVarsBtn">⚙ 变量</button>';
  h += '<button class="tool-btn" id="scnReportBtn">☰ 报告</button>';
  if (state.scnSummary) {
    const s = state.scnSummary;
    h += '<span class="scn-summary' + (s.fail ? " has-fail" : "") + '">' +
      '<i class="dot ok"></i>' + s.pass + " pass · " +
      '<i class="dot no"></i>' + s.fail + " fail · " +
      '<i class="dot sk"></i>' + s.skipped + " skipped · 总耗时 " + s.totalMs + "ms</span>";
  }
  h += "</div>";
  return h;
}

function viewScenario() {
  const sc = DATA.SCENARIOS.find((s) => s.id === state.scenarioId) || DATA.SCENARIOS[0];
  const rep = sc.last_report;
  const env = DATA.ENVIRONMENTS.find((e) => e.name === state.env) || DATA.ENVIRONMENTS[0];
  state.scenarioId = sc.id;
  const total = countSteps(sc.steps);

  let html = '<div class="view-title">场景编排 · 步骤树</div>';
  html += '<div class="view-sub">树形编排：条件/循环做父节点嵌套子步骤，{{var}} 变量传递。环境：' + esc(env.name) + "（" + esc(env.base_url) + "）</div>";

  html += '<div class="scn-layout">';
  html += '<div class="scn-list">';
  for (const s of DATA.SCENARIOS) {
    html += '<div class="scn-card' + (s.id === sc.id ? " active" : "") + '" data-scn="' + esc(s.id) + '">' +
      '<div class="nm">' + esc(s.name) + "</div>" +
      '<div class="ds">' + esc(s.description || "") + "</div></div>";
  }
  html += "</div>";

  html += '<div class="scn-main">';
  html += scnToolbarHtml();

  // 原语下拉面板
  if (state.scnMenu === "add") {
    html += '<div class="add-menu">';
    for (const key of Object.keys(STEP_TYPES)) {
      const m = STEP_TYPES[key];
      html += '<div class="add-item" data-add="' + key + '"><span class="step-tbadge ' + m.cls + '">' + m.icon + " " + m.label + '</span><span class="add-d">' + m.desc + "</span></div>";
    }
    html += "</div>";
  } else if (state.scnMenu === "add-api") {
    html += '<div class="add-menu"><div class="add-menu-title">从 API 清单选择</div>';
    for (const a of DATA.API_DEFINITIONS) {
      html += '<div class="add-item" data-add-api="' + esc(a.id) + '"><span class="method-badge ' + methodClass(a.method) + '">' + esc(a.method) + '</span><span class="add-d">' + esc(a.path) + " · " + esc(a.summary || "") + "</span></div>";
    }
    html += "</div>";
  } else if (state.scnMenu === "add-ref") {
    html += '<div class="add-menu"><div class="add-menu-title">选择要引用的场景</div>';
    for (const s of DATA.SCENARIOS) {
      if (s.id === sc.id) continue;
      html += '<div class="add-item" data-add-ref="' + esc(s.id) + '"><span class="step-tbadge t-reference">❝ 引用场景</span><span class="add-d">' + esc(s.name) + "</span></div>";
    }
    html += "</div>";
  }

  html += '<div class="scn-body">';
  html += '<div class="panel scn-tree-panel"><div class="panel-head">步骤树<span class="hint">' + total + ' 节点 · 深度 ' + scnTreeMaxDepth(sc.steps) + ' · 点节点看检查器</span></div>';
  html += '<div class="tree-canvas">' + sc.steps.map((n) => stepRowHtml(n, 0)).join("") + "</div></div>";

  const sel = state.scnNodeId && findNode(sc.steps, state.scnNodeId);
  html += '<div class="panel scn-inspector' + (sel ? "" : " empty") + '"><div class="panel-head">检查器<span class="hint">' + (sel ? esc(sel.name) : "未选中步骤") + "</span></div>";
  html += '<div class="insp-body">' + (sel ? inspectorHtml(sel) : '<div class="ctx-empty">点击左侧步骤树中的节点，查看配置与执行结果</div>') + "</div></div>";
  html += "</div>";

  // 变量面板
  if (state.scnVarsOpen) {
    const vars = { ...(env.vars || {}) };
    walkSteps(sc.steps, (n) => {
      const ex = n.config && n.config.extract;
      if (ex) for (const e of ex) vars[e.name] = "← " + e.jsonpath;
    });
    html += '<div class="panel"><div class="panel-head">变量面板<span class="hint">环境变量 + 步骤提取变量</span></div><div class="panel-body">';
    for (const kv of Object.entries(vars)) {
      html += '<div class="kv-line"><span class="k">' + esc(kv[0]) + '</span><span class="v">' + esc(kv[1]) + "</span></div>";
    }
    html += "</div></div>";
  }

  // 报告预览（md 形态）
  if (state.scnReportOpen && rep) {
    html += '<div class="panel"><div class="panel-head">最近运行报告（' + esc(rep.environment_name) + '）<span class="hint">markdown 导出预览</span></div>';
    html += '<div class="report-head">' +
      '<span class="' + (rep.passed ? "pass-pill" : "fail-pill") + '">' + (rep.passed ? "PASS" : "FAIL") + "</span>" +
      '<span class="rh-title">' + esc(rep.scenario_name) + "</span>" +
      '<span class="rh-meta">步骤 ' + rep.passed_steps + "/" + rep.total_steps + " · 断言 " + rep.passed_assertions + "/" + rep.total_assertions + " · 耗时 " + rep.duration_ms + "ms · " + fmtTime(rep.started_at) + "</span>" +
      "</div>";
    html += '<div class="panel-body md-preview">';
    html += "<h1># 场景测试报告：" + esc(rep.scenario_name) + "</h1>";
    html += "<p>环境：" + esc(rep.environment_name) + " · base_url：<code>" + esc(rep.base_url) + "</code> · 总耗时 " + rep.duration_ms + "ms</p>";
    html += "<h2>## 步骤结果（树形遍历）</h2><table><tr><th>步骤</th><th>类型</th><th>结果</th><th>耗时</th></tr>";
    walkSteps(sc.steps, (n) => {
      const m = STEP_TYPES[n.type] || {};
      html += "<tr><td>" + esc(n.name) + "</td><td>" + esc(m.label || n.type) + "</td><td>" + (n.status === "pass" ? "PASS" : n.status === "fail" ? "FAIL" : n.status || "-") + "</td><td>" + (n.durationMs != null ? n.durationMs + "ms" : "-") + "</td></tr>";
    });
    html += "</table>";
    const fails = [];
    walkSteps(sc.steps, (n) => {
      if (n.status !== "fail") return;
      const msg = n.result && n.result.assertions
        ? n.result.assertions.filter((x) => !x.passed).map((x) => x.message).join("; ")
        : (n.result && n.result.message) || "";
      fails.push({ name: n.name, msg: msg });
    });
    if (fails.length) {
      html += "<h2>## 失败步骤</h2><table><tr><th>步骤</th><th>原因</th></tr>";
      for (const f of fails) html += "<tr><td>" + esc(f.name) + "</td><td>" + esc(f.msg || "-") + "</td></tr>";
      html += "</table>";
    }
    html += "</div></div>";
  }
  html += "</div></div>";
  return html;
}

/** 运行演示：按树深度优先序 setTimeout 逐步点亮，跑完出汇总 */
function runScenarioDemo() {
  if (state.scnRunning) return;
  const sc = DATA.SCENARIOS.find((s) => s.id === state.scenarioId) || DATA.SCENARIOS[0];
  const plan = [];
  walkSteps(sc.steps, (n) => plan.push({ id: n.id, status: n.status || "pass", durationMs: n.durationMs }));
  const backup = JSON.parse(JSON.stringify(sc.steps));
  state.scnRunning = true;
  state.scnSummary = null;
  state.scnMenu = null;

  walkSteps(sc.steps, (n) => { n.status = undefined; n.durationMs = undefined; });
  renderWorkspace();

  let i = 0;
  const STEP_MS = 240;
  const timer = setInterval(() => {
    if (i >= plan.length) {
      clearInterval(timer);
      state._scnTimer = null;
      let pass = 0, fail = 0, skipped = 0, totalMs = 0;
      walkSteps(sc.steps, (n) => {
        if (n.status === "pass") pass++;
        else if (n.status === "fail") fail++;
        else skipped++;
        totalMs += n.durationMs || 0;
      });
      state.scnRunning = false;
      state.scnSummary = { pass: pass, fail: fail, skipped: skipped, totalMs: totalMs };
      renderWorkspace();
      return;
    }
    const p = plan[i];
    const node = findNode(sc.steps, p.id);
    const finalSt = p.status === "skipped" ? "skipped" : p.status; // skipped 直接跳过 running
    if (node && finalSt !== "skipped") { node.status = "running"; renderWorkspace(); }
    setTimeout(() => {
      if (node) { node.status = finalSt; node.durationMs = p.durationMs; renderWorkspace(); }
    }, STEP_MS * 0.6);
    i++;
  }, STEP_MS);

  state._scnTimer = timer;
  state._scnBackup = { scenarioId: sc.id, steps: backup };
}

/** 中止运行动画并恢复 data.js 初始执行状态 */
function restoreScenario() {
  if (state._scnTimer) { clearInterval(state._scnTimer); state._scnTimer = null; }
  if (state._scnBackup) {
    const sc = DATA.SCENARIOS.find((s) => s.id === state._scnBackup.scenarioId);
    if (sc) sc.steps = state._scnBackup.steps;
    state._scnBackup = null;
  }
  state.scnRunning = false;
}

/* ------------------------------ 右栏：AI 面板 ------------------------------ */
function renderCtxSelected() {
  const el = $("#ctxSelected");
  const api = apiById(state.selectedApiId);
  if (!api) {
    el.innerHTML = '<span class="none">未选择 API</span>';
    return;
  }
  el.innerHTML = '<span class="method-badge ' + methodClass(api.method) + '">' + esc(api.method) + '</span><span class="sel-path">' + esc(api.path) + "</span>";
}

function renderCtxResult() {
  $$(".ctx-btn").forEach((b) => b.classList.toggle("active", b.dataset.demo === state.demo));
  const box = $("#ctxResult");
  if (!state.demo) {
    box.innerHTML = '<div class="ctx-empty">选择左侧 API 后，点击上方按钮预览引擎能力（当前为演示数据）</div>';
    return;
  }
  const d = DATA.AI_DEMOS[state.demo];
  let html = "";

  if (state.demo === "recordToCase") {
    html += '<div class="ai-block"><div class="ai-head">' + esc(d.title) + "</div><div class=\"ai-sum\">" + esc(d.summary) + '</div><div class="ai-body">';
    for (const c of d.cases) {
      html += '<div class="ai-case"><div class="ac-name">' + esc(c.name) + '</div><div class="ac-req">' + esc(c.request) + "</div>";
      for (const a of c.assertions) {
        html += '<div class="assert-row"><span class="atype">' + esc(a.type) + "</span>" +
          (a.target ? '<span class="atarget">' + esc(a.target) + "</span>" : "") +
          (a.operator ? '<span class="aop">' + esc(a.operator) + "</span>" : "") +
          (a.expected !== undefined ? '<span class="aexp">' + esc(a.expected) + "</span>" : "") +
          (a.mode ? '<span class="amode">' + esc(a.mode) + "</span>" : "") + "</div>";
      }
      html += "</div>";
    }
    html += "</div><div class=\"ai-note\">" + esc(d.note) + "</div></div>";
  }

  if (state.demo === "edgeCases") {
    html += '<div class="ai-block"><div class="ai-head">' + esc(d.title) + "</div><div class=\"ai-sum\">" + esc(d.summary) + '</div><div class="ai-body">';
    for (const c of d.cases) {
      html += '<div class="ai-case"><div class="ac-name">' + esc(c.name) + '<span class="cat">' + esc(c.category) + '</span><span class="aexp" style="margin-left:6px">期望 ' + c.expect + "</span></div></div>";
    }
    html += "</div><div class=\"ai-note\">" + esc(d.note) + "</div></div>";
  }

  if (state.demo === "diagnosis") {
    const dg = d.diagnosis;
    html += '<div class="ai-block"><div class="ai-head">' + esc(d.title) + "</div><div class=\"ai-sum\">" + esc(d.summary) + '</div><div class="ai-body">';
    html += '<div style="margin-bottom:8px"><span class="rc-tag rc-' + dg.root_cause + '">' + esc(dg.root_cause) + "</span></div>";
    html += '<div style="font-size:11.5px;line-height:1.7;color:var(--fg);margin-bottom:8px">' + esc(dg.reason) + "</div>";
    html += '<div style="font-size:11px;color:var(--fg-faint);margin-bottom:4px">修复建议</div>';
    dg.suggestions.forEach((s, i) => { html += '<div class="ai-sug"><span class="n">' + (i + 1) + ".</span><span>" + esc(s) + "</span></div>"; });
    // 证据 diff
    const ev = dg.evidence;
    html += '<div style="font-size:11px;color:var(--fg-faint);margin:10px 0 4px">证据 diff（status：期望 ' + ev.expected_status + " / 实际 " + ev.actual_status + "）</div>";
    html += '<div class="code-block" style="padding:8px 10px">' +
      esc(ev.failures.map((f) => f.target + " " + f.kind + "\n  expected: " + JSON.stringify(f.expected) + "\n  actual  : " + JSON.stringify(f.actual)).join("\n")) +
      "</div>";
    html += "</div></div>";
  }
  box.innerHTML = html;
}

/* ------------------------------ 中栏渲染入口 ------------------------------ */
function renderWorkspace() {
  const ws = $("#workspace");
  if (state.view === "api") ws.innerHTML = viewApiDetail();
  else if (state.view === "cases") ws.innerHTML = viewCases();
  else if (state.view === "coverage") ws.innerHTML = viewCoverage();
  else if (state.view === "scenario") ws.innerHTML = viewScenario();
  bindWorkspaceEvents();
}

function bindWorkspaceEvents() {
  // 用例来源 tab
  $$(".subtab").forEach((t) => t.addEventListener("click", () => { state.caseTab = t.dataset.tab; renderWorkspace(); }));
  // 用例展开/收起
  $$(".case-card[data-case]").forEach((el) => el.addEventListener("click", () => {
    state.caseOpenId = state.caseOpenId === el.dataset.case ? null : el.dataset.case;
    renderWorkspace();
  }));
  // 场景切换（运行中先中止并恢复）
  $$(".scn-card").forEach((el) => el.addEventListener("click", () => {
    if (state.scnRunning) restoreScenario();
    state.scenarioId = el.dataset.scn;
    state.scnNodeId = null;
    state.scnSummary = null;
    renderWorkspace();
  }));

  // ---- 步骤树交互 ----
  // 选中节点 → 检查器
  $$(".step-row").forEach((el) => el.addEventListener("click", (e) => {
    if (e.target.closest(".twist")) return; // 折叠箭头单独处理
    state.scnNodeId = el.dataset.node;
    renderWorkspace();
  }));
  // 折叠/展开容器节点
  $$(".step-row .twist").forEach((el) => {
    if (el.classList.contains("leaf")) return;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.closest(".step-row").dataset.node;
      if (state.scnCollapsed.has(id)) state.scnCollapsed.delete(id);
      else state.scnCollapsed.add(id);
      renderWorkspace();
    });
  });

  // 工具条
  const runBtn = $("#scnRun");
  if (runBtn) runBtn.addEventListener("click", () => runScenarioDemo());
  const addBtn = $("#scnAddBtn");
  if (addBtn) addBtn.addEventListener("click", () => { state.scnMenu = state.scnMenu ? null : "add"; renderWorkspace(); });
  const varsBtn = $("#scnVarsBtn");
  if (varsBtn) varsBtn.addEventListener("click", () => { state.scnVarsOpen = !state.scnVarsOpen; renderWorkspace(); });
  const repBtn = $("#scnReportBtn");
  if (repBtn) repBtn.addEventListener("click", () => { state.scnReportOpen = !state.scnReportOpen; renderWorkspace(); });

  // 添加步骤：六种原语
  $$(".add-item[data-add]").forEach((el) => el.addEventListener("click", () => {
    const type = el.dataset.add;
    if (type === "request") { state.scnMenu = "add-api"; renderWorkspace(); return; }
    if (type === "reference") { state.scnMenu = "add-ref"; renderWorkspace(); return; }
    addStepNode(makeDefaultNode(type));
  }));
  // 从 API 清单选请求
  $$(".add-item[data-add-api]").forEach((el) => el.addEventListener("click", () => {
    const api = apiById(el.dataset.addApi);
    if (!api) return;
    const env = DATA.ENVIRONMENTS.find((e) => e.name === state.env) || DATA.ENVIRONMENTS[0];
    const node = makeDefaultNode("request");
    node.name = api.summary || api.method + " " + api.path;
    node.config = {
      method: api.method, url: env.base_url + api.path,
      headers: api.auth_type === "bearer" ? { authorization: "Bearer {{token}}" } : {},
      assertions: [{ type: "status", operator: "eq", expected: Object.keys(api.responses || {})[0] || 200 }],
    };
    addStepNode(node);
  }));
  // 引用其它场景
  $$(".add-item[data-add-ref]").forEach((el) => el.addEventListener("click", () => {
    const ref = DATA.SCENARIOS.find((s) => s.id === el.dataset.addRef);
    if (!ref) return;
    const node = makeDefaultNode("reference");
    node.name = "引用场景：" + ref.name;
    node.config = { scenarioId: ref.id, refMode: "ref", note: "引用不复制，源场景更新自动生效" };
    addStepNode(node);
  }));
}

/** 造一个默认新节点（添加步骤演示用） */
function makeDefaultNode(type) {
  const id = "st-new-" + Math.random().toString(36).slice(2, 8);
  const base = { id: id, type: type, name: STEP_TYPES[type].label + "（新增）", status: undefined, durationMs: undefined };
  if (type === "condition") {
    base.config = { variable: "{{balance}}", operator: "gte", value: "0", expression: "Number({{balance}}) >= 0" };
    base.children = [
      Object.assign(makeDefaultNode("wait"), { name: "then 分支示例", branch: "then" }),
      Object.assign(makeDefaultNode("wait"), { name: "else 分支示例", branch: "else" }),
    ];
    // 递归造的孙节点 id 也随机，避免重复；children 不再有下一层
    base.children.forEach((c) => { c.children = undefined; c.config = { durationMs: 200 }; });
  } else if (type === "loop") {
    base.config = { loopType: "count", count: 2, intervalMs: 100 };
    base.children = [makeDefaultNode("wait")];
    base.children[0].children = undefined;
  } else if (type === "wait") {
    base.config = { durationMs: 500 };
  } else if (type === "assert") {
    base.config = { type: "jsonpath", target: "$.code", operator: "eq", expected: 0 };
  }
  return base;
}

/** 把新节点追加到当前场景根级，并选中它 */
function addStepNode(node) {
  const sc = DATA.SCENARIOS.find((s) => s.id === state.scenarioId) || DATA.SCENARIOS[0];
  sc.steps.push(node);
  state.scnMenu = null;
  state.scnNodeId = node.id;
  renderWorkspace();
}

/* ------------------------------ 初始化 ------------------------------ */
function init() {
  // 默认选中第一个 API 与第一个场景
  state.selectedApiId = DATA.API_DEFINITIONS[0].id;
  state.scenarioId = DATA.SCENARIOS[0].id;

  renderTree(); renderTabs(); renderWorkspace(); renderCtxSelected(); renderCtxResult();

  // 顶部主 tab（离开场景视图时中止运行动画）
  $$("#mainTabs .tab").forEach((t) => t.addEventListener("click", () => {
    if (state.scnRunning) restoreScenario();
    state.scnMenu = null;
    state.view = t.dataset.view;
    renderTabs(); renderWorkspace();
  }));

  // 环境切换
  $$("#envSwitch .env").forEach((b) => b.addEventListener("click", () => {
    state.env = b.dataset.env;
    $$("#envSwitch .env").forEach((x) => x.classList.toggle("active", x === b));
    renderWorkspace();
  }));

  // 主题切换（暗/亮，默认暗色）
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = cur;
    $("#themeBtn").textContent = cur === "light" ? "☀" : "☾";
  });

  // 左栏搜索
  $("#apiSearch").addEventListener("input", (e) => { state.search = e.target.value; renderTree(); });

  // 右栏 AI 演示按钮
  $$(".ctx-btn").forEach((b) => b.addEventListener("click", () => {
    state.demo = state.demo === b.dataset.demo ? null : b.dataset.demo;
    renderCtxResult();
  }));
}

document.addEventListener("DOMContentLoaded", init);
