/**
 * VerifyOS 录制 panel（P1.1 核心）：chrome.devtools.network.getHAR() 捕获流量。
 *
 * 工作方式：
 * - DevTools 的 network 对象在面板打开期间持续收集请求/响应对（含 HTTPS 明文 body，
 *   因为 DevTools 在浏览器内部解码后可见——这正是代理模式拿不到 HTTPS 明文的补充通道）；
 * - 监听 network.onRequestFinished 事件驱动刷新（事件本身不带完整 body，需重新 getHAR）；
 * - getHAR() 返回全量，用「已见 entry 计数」做增量提取，转成 TrafficRecord 结构；
 * - 每条按 sec-fetch-dest / accept / X-Requested-With / _resourceType 分级
 *   （与 src/recorder/classify.ts 同一套启发式，插件侧为 JS 复刻）；
 * - 「导出 JSON」把 { records: [...] } 发给 background 下载，
 *   文件可直接被 npm run import:har 导入现有 session 存储。
 *
 * 注意：HAR entry 的 body 大小受 DevTools「Preserve log」与浏览器内存策略影响，
 * 巨大响应可能被省略——诚实限制，与 DevTools Network 面板看到的一致。
 */

/** 与 src/types/models.ts 的 TrafficRecord 对齐（插件侧最小字段集） */
// eslint-disable-next-line no-unused-vars
function trafficRecord(entry, seq) {
  const req = entry.request;
  const res = entry.response;
  const url = new URL(req.url);
  const now = new Date().toISOString();

  const requestHeaders = {};
  for (const h of req.headers) requestHeaders[h.name.toLowerCase()] = h.value;
  const responseHeaders = {};
  for (const h of res.headers) responseHeaders[h.name.toLowerCase()] = h.value;

  const queryParams = {};
  for (const [k, v] of url.searchParams.entries()) {
    (queryParams[k] = queryParams[k] || []).push(v);
  }

  const cls = classifyEntry(entry);

  return {
    id: `ext-${seq}-${Date.now().toString(36)}`,
    api_definition_id: null,
    timestamp: entry.startedDateTime || now,
    method: req.method,
    path: url.pathname,
    host: `${url.protocol}//${url.host}`,
    query_params: queryParams,
    request_headers: requestHeaders,
    request_body: req.postData ? req.postData.text : undefined,
    status_code: res.status,
    response_headers: responseHeaders,
    response_body: res.content && res.content.text !== undefined ? res.content.text : undefined,
    latency_ms: Math.round(entry.time || 0),
    source: 'extension',
    request_class: cls.request_class,
    is_noise: cls.is_noise,
    noise_flag: false,
    created_at: now,
    updated_at: now,
  };
}

/** 与 src/recorder/classify.ts 同源启发式的 JS 复刻（devtools 可多看 _resourceType） */
function classifyEntry(entry) {
  const headers = {};
  for (const h of entry.request.headers) headers[h.name.toLowerCase()] = h.value;

  // 0. DevTools 独有：_resourceType（browser 内部资源类型，最可靠）
  const rt = entry._resourceType;
  if (rt === 'document') return { request_class: 'top_level', is_noise: false, reason: 'resourceType=document' };
  if (rt === 'script' || rt === 'stylesheet' || rt === 'image' || rt === 'font' || rt === 'media') {
    return { request_class: 'embedded', is_noise: true, reason: `resourceType=${rt}` };
  }
  if (rt === 'xhr' || rt === 'fetch') return { request_class: 'ajax', is_noise: false, reason: `resourceType=${rt}` };

  // 1. sec-fetch-dest
  const dest = headers['sec-fetch-dest'];
  if (dest === 'document') return { request_class: 'top_level', is_noise: false, reason: 'sec-fetch-dest=document' };
  if (['script', 'style', 'image', 'font'].includes(dest)) {
    return { request_class: 'embedded', is_noise: true, reason: `sec-fetch-dest=${dest}` };
  }
  if (dest === 'empty') return { request_class: 'ajax', is_noise: false, reason: 'sec-fetch-dest=empty' };

  // 2. X-Requested-With
  if (headers['x-requested-with'] && /xmlhttprequest/i.test(headers['x-requested-with'])) {
    return { request_class: 'ajax', is_noise: false, reason: 'X-Requested-With=XMLHttpRequest' };
  }

  // 3. accept 形态
  const accept = headers['accept'] || '';
  if (/text\/html/i.test(accept) && !/application\/json/i.test(accept)) {
    return { request_class: 'top_level', is_noise: false, reason: 'accept=text/html' };
  }
  if (/application\/json/i.test(accept)) {
    return { request_class: 'ajax', is_noise: false, reason: 'accept=application/json' };
  }

  // 4. 静态扩展名 / Content-Type
  const path = new URL(entry.request.url).pathname;
  if (/\.(js|mjs|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|eot|map|mp4|webm|mp3)(\?|$)/i.test(path)) {
    return { request_class: 'embedded', is_noise: true, reason: '静态扩展名' };
  }
  const ct = (entry.response.content && entry.response.content.mimeType) || '';
  if (/^(image\/|font\/|text\/css)/i.test(ct)) {
    return { request_class: 'embedded', is_noise: true, reason: `mime=${ct}` };
  }

  return { request_class: 'ajax', is_noise: false, reason: '兜底 ajax' };
}

