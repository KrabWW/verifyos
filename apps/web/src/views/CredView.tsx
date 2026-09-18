import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

// G09: 凭据 7 类（值仍走 secret 字段加密存储；引擎消费标注后续）
const CRED_KINDS: Array<{ value: string; label: string }> = [
  { value: 'password', label: '密码' },
  { value: 'otp', label: 'OTP' },
  { value: 'totp', label: 'TOTP' },
  { value: 'magic_link', label: 'Magic Link' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'header', label: 'Header' },
  { value: 'file', label: '文件' },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(CRED_KINDS.map((k) => [k.value, k.label]));

// ---------- 凭据管理（B3 引擎 + UI） ----------
// 凭据联动：projects = 全部项目（App.tsx projects state）；defaultProjectId = 当前侧栏选中项目 id
export function CredView({ projects, defaultProjectId }: { projects: Array<{ id: string; name: string; numId?: string }>; defaultProjectId: string }) {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ name: '', role: '管理员', kind: 'password', username: '', secret: '' });
  const [msg, setMsg] = useState('');
  // 凭据联动：所属项目 select（新建默认=当前项目；projects[].id 即数字 id 字符串形式）
  const [formProject, setFormProject] = useState<string>(defaultProjectId || '');
  useEffect(() => {
    if (projects.length && !projects.some((p) => p.id === formProject)) setFormProject(projects[0].id);
  }, [projects]);
  // project_id 数字 → 项目名（列表归属列展示；ProjectItem.id=short_id，数字 FK 用 numId）
  const projNameOf = (pid: unknown) => projects.find((p) => (p.numId ?? p.id) === String(pid))?.name ?? `项目 #${String(pid ?? '?')}`;
  // H06: 编辑态——非 null 时表单转为编辑该凭据（PUT /api/credentials/:id 复用轮换端点）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [bs, setBs] = useState<Array<{ short_id: string; name: string; captured_at: string; ttl_hours: number; live: boolean; source_kind?: string; reuse_count?: number }>>([]);
  const [testMsg, setTestMsg] = useState('');

  const load = () => {
    fetch('/api/credentials').then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => undefined);
    fetch('/api/browser-states').then((r) => r.json()).then((d) => setBs(d.items ?? [])).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const add = () => {
    if (!form.name || !form.username || !form.secret) { setMsg('名称/用户名/值必填'); return; }
    // 凭据联动：projectId 必传（缺省会落到演示项目 #1，导致真实项目验证查不到凭据）
    const projectId = Number(formProject) || undefined;
    fetch('/api/credentials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.name, role: form.role, kind: form.kind, username: form.username, password: form.secret, ...(projectId ? { projectId } : {}) }) })
      .then((r) => r.json())
      .then(() => { setMsg('✓ 已加密保存（AES-256-GCM）'); setForm({ name: '', role: '管理员', kind: 'password', username: '', secret: '' }); load(); })
      .catch(() => setMsg('保存失败'));
  };
  // H06: 点击「编辑」→ 卡片转表单预填当前值；username/secret 在库内加密不可回读，留空即保持原值
  const startEdit = (it: Record<string, unknown>) => {
    setEditingId(Number(it.id));
    setForm({
      name: String(it.name ?? ''),
      role: String(it.role ?? '管理员'),
      kind: String(it.kind ?? it.type ?? 'password'),
      username: '',
      secret: '',
    });
    setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditingId(null); setForm({ name: '', role: '管理员', kind: 'password', username: '', secret: '' }); setMsg(''); };
  // H06: 保存分发——编辑态走 PUT（服务端合并字段，仅更新非空项；改值会打 rotated_at 标）
  const save = () => {
    if (editingId == null) { add(); return; }
    if (!form.name) { setMsg('名称必填'); return; }
    const body: Record<string, string | number> = { name: form.name, role: form.role };
    const projectId = Number(formProject) || undefined;
    if (projectId) body.projectId = projectId;
    if (form.username) body.username = form.username;
    if (form.secret) body.password = form.secret;
    fetch(`/api/credentials/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setMsg('✓ 已保存修改'); cancelEdit(); load(); }
        else setMsg(`更新失败：${d.reason ?? '未知'}`);
      })
      .catch(() => setMsg('更新失败（网络）'));
  };
  const del = (id: unknown) => fetch(`/api/credentials/${id}`, { method: 'DELETE' }).then(load);
  const rotate = (id: unknown) => {
    const pwd = window.prompt('输入新值（凭据将轮换，rotated_at 打标）：');
    if (!pwd) return;
    fetch(`/api/credentials/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
      .then((r) => r.json())
      .then((d) => { setMsg(d.ok ? '✓ 已轮换' : '轮换失败'); load(); })
      .catch(() => setMsg('轮换失败'));
  };
  // 更新时间：updated_at 有则用，无则回退 created_at（credential 表当前只有 created_at/rotated_at）
  const updatedAtOf = (it: Record<string, unknown>) => {
    const t = it.updated_at ?? it.rotated_at ?? it.created_at;
    return t ? new Date(String(t)).toLocaleString('zh-CN', { hour12: false }) : '-';
  };

  return (
    <div className="pageview">
      <div className="aibanner">
        <b style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Zap size={11} /> 运行时请求优先</b>
        <span>无需预先配置——Agent 遇到登录墙会在对话中动态向你要凭据，保存后自动继续（Progressive Disclosure）。新手零配置 · 专家进配置</span>
      </div>
      <div className="sumcard">
        <h4>{editingId != null ? '✏️ 编辑凭据' : '添加凭据（AES-256-GCM 加密存储 · 角色维度）'}</h4>
        <div className="formrow"><label>名称</label><input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：演示 CRM 管理员" /></div>
        <div className="formrow"><label>所属项目</label>
          <select className="inp" value={formProject} onChange={(e) => setFormProject(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.numId ?? p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="hint" style={{ fontSize: 11 }}>凭据按「项目 + 角色」与验证执行联动：验证的执行角色（actor）匹配同项目下同角色凭据；匹配链=角色+项目 → 全局角色 → 项目内任意 → 管理员兜底。</div>
        <div className="formrow"><label>角色</label><input className="inp" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
        <div className="formrow"><label>类型</label>
          <select className="inp" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} disabled={editingId != null}>
            {CRED_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        {editingId != null && (
          <div className="hint" style={{ fontSize: 11 }}>编辑态：类型暂不支持在线修改（PUT 端点不含 type 字段）；用户名/值留空则保持原值，修改值将打 rotated_at 标记（同轮换语义）。</div>
        )}
        {editingId == null && form.kind !== 'password' && (
          <div className="hint" style={{ fontSize: 11 }}>该类型值以加密 JSON 存储为 {'{secret}'}，引擎消费属后续（当前表单仍用 secret 字段存值）。</div>
        )}
        <div className="formrow"><label>用户名</label><input className="inp" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={editingId != null ? '留空保持原值' : ''} /></div>
        <div className="formrow"><label>{form.kind === 'password' ? '密码' : '值'}</label><input className="inp" type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={editingId != null ? '留空保持原值' : ''} /></div>
        <button className="btn primary" onClick={save} style={{ marginTop: 6 }}>{editingId != null ? '保存修改' : '加密保存'}</button>
        {editingId != null && <button className="btn" onClick={cancelEdit} style={{ marginTop: 6, marginLeft: 6 }}>取消</button>}
        {msg && <span className="dim" style={{ marginLeft: 10, fontSize: 11.5 }}>{msg}</span>}
      </div>
      {/* flexShrink:0——防止在 .pageview flex 列里被压缩后 overflow:hidden 裁掉表格（同执行历史页踩过的坑） */}
      <div className="sumcard" style={{ padding: 0, overflow: 'hidden', flexShrink: 0 }}>
        <table className="tbl">
          <tr><th>名称</th><th>角色</th><th>类型</th><th>所属项目</th><th>值</th><th>更新时间</th><th></th></tr>
          {items.length === 0 && <tr><td colSpan={7} className="dim">暂无凭据</td></tr>}
          {items.map((it) => (
            <tr key={String(it.id)} style={editingId === Number(it.id) ? { background: 'rgba(132,204,22,0.08)' } : undefined}>
              <td><b>{String(it.name)}</b>{editingId === Number(it.id) && <span className="chip p-amber" style={{ marginLeft: 6 }}>编辑中</span>}</td>
              <td><span className="chip">{String(it.role)}</span></td>
              <td>{KIND_LABEL[String(it.kind ?? it.type)] ?? String(it.kind ?? it.type ?? '-')}</td>
              <td style={{ fontSize: 11.5 }}>{projNameOf(it.project_id)}</td>
              <td className="mono" style={{ color: 'var(--muted)' }}>••••••••（加密）</td>
              <td className="mono" style={{ fontSize: 10.5 }}>{updatedAtOf(it)}</td>
              <td><button className="btn" style={{ fontSize: 10.5 }} onClick={() => {
                fetch(`/api/credentials/${it.id}/test`, { method: 'POST' }).then((r) => r.json()).then((d) => setTestMsg(d.ok ? `⏳ ${String(it.name)} 登录探测 Run ${d.runId} 已触发（≈2s 出判定，到执行历史看结果）` : `✗ 测试失败：${d.reason}`)).catch(() => setTestMsg('测试失败（网络）'));
              }}>测试连接</button>{' '}<button className="btn" onClick={() => startEdit(it)}>编辑</button>{' '}<button className="btn" onClick={() => rotate(it.id)}>轮换</button>{' '}<button className="btn" onClick={() => del(it.id)}>删除</button></td>
            </tr>
          ))}
        </table>
        {testMsg && <div className="hint" style={{ padding: '6px 14px' }}>{testMsg}</div>}
      </div>

      <div className="sumcard">
        <h4>Browser State（可继承复用的登录态 · 6h 复用窗口）</h4>
        {bs.length === 0 && <p className="dim" style={{ fontSize: 12 }}>暂无——探索/执行产出登录态后自动入库（Resume From 免重复登录）。</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {bs.map((b) => (
            <div key={b.short_id} className="statcard" style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={`dot ${b.live ? 'ok' : 'idle'}`} style={{ width: 14, height: 14, fontSize: 9 }}>{b.live ? '✓' : '·'}</span>
                <b style={{ fontSize: 12.5 }}>{b.name}</b>
              </div>
              <div className="dim" style={{ fontSize: 10.5, marginTop: 4 }}>
                {b.live ? `剩余 TTL ${b.ttl_hours}h` : '已过期（可刷新续期）'} · 抓取于 {new Date(b.captured_at).toLocaleTimeString('zh-CN', { hour12: false })}
              </div>
              <div className="dim" style={{ fontSize: 10.5, marginTop: 2 }}>
                来源：{b.source_kind ?? 'unknown'} · 复用 {b.reuse_count ?? 0} 次
              </div>
              <button className="btn" style={{ marginTop: 8, width: '100%', justifyContent: 'center', fontSize: 11 }} onClick={() => {
                fetch(`/api/browser-states/${b.short_id}/refresh`, { method: 'POST' }).then((r) => r.json()).then((d) => setTestMsg(d.ok ? `🔄 ${b.name} 已续 6h（登录断言 Run ${d.runId}，执行页可核对）` : '刷新失败')).catch(() => setTestMsg('刷新失败'));
              }}>🔄 刷新（登录探测 + 续 6h）</button>
            </div>
          ))}
        </div>
      </div>

      <div className="sumcard">
        <h4>安全说明</h4>
        <div className="kv"><span>加密存储</span><b>AES-256-GCM（iv‖tag‖cipher，密钥 64-hex 环境变量注入）</b></div>
        <div className="kv"><span>项目隔离</span><b>凭据按 project + role 维度隔离，跨项目不可见</b></div>
        <div className="kv"><span>使用留痕</span><b>audit_log 记录每次凭据使用 / 测试 / 刷新（actor/action/target/meta）</b></div>
        <div className="kv"><span>轮换吊销</span><b>轮换打 rotated_at 标；删除即吊销（关联状态刷新会失败暴露）</b></div>
      </div>
    </div>
  );
}
