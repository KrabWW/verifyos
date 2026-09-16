import { useState } from 'react';
import { FileText, Plug, Layers, SearchCheck, Sparkles, Palette, Bird, Check } from 'lucide-react';
import mammoth from 'mammoth/mammoth.browser';

// ---------- F3 + G16: 需求导入（真文件解析 + 连接说明卡 + 交叉验证 + LLM 推导） ----------
interface ImportStructured { domains: string[]; roles: string[]; ruleCount: number; criteriaCount: number; stateMachine: string; rules: string[]; criteria: string[] }
interface ImportMatrix { domains: string[]; roles: string[]; cells: number[][] }
interface CrossFinding { level: 'red' | 'amber' | 'yellow'; title: string; detail: string; fp?: string }

const IMPORT_SAMPLE = `模块：员工管理
角色：管理员、普通用户
业务规则：普通用户不能修改员工
业务规则：新增员工时姓名必须非空
业务规则：仅管理员可批量删除员工
业务规则：支持导出 Excel
业务规则：修改密码时新密码与确认密码必须一致
验收标准：AC1 无权限用户点击编辑应被拒绝
状态机：草稿 → 提交 → 审核 → 完成`;

function ConnectorCard({ icon, name, steps, status }: { icon: React.ReactNode; name: string; steps: string[]; status: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="g16-connector">
      <button className="g16-conn-head" onClick={() => setOpen(!open)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{icon} {name} 连接流程</span>
        <span className="g16-conn-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="g16-conn-body">
          <ol>
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
          <p className="g16-conn-status">{status}</p>
        </div>
      )}
    </div>
  );
}

