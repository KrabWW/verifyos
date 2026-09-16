import { useState } from 'react';
import { Sparkles, FlaskConical, Play, Package, Compass, Plus, Trash2, GitBranch, Server } from 'lucide-react';

interface RepoRow { url: string; kind: 'gitlab' | 'github' }
interface EnvRow { name: string; url: string }

// ---------- F1: 欢迎页（s-welcome：hero + 特性卡 + 新建项目，F16 入口） ----------
// T9: 新建项目时可添加多个 repo（url + kind）与多个 environment（name + url）。
export function WelcomeView({ onGoExplore, onGo }: { onGoExplore: (url: string) => void; onGo: (r: 'chat' | 'editor' | 'run') => void }) {
  const [name, setName] = useState('订单管理系统');
  const [url, setUrl] = useState('https://crm.test.example.com');
  const [env, setEnv] = useState('测试环境');
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [envs, setEnvs] = useState<EnvRow[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const addRepo = () => setRepos((p) => [...p, { url: '', kind: 'gitlab' }]);
  const setRepo = (i: number, patch: Partial<RepoRow>) => setRepos((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const delRepo = (i: number) => setRepos((p) => p.filter((_, idx) => idx !== i));

  const addEnv = () => setEnvs((p) => [...p, { name: '', url: '' }]);
  const setEnvRow = (i: number, patch: Partial<EnvRow>) => setEnvs((p) => p.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const delEnv = (i: number) => setEnvs((p) => p.filter((_, idx) => idx !== i));

  const start = () => {
    setBusy(true);
    const payload = {
      name,
      url,
      env,
      // T9: 过滤空行的 repo/environment（服务端也会去重）
      repos: repos.map((r) => ({ url: r.url.trim(), kind: r.kind })).filter((r) => r.url),
      environments: envs.map((e) => ({ name: e.name.trim(), url: e.url.trim() })).filter((e) => e.name),
    };
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then((r) => r.json())
      .then((d) => {
        setBusy(false);
        if (d.ok) {
          const target = url || d.environments?.[0]?.url || '';
          setMsg(`✓ 已创建「${name}」：${d.repos?.length ?? 0} 个仓库 · ${d.environments?.length ?? 0} 个环境，正在带你去探索…`);
          setTimeout(() => onGoExplore(target), 1200);
        } else setMsg('创建失败');
      })
      .catch(() => { setBusy(false); setMsg('创建失败（网络）'); });
  };

  return (
    <div className="pageview" style={{ overflowY: 'auto' }}>
      <div className="welcome-hero">
        <div className="mark">✓</div>
        <div className="kicker">中文 AI 测试平台 · 私有化部署</div>
        <h1>测试，从<em>一句话</em>开始</h1>
        <p>告诉我要验证什么 —— 我来探索应用、发现 QA 点、执行验证并给出证据。</p>
        <div className="trust">
          <span><b><span className="cnum">18</span> 页面</b>自动探索</span>
          <span><b><span className="cnum">4</span> 类步骤</b>混合编排</span>
          <span><b><span className="cnum">6</span> 种证据</b>一次执行全留痕</span>
        </div>
      </div>

      <div className="goalcards">
        <div className="goalcard" onClick={() => onGo('chat')}>
          <div className="ic"><Sparkles size={20} /></div><b>发现测试缺口</b><span>分析你的应用，找出值得测试的地方</span>
        </div>
        <div className="goalcard" onClick={() => onGo('editor')}>
          <div className="ic"><FlaskConical size={20} /></div><b>创建一个验证</b><span>用自然语言告诉 AI 要验证什么</span>
        </div>
        <div className="goalcard" onClick={() => onGo('run')}>
          <div className="ic"><Play size={20} /></div><b>运行已有验证</b><span>查看最近执行结果与证据</span>
        </div>
      </div>

      <div className="card newproj">
        <h3><Package size={14} /> 新建项目</h3>
        <div className="field"><label>项目名称</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>应用地址（默认环境）</label><input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div className="field" style={{ width: 110 }}>
            <label>环境</label>
            <select value={env} onChange={(e) => setEnv(e.target.value)}>
              <option>测试环境</option><option>预发环境</option><option>生产环境</option>
            </select>
          </div>
        </div>

        {/* T9: 多仓库（url + kind） */}
        <h4 style={{ margin: '14px 0 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <GitBranch size={13} /> 代码仓库（GitLab / GitHub）
          <button className="btn" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }} onClick={addRepo}><Plus size={11} /> 添加仓库</button>
        </h4>
        {repos.length === 0 && <p className="dim" style={{ fontSize: 11.5, margin: '4px 0' }}>未添加仓库 —— PR 验证按 repo 反查项目，建议填上关联仓库。</p>}
        {repos.map((r, i) => (
          <div key={i} className="row" style={{ marginBottom: 6, gap: 6 }}>
            <div className="field" style={{ flex: 1 }}><input placeholder="https://gitlab.com/group/repo.git" value={r.url} onChange={(e) => setRepo(i, { url: e.target.value })} /></div>
            <select className="inp" style={{ width: 96, flexShrink: 0 }} value={r.kind} onChange={(e) => setRepo(i, { kind: e.target.value as 'gitlab' | 'github' })}>
              <option value="gitlab">GitLab</option><option value="github">GitHub</option>
            </select>
            <button className="btn" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)' }} title="删除" onClick={() => delRepo(i)}><Trash2 size={12} /></button>
          </div>
        ))}

        {/* T9: 多环境（name + url） */}
        <h4 style={{ margin: '14px 0 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
          <Server size={13} /> 环境（测试 / 预发 / 生产）
          <button className="btn" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }} onClick={addEnv}><Plus size={11} /> 添加环境</button>
        </h4>
        {envs.length === 0 && <p className="dim" style={{ fontSize: 11.5, margin: '4px 0' }}>默认以上方「应用地址 + 环境」作为首个环境；可在此追加更多环境。</p>}
        {envs.map((e, i) => (
          <div key={i} className="row" style={{ marginBottom: 6, gap: 6 }}>
            <div className="field" style={{ width: 130, flexShrink: 0 }}><input placeholder="环境名" value={e.name} onChange={(ev) => setEnvRow(i, { name: ev.target.value })} /></div>
            <div className="field" style={{ flex: 1 }}><input placeholder="https://staging.example.com" value={e.url} onChange={(ev) => setEnvRow(i, { url: ev.target.value })} /></div>
            <button className="btn" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)' }} title="删除" onClick={() => delEnv(i)}><Trash2 size={12} /></button>
          </div>
        ))}

        <div className="hint" style={{ margin: '10px 0' }}>可选：＋需求文档（Word / PDF / 飞书） · ＋连接 Figma · ＋配置角色凭据 —— 都可以之后再配，<b>零配置即可开始探索</b>。</div>
        <button className="btn primary" onClick={start} disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: 8 }}><Compass size={11} /> {busy ? '创建中…' : '开始探索'}</button>
        {msg && <p className="dim" style={{ marginTop: 6, fontSize: 11.5 }}>{msg}</p>}
      </div>
    </div>
  );
}