/* ---------------------------------- UI ---------------------------------- */

const state = {
  records: [], // 已转成 TrafficRecord 的捕获列表（全量）
  harCount: 0, // 上次 getHAR 已处理的 entry 数（增量游标）
};

const tbody = document.getElementById('tbody');
const tableEl = document.getElementById('table');
const emptyEl = document.getElementById('empty');
const summaryEl = document.getElementById('summary');
const hideNoiseEl = document.getElementById('hideNoise');

function header(list) {
  tableEl.style.display = list.length > 0 ? '' : 'none';
  emptyEl.style.display = list.length > 0 ? 'none' : '';
}

function render() {
  const list = hideNoiseEl.checked ? state.records.filter((r) => !r.is_noise) : state.records;
  tbody.innerHTML = '';
  let i = 0;
  for (const r of list) {
    i += 1;
    const tr = document.createElement('tr');
    if (r.is_noise) tr.className = 'noise';
    const cls = document.createElement('td');
    cls.className = `cls ${r.request_class}`;
    cls.textContent = r.request_class + (r.is_noise ? '(noise)' : '');
    tr.innerHTML = `<td>${i}</td>`;
    tr.appendChild(cls);
    tr.innerHTML += `<td>${r.method}</td><td title="${r.host}${r.path}">${r.host}${r.path}</td><td>${r.status_code}</td><td>${r.latency_ms}ms</td>`;
    tbody.appendChild(tr);
  }
  header(list);

  const total = state.records.length;
  const ajaxN = state.records.filter((r) => r.request_class === 'ajax').length;
  const noiseN = state.records.filter((r) => r.is_noise).length;
  summaryEl.textContent = `已捕获 ${total} 条：ajax=${ajaxN}，噪音=${noiseN}（当前显示 ${list.length} 条）`;
}

/** 拉取 HAR 并增量提取新 entry（getHAR 只能在 devtools 上下文调用） */
async function refresh() {
  try {
    const har = await chrome.devtools.network.getHAR();
    const entries = har.entries || [];
    for (let i = state.harCount; i < entries.length; i += 1) {
      state.records.push(trafficRecord(entries[i], i));
    }
    state.harCount = entries.length;
    // 同步到 storage 供 popup 统计（仅计数所需字段，避免超出 storage 配额）
    chrome.storage.local.set({
      captured: state.records.slice(-500).map((r) => ({ request_class: r.request_class, is_noise: r.is_noise })),
    });
    render();
  } catch (err) {
    summaryEl.textContent = `HAR 拉取失败: ${err && err.message ? err.message : String(err)}`;
    summaryEl.classList.add('error');
  }
}

// 事件驱动：任一请求完成即刷新（节流 300ms，页面批量加载时避免 HAR 重复全量拉取）
let timer = null;
function scheduleRefresh() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    refresh();
  }, 300);
}
chrome.devtools.network.onRequestFinished.addListener(scheduleRefresh);
chrome.devtools.network.onNavigated.addListener(() => {
  // 导航后 HAR 可能被清空（非 preserve log 模式），重置游标重新计数
  setTimeout(() => {
    chrome.devtools.network.getHAR().then((har) => {
      const n = (har.entries || []).length;
      state.harCount = n < state.harCount ? n : state.harCount;
    });
  }, 500);
});

document.getElementById('export').addEventListener('click', () => {
  const payload = { records: state.records };
  chrome.runtime.sendMessage({ type: 'EXPORT_JSON', payload }, (resp) => {
    if (resp && resp.ok) {
      summaryEl.textContent = `已触发导出（${state.records.length} 条），请在下载对话框选择保存位置。`;
    } else {
      summaryEl.textContent = '导出失败，请重试。';
    }
  });
});

document.getElementById('clear').addEventListener('click', () => {
  state.records = [];
  state.harCount = 0;
  chrome.storage.local.set({ captured: [] });
  render();
});

hideNoiseEl.addEventListener('change', render);

refresh();
