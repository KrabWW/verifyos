import { useEffect, useState } from 'react';
import { TriangleAlert, Bug, Globe, FlaskConical, Repeat, UserCheck, Ban } from 'lucide-react';
import type { RunEvent } from '@verifyos/shared';
import type { DoneSummary, Route } from '../shared';

// ---------- F8：Triage 完整屏（规则化 AI 归因 + 证据深钻 + 人工分类 + 处理动作 + 全链路追溯） ----------
interface TriageData { events: RunEvent[]; verdict: string; done: DoneSummary | null }

/** G06：5 类 chips（持久化到 issue.source.classification 语义不变） */
const TRIAGE_CLASSES: Array<{ key: string; icon: typeof Bug }> = [
  { key: '产品 Bug', icon: Bug },
  { key: '环境问题', icon: Globe },
  { key: '测试问题', icon: FlaskConical },
  { key: 'Flaky 暂时性故障', icon: Repeat },
  { key: '需人工复查', icon: UserCheck },
];

/** G06：证据结构化引用——从 observation/trace 文本提取 HTTP 状态行与 DB 错误行（提取不到返回空） */
function extractQuotes(text: string): Array<{ kind: 'http' | 'db'; line: string }> {
  const out: Array<{ kind: 'http' | 'db'; line: string }> = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || seen.has(line)) continue;
    if (/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S+\s+\d{3}\b/.test(line)) out.push({ kind: 'http', line });
    else if (/duplicate key|unique constraint|foreign key|violates|deadlock|serialization failure/i.test(line)) out.push({ kind: 'db', line });
    else continue;
    seen.add(line);
    if (out.length >= 4) break;
  }
  return out;
}

/** 规则化归因：断言/触达证据 → 结论 + 置信度（LLM key 就绪后可升级 glm-4.5v 归因） */
function attributeFailure(sverdict: string, reason: string): { text: string; conf: number; cls: string } {
  if (sverdict === 'unknown' || /未触达|UNKNOWN|防假绿/.test(reason)) {
    return { text: '目标页面未被触达——防假绿机制将「断言全绿但没走到目标」改判为无法验证', conf: 0.88, cls: 'warn' };
  }
  if (sverdict === 'fail') {
    return { text: '断言未满足——页面最终状态与预期不符，疑似产品缺陷', conf: 0.72, cls: 'fail' };
  }
  return { text: '证据不足——建议查看失败截图与 trace 深钻', conf: 0.5, cls: 'warn' };
}

