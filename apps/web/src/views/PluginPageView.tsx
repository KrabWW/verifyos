import { Database, Globe, Plug, Table2 } from 'lucide-react';

/**
 * U29：插件声明式页面渲染器。
 * 插件在 manifest.ui.menu[].entry 声明页面内容（declarative blocks 或 iframe），
 * 平台用通用渲染器画出来——插件不往平台里注代码，安全边界清晰。
 * blocks 类型：kv（键值行）/ text（段落）/ link（站内跳转）/ table（二维表）。
 */

interface Block { type: string; title?: string; text?: string; rows?: string[][]; route?: string; url?: string }
export interface PluginMenuEntry {
  label: string;
  icon?: string;
  entry: { type: 'declarative' | 'iframe'; blocks?: Block[]; url?: string };
}

function BlockView({ b, onGo }: { b: Block; onGo?: (r: string) => void }) {
  if (b.type === 'kv' && Array.isArray(b.rows)) {
    return (
      <div className="sumcard" style={{ marginBottom: 10 }}>
        {b.title && <h4>{b.title}</h4>}
        {b.rows.map((r, i) => (
          <div key={i} className="kv"><span>{r[0]}</span><b style={{ wordBreak: 'break-all' }}>{r[1]}</b></div>
        ))}
      </div>
    );
  }
  if (b.type === 'text') {
    return (
      <div className="sumcard" style={{ marginBottom: 10 }}>
        {b.title && <h4>{b.title}</h4>}
        <p className="dim" style={{ fontSize: 12, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{b.text}</p>
      </div>
    );
  }
  if (b.type === 'table' && Array.isArray(b.rows)) {
    return (
      <div className="sumcard" style={{ marginBottom: 10, padding: 0, overflow: 'hidden' }}>
        {b.title && <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}><h4 style={{ margin: 0 }}>{b.title}</h4></div>}
        <table className="tbl">
          {b.rows.map((row, i) => (
            <tr key={i}>{row.map((cell, k) => (i === 0 ? <th key={k}>{cell}</th> : <td key={k}>{cell}</td>))}</tr>
          ))}
        </table>
      </div>
    );
  }
  if (b.type === 'link' && b.route) {
    return (
      <button className="btn primary" style={{ fontSize: 12, marginBottom: 10 }} onClick={() => onGo?.(b.route!)}>
        {b.title ?? b.text ?? '前往'} →
      </button>
    );
  }
  return null;
}

export function PluginPageView({ plugin, onGo }: {
  plugin: {
    shortId: string; name: string; version: string; kind: string; description: string;
    manifest: Record<string, unknown>;
  } | null;
  onGo?: (r: string) => void;
}) {
  if (!plugin) {
    return (
      <div className="pageview">
        <div className="sumcard" style={{ textAlign: 'center', padding: '48px 16px' }}>
          <Plug size={30} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <h4 style={{ margin: '0 0 6px' }}>插件页面未找到</h4>
          <p className="dim" style={{ fontSize: 12 }}>对应插件可能已被禁用或删除——到「工具与插件」查看插件状态。</p>
        </div>
      </div>
    );
  }
  const manifest = (plugin.manifest ?? {}) as Record<string, unknown>;
  const ui = (manifest.ui ?? {}) as { menu?: PluginMenuEntry[] };
  const entry = ui.menu?.[0]?.entry;
  return (
    <div className="pageview">
      <div className="sumcard" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Database size={13} /> {plugin.name}
          </h4>
          <span className="chip p-purple">{plugin.kind}</span>
          <span className="chip mono">v{plugin.version}</span>
          <span className="sp" />
          <span className="chip mono">{plugin.shortId}</span>
        </div>
        {plugin.description && <p className="dim" style={{ fontSize: 12, marginTop: 6 }}>{plugin.description}</p>}
      </div>
      {entry?.type === 'declarative' && (entry.blocks ?? []).map((b, i) => (
        <BlockView key={i} b={b} onGo={onGo} />
      ))}
      {entry?.type === 'iframe' && entry.url && (
        <div className="sumcard" style={{ padding: 0, height: '70vh' }}>
          <iframe src={entry.url} style={{ width: '100%', height: '100%', border: 'none' }} title={plugin.name} />
        </div>
      )}
      {entry?.type === 'declarative' && (entry.blocks ?? []).some((b) => b.type === 'table') && (
        <p className="dim" style={{ fontSize: 11 }}><Table2 size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />表格数据来自插件声明</p>
      )}
      {!entry && (
        <div className="sumcard">
          <h4><Globe size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />该插件没有声明页面</h4>
          <p className="dim" style={{ fontSize: 12 }}>在 manifest.ui.menu 中声明 entry 即可长出本页面（declarative blocks 或 iframe）。</p>
        </div>
      )}
    </div>
  );
}
