/**
 * 【临时预览页 · 验收用】eng-api-tree 组件独立渲染测试。
 * 不依赖 eng-shell 的 App.tsx / types.ts / lib/utils.ts。
 * 合并后可整体删除：__preview.html + src/__preview__.tsx
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import ApiTree from "./components/api-tree/ApiTree";
import RequestPane from "./components/request/RequestPane";
import ResponseViewer from "./components/request/ResponseViewer";
import { DEMO_APIS, DEMO_GROUPS, DEMO_RESPONSE, requestFromApi } from "./components/api-tree/data";
import type { ApiDefinition, RequestState } from "./components/api-tree/types";
import "./index.css";

function Preview() {
  /* 预览截图用：#shot=body|curl|timing|search|auth 控制初始状态 */
  const shot = new URLSearchParams(window.location.hash.slice(1)).get("shot") ?? "";
  const [selected, setSelected] = useState<ApiDefinition>(DEMO_APIS[5]);
  const [request, setRequest] = useState<RequestState>(() => requestFromApi(DEMO_APIS[5]));
  const [responseKey, setResponseKey] = useState(0);
  const [toast, setToast] = useState("");

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 1600);
  };

  const select = (api: ApiDefinition) => {
    setSelected(api);
    setRequest(requestFromApi(api));
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-fg-primary" data-accent="teal">
      {/* 顶栏 */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-bg-secondary px-4">
        <span className="text-sm font-bold tracking-wide text-accent">VerifyOS</span>
        <span className="text-xs text-fg-muted">API 测试工作台 · 组件预览</span>
        <span className="ml-auto rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] text-fg-muted">
          当前选中：{selected.method} {selected.name}
        </span>
      </header>

      {/* 三栏 */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-border">
          <ApiTree
            apis={DEMO_APIS}
            groups={DEMO_GROUPS}
            selectedId={selected.id}
            initialQuery={shot === "search" ? "auth" : ""}
            onSelect={select}
            onGenerate={(api) => flash(`✦ 已为「${api.name}」生成测试用例（mock）`)}
          />
        </aside>

        <main className="min-w-0 flex-1 border-r border-border">
          <RequestPane
            initialRequest={request}
            initialTab={shot === "body" ? "body" : shot === "auth" ? "auth" : "params"}
            initialCurlOpen={shot === "curl"}
            onRequestChange={setRequest}
            onSend={(r) => { flash(`已发送 ${r.method} ${r.url}（模拟 600ms）`); setResponseKey((k) => k + 1); }}
            onSaveCase={(r) => flash(`用例已保存：${r.method} ${r.url}`)}
          />
        </main>

        <section className="min-w-0 flex-1">
          <ResponseViewer
            key={responseKey}
            response={DEMO_RESPONSE}
            initialLens={shot === "timing" ? "timing" : "body"}
            onResend={() => { flash("重新发送（模拟）"); setResponseKey((k) => k + 1); }}
          />
        </section>
      </div>

      {/* toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-md border border-accent-line bg-bg-tertiary px-4 py-2 text-xs text-accent shadow-xl shadow-black/40">
          {toast}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
