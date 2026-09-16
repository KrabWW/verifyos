import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Brain, CornerDownRight, Globe, MousePointerClick, Paperclip, RotateCw,
  Check, X, TriangleAlert, Sparkles, Cone, Smartphone, Compass,
  Target, FlaskConical, Play, Map as MapIcon, Bug, Sparkle, Inbox,
  GitPullRequest, Plug, ShieldCheck, PencilLine, FolderPlus,
  Keyboard, Wand2, CircleCheck, CircleX, Camera, Video, FileArchive,
  Terminal, Network, Save, Ban,
} from 'lucide-react';
import type { RunEvent } from '@verifyos/shared';
import { verdictMeta, type Route, type DoneSummary } from './shared';
import { PluginPageView } from './views/PluginPageView';
import { DashboardView } from './views/DashboardView';
import { HistoryView } from './views/HistoryView';
import { PrView } from './views/PrView';
import { ExploreView } from './views/ExploreView';
import { QaView } from './views/QaView';
import { MapView } from './views/MapView';
import { CredView } from './views/CredView';
import { IssuesView } from './views/IssuesView';
import { PluginsView } from './views/PluginsView';
import { ChatView } from './views/ChatView';
import { MobileView } from './views/MobileView';
import { TriageView } from './views/TriageView';
import { EditorView } from './views/EditorView';
import { StepEditor } from './views/StepEditor';
import { WelcomeView } from './views/WelcomeView';
import { ImportView } from './views/ImportView';
import { ProjectSettingsView } from './views/ProjectSettingsView';

/**
 * C4+：验证执行页——完整对齐 prototype.html editor 屏：
 * 侧边栏(184px) + 页头(runhead) + 三列（步骤定义/Action Log/浏览器舞台+摘要）
 */

interface StepDefView {
  id: string;
  title: string;
  kind: string;
  targetRef?: string;
  /** 编辑器：ai 指令 / 断言值 */
  instruction?: string;
  assertValue?: string;
  /** U25：StepEditor 写入的完整断言对象（执行页/编辑器共用形态） */
  assert?: { kind: 'url_contains' | 'text_visible' | 'element_visible'; value: string };
  /** 编辑器展开态 */
  editing?: boolean;
  actions?: Array<{ type: string; selector?: string; value?: string; url?: string }>;
}

interface StepCard {
  stepId: string;
  title?: string;
  kind?: string;
  index?: number;
  lines: RunEvent[];
  verdict?: string;
  open: boolean;
}

/** H09：验证库条目（GET /api/verifications items） */
interface VerItem {
  id: string;
  short_id?: string;
  title?: string;
  steps?: Array<{
    id: string; title?: string; kind: string;
    instruction?: string; targetRef?: string;
    assert?: { value?: string };
    actions?: Array<{ type: string; selector?: string; value?: string; url?: string }>;
  }>;
}

/** H09：项目条目（GET /api/projects） */
interface ProjectItem { id: string; name: string }

const NAV: Array<{ icon: typeof Sparkle; label: string; route: Route; badge?: string }> = [
  { icon: FlaskConical, label: '概览', route: 'dashboard' },
  // H09：NAV 按用户闭环重排——探索→QA 点→验证·执行→历史→地图→问题→PR→导入→AI 工作区
  { icon: Compass, label: '探索', route: 'explore' },
  { icon: Target, label: 'QA 点', route: 'qa' },
  { icon: FlaskConical, label: '验证 · 执行', route: 'run' },
  { icon: Play, label: '执行历史', route: 'history' },
  { icon: MapIcon, label: '应用地图', route: 'map' },
  { icon: Bug, label: '问题', route: 'issues' },
  { icon: GitPullRequest, label: 'PR 验证', route: 'pr', badge: 'NEW' },
  { icon: Inbox, label: '需求导入', route: 'import' },
  { icon: Sparkle, label: 'AI 工作区', route: 'chat' },
  { icon: PencilLine, label: '验证编辑器', route: 'editor' },
  { icon: FolderPlus, label: '新建项目', route: 'welcome' },
];

function groupEvents(events: RunEvent[]): { cards: StepCard[]; banner: RunEvent[] } {
  const cards: StepCard[] = [];
  const banner: RunEvent[] = [];
  for (const e of events) {
    if (e.type === 'run.started' || e.type === 'run.completed' || e.type === 'run.waiting_approval' || e.type === 'run.resumed') {
      banner.push(e);
      continue;
    }
    if (e.type === 'step.started') {
      const se = e as unknown as { stepId: string; title: string; kind: string; index: number };
      cards.push({ stepId: se.stepId, title: se.title, kind: se.kind, index: se.index, lines: [], open: true });
      continue;
    }
    if (e.type === 'step.completed') {
      const ce = e as unknown as { stepId: string; verdict: string };
      const card = [...cards].reverse().find((c) => c.stepId === ce.stepId);
      if (card) {
        card.verdict = ce.verdict;
        card.open = false;
      }
      continue;
    }
    const le = e as unknown as { stepId?: string };
    const card = [...cards].reverse().find((c) => c.stepId === le.stepId);
    if (card) card.lines.push(e);
  }
  return { cards, banner };
}

/** L1：动作差异化图标——每类动作专属图标 + 彩色徽标底，一眼分辨点击/填表/跳转/AI/重放 */
function actionIcon(action: string): { icon: React.ReactNode; cls: string } {
  const a = action.toLowerCase();
  const size = 10;
  if (a.includes('replay')) return { icon: <RotateCw size={size} />, cls: 'a-replay' };
  if (a.includes('act')) return { icon: <Wand2 size={size} />, cls: 'a-act' };
  if (a.includes('fill') || a.includes('type')) return { icon: <Keyboard size={size} />, cls: 'a-fill' };
  if (a.includes('click')) return { icon: <MousePointerClick size={size} />, cls: 'a-click' };
  if (a.includes('goto')) return { icon: <Globe size={size} />, cls: 'a-goto' };
  return { icon: <CornerDownRight size={size} />, cls: 'a-generic' };
}

/** L1：证据 kind 差异化图标（截图/视频/trace/console/HAR 各有专属形） */
function evidenceIcon(kind?: string): React.ReactNode {
  const k = (kind ?? '').toLowerCase();
  const size = 10;
  if (k.includes('screenshot')) return <Camera size={size} />;
  if (k.includes('video')) return <Video size={size} />;
  if (k.includes('trace')) return <FileArchive size={size} />;
  if (k.includes('console')) return <Terminal size={size} />;
  if (k.includes('har') || k.includes('network')) return <Network size={size} />;
  return <Paperclip size={size} />;
}