export function TriageView({ data, onBack, onGo }: { data: TriageData | null; onBack: () => void; onGo?: (r: Route) => void }) {
  const [detail, setDetail] = useState<{ reachability?: Array<{ stepId: string; verdict: string; explanation: string }>; evidenceKeys?: string[] } | null>(null);
  const [cls, setCls] = useState(TRIAGE_CLASSES[0].key);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState('');
  const [chain, setChain] = useState<{ ver: { shortId: string; title: string } | null; qa: { shortId: string; title: string } | null }>({ ver: null, qa: null });
  const runId = data?.done?.runId ?? '';

  useEffect(() => {
    if (!runId) { setDetail(null); return; }
    fetch(`/api/runs/${runId}`).then((r) => r.json()).then((d) => setDetail(d.found ? d : null)).catch(() => setDetail(null));
  }, [runId]);

  // G06：追溯链 VER/QA 真值回填——overview 最近 Run 找 verShortId，验证列表再链 QA 点（拿不到保持 —）
  useEffect(() => {
    if (!runId) { setChain({ ver: null, qa: null }); return; }
    fetch('/api/overview')
      .then((r) => r.json())
      .then((d) => {
        const rec = (d.recent ?? []).find((x: { runId?: string }) => x.runId === runId) as { verShortId?: string | null; verTitle?: string | null } | undefined;
        if (!rec?.verShortId) return;
        return fetch('/api/verifications')
          .then((r) => r.json())
          .then((v) => {
            const ver = (v.items ?? []).find((x: { short_id?: string }) => x.short_id === rec.verShortId) as { title?: string; qa_short_id?: string | null; qa_title?: string | null } | undefined;
            setChain({
              ver: { shortId: rec.verShortId as string, title: ver?.title ?? rec.verTitle ?? '' },
              qa: ver?.qa_short_id ? { shortId: ver.qa_short_id, title: ver.qa_title ?? '' } : null,
            });
          });
      })
      .catch(() => undefined);
  }, [runId]);

  if (!data) {
    // P2：data 未就绪时显示加载中（而非空态卡，避免误以为「无待分析 Run」）
    return (
      <div className="pageview">
        <div className="sumcard" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p className="dim" style={{ fontSize: 13, margin: '0 0 12px' }}>加载中…</p>
          <button className="btn" onClick={onBack}>← 回验证 · 执行</button>
        </div>
      </div>
    );
  }

  const { events, verdict, done } = data;
  const completed = events.filter((e) => e.type === 'step.completed') as unknown as Array<{ stepId: string; verdict: string }>;
  const started = events.filter((e) => e.type === 'step.started') as unknown as Array<{ stepId: string; title: string; kind?: string }>;
  const titleOf = (id: string) => started.find((s) => s.stepId === id)?.title ?? id;
  const kindOf = (id: string) => started.find((s) => s.stepId === id)?.kind ?? '—';
  const failedObs = events.filter((e) => e.type === 'step.observation') as unknown as Array<{ stepId?: string; ok?: boolean; detail?: string }>;
  const shots = events.filter((e) => e.type === 'step.evidence') as unknown as Array<{ stepId?: string; kind?: string; uri?: string; runId?: string }>;
  const badSteps = completed.filter((c) => c.verdict === 'fail' || c.verdict === 'unknown');

  // P0（walk-c）：证据走 query 式 /api/runs/:id/evidence?key=…（路径式在 Nest11/Express5 通配路由 404）
  const evUrl = (uri: string) => `/api/runs/${runId}/evidence?key=${encodeURIComponent(uri)}`;
  const traceKeys = (detail?.evidenceKeys ?? []).filter((k) => /trace|har/i.test(k));

  const submitIssue = (quarantine: boolean) => {
    const first = badSteps[0];
    if (!first) return;
    const reason = [...failedObs].reverse().find((o) => o.stepId === first.stepId)?.detail ?? '';
    fetch('/api/issues', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${quarantine ? '[Quarantine] ' : ''}${cls}：${titleOf(first.stepId)}`,
        severity: quarantine ? 'low' : verdict === 'fail' ? 'high' : 'medium',
        source: { triage: true, classification: cls, remark, quarantine, runId, verdict, reason, stepId: first.stepId },
      }),
    })
      .then((r) => r.json())
      .then(() => setMsg(`✓ 已${quarantine ? '隔离并登记' : '创建缺陷'}（分类：${cls}）——「问题」页可查看`))
      .catch(() => setMsg('提交失败（网络）'));
  };

  // P1：rerun 带 verificationShortId（追溯链已从 overview recent.verShortId 回填；取不到则禁用）
  const verShortId = chain.ver?.shortId ?? null;
  const rerun = () => {
    if (!verShortId) return;
    fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationShortId: verShortId }) })
      .then((r) => r.json())
      .then((d) => { setMsg(`✓ 已重新触发 Run：${d.runId ?? ''}（关联验证 ${verShortId}）——回执行页看实时流`); })
      .catch(() => setMsg('触发失败'));
  };

  return (
    <div className="pageview">
      {/* 头：Run 概要 + 追溯链 */}
      <div className="sumcard">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>全链路追溯</h4>
          <span className="sp" />
          <span className={`chip v-${verdict}`}>{verdict === 'fail' ? <><Ban size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> 阻止合并</> : verdict === 'unknown' ? <><TriangleAlert size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> 警告合并</> : verdict}</span>
          <button className="btn" onClick={onBack}>← 回执行页</button>
        </div>
        <div className="chainrow">
          <span className="chainnode on" title={runId}>RUN <b className="mono">{runId ? runId.slice(0, 10) : '—'}</b></span>
          <span className="chainarrow">→</span>
          {chain.ver ? (
            <span className={`chainnode on${onGo ? ' link' : ''}`} title={chain.ver.title || '查看该验证'} onClick={() => onGo?.('editor')}>VER <b className="mono">{chain.ver.shortId}</b></span>
          ) : (
            <span className="chainnode off" title="VER 关联待 F5/F7（批量生成验证后回填）">VER <b>—</b></span>
          )}
          <span className="chainarrow">→</span>
          {chain.qa ? (
            <span className={`chainnode on${onGo ? ' link' : ''}`} title={chain.qa.title || '查看该 QA 点'} onClick={() => onGo?.('qa')}>QA <b className="mono">{chain.qa.shortId}</b></span>
          ) : (
            <span className="chainnode off">QA <b>—</b></span>
          )}
          <span className="chainarrow">→</span>
          <span className="chainnode off">需求 <b>—</b></span>
          <span className="chainarrow">→</span>
          <span className="chainnode on">证据 <b>{detail?.evidenceKeys?.length ?? 0} 件</b></span>
        </div>
      </div>

      {/* AI 归因 + 证据深钻（每个失败步骤一张卡） */}
      {badSteps.map((bs) => {
        const stepObs = [...failedObs].reverse().filter((o) => o.stepId === bs.stepId);
        const reason = stepObs[0]?.detail ?? '无详细原因';
        const quotes = extractQuotes(stepObs.map((o) => o.detail ?? '').join('\n'));
        const att = attributeFailure(bs.verdict, reason);
        const shot = [...shots].reverse().find((ev) => ev.stepId === bs.stepId && ev.kind === 'screenshot');
        return (
          <div key={bs.stepId} className="sumcard">
            <h4 style={{ marginTop: 0 }}><TriangleAlert size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />失败步骤：{titleOf(bs.stepId)} <span className="chip">{kindOf(bs.stepId)}</span> <span className={`chip v-${bs.verdict === 'fail' ? 'fail' : 'unknown'}`}>{bs.verdict.toUpperCase()}</span></h4>
            <div className="attrib">
              <b>归因结论</b>
              <span>{att.text}</span>
              <div className="confbar">
                <div className="conftrack"><i className={att.cls} style={{ width: `${Math.round(att.conf * 100)}%` }} /></div>
                <b className="mono">置信度 {Math.round(att.conf * 100)}%</b>
              </div>
            </div>
            <div className="treason" style={{ marginTop: 8 }}>{reason}</div>
            {shot?.uri && (
              <a className="trishot" href={shot.runId ? `/api/runs/${shot.runId}/evidence?key=${encodeURIComponent(shot.uri)}` : evUrl(shot.uri)} target="_blank" rel="noreferrer">
                <img src={shot.runId ? `/api/runs/${shot.runId}/evidence?key=${encodeURIComponent(shot.uri)}` : evUrl(shot.uri)} alt="失败时截图" />
                <span className="dim">失败时截图 · 点击看原图</span>
              </a>
            )}
            <div className="kv" style={{ marginTop: 8 }}><span>Trace / HAR</span>
              <b>{traceKeys.length === 0 ? <span className="dim">本 Run 未归档（占位）</span> : traceKeys.map((k) => (
                <a key={k} className="evlink mono" style={{ marginLeft: 5 }} href={evUrl(k)} target="_blank" rel="noreferrer">{k.split('/').pop()}</a>
              ))}</b>
            </div>
            {quotes.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                {quotes.map((q, i) => (
                  <blockquote key={i} className={`evquote q-${q.kind}`}>
                    <span className="qk">{q.kind === 'http' ? 'HTTP' : 'DB'}</span>
                    <code>{q.line}</code>
                  </blockquote>
                ))}
              </div>
            ) : (
              <div className="kv"><span>Network / DB 证据</span><b className="dim">占位——待 Stagehand API 级流接入（D1 已知边界）</b></div>
            )}
          </div>
        );
      })}

      {/* 人工分类 + 处理动作 */}
      <div className="sumcard">
        <h4 style={{ marginTop: 0 }}>人工确认分类</h4>
        <div className="clsrow" style={{ flexWrap: 'wrap' }}>
          {TRIAGE_CLASSES.map(({ key, icon: Icon }) => (
            <span key={key} className={`chip quick${cls === key ? ' on' : ''}`} style={cls === key ? { background: 'var(--ink)', color: '#fff' } : undefined} onClick={() => setCls(key)}>
              <Icon size={10} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />{key}
            </span>
          ))}
        </div>
        <div className="formrow" style={{ marginTop: 8 }}>
          <label>备注</label>
          <input className="inp" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="补充上下文（复现条件/环境/关联单号…）" />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn primary" onClick={() => submitIssue(false)}>① 创建缺陷（禅道/Jira 占位）</button>
          <button className="btn" onClick={() => submitIssue(true)}>② 隔离 Quarantine</button>
          <button className="btn" onClick={rerun} disabled={!verShortId} title={verShortId ? `带 verificationShortId=${verShortId} 重新运行` : '未找到关联验证（verShortId）——仅从验证发起的 Run 可重跑'}>③ 重新运行</button>
        </div>
        {msg && <p className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>{msg}</p>}
        <p className="hint">合并门禁：fail → 阻止合并 · unknown → 警告合并（UNKNOWN ≠ PASS）。创建缺陷与隔离都会带分类/备注/runId 落问题库。</p>
      </div>
    </div>
  );
}
