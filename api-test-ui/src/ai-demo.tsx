import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AiDrawer, AiFloatingButton, type AiContext, type AiIntent } from './components/ai';
import './index.css';

/** 临时演示入口：仅用于 playwright 验证 AiDrawer / AiFloatingButton，不进入主应用 */
function AiDemo() {
  const [open, setOpen] = useState(false);
  const [ctxIdx, setCtxIdx] = useState(0);

  const contexts: { context: AiContext; intent: AiIntent }[] = [
    { context: { type: 'api', label: '已选: GET /users/:id' }, intent: 'gen-case' },
    {
      context: { type: 'scenario', label: '场景: 下单流程 · 2 fail' },
      intent: 'diagnose',
    },
    { context: { type: 'coverage', label: '覆盖: PUT /orders/:id · 40%' }, intent: 'gen-case' },
    { context: { type: 'general', label: '通用助手' }, intent: 'chat' },
  ];

  const cur = contexts[ctxIdx];

  return (
    <div className="min-h-screen p-6">
      <h1 className="mb-3 text-base font-semibold">AI Drawer 临时演示页</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {contexts.map((c, i) => (
          <button
            key={c.context.label}
            data-testid={`ctx-${c.context.type}`}
            className="input w-auto"
            onClick={() => setCtxIdx(i)}
          >
            {c.context.label}（{c.intent}）
          </button>
        ))}
      </div>
      <button className="input w-auto" data-testid="open-drawer" onClick={() => setOpen(true)}>
        打开抽屉
      </button>
      <AiFloatingButton onOpen={() => setOpen(true)} />
      <AiDrawer open={open} onClose={() => setOpen(false)} context={cur.context} intent={cur.intent} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AiDemo />
  </StrictMode>,
);