function lineBody(e: RunEvent): { icon: React.ReactNode; text: string; cls: string; icoCls?: string; ts?: string } {
  const t = e as unknown as {
    type: string; ts?: string; text?: string; tool?: string; action?: string; args?: Record<string, unknown>;
    ok?: boolean; detail?: string; kind?: string; uri?: string;
  };
  const ts = t.ts ? new Date(t.ts).toTimeString().slice(0, 8) : undefined;
  if (t.type === 'step.thinking') return { icon: <Brain size={10} />, text: t.text ?? '', cls: 'think', icoCls: 'a-think', ts };
  if (t.type === 'step.action') {
    const a = t.args ?? {};
    const llm = (a.llmCalls as number) ?? 0;
    const hit = a.cache === 'hit';
    const cache = hit ? ' · 缓存命中' : '';
    const label = (a.instruction as string) ?? (a.selector as string) ?? (a.url as string) ?? '';
    const ai = actionIcon(t.action ?? '');
    // G12：缓存命中行加高亮样式（lime 底色，一眼区分零 LLM 重放）
    return { icon: ai.icon, text: `${t.tool}·${t.action} ${label}（LLM ${llm}${cache}）`, cls: hit ? 'act cache-hit' : 'act', icoCls: ai.cls, ts };
  }
  if (t.type === 'step.observation') {
    return { icon: t.ok ? <CircleCheck size={10} /> : <CircleX size={10} />, text: t.detail ?? '', cls: t.ok ? 'obs-ok' : 'obs-fail', icoCls: t.ok ? 'a-ok' : 'a-fail', ts };
  }
  if (t.type === 'step.evidence') return { icon: evidenceIcon(t.kind), text: `${t.kind} · ${(t.uri ?? '').split('/').pop()}`, cls: 'ev', icoCls: 'a-ev', ts };
  return { icon: <CornerDownRight size={10} />, text: t.type, cls: '', icoCls: 'a-generic', ts };
}