export function ImportView({ onGoQa, onGoChat }: { onGoQa: () => void; onGoChat: () => void }) {
  const [text, setText] = useState('');
  const [structured, setStructured] = useState<ImportStructured | null>(null);
  const [matrix, setMatrix] = useState<ImportMatrix | null>(null);
  const [findings, setFindings] = useState<CrossFinding[]>([]);
  const [ignoredLocal, setIgnoredLocal] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [useLLM, setUseLLM] = useState(false);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);

  const handleFile = async (f: File | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase().split('.').pop();
    try {
      if (ext === 'docx') {
        const buf = await f.arrayBuffer();
        const res = await mammoth.extractRawText({ arrayBuffer: buf });
        setText(res.value);
        setMsg(`✓ 已从 ${f.name} 提取 ${res.value.length} 字符（mammoth.docx 真解析，浏览器端）`);
      } else if (ext === 'md' || ext === 'txt' || ext === 'markdown') {
        const t = await f.text();
        setText(t);
        setMsg(`✓ 已从 ${f.name} 读取 ${t.length} 字符`);
      } else {
        setMsg(`暂不支持 .${ext} —— 当前支持 .docx（mammoth 真解析）/.md/.txt；.pdf 请先复制文本粘贴`);
        return;
      }
      setStructured(null); setFindings([]);
    } catch (e) {
      setMsg(`解析 ${f.name} 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const parse = () => fetch('/api/imports/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, name: '粘贴文本' }) })
    .then((r) => r.json()).then((d) => {
      if (!d.ok) { setMsg(d.reason); return; }
      setStructured(d.structured); setMatrix(d.matrix ?? null); setMsg('✓ 已解析（启发式拆分）'); setFindings([]); setIgnoredLocal(new Set());
    }).catch(() => setMsg('解析失败'));

  const crossCheck = () => {
    if (!structured) { setMsg('先解析需求文本'); return; }
    setMsg(useLLM ? '交叉验证中（含 LLM 边界用例推导，约 20-40s）…' : '交叉验证中…');
    fetch('/api/imports/cross-check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: structured.rules, useLLM }) })
      .then((r) => r.json()).then((d) => {
        setFindings(d.findings ?? []);
        const extra = d.llmError ? '（LLM 推导失败已跳过：' + d.llmError + '）' : (d.llmUsed ? '（含 LLM 推导）' : '');
        const ign = d.ignoredCount > 0 ? `，另 ${d.ignoredCount} 条已被忽略（持久化）` : '';
        setMsg(d.findings?.length ? `发现 ${d.findings.length} 个交叉验证疑点${extra}${ign}` : `交叉验证无缺口疑点${extra}${ign}`);
      })
      .catch(() => setMsg('交叉验证失败'));
  };

  const toQa = (f: CrossFinding) => fetch('/api/qa-points/from-finding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: f.title.split('·')[1]?.trim() ?? f.title, risk: f.level === 'red' ? 'high' : 'medium', detail: f.detail }) })
    .then((r) => r.json()).then((d) => setMsg(d.deduped ? '该 QA 点已存在（去重）' : `✓ 已转 QA 点 ${d.shortId}`)).catch(() => setMsg('转换失败'));

  // F3-ignore：忽略持久化（服务端 import_ignore 表，下次 cross-check 直接过滤）；fp 区分同类不同关键词疑点
  const ignore = (f: CrossFinding) => {
    const fp = f.fp ?? f.title;
    fetch('/api/imports/ignore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint: fp, title: f.title }) })
      .then((r) => r.json()).then((d) => {
        if (d.ok) {
          setIgnoredLocal((s) => new Set(s).add(fp));
          setMsg(`✓ 已忽略「${f.title.slice(0, 30)}…」——已持久化，下次交叉验证自动过滤`);
        }
      }).catch(() => setMsg('忽略失败'));
  };

  // F3-flag：标记给产品 → 真入问题库（issue 表，open 标题去重）
  const flagToProduct = (f: CrossFinding) => {
    fetch('/api/issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      title: `[需求标记] ${f.title}`,
      severity: f.level === 'red' ? 'high' : 'medium',
      source: { kind: 'import-finding', detail: f.detail, level: f.level },
    }) })
      .then((r) => r.json()).then((d) => setMsg(d.deduped ? '该标记已在问题库中（去重）' : '✓ 已标记给产品——入「问题库」可追踪')).catch(() => setMsg('标记失败'));
  };

  return (
    <div className="pageview">
      <div className="runhead">
        <span className="hint">支持 .docx（mammoth 浏览器端真解析）/.md/.txt 上传，或直接粘贴需求文本——Figma/飞书连接器见下方流程卡</span>
        <span className="sp" />
        <input ref={setFileInput} type="file" accept=".docx,.md,.txt,.markdown" style={{ display: 'none' }} onChange={(e) => { handleFile(e.target.files?.[0] ?? null); e.target.value = ''; }} data-testid="import-file-input" />
        <button className="btn" onClick={() => fileInput?.click()}>＋ 上传文档</button>
      </div>
      <div className="exgrid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
        <div>
          <div className="excol">
            <h4><FileText size={12} /> 来源</h4>
            <textarea className="inp" style={{ width: '100%', minHeight: 150, fontFamily: 'inherit', fontSize: 12, resize: 'vertical' }} placeholder="粘贴需求文本（模块：/角色：/业务规则：/验收标准： 行首标记可获得最佳拆分效果），或点右上「＋ 上传文档」选择 .docx/.md/.txt 文件" value={text} onChange={(e) => setText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" onClick={() => { setText(IMPORT_SAMPLE); setMsg('已载入样例（员工管理 PRD 片段）'); }}>载入样例</button>
              <button className="btn primary" onClick={parse}>解析拆分</button>
            </div>
            <div style={{ marginTop: 12 }}>
              <h4><Plug size={12} /> 连接器</h4>
              <ConnectorCard icon={<Palette size={12} />} name="Figma" steps={[
                '获取 FIGMA_TOKEN：Figma → Settings → Personal access tokens → Generate new token（需 file read 权限）',
                '用内置 http 工具拉取原型帧数据：POST /api/tools/invoke { "name": "http", "args": { "url": "https://api.figma.com/v1/files/:fileKey", "headers": { "X-Figma-Token": "<FIGMA_TOKEN>" } } }',
                '将返回的帧（Frame/Component）结构进交叉验证：与需求规则、探索图做三方匹配',
              ]} status="当前状态：凭据未配置——配置后可真连（不走占位模拟）" />
              <ConnectorCard icon={<Bird size={12} />} name="飞书" steps={[
                '在飞书开放平台创建企业自建应用，获取 FEISHU_APP_ID 与 FEISHU_APP_SECRET',
                '换取 tenant_access_token：POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal { "app_id": "…", "app_secret": "…" }',
                '导出文档内容：GET https://open.feishu.cn/open-apis/docx/v1/documents/:documentId/raw_content（Bearer tenant_access_token）→ 文本进入解析拆分与交叉验证',
              ]} status="当前状态：凭据未配置——配置后可真连（不走占位模拟）" />
            </div>
            {structured && (
              <div style={{ marginTop: 12 }}>
                <h4><Layers size={12} /> 结构化拆分</h4>
                <div className="kv"><span>功能域</span><b>{structured.domains.join(' · ')}</b></div>
                <div className="kv"><span>角色</span><b>{structured.roles.join(' / ')}</b></div>
                <div className="kv"><span>业务规则</span><b>{structured.ruleCount} 条</b></div>
                <div className="kv"><span>验收标准</span><b>{structured.criteriaCount} 条</b></div>
                <div className="kv"><span>状态机</span><b>{structured.stateMachine}</b></div>
                {matrix && matrix.domains.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div className="dim" style={{ fontSize: 10.5, marginBottom: 4 }}>模块 × 角色矩阵（单元格 = 规则条数）</div>
                    <table className="tbl" style={{ fontSize: 11 }}>
                      <thead>
                        <tr><th>模块</th>{matrix.roles.map((r) => <th key={r} style={{ textAlign: 'center' }}>{r}</th>)}</tr>
                      </thead>
                      <tbody>
                        {matrix.domains.map((d, di) => (
                          <tr key={d}>
                            <td>{d}</td>
                            {matrix.roles.map((r, ri) => {
                              const n = matrix.cells[di]?.[ri] ?? 0;
                              return <td key={r} style={{ textAlign: 'center' }} className={n === 0 ? 'dim' : ''}>{n === 0 ? '—' : <b>{n}</b>}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn" onClick={crossCheck}><SearchCheck size={11} /> 交叉验证（需求 × 探索图 × QA 点）</button>
                  <button className={`btn ${useLLM ? 'primary' : ''}`} style={{ padding: '2px 9px', fontSize: 11 }} onClick={() => setUseLLM(!useLLM)} title="调 LLM 从规则推导 1-3 条未覆盖边界用例（较慢 20-40s）">
                    {useLLM && <Check size={10} style={{ display: 'inline', verticalAlign: '-1px' }} />} AI 推导
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="excol">
            <h4><SearchCheck size={12} /> 交叉验证发现 <span className="chip p-indigo">需求 × 原型 × 运行系统</span></h4>
            {findings.length === 0 && <p className="dim" style={{ fontSize: 11.5 }}>先解析文本，再点「交叉验证」——规则关键词与探索图/QA 点库匹配，缺口即出卡；开「AI 推导」可额外让 LLM 从规则推导未覆盖边界用例。</p>}
            <div className="findings" style={{ marginTop: 4 }}>
              {findings.map((f, i) => {
                const fp = f.fp ?? f.title;
                return (
                  <div key={i} className={`finding ${f.level === 'red' ? 'red' : 'amber'}`} style={ignoredLocal.has(fp) ? { opacity: 0.4 } : undefined}>
                    <h5><i className={f.level === 'red' ? 'dotr' : 'dota'} /> {f.title}</h5>
                    <p>{f.detail}</p>
                    <div className="acts">
                      <button className="btn primary" style={{ padding: '2px 9px', fontSize: 11 }} onClick={() => toQa(f)}>转 QA 点</button>
                      <button className="btn" style={{ padding: '2px 9px', fontSize: 11 }} disabled={ignoredLocal.has(fp)} onClick={() => ignore(f)}>{ignoredLocal.has(fp) ? '已忽略' : '忽略'}</button>
                      <button className="btn" style={{ padding: '2px 9px', fontSize: 11 }} onClick={() => flagToProduct(f)}>标记给产品</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="excol" style={{ marginTop: 12 }}>
            <h4><Sparkles size={12} /> 提取 QA 点</h4>
            <div className="kv"><span>预计产出</span><b>{structured ? `${structured.ruleCount + structured.criteriaCount} 条` : '—'}（解析后按规则/验收条数估算）</b></div>
            <div className="kv"><span>提取通道</span><b>当前：交叉验证逐条「转 QA 点」· LLM 批量提取走 AI 工作区（QaExtractor 已接探索链路）</b></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn primary" onClick={onGoChat}><Sparkles size={11} /> 到 AI 工作区提取</button>
              <button className="btn" onClick={onGoQa}>查看已有 QA 点 →</button>
            </div>
          </div>
        </div>
      </div>
      {msg && <p className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
