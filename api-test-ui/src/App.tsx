import { useEffect, useState } from 'react';
import { TopBar, type EnvKey, type ModelKey, type AccentKey } from '@/components/layout/TopBar';
import { Sidenav, type NavKey } from '@/components/layout/Sidenav';
import { PaneLayout } from '@/components/layout/PaneLayout';
import { EmptyState } from '@/components/layout/EmptyState';
import ApiTree from '@/components/api-tree/ApiTree';
import RequestPane from '@/components/request/RequestPane';
import ResponseViewer from '@/components/request/ResponseViewer';
import { CoverageBoard } from '@/components/coverage/CoverageBoard';
import { ScenarioTree } from '@/components/scenario/ScenarioTree';
import { ReportView } from '@/components/report/ReportView';
import { SettingsView } from '@/components/settings/SettingsView';
import { CasesView } from '@/components/cases/CasesView';
import { ContextPanel } from '@/components/context/ContextPanel';
import { AiDrawer } from '@/components/ai/AiDrawer';
import { AiFloatingButton } from '@/components/ai/AiFloatingButton';
import { DEMO_APIS, requestFromApi } from '@/components/api-tree/data';
import type { ApiDefinition } from '@/components/api-tree/types';

const VALID_ACCENTS: AccentKey[] = [
  'teal', 'blue', 'violet', 'rose', 'amber', 'green', 'cyan', 'red', 'orange',
];

type TabDoc = { kind: 'api' | 'scn'; id: string; label: string };

