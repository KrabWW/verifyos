import { useEffect, useState } from 'react';
import { GitBranch, Server, Plus, Trash2, RefreshCw } from 'lucide-react';

interface Repo { id: number; repo_url: string; kind: string }
interface Env { id: number; name: string; url: string; is_production: boolean }

// ---------- T9: 项目设置（多 repo / 多 environment 展示 + 增删） ----------
export function ProjectSettingsView({ shortId, name }: { shortId: string; name: string }) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [envs, setEnvs] = useState<Env[]>([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoKind, setRepoKind] = useState<'gitlab' | 'github'>('gitlab');
  const [envName, setEnvName] = useState('');
  const [envUrl, setEnvUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!shortId) return;
    fetch(`/api/projects/${shortId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.found) { setRepos(d.repos ?? []); setEnvs(d.environments ?? []); }
      })
      .catch(() => undefined);
  };
  useEffect(load, [shortId]);

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 3000); };

  const addRepo = () => {
    const url = repoUrl.trim();
    if (!url) { flash('请填写仓库地址'); return; }
    setBusy(true);
    fetch(`/api/projects/${shortId}/repos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, kind: repoKind }) })
      .then((r) => r.json())
      .then((d) => { setBusy(false); if (d.ok) { setRepoUrl(''); flash('✓ 已添加仓库'); load(); } else flash('添加失败'); })
      .catch(() => { setBusy(false); flash('添加失败（网络）'); });
  };
  const delRepo = (id: number) => {
    fetch(`/api/projects/${shortId}/repos/${id}`, { method: 'DELETE' }).then(() => load()).catch(() => undefined);
  };

  const addEnv = () => {
    const n = envName.trim();
    if (!n) { flash('请填写环境名'); return; }
    setBusy(true);
    fetch(`/api/projects/${shortId}/environments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, url: envUrl.trim() }) })
      .then((r) => r.json())
      .then((d) => { setBusy(false); if (d.ok) { setEnvName(''); setEnvUrl(''); flash('✓ 已添加环境'); load(); } else flash('添加失败'); })
      .catch(() => { setBusy(false); flash('添加失败（网络）'); });
  };
  const delEnv = (id: number) => {
    fetch(`/api/projects/${shortId}/environments/${id}`, { method: 'DELETE' }).then(() => load()).catch(() => undefined);
  };

  return (
    <div className="pageview" style={{ overflowY: 'auto' }}>
      <div className="card" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0 }}>项目设置</h3>
          <span className="chip mono">{shortId}</span>
          <span className="sp" />
          <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={load} title="刷新"><RefreshCw size={12} /> 刷新</button>
        </div>
        <p className="dim" style={{ fontSize: 12, margin: '6px 0 0' }}>项目：<b>{name}</b> —— 绑定多个代码仓库与多个部署环境，PR 验证按 repo 反查到这里。</p>
        {msg && <p className="dim" style={{ marginTop: 6, fontSize: 11.5 }}>{msg}</p>}

        <h4 style={{ margin: '18px 0 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><GitBranch size={14} /> 代码仓库</h4>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <input className="inp" style={{ flex: 1 }} placeholder="https://gitlab.com/group/repo.git" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
          <select className="inp" style={{ width: 96, flexShrink: 0 }} value={repoKind} onChange={(e) => setRepoKind(e.target.value as 'gitlab' | 'github')}>
            <option value="gitlab">GitLab</option><option value="github">GitHub</option>
          </select>
          <button className="btn primary" style={{ fontSize: 11, padding: '2px 9px' }} disabled={busy} onClick={addRepo}><Plus size={12} /> 添加</button>
        </div>
        {repos.length === 0 && <p className="dim" style={{ fontSize: 11.5 }}>尚未绑定仓库。</p>}
        {repos.map((r) => (
          <div key={r.id} className="row" style={{ alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--line, #eee)' }}>
            <span className="chip" style={{ fontSize: 10 }}>{r.kind}</span>
            <span className="mono" style={{ flex: 1, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.repo_url}</span>
            <button className="btn" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)' }} title="删除" onClick={() => delRepo(r.id)}><Trash2 size={12} /></button>
          </div>
        ))}

        <h4 style={{ margin: '18px 0 6px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Server size={14} /> 环境</h4>
        <div className="row" style={{ gap: 6, marginBottom: 6 }}>
          <input className="inp" style={{ width: 150, flexShrink: 0 }} placeholder="环境名（如 预发环境）" value={envName} onChange={(e) => setEnvName(e.target.value)} />
          <input className="inp" style={{ flex: 1 }} placeholder="https://staging.example.com" value={envUrl} onChange={(e) => setEnvUrl(e.target.value)} />
          <button className="btn primary" style={{ fontSize: 11, padding: '2px 9px' }} disabled={busy} onClick={addEnv}><Plus size={12} /> 添加</button>
        </div>
        {envs.length === 0 && <p className="dim" style={{ fontSize: 11.5 }}>尚未配置环境。</p>}
        {envs.map((e) => (
          <div key={e.id} className="row" style={{ alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--line, #eee)' }}>
            <span className="chip" style={{ fontSize: 10 }}>{e.is_production ? '生产' : '环境'}</span>
            <b style={{ fontSize: 12, width: 120, flexShrink: 0 }}>{e.name}</b>
            <span className="mono" style={{ flex: 1, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.url}</span>
            <button className="btn" style={{ fontSize: 11, padding: '2px 6px', color: 'var(--red)' }} title="删除" onClick={() => delEnv(e.id)}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