export function App() {
  const [route, setRoute] = useState<Route>('run');
  const [replayRunId, setReplayRunId] = useState<string | null>(null);
  // U21：编辑器聚焦目标（验证 short_id）——QA 点「编辑/生成验证」跳编辑器时预填选中
  const [editorFocus, setEditorFocus] = useState<string | null>(null);
  // U22：当前 Run 关联验证 short_id（执行页 chip 真关联）+ QA 点聚焦（编辑器反向跳 QA 自动开抽屉）
  const [runVerShort, setRunVerShort] = useState<string | null>(null);
  const [qaFocus, setQaFocus] = useState<string | null>(null);
  // U26：QA 点动线改道——「生成验证/编辑」直接进执行页（一体化工作台），载入该验证步骤就地编辑
  const [runFocusVer, setRunFocusVer] = useState<string | null>(null);
  // U29：插件 UI 扩展——启用的插件可在侧栏长出自己的菜单与页面
  const [pluginPageRoute, setPluginPageRoute] = useState<string | null>(null);
  const [plugNavs, setPlugNavs] = useState<Array<{ shortId: string; label: string; icon?: string }>>([]);
  const [plugPages, setPlugPages] = useState<Record<string, { shortId: string; name: string; version: string; kind: string; description: string; manifest: Record<string, unknown> }>>({});
  const [health, setHealth] = useState('…');
  const [steps, setSteps] = useState<StepDefView[]>([]);
  // U25：拖拽排序（编辑回归执行页后一并恢复）
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<DoneSummary | null>(null);
  const [triageData, setTriageData] = useState<{ events: RunEvent[]; verdict: string; done: DoneSummary | null } | null>(null);
  const [exploreSeed, setExploreSeed] = useState('');
  // H09：项目切换器上下文（仅本地 state + localStorage，数据层暂无项目维度）
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem('verifyos.project') ?? '');
  const [projOpen, setProjOpen] = useState(false);
  // H09：验证库（真 VER short_id + 步骤定义验证选择）
  const [vers, setVers] = useState<VerItem[]>([]);
  const [verSel, setVerSel] = useState('');
  // U25：执行页内编辑 + 试运行（dry-run 同步接口，与编辑器共用后端）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dryBusy, setDryBusy] = useState<number | 'all' | null>(null);
  const [dry, setDry] = useState<{ runId: string; verdict: string; stepResults: Array<{ id: string; verdict: string; selector?: string }>; screenshots: string[] } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ping = () => fetch('/api/health').then((r) => r.json()).then((d) => setHealth(d.ok ? 'ok' : 'fail')).catch(() => setHealth('unreachable'));
    ping();
    // H09：15s 轮询健康状态（unreachable 可自愈），卸载清理
    const healthTimer = setInterval(ping, 15000);
    fetch('/api/runs/steps').then((r) => r.json()).then((d) => setSteps(d.steps ?? [])).catch(() => setSteps([]));
    // H09：验证库列表（页头真 short_id + 步骤定义选择下拉）
    fetch('/api/verifications').then((r) => r.json()).then((d) => setVers(d.items ?? [])).catch(() => setVers([]));
    // U29：插件 UI 扩展——enabled 且 manifest.ui.menu 的插件 → 侧栏菜单 + 页面注册
    fetch('/api/plugins').then((r) => r.json()).then((d) => {
      const items = (d.plugins ?? d.items ?? []) as Array<Record<string, unknown>>;
      const navs: Array<{ shortId: string; label: string; icon?: string }> = [];
      const pages: Record<string, { shortId: string; name: string; version: string; kind: string; description: string; manifest: Record<string, unknown> }> = {};
      for (const p of items) {
        if (p.status !== 'enabled') continue;
        const manifest = (p.manifest ?? {}) as Record<string, unknown>;
        const ui = (manifest.ui ?? {}) as { menu?: Array<{ label?: string; icon?: string }> };
        const menu = ui.menu?.[0];
        if (!menu?.label) continue;
        const sid = String(p.short_id);
        navs.push({ shortId: sid, label: String(menu.label), icon: menu.icon });
        pages[sid] = {
          shortId: sid, name: String(p.name ?? sid), version: String(p.version ?? '1.0.0'),
          kind: String(p.kind ?? 'custom'), description: String(p.description ?? ''), manifest,
        };
      }
      setPlugNavs(navs);
      setPlugPages(pages);
    }).catch(() => undefined);
    // H09：项目列表（后端若无 /api/projects 则诚实降级为本地默认项目）
    // T9: 后端返回 {ok, projects:[{id, short_id, name}]}——用 short_id 作唯一标识
    fetch('/api/projects')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => setProjects((Array.isArray(d) ? d : d.projects ?? d.items ?? []).map((p: Record<string, unknown>) => ({ id: String(p.short_id ?? p.id), name: String(p.name ?? p.title ?? p.id ?? '') }))))
      .catch(() => setProjects([]));

    const socket = io({ path: '/ws' });
    socket.on('run.event', (e: RunEvent) => {
      setEvents((prev) => [...prev, e]);
      if (e.type === 'run.started') {
        setRunning(true);
        setDone(null);
        setRunVerShort(null); // U22：新 Run 关联未知，等 detail 回来
        setEvents([e]); // F17: 新 Run 开始即重置事件流（API 触发的 Run 也清旧状态，修 banner/Triage 残留）
      }
      if (e.type === 'run.completed') setRunning(false);
    });
    socket.on('run.done', (d: DoneSummary) => setDone(d));
    return () => {
      socket.disconnect();
      clearInterval(healthTimer);
    };
  }, []);

  // H09：项目下拉点外部关闭
  useEffect(() => {
    if (!projOpen) return;
    const close = () => setProjOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [projOpen]);

  // U26：QA 点跳入执行页——按 short_id 找到验证并载入左列（就地编辑+试运行）
  useEffect(() => {
    if (!runFocusVer) return;
    fetch('/api/verifications').then((r) => r.json()).then((d) => {
      const rows: VerItem[] = d.items ?? [];
      setVers(rows);
      const target = rows.find((v) => v.short_id === runFocusVer);
      if (target) {
        applyVerification(String(target.id));
      }
      setRunFocusVer(null);
    }).catch(() => setRunFocusVer(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runFocusVer]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events]);

  const triggerRun = () => {
    setEvents([]);
    setDone(null);
    setReplayRunId(null);
    fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps }),
    }).catch(() => setRunning(false));
  };

  // U25：执行页内编辑——与编辑器共用 StepEditor 与 dry-run 后端，单一事实来源
  const toPayload = () => steps.map((s) => ({
    id: s.id, title: s.title, kind: s.kind,
    ...(s.actions?.length ? { actions: s.actions } : {}),
    ...(s.instruction ? { instruction: s.instruction } : {}),
    // U27 修复：StepEditor 写入的是 assert 对象——只看旧字段 assertValue 会丢断言
    ...(s.assert?.value ? { assert: { kind: s.assert.kind, value: s.assert.value } } : {}),
    ...(!s.assert?.value && s.assertValue ? { assert: { kind: 'url_contains' as const, value: s.assertValue } } : {}),
    ...(s.targetRef ? { targetRef: s.targetRef } : {}),
  }));
  const addStep = (kind: string) => {
    const id = `st_${Date.now().toString(36)}`;
    const title = kind === 'module' ? '确定性动作' : kind === 'ai' ? 'AI 操作' : '断言';
    setSteps((prev) => [...prev, { id, title, kind, editing: true, instruction: kind === 'ai' ? '' : '', assertValue: kind === 'assertion' ? '' : '' }]);
    setEditingId(id);
  };
  const delStep = (id: string) => { setSteps((prev) => prev.filter((s) => s.id !== id)); if (editingId === id) setEditingId(null); };
  const updStep = (id: string, patch: Partial<StepDefView>) => setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveStep = (from: number, to: number) => {
    if (from === to || to < 0 || to > steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      const insertAt = from < to ? to - 1 : to;
      next.splice(insertAt, 0, moved);
      return next;
    });
  };
  const saveAsVerification = () => {
    const payload = toPayload();
    const selVer = vers.find((v) => String(v.id) === verSel);
    if (selVer) {
      // 已选验证 → 更新它（不再像旧版每次新建造成重复）
      fetch(`/api/verifications/${selVer.id}/steps`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: selVer.title, steps: payload }),
      })
        .then((r) => r.json())
        .then((d) => window.alert(d.ok ? `✓ 已更新验证 ${selVer.short_id}` : `保存失败：${d.reason ?? '未知'}`))
        .catch(() => window.alert('保存失败'));
    } else {
      fetch('/api/verifications/blank', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '快速编辑验证', steps: payload }),
      })
        .then((r) => r.json())
        .then((d) => { window.alert(d.shortId ? `✓ 已保存为验证：${d.shortId}` : '保存失败'); if (d.shortId) { setVerSel(String(d.id ?? '')); fetch('/api/verifications').then((r) => r.json()).then((dd) => setVers(dd.items ?? [])).catch(() => undefined); } })
        .catch(() => window.alert('保存失败'));
    }
  };
  const dryRun = (upto?: number) => {
    if (dryBusy !== null || steps.length === 0) return;
    setDryBusy(upto ?? 'all');
    fetch('/api/runs/dry-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: toPayload(), ...(upto !== undefined ? { upto } : {}) }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) window.alert(`试运行失败：${d.error}`); else setDry(d); })
      .catch(() => window.alert('试运行失败（网络）'))
      .finally(() => setDryBusy(null));
  };

  // 历史回放：fetch events 一次性回放
  useEffect(() => {
    if (!replayRunId) return;
    setEvents([]);
    setDone(null);
    setRunning(false);
    fetch(`/api/runs/${replayRunId}/events`)
      .then((r) => r.json())
      .then((d) => {
        if (d.found) setEvents(d.events ?? []);
        else setEvents([]);
      })
      .catch(() => setEvents([]));
    // L4 集成：回放态也拉 Run 详情 → RunDetail（AI 分析/最终截图/视频回放 tabs + 触达校验）在回放历史 Run 时同样可用
    fetch(`/api/runs/${replayRunId}`)
      .then((r) => r.json())
      .then((det) => {
        if (det.found) {
          setDone({
            runId: replayRunId,
            verdict: det.verdict ?? 'unknown',
            llmCalls: det.llmCalls ?? 0,
            cache: det.cache,
            durationMs: det.durationMs ?? 0,
          });
        }
      })
      .catch(() => undefined);
  }, [replayRunId]);

  const { cards, banner } = useMemo(() => groupEvents(events), [events]);
  const completedBanner = banner.find((e) => e.type === 'run.completed') as unknown as { verdict?: string } | undefined;

  // 最后一张截图证据（浏览器舞台渲染真实截图）
  const evidenceEvents = events.filter((e) => e.type === 'step.evidence') as unknown as Array<{ kind?: string; uri?: string; runId?: string }>;
  const lastShot = [...evidenceEvents].reverse().find((e) => e.kind === 'screenshot');
  // 触达的最后 URL
  const lastUrl = useMemo(() => {
    const obs = [...events].reverse().find((e) => e.type === 'step.observation') as unknown as { detail?: string } | undefined;
    const fromObs = obs?.detail?.match(/https?:\/\/\S+/)?.[0];
    return fromObs ?? 'about:blank';
  }, [events]);

  const stepState = (id: string, index: number): { dot: string; cls: string; open: boolean } => {
    const card = cards.find((c) => c.stepId === id);
    if (card?.verdict) {
      const m = verdictMeta(card.verdict);
      return { dot: m.dot || '✓', cls: m.cls, open: false };
    }
    if (card?.open) return { dot: '●', cls: 'run', open: true };
    return { dot: String(index + 1), cls: 'idle', open: false };
  };

  const runVerdict = completedBanner?.verdict ?? (running ? 'running' : undefined);

  // H09：当前项目（localStorage 恢复优先；接口缺失时诚实降级为本地默认项目，仅上下文标识不过滤数据）
  const projList: ProjectItem[] = projects.length > 0 ? projects : [{ id: 'local', name: '订单管理系统' }];
  const curProject = projList.find((p) => p.id === projectId) ?? projList[0];
  const selectProject = (id: string) => {
    setProjectId(id);
    localStorage.setItem('verifyos.project', id);
    setProjOpen(false);
  };
  // H09：验证选择——用验证库 steps 覆盖本地步骤定义 state
  const applyVerification = (id: string) => {
    setVerSel(id);
    const v = vers.find((x) => x.id === id);
    if (!v) return;
    setSteps((v.steps ?? []).map((s) => ({
      id: s.id,
      title: s.title ?? s.id,
      kind: s.kind,
      ...(s.instruction ? { instruction: s.instruction } : {}),
      ...(s.assert?.value ? { assertValue: s.assert.value } : {}),
      ...(s.targetRef ? { targetRef: s.targetRef } : {}),
      ...(s.actions ? { actions: s.actions } : {}),
      editing: false,
    })));
  };

  return (
    <div className="shell">
      {/* 侧边栏（原型 184px） */}
      <aside className="sidebar">
        <div className="slogo">
          <span className="mark">✓</span>
          <div className="sproj-wrap">
            <div className="sname">VerifyOS</div>
            {/* H09：项目切换器——点击弹出下拉，仅本地 state + localStorage，不假装过滤数据 */}
            <div
              className="sproj proj-switch"
              title="切换项目（仅切换上下文标识，数据层暂无项目维度）"
              onClick={(e) => { e.stopPropagation(); setProjOpen((o) => !o); }}
            >
              {curProject?.name ?? '订单管理系统'}<span className="proj-caret">▾</span>
            </div>
            {projOpen && (
              <div className="proj-menu" onClick={(e) => e.stopPropagation()}>
                {projList.map((p) => (
                  <div key={p.id} className={`proj-item${p.id === curProject?.id ? ' on' : ''}`} onClick={() => selectProject(p.id)}>
                    <span className="proj-check">{p.id === curProject?.id ? '✓' : ''}</span>
                    <span className="proj-name">{p.name}</span>
                  </div>
                ))}
                {projects.length === 0 && <div className="proj-note">GET /api/projects 不可用 · 显示本地默认</div>}
                <div
                  className="proj-item"
                  onClick={() => { setProjOpen(false); setRoute('settings'); }}
                ><span className="proj-check">⚙</span><span className="proj-name">项目设置（仓库 / 环境）</span></div>
              </div>
            )}
          </div>
        </div>
        <div className="navsec">工作区</div>
        {NAV.map(({ icon: Icon, label, route: r, badge }) => (
          <div key={label} className={`navitem${route === r ? ' active' : ''}`} onClick={() => setRoute(r)}>
            <Icon size={13} />
            <span className="navlabel">{label}</span>
            {badge && <span className="navbadge">{badge}</span>}
            {/* H09：全局 Run 感知——socket running 时侧栏「验证 · 执行」绿点徽标 */}
            {r === 'run' && running && <span className="navrun">● 运行中</span>}
          </div>
        ))}
        <div className="navsec">管理</div>
        <div className="navitem" onClick={() => setRoute('plugins')}><Plug size={13} /><span className="navlabel">工具与插件</span></div>
        <div className="navitem" onClick={() => setRoute('mobile')}><Smartphone size={13} /><span className="navlabel">移动测试</span></div>
        <div className="navitem" onClick={() => setRoute('cred')}><Inbox size={13} /><span className="navlabel">凭据</span></div>
        {plugNavs.length > 0 && (
          <>
            <div className="navsec">插件</div>
            {plugNavs.map((n) => (
              <div
                key={n.shortId}
                className={`navitem${route === 'plugin-page' && pluginPageRoute === n.shortId ? ' active' : ''}`}
                title={`由插件 ${n.shortId} 提供`}
                onClick={() => { setPluginPageRoute(n.shortId); setRoute('plugin-page'); }}
              >
                <Plug size={13} />
                <span className="navlabel">{n.label}</span>
              </div>
            ))}
          </>
        )}
        <div className="suser">
          <span className="avatar">谢</span>
          <div><b>谢嘉伟</b><div className="dim">FDE</div></div>
        </div>
      </aside>

      {/* 主区 */}
      <div className="main">
        {/* 页头（原型 runhead） */}
        <div className="runhead">
          {route !== 'run' && (
            <button className="btn" onClick={() => setRoute('run')}>← 验证 · 执行</button>
          )}
          <div className="big">{route === 'plugin-page' ? (plugPages[pluginPageRoute ?? '']?.name ?? '插件页面') : ({ dashboard: '概览', chat: 'AI 工作区', explore: '探索', qa: 'QA 点', run: '验证 · 执行', editor: '验证编辑器', history: '执行历史', map: '应用地图', issues: '问题', pr: 'PR 验证', mobile: '移动测试', cred: '凭据', plugins: '工具与插件', triage: '失败分析 · Triage', welcome: '新建项目', import: '需求导入 · AI 提取 QA 点', settings: '项目设置' }[route])}</div>
          {/* H09：真 VER short_id（验证库第一条；空则灰 chip 诚实标注未关联） */}
          {route === 'run' && ((runVerShort || vers[0]?.short_id)
            ? <span className="chip mono link" title={(runVerShort ? '本次 Run 关联的验证' : '验证库当前选中') + '——点击去编辑器查看/修改步骤'} style={{ cursor: 'pointer' }} onClick={() => { const v = runVerShort ?? vers[0]?.short_id; if (v) setRunFocusVer(v); }}>{runVerShort ?? vers[0]?.short_id}</span>
            : <span className="chip chip-void">未关联验证</span>)}
          {route === 'run' && replayRunId && (
            <span className="chip" style={{ background: 'var(--lime-bg)', color: 'var(--lime-deep)', border: '1px solid #d9f99d' }}>
              <Play size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> 回放中：{replayRunId.slice(0, 14)}…
              <span className="sp" style={{ width: 6 }} />
              <a style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setReplayRunId(null)}>返回实时</a>
            </span>
          )}
          {route === 'run' && running ? (
            <span className="livechip"><i />LIVE</span>
          ) : route === 'run' && runVerdict && runVerdict !== 'running' ? (
            <span className={`chip v-${runVerdict}`}>
              {runVerdict === 'pass' ? <Check size={11} /> : runVerdict === 'fail' ? <X size={11} /> : <TriangleAlert size={11} />}
              {' '}{runVerdict === 'pass' ? '通过' : runVerdict === 'fail' ? '失败' : '无法验证'}
            </span>
          ) : null}
          <span className="sp" />
          <span className="hint mono">后端 {health}</span>
          {route === 'run' && (
            <button className="btn primary" onClick={triggerRun} disabled={running}>
              <Play size={11} /> {running ? '执行中…' : '重新运行'}
            </button>
          )}
        </div>

        {route === 'run' && completedBanner && (
          <div className={`banner ${completedBanner.verdict === 'pass' ? 'b-ok' : completedBanner.verdict === 'unknown' ? 'b-warn' : 'b-fail'}`}>
            {completedBanner.verdict === 'pass' ? '✓' : completedBanner.verdict === 'unknown' ? '⚠' : '✕'}
            &nbsp;Run 完成：{(completedBanner.verdict ?? '').toUpperCase()}
            {done && <span className="mono">· {done.durationMs}ms · LLM {done.llmCalls} 次{done.cache ? ` · 缓存 ${done.cache.entries} 条/${done.cache.totalHits} 命中` : ''}</span>}
          </div>
        )}

        {route === 'dashboard' && <DashboardView onOpenRun={(runId) => { if (runId) setReplayRunId(runId); setRoute('run'); }} onGo={(r) => setRoute(r)} />}
        {route === 'history' && <HistoryView onReplay={(id) => { setReplayRunId(id); setRoute('run'); }} onNew={() => setRoute('editor')} />}
        {route === 'pr' && <PrView />}
        {route === 'explore' && <ExploreView seedUrl={exploreSeed} key={exploreSeed} onGoMap={() => setRoute('map')} onGoQa={() => setRoute('qa')} />}
        {route === 'import' && <ImportView onGoQa={() => setRoute('qa')} onGoChat={() => setRoute('chat')} />}
        {route === 'welcome' && <WelcomeView onGoExplore={(u) => { setExploreSeed(u); setRoute('explore'); }} onGo={(r) => setRoute(r)} />}
        {route === 'settings' && <ProjectSettingsView shortId={curProject?.id ?? ''} name={curProject?.name ?? '订单管理系统'} />}
        {route === 'qa' && <QaView onGo={(r) => setRoute(r)} onGoEditor={() => setRoute('run')} onGoQaEditor={(verShortId) => { setRunFocusVer(verShortId); setRoute('run'); }} focusQaId={qaFocus} onFocusConsumed={() => setQaFocus(null)} />}
        {route === 'map' && <MapView onGoQa={() => setRoute('qa')} />}
        {route === 'cred' && <CredView />}
        {route === 'chat' && <ChatView />}
        {route === 'issues' && <IssuesView onGo={(r) => setRoute(r)} onOpenRun={(runId) => { setReplayRunId(runId); setRoute('run'); }} />}
        {route === 'plugins' && <PluginsView />}
        {route === 'triage' && <TriageView data={triageData} onBack={() => setRoute('run')} onGo={(r) => setRoute(r)} />}
        {route === 'editor' && <EditorView onOpenRun={() => setRoute('run')} focusVerId={editorFocus} onFocusConsumed={() => setEditorFocus(null)} onGoQa={(qaId) => { setQaFocus(qaId); setRoute('qa'); }} />}
        {route === 'mobile' && <MobileView />}
        {route === 'plugin-page' && <PluginPageView plugin={pluginPageRoute ? plugPages[pluginPageRoute] ?? null : null} onGo={(r) => setRoute(r as Route)} />}

        <div className="cols" style={{ display: route === 'run' ? undefined : 'none', gridTemplateColumns: editingId ? 'minmax(300px, 360px) minmax(255px, 285px) minmax(360px, 1fr)' : undefined }}>
          {/* 左：步骤定义（U25：编辑回归执行页——与编辑器共用 StepEditor 组件，试运行就地反馈，免去跳页） */}
          <aside
            className="col col-defs"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && overIdx !== null) moveStep(dragIdx, overIdx); setDragIdx(null); setOverIdx(null); }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>步骤定义</h3>
              <select
                className="inp versel"
                value={verSel}
                title="从验证库载入步骤定义"
                onChange={(e) => applyVerification(e.target.value)}
              >
                <option value="">选择验证…</option>
                {vers.map((v) => (
                  <option key={v.id} value={v.id}>{v.short_id ?? v.id} · {v.title ?? ''}</option>
                ))}
              </select>
              <span className="sp" />
              <button className="btn" style={{ fontSize: 10, padding: '2px 7px' }} title="添加 AI 步骤" onClick={() => addStep('ai')}>＋AI</button>
              <button className="btn" style={{ fontSize: 10, padding: '2px 7px' }} title="添加断言步骤" onClick={() => addStep('assertion')}>＋断言</button>
              <button className="btn" style={{ fontSize: 10, padding: '2px 7px' }} title="添加确定性动作步骤" onClick={() => addStep('module')}>＋动作</button>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 7px' }}
                title="把当前步骤保存为验证（已选验证则更新它）"
                onClick={saveAsVerification}
              ><Save size={10} /> 存为验证</button>
              <button
                className="btn"
                style={{ fontSize: 10, padding: '2px 7px' }}
                title="真实浏览器试运行全部步骤（ai 步含 LLM 规划 20-40s），结果就地显示"
                disabled={dryBusy !== null || steps.length === 0}
                onClick={() => dryRun()}
              >{dryBusy === 'all' ? '试运行中…' : '▶ 试运行'}</button>
            </div>
            {steps.map((s, i) => {
              const st = stepState(s.id, i);
              const dryR = dry?.stepResults.find((r) => r.id === s.id);
              return (
                <Fragment key={s.id}>
                  {dragIdx !== null && overIdx === i && <div className="drop-indicator" />}
                  <div
                    className={`stepcard ${st.cls}${st.open ? ' cur' : ''}${dragIdx === i ? ' dragging' : ''}${editingId === s.id ? ' editing' : ''}`}
                    draggable={editingId !== s.id}
                    onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      const rect = e.currentTarget.getBoundingClientRect();
                      setOverIdx(e.clientY > rect.top + rect.height / 2 ? i + 1 : i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (dragIdx !== null && overIdx !== null) moveStep(dragIdx, overIdx);
                      setDragIdx(null); setOverIdx(null);
                    }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  >
                    {editingId !== s.id && <span className={`dot ${st.cls}`}>{st.cls === 'run' ? '●' : st.dot}</span>}
                    <div className="stepbody">
                      {editingId === s.id ? (
                        <StepEditor step={s as never} onChange={(p) => updStep(s.id, p as Partial<StepDefView>)} />
                      ) : (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <b style={{ flex: 1, minWidth: 0 }}>{s.title}</b>
                            {dryR && <span title={`试运行：${dryR.verdict}`} style={{ width: 8, height: 8, borderRadius: 50, flexShrink: 0, background: dryR.verdict === 'pass' ? 'var(--green)' : 'var(--red)' }} />}
                            <button className="btn" style={{ fontSize: 9.5, padding: '1px 6px' }} onClick={() => setEditingId(editingId === s.id ? null : s.id)}>{editingId === s.id ? '收起' : '编辑'}</button>
                            <button className="btn" style={{ fontSize: 9.5, padding: '1px 6px', color: 'var(--red)' }} onClick={() => delStep(s.id)}>×</button>
                          </div>
                          <div className="chips">
                            <span className="chip stepno">Step {i + 1}</span>
                            <span className="chip">{s.kind}</span>
                            {s.targetRef && <span className="chip target">目标 {s.targetRef.replace(/^https?:\/\/[^/]+/, '')}</span>}
                          </div>
                        </>
                      )}
                      {editingId === s.id && (
                        <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                          <button className="btn primary" style={{ fontSize: 9.5, padding: '1px 8px' }} onClick={() => setEditingId(null)}>完成</button>
                          <button
                            className="btn"
                            style={{ fontSize: 9.5, padding: '1px 8px' }}
                            disabled={dryBusy !== null}
                            title="真实浏览器跑到该步骤（含此前步骤），就地看效果"
                            onClick={() => dryRun(i)}
                          >{dryBusy === i ? '试运行中…' : '▶ 试运行到此步'}</button>
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}
            {dragIdx !== null && overIdx === steps.length && <div className="drop-indicator" />}
          </aside>

          {/* 中：Action Log */}
          <section className="col col-log">
            <h3>Action Log</h3>
            <div className="gate" title="合并门禁：断言失败阻止合并；无法验证警告；UNKNOWN ≠ PASS">
              <Cone size={11} /> 失败→<b>阻止</b> · 无法验证→<b>警告</b>
            </div>
            <div className="log" ref={logRef}>
              {cards.length === 0 && <p className="dim">点击右上角「重新运行」开始</p>}
              {cards.map((c) => {
                const v = verdictMeta(c.verdict ?? (c.open ? 'running' : undefined));
                return (
                  <div key={c.stepId} className={`alogcard${c.open ? ' cur' : ''}`}>
                    <div className="aloghead">
                      <span className={`dot ${v.cls}`}>{c.open ? '●' : v.dot}</span>
                      <b>{c.title ?? c.stepId}</b>
                      <span className="chip">{c.kind}</span>
                    </div>
                    {c.lines.map((l, i) => {
                      const b = lineBody(l);
                      return (
                        <div key={i} className={`logline ${b.cls}`}>
                          <span className={`lico ${b.icoCls ?? ''}`}>{b.icon}</span>
                          <span className="ltext" title={b.text}>{b.text}</span>
                          {b.ts && <span className="lts">{b.ts}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 右：浏览器舞台 + 摘要 */}
          <aside className="col col-stage">
            <TriageCard
              events={events}
              verdict={runVerdict}
              onOpenTriage={() => { setTriageData({ events, verdict: runVerdict ?? 'unknown', done }); setRoute('triage'); }}
            />
            <h3>舞台</h3>
            <div className="stage">
              <div className="brow">
                <div className="browbar">
                  <span className="bdot" /><span className="bdot" /><span className="bdot" />
                  <span className="browurl mono">{lastUrl.replace(/^https?:\/\//, '')}</span>
                </div>
                <div className="browbody">
                  {(() => {
                    // U25：试运行截图优先（标注「试运行」）——就地预览编辑效果
                    const dryShot = dry?.screenshots?.[dry.screenshots.length - 1];
                    if (dryShot) {
                      return <img className="shot" src={`/api/runs/${dry.runId}/evidence?key=${encodeURIComponent(dryShot)}`} alt="试运行截图" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />;
                    }
                    if (lastShot?.uri && lastShot.runId) {
                      return <img className="shot" src={`/api/runs/${lastShot.runId}/evidence?key=${encodeURIComponent(lastShot.uri)}`} alt="最新截图" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />;
                    }
                    return <div className="browempty"><Play size={18} /><span>运行后显示实时截图</span></div>;
                  })()}
                </div>
              </div>
            </div>

            <h3>Run 摘要</h3>
            <div className="sumcard">
              <div className="kv"><span>状态</span><b>{running ? '● 执行中' : done ? done.verdict.toUpperCase() : '待运行'}</b></div>
              <div className="kv"><span>引擎</span><b>Stagehand × glm-4.5v</b></div>
              <div className="kv"><span>LLM 调用</span><b className="mono">{done?.llmCalls ?? 0}</b></div>
              {done && <div className="kv"><span>耗时</span><b className="mono">{done.durationMs}ms</b></div>}
              {done?.cache && <div className="kv"><span>定位缓存</span><b className="mono">{done.cache.entries} 条 / {done.cache.totalHits} 命中</b></div>}
            </div>
            <RunDetail done={done} events={events} onVer={setRunVerShort} onEditVer={(v) => { setRunFocusVer(v); setRoute('run'); }} />
          </aside>
        </div>

        {/* G14：底部持久日志面板（仅 run 屏） */}
        {route === 'run' && <RunLogPanel events={events} onOpenMap={() => setRoute('map')} />}
      </div>
    </div>
  );
}

/** run.done 后拉取详情：证据三 tab（AI 分析/最终截图/视频回放）+ 触达校验明细 + 证据下钻 */
function RunDetail({ done, events, onVer, onEditVer }: { done: DoneSummary | null; events: RunEvent[]; onVer?: (v: string | null) => void; onEditVer?: (v: string) => void }) {
  const [detail, setDetail] = useState<{
    verShortId?: string | null;
    reachability?: Array<{ stepId: string; verdict: string; explanation: string }>;
    visitedUrls?: string[];
    evidenceKeys?: string[];
  } | null>(null);
  const [tab, setTab] = useState<'ai' | 'shot' | 'video'>('ai');

  useEffect(() => {
    if (!done) { setDetail(null); onVer?.(null); return; }
    fetch(`/api/runs/${done.runId}`).then((r) => r.json()).then((d) => {
      setDetail(d.found ? d : null);
      onVer?.((d.verShortId as string) ?? null); // U22：上报本 Run 真关联验证（执行页 chip）
    }).catch(() => { setDetail(null); onVer?.(null); });
  }, [done]);

  if (!done) return null;

  // G14：三 tab 数据源（全部来自现有事件流，空态诚实标注）
  const thinkLines = events.filter((e) => e.type === 'step.thinking') as unknown as Array<{ text?: string }>;
  const llmActions = (events.filter((e) => e.type === 'step.action') as unknown as Array<{ tool?: string; action?: string; args?: { llmCalls?: number } }>)
    .filter((a) => (a.args?.llmCalls ?? 0) > 0);
  const evItems = events.filter((e) => e.type === 'step.evidence') as unknown as Array<{ kind?: string; uri?: string; runId?: string }>;
  const shotItems = evItems.filter((s) => s.kind === 'screenshot' && s.uri);
  let videoItems = evItems.filter((s) => s.kind === 'video' && s.uri);
  // 兜底：事件流缺 video evidence（旧 Run / runner 未发事件）时，从 detail.evidenceKeys 过滤 .webm
  if (videoItems.length === 0 && (detail?.evidenceKeys ?? []).some((k) => k.endsWith('.webm'))) {
    videoItems = (detail!.evidenceKeys ?? []).filter((k) => k.endsWith('.webm')).map((k) => ({ kind: 'video', uri: k, runId: done.runId }));
  }
  const evUrl = (rid: string, uri: string) => `/api/runs/${rid}/evidence?key=${encodeURIComponent(uri)}`;

  return (
    <div className="sumcard">
      <div className="runlog-tabs">
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI 分析</button>
        <button className={tab === 'shot' ? 'on' : ''} onClick={() => setTab('shot')}>最终截图</button>
        <button className={tab === 'video' ? 'on' : ''} onClick={() => setTab('video')}>视频回放</button>
      </div>
      {tab === 'ai' && (
        thinkLines.length + llmActions.length === 0 ? (
          <p className="dim runlog-empty">该 Run 无 LLM 观察——module/assertion 步骤零 LLM 属正常</p>
        ) : (
          <div className="runlog-ailist">
            {thinkLines.map((t, i) => <div key={`t${i}`} className="runlog-airow">{t.text}</div>)}
            {llmActions.map((a, i) => <div key={`a${i}`} className="runlog-airow mono">{a.tool}·{a.action}（LLM {a.args?.llmCalls} 次）</div>)}
          </div>
        )
      )}
      {tab === 'shot' && (shotItems.length === 0 ? (
        <p className="dim runlog-empty">本 Run 无截图证据</p>
      ) : shotItems.map((s, i) => {
        const rid = s.runId ?? done.runId;
        return (
          <a key={i} className="runlog-shot" href={evUrl(rid, s.uri!)} target="_blank" rel="noreferrer">
            <img src={evUrl(rid, s.uri!)} alt={`截图 ${i + 1}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="dim">{s.uri!.split('/').pop()}</span>
          </a>
        );
      }))}
      {tab === 'video' && (videoItems.length === 0 ? (
        <p className="dim runlog-empty">该 Run 未录制视频（引擎 video 管道属后续）</p>
      ) : videoItems.map((v, i) => (
        <video key={i} className="runlog-video" controls src={evUrl(v.runId ?? done.runId, v.uri!)} />
      )))}
      {detail?.verShortId && onEditVer && (
        <button className="btn" style={{ fontSize: 11, marginTop: 6 }} title="跳到验证编辑器查看/修改这条验证的步骤" onClick={() => onEditVer(detail.verShortId!)}>→ 编辑这条验证</button>
      )}
      <h4>触达校验（UNKNOWN ≠ PASS）</h4>
      {(detail?.reachability ?? []).length === 0 && <p className="dim" style={{ fontSize: 11 }}>本 Run 未声明 targetRef</p>}
      {(detail?.reachability ?? []).map((c) => (
        <div key={c.stepId} className={`reach ${c.verdict}`}>
          <span className={`dot ${verdictMeta(c.verdict).cls}`}>{verdictMeta(c.verdict).dot}</span>
          <span className="rexplain">{c.explanation}</span>
        </div>
      ))}
      <h4>证据（{detail?.evidenceKeys?.length ?? 0}）</h4>
      <div className="evlist">
        {(detail?.evidenceKeys ?? []).map((k) => (
          <a key={k} className="evlink mono" href={`/api/runs/${done.runId}/evidence/${k}`} target="_blank" rel="noreferrer">
            {k.split('/').pop()}
          </a>
        ))}
      </div>
    </div>
  );
}


/** G14：底部持久日志面板——Console/Network/测试&Agent/图谱/日志 五 tab（180px，点标题折叠为 32px 条） */
function RunLogPanel({ events, onOpenMap }: { events: RunEvent[]; onOpenMap: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'console' | 'network' | 'test' | 'map' | 'log'>('test');

  const evs = events as unknown as Array<{ type: string; ts?: string; detail?: string; text?: string; kind?: string; uri?: string; runId?: string; ok?: boolean }>;
  const { cards } = useMemo(() => groupEvents(events), [events]);

  // U28：真数据源——console 日志文件 + HAR 解析（来自引擎 evidence 事件）
  const runId = (evs.find((e) => e.runId)?.runId) ?? '';
  const consoleKey = (evs.find((e) => e.kind === 'console' && e.uri)?.uri) ?? '';
  const networkKey = (evs.find((e) => e.kind === 'network' && e.uri)?.uri) ?? '';
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [netEntries, setNetEntries] = useState<Array<{ method: string; status: number; url: string }>>([]);
  const [netLoading, setNetLoading] = useState(false);
  useEffect(() => {
    setConsoleLines([]);
    setNetEntries([]);
    if (!runId) return;
    if (consoleKey) {
      fetch(`/api/runs/${runId}/evidence?key=${encodeURIComponent(consoleKey)}`)
        .then((r) => r.text())
        .then((t) => setConsoleLines(t.split('\n').filter((l) => l.trim())))
        .catch(() => undefined);
    }
    if (networkKey) {
      setNetLoading(true);
      fetch(`/api/runs/${runId}/evidence?key=${encodeURIComponent(networkKey)}`)
        .then((r) => r.json())
        .then((har: { log?: { entries?: Array<{ request?: { method?: string; url?: string }; response?: { status?: number } }> } }) => {
          const rows = (har?.log?.entries ?? []).slice(0, 120).map((en) => ({
            method: en.request?.method ?? 'GET',
            status: en.response?.status ?? 0,
            url: (en.request?.url ?? '').replace(/^https?:\/\//, ''),
          }));
          setNetEntries(rows);
        })
        .catch(() => undefined)
        .finally(() => setNetLoading(false));
    }
  }, [runId, consoleKey, networkKey]);

  const consoleOldFallback = evs.filter((e) => e.type === 'step.observation' && /console/i.test(e.detail ?? ''));
  const statusCls = (s: number) => (s >= 200 && s < 300 ? 'var(--green)' : s >= 300 && s < 400 ? '#2563eb' : s >= 400 ? 'var(--red)' : 'var(--muted)');

  const TAB_META: Array<{ id: typeof tab; label: string; count?: number }> = [
    { id: 'console', label: 'Console', count: consoleLines.length || consoleOldFallback.length },
    { id: 'network', label: 'Network', count: netEntries.length },
    { id: 'test', label: '测试&Agent', count: cards.length },
    { id: 'map', label: '图谱' },
    { id: 'log', label: '日志', count: events.length },
  ];

  return (
    <div className={`runlog-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="runlog-head" onClick={() => setCollapsed((c) => !collapsed)}>
        <b>RUN LOG</b>
        <span className="runlog-tabs" onClick={(e) => e.stopPropagation()}>
          {TAB_META.map((m) => (
            <button key={m.id} className={tab === m.id ? 'on' : ''} onClick={() => setTab(m.id)}>
              {m.label}{m.count !== undefined ? ` (${m.count})` : ''}
            </button>
          ))}
        </span>
        <span className="sp" />
        <span className="dim">{collapsed ? '展开 ▲' : '折叠 ▼'}</span>
      </div>
      {!collapsed && (
        <div className="runlog-body">
          {tab === 'console' && (() => {
            if (consoleLines.length === 0 && consoleOldFallback.length === 0) {
              return <p className="dim runlog-empty">{runId && consoleKey ? 'Console 日志加载中…' : '本 Run 没有捕获到 console 输出（页面无 console 调用即为此状态）'}</p>;
            }
            const src = consoleLines.length > 0 ? consoleLines : consoleOldFallback.map((e) => e.detail ?? '');
            return src.map((line, i) => {
              const cls = /\[error\]|\[pageerror\]/.test(line) ? 'var(--red)' : /\[warning\]/.test(line) ? 'var(--amber)' : 'var(--sub)';
              return <div key={i} className="runlog-row"><span style={{ color: cls, fontFamily: 'var(--mono)', fontSize: 10.3, wordBreak: 'break-all' }}>{line}</span></div>;
            });
          })()}
          {tab === 'network' && (netLoading ? (
            <p className="dim runlog-empty">HAR 解析中…</p>
          ) : netEntries.length === 0 ? (
            <p className="dim runlog-empty">{networkKey ? 'HAR 里没有请求记录' : '本 Run 没有 HAR 网络记录（正式运行会自动生成）'}</p>
          ) : netEntries.map((en, i) => (
            <div key={i} className="runlog-row">
              <span className="mono" style={{ fontSize: 10, color: statusCls(en.status), width: 30, flexShrink: 0 }}>{en.status}</span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', width: 42, flexShrink: 0 }}>{en.method}</span>
              <span className="mono" style={{ fontSize: 10.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{en.url}</span>
            </div>
          )))}
          {tab === 'test' && (cards.length === 0 ? (
            <p className="dim runlog-empty">尚无步骤事件——点右上角「重新运行」</p>
          ) : cards.map((c) => (
            <div key={c.stepId} className="runlog-row">
              <span className={`dot ${verdictMeta(c.verdict ?? (c.open ? 'running' : undefined)).cls}`} style={{ width: 12, height: 12, fontSize: 8 }}>{verdictMeta(c.verdict ?? (c.open ? 'running' : undefined)).dot || '·'}</span>
              <b style={{ fontSize: 11 }}>{c.title ?? c.stepId}</b>
              {c.lines.map((l, i) => <span key={i}>{lineBody(l).text}</span>)}
            </div>
          )))}
          {tab === 'map' && (
            <div>
              <p style={{ margin: '4px 0 8px' }}>应用地图汇总探索与运行触达的页面/交互图——当前 Run 的触达明细见右侧「触达校验」。</p>
              <button className="btn primary" style={{ fontSize: 11 }} onClick={onOpenMap}>打开应用地图 →</button>
            </div>
          )}
          {tab === 'log' && (events.length === 0 ? (
            <p className="dim runlog-empty">事件流为空</p>
          ) : events.map((e, i) => {
            const b = lineBody(e);
            return (
              <div key={i} className="runlog-row">
                <span className="lts">{b.ts ?? ''}</span>
                <span className="mono" style={{ fontSize: 9.8 }}>{e.type}</span>
                <span style={{ minWidth: 0 }}>{b.text}</span>
              </div>
            );
          }))}
        </div>
      )}
    </div>
  );
}

/** D1+F8：Triage 失败分析（verdict=fail/unknown 时出现：失败步骤 + 原因 + 截图证据 + → 完整分析入口） */
function TriageCard({ events, verdict, onOpenTriage }: { events: RunEvent[]; verdict?: string; onOpenTriage?: () => void }) {
  if (verdict !== 'fail' && verdict !== 'unknown') return null;

  const completed = events.filter((e) => e.type === 'step.completed') as unknown as Array<{ stepId: string; verdict: string }>;
  const badSteps = completed.filter((c) => c.verdict === 'fail' || c.verdict === 'unknown');
  if (badSteps.length === 0) return null;

  const started = events.filter((e) => e.type === 'step.started') as unknown as Array<{ stepId: string; title: string }>;
  const titleOf = (id: string) => started.find((s) => s.stepId === id)?.title ?? id;
  const failedObs = events.filter((e) => e.type === 'step.observation') as unknown as Array<{ stepId?: string; ok?: boolean; detail?: string }>;
  const shots = events.filter((e) => e.type === 'step.evidence') as unknown as Array<{ stepId?: string; kind?: string; uri?: string; runId?: string }>;

  return (
    <div className="triage">
      <div className="triagehead">
        <TriangleAlert size={13} />
        <b>失败分析 · Triage</b>
        <span className="chip">{verdict === 'fail' ? <Ban size={11} /> : <TriangleAlert size={11} />} {verdict === 'fail' ? '阻止合并' : '警告合并'}</span>
      </div>
      {badSteps.map((bs) => {
        const reason = [...failedObs].reverse().find((o) => o.stepId === bs.stepId)?.detail ?? '无详细原因';
        const shot = [...shots].reverse().find((ev) => ev.stepId === bs.stepId && ev.kind === 'screenshot');
        const toIssue = () => {
          fetch('/api/issues', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: `验证失败：${titleOf(bs.stepId)}`, severity: verdict === 'fail' ? 'high' : 'medium', source: { reason, stepId: bs.stepId, verdict } }),
          }).then(() => window.alert('已转入问题库（「问题」页可查看）'));
        };
        return (
          <div key={bs.stepId} className="tribody">
            <div className="kv"><span>失败步骤</span><b>{titleOf(bs.stepId)}</b></div>
            <div style={{ display: 'flex', gap: 6, margin: '3px 0 5px' }}>
              {onOpenTriage && <button className="btn primary" style={{ fontSize: 10.5 }} onClick={onOpenTriage}>→ 完整分析</button>}
              <button className="btn" style={{ fontSize: 10.5 }} onClick={toIssue}>→ 转 issue</button>
            </div>
            <div className="kv"><span>判定</span><b className={`mono v-${bs.verdict === 'fail' ? 'fail' : 'unknown'}`} style={{ color: bs.verdict === 'fail' ? 'var(--red)' : 'var(--amber)' }}>{bs.verdict.toUpperCase()}</b></div>
            <div className="treason">{reason}</div>
            {shot?.uri && shot.runId && (
              <a className="trishot" href={`/api/runs/${shot.runId}/evidence?key=${encodeURIComponent(shot.uri)}`} target="_blank" rel="noreferrer">
                <img src={`/api/runs/${shot.runId}/evidence?key=${encodeURIComponent(shot.uri)}`} alt="失败时截图" />
                <span className="dim">点击查看原图 · {shot.uri.split('/').pop()}</span>
              </a>
            )}
            {shot?.runId && <TriageEvidence runId={shot.runId} />}
          </div>
        );
      })}
    </div>
  );
}


// ---------- 建设中占位（诚实标注依赖） ----------
const SOON_META: Partial<Record<Route, { icon: typeof Sparkle; desc: string }>> = {};

function ComingSoon({ route }: { route: Route }) {
  const meta = SOON_META[route];
  const Icon = meta?.icon ?? Sparkle;
  return (
    <div className="pageview">
      <div className="sumcard" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Icon size={30} style={{ color: 'var(--muted)' }} />
        <h4 style={{ fontSize: 14, margin: '10px 0 6px', color: 'var(--text)' }}>
          {({ mobile: '移动测试' } as Record<string, string>)[route]}
          {' '}—— 建设中
        </h4>
        <p className="dim" style={{ fontSize: 12, maxWidth: 460, margin: '0 auto', lineHeight: 1.9 }}>
          {meta?.desc ?? '规划中'}
        </p>
      </div>
    </div>
  );
}


/** Triage 证据文件下钻（该 Run 的全部证据：截图/trace/HAR，可点击下载/打开） */
function TriageEvidence({ runId }: { runId: string }) {
  const [keys, setKeys] = useState<string[]>([]);
  useEffect(() => {
    fetch(`/api/runs/${runId}`)
      .then((r) => r.json())
      .then((d) => setKeys(d.evidenceKeys ?? []))
      .catch(() => setKeys([]));
  }, [runId]);
  if (keys.length === 0) return null;
  return (
    <div className="triev" style={{ marginTop: 6 }}>
      <span className="dim" style={{ fontSize: 10 }}>全部证据（{keys.length}）：</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
        {keys.map((k) => (
          <a
            key={k}
            className="evlink mono"
            style={{ fontSize: 9.5 }}
            href={`/api/runs/${runId}/evidence?key=${encodeURIComponent(k)}`}
            target="_blank"
            rel="noreferrer"
          >
            {k.split('/').pop()}
          </a>
        ))}
      </div>
    </div>
  );
}