export default function App() {
  const [env, setEnv] = useState<EnvKey>('dev');
  const [model, setModel] = useState<ModelKey>('glm-4.6');
  const [accent, setAccent] = useState<AccentKey>('teal');
  const [nav, setNav] = useState<NavKey>('api');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiIntent, setAiIntent] = useState<'gen-case' | 'edge-case' | 'diagnose' | 'chat' | undefined>();
  const openTabs: TabDoc[] = [];

  // accent 切换同步到 html data-accent
  useEffect(() => {
    if (VALID_ACCENTS.includes(accent)) {
      document.documentElement.dataset.accent = accent;
    }
  }, [accent]);

  const [recOn, setRecOn] = useState(false);
  // 左栏选中的 API（驱动右栏 ContextPanel 详情摘要）
  const [selectedApi, setSelectedApi] = useState<ApiDefinition | null>(null);
  const navView = (): React.ReactNode => {
    if (nav === 'coverage') return <CoverageBoard />;
    if (nav === 'scenario') return <ScenarioTree />;
    if (nav === 'report') return <ReportView />;
    if (nav === 'settings') return <SettingsView />;
    if (nav === 'cases') return <CasesView />;
    // API 视图：选中资产树节点 → 请求编辑器；否则空态引导
    if (nav === 'api' && selectedApi)
      return <RequestPane initialRequest={requestFromApi(selectedApi)} />;
    if (openTabs.length === 0)
      return <EmptyState onStart={(i) => {
        if (i === 0) {
          // ① 录制流量 → 开录制面板（可见反馈：面板滑出+开关变红）
          setRecOn(true);
          setNav('api');
        } else if (i === 1) {
          // ② 导入 OpenAPI → 开 AI 抽屉（edge-case 模式）
          setAiIntent('edge-case');
          setAiOpen(true);
        } else {
          // ③ 手写调试 → 切到 API 视图 + AI 抽屉关闭
          setNav('api');
          setAiOpen(false);
        }
      }} />;
    return null;
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-fg-primary">
      <TopBar env={env} onEnvChange={setEnv} model={model} onModelChange={setModel} accent={accent} onAccentChange={setAccent} />

      <div className="flex min-h-0 flex-1">
        <Sidenav active={nav} onChange={setNav} />

        <PaneLayout
          left={
            // 用例视图使用独立用例列表（CasesView），左栏留空以与 API 树视图区分
            nav === 'api'
              ? <ApiTree
                  apis={DEMO_APIS}
                  selectedId={selectedApi?.id ?? null}
                  onSelect={(api: ApiDefinition) => setSelectedApi(api)}
                  onGenerate={(api: unknown) => { setAiIntent('gen-case'); setAiOpen(true); }}
                />
              : nav === 'scenario'
                ? <ScenarioTree scenarioName="下单流程" />
                : undefined
          }
          right={
            // 右栏：上下文面板（API 详情 / 场景摘要 / 快捷入口）
            <ContextPanel
              nav={nav}
              selectedApi={nav === 'api' ? selectedApi : null}
              onNewRequest={() => { setSelectedApi(null); setNav('api'); }}
              onImportOpenAPI={() => { setAiIntent('edge-case'); setAiOpen(true); }}
              onOpenAi={() => { setAiIntent(undefined); setAiOpen(true); }}
            />
          }
        >
          {navView() ?? <RequestPane initialRequest={{ method: 'GET' as const, url: '/users/:id', headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }], params: [{ id: 'p1', key: 'id', value: '1001', enabled: true }], bodyType: 'none' as const, body: '', auth: { type: 'none' as const, token: '', username: '', password: '', keyName: '', keyValue: '' }, assertions: [], preScript: '', postScript: '' }} />}
        </PaneLayout>
      </div>

      {/* 全局 AI 浮动按钮 + 抽屉 */}
      <AiFloatingButton onOpen={() => { setAiIntent(undefined); setAiOpen(true); }} />
      <AiDrawer open={aiOpen} onClose={() => setAiOpen(false)}
        context={{ type: nav === 'coverage' ? 'coverage' : nav === 'scenario' ? 'scenario' : 'api', label: nav === 'coverage' ? '未覆盖 3 个' : 'GET /users/:id' }}
        intent={aiIntent}
      />

      {/* 录制面板 overlay（卡①触发） */}
      {recOn && (
        <div className="fixed inset-y-0 left-0 z-30 w-[300px] bg-bg-secondary border-r border-border shadow-xl flex flex-col" style={{ animation: 'slideIn .25s ease-out' }}>
          <div className="flex items-center justify-between p-3 border-b border-border">
            <b className="text-[13px] text-fg-primary">录制会话</b>
            <span className="text-[11px] text-red-400">● 录制中</span>
            <button onClick={() => setRecOn(false)} className="text-fg-muted hover:text-fg-primary ml-2">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {([
              { dom: 'api.example.com', n: 18, rows: [['POST','/login','主文档'],['GET','/users','业务XHR'],['GET','/users/:id','业务XHR'],['POST','/orders','业务XHR']] },
              { dom: 'cdn.jsdelivr.net', n: 6, rows: [['GET','/npm/*.js','静态/三方'],['GET','/npm/*.css','静态/三方']] },
              { dom: 'sentry.io', n: 3, rows: [['POST','/breadcrumb','静态/三方']] },
            ] as Array<{ dom: string; n: number; rows: string[][] }>).map(({ dom, n, rows }, i) => (
              <div key={i} className="mb-3">
                <div className="flex items-center gap-2 text-[11.5px] text-fg-secondary mb-1">
                  <span className="w-3.5 h-3.5 border-[1.5px] border-fg-muted rounded-sm bg-accent text-[9px] text-center leading-[14px] text-white">✓</span>
                  {dom} <span className="ml-auto text-fg-muted text-[10px]">{n} 条</span>
                </div>
                {rows.map((r: string[], k: number) => (
                  <div key={k} className="flex items-center gap-1.5 py-0.5 pl-5 ml-3 border-l border-border font-mono text-[10px] text-fg-muted">
                    <span className="w-10 text-[9px]">{r[2]}</span> {r[0]} {r[1]}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <button onClick={() => { setRecOn(false); setAiIntent('gen-case'); setAiOpen(true); }}
              className="w-full bg-accent text-white font-semibold rounded-md py-2 text-[12.5px]">
              从勾选流量生成用例 →
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}
