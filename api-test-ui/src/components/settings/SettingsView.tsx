/**
 * SettingsView — 设置视图（nav === 'settings'）。
 *
 * 两个 section：
 * a) AI 模型配置：provider / API Key / Base URL / 默认模型名 + 测试连接（mock 结果）
 * b) 凭据管理：各连接器 token 状态 + 行内「配置」按钮展开输入框
 * 表单均为暗色风格（.input = bg-bg-tertiary 圆角输入框）。
 */
import { useState } from 'react';
import { Check, X, Settings2, KeyRound, LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/** AI provider 选项 */
const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'zhipu', label: '智谱' },
  { value: 'ollama', label: '本地 Ollama' },
] as const;

/** 连接器凭据定义 */
interface Connector {
  id: string;
  name: string;
  /** token 是否已配置 */
  configured: boolean;
  /** 已配置时展示的掩码 token */
  masked?: string;
}

const CONNECTORS: Connector[] = [
  { id: 'gitlab', name: 'GitLab', configured: true, masked: 'glpat-****9f2a' },
  { id: 'github', name: 'GitHub', configured: true, masked: 'ghp_****c41d' },
  { id: 'feishu', name: '飞书', configured: false },
  { id: 'zentao', name: '禅道', configured: false },
  { id: 'jira', name: 'Jira', configured: true, masked: 'ATATT****77be' },
  { id: 'figma', name: 'Figma', configured: false },
];

/** 测试连接状态 */
type TestState = 'idle' | 'testing' | 'ok' | 'error';

export function SettingsView() {
  // a) AI 模型配置表单状态
  const [provider, setProvider] = useState<string>('deepseek');
  const [apiKey, setApiKey] = useState('sk-demo-8f2e1a90c7');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [modelName, setModelName] = useState('deepseek-chat');
  const [testState, setTestState] = useState<TestState>('idle');

  // b) 凭据管理：当前展开配置输入框的连接器 id
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');

  /** 测试连接（mock：1s 后随机返回成功/失败，演示用固定成功） */
  const handleTest = () => {
    setTestState('testing');
    window.setTimeout(() => setTestState('ok'), 800);
  };

  /** 切换 provider 时联动填充 Base URL（mock 默认值） */
  const handleProviderChange = (v: string) => {
    setProvider(v);
    const defaults: Record<string, string> = {
      deepseek: 'https://api.deepseek.com/v1',
      openai: 'https://api.openai.com/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      ollama: 'http://localhost:11434/v1',
    };
    setBaseUrl(defaults[v] ?? '');
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-[560px] space-y-6">
        <h2 className="text-[13px] font-semibold text-fg-primary">设置</h2>

        {/* ===== a) AI 模型配置 ===== */}
        <section className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg-primary">
            <Settings2 size={15} className="text-accent" />AI 模型配置
          </div>

          <div className="space-y-3">
            {/* provider 下拉 */}
            <label className="block">
              <span className="mb-1 block text-xs text-fg-secondary">Provider</span>
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="input cursor-pointer"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value} className="bg-bg-secondary">{p.label}</option>
                ))}
              </select>
            </label>

            {/* API Key */}
            <label className="block">
              <span className="mb-1 block text-xs text-fg-secondary">API Key</span>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </label>

            {/* Base URL */}
            <label className="block">
              <span className="mb-1 block text-xs text-fg-secondary">Base URL</span>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
            </label>

            {/* 默认模型名 */}
            <label className="block">
              <span className="mb-1 block text-xs text-fg-secondary">默认模型名</span>
              <Input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="deepseek-chat" />
            </label>

            {/* 测试连接 + mock 结果 */}
            <div className="flex items-center gap-3 pt-1">
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testState === 'testing'}>
                {testState === 'testing' && <LoaderCircle size={12} className="animate-spin" />}
                测试连接
              </Button>
              {testState === 'ok' && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <Check size={13} />连接成功 · {modelName} 可用（延迟 213ms）
                </span>
              )}
              {testState === 'error' && (
                <span className="flex items-center gap-1 text-xs text-red-500">
                  <X size={13} />连接失败 · 请检查 API Key 与 Base URL
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ===== b) 凭据管理 ===== */}
        <section className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg-primary">
            <KeyRound size={15} className="text-accent" />凭据管理
          </div>

          <div className="divide-y divide-border">
            {CONNECTORS.map((c) => {
              const editing = editingId === c.id;
              return (
                <div key={c.id} className="py-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* token 状态 */}
                    {c.configured ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15 text-green-500">
                        <Check size={12} />
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15 text-red-500">
                        <X size={12} />
                      </span>
                    )}
                    <span className="text-[13px] text-fg-primary">{c.name}</span>
                    <span className={cn('text-[11px]', c.configured ? 'text-fg-muted' : 'text-red-400')}>
                      {c.configured ? `已配置 · ${c.masked}` : '未配置'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setEditingId(editing ? null : c.id);
                        setTokenDraft(c.configured ? (c.masked ?? '') : '');
                      }}
                    >
                      配置
                    </Button>
                  </div>

                  {/* 行内配置输入框 */}
                  {editing && (
                    <div className="mt-2 flex items-center gap-2 pl-7">
                      <Input
                        value={tokenDraft}
                        onChange={(e) => setTokenDraft(e.target.value)}
                        placeholder={`输入 ${c.name} 的 token / API Key`}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          // mock：保存即视为已配置，收起输入框
                          setEditingId(null);
                          setTokenDraft('');
                        }}
                      >
                        保存
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
