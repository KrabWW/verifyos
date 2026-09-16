import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, Chip } from "./ui";
import { Icon } from "./icons";
import { Caption } from "./scenes1";

/* ============ 场景 9：移动测试（对标 QA.tech 第四动图 Test mobile apps） ============ */
const MOB_STEPS: { t: string; kind: string; ts: string; warn?: boolean }[] = [
  { t: "Launch app", kind: "设备", ts: "08:10:23" },
  { t: "输入演示账号邮箱", kind: "AI 操作", ts: "08:10:45" },
  { t: "输入密码", kind: "确定性", ts: "08:10:57" },
  { t: "收起键盘", kind: "AI 操作", ts: "08:11:07" },
  { t: "点击「登录」", kind: "AI 操作", ts: "08:11:15" },
  { t: "打开商机「Horizon Labs」", kind: "AI 操作", ts: "08:11:25" },
  { t: "寻找添加备注入口", kind: "AI 操作", ts: "08:11:49", warn: true },
];

const LIME = "#a3e635", LIME_BG = "#fcffe8", LIME_DEEP = "#365314";

const PhoneMock: React.FC<{ view: number }> = ({ view }) => (
  <div style={{ width: 236, background: "#18181b", borderRadius: 30, padding: 10, boxShadow: "0 24px 60px rgba(24,24,27,.3)", flexShrink: 0 }}>
    <div style={{ background: "#fff", borderRadius: 21, overflow: "hidden", height: 380, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#f4f4f5", fontSize: 10.5, color: "#71717a", display: "flex", justifyContent: "space-between", padding: "5px 14px", fontWeight: 600 }}>
        <span>6:11</span><span>▲ 5G 87%</span>
      </div>
      {view === 0 && (
        <div style={{ padding: "14px 16px", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>ACME CRM</div>
          <div style={{ fontSize: 12, fontWeight: 700, margin: "12px 0 8px" }}>欢迎回来</div>
          {[["邮箱", "demo@acme.crm"], ["密码", "••••••••"]].map(([l, v]) => (
            <div key={l} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: C.sub }}>{l}</div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 9px", fontSize: 12.5, marginTop: 2 }}>{v}</div>
            </div>
          ))}
          <div style={{ background: C.ink, color: "#fff", borderRadius: 7, padding: "6px 0", textAlign: "center", fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>登录</div>
        </div>
      )}
      {view === 1 && (
        <div style={{ padding: "10px 12px", flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, padding: "4px 4px 8px", borderBottom: "1px solid #ececef" }}>Pipeline</div>
          {[["Horizon Labs", "Cloud Migration", "$42,000"], ["Acme Retail", "Shelf-label pilot", "$18,500"], ["Northwind", "Expansion · Q4", "$9,200"]].map(([n, d, v], i) => (
            <div key={n} style={{ border: "1px solid #ececef", borderRadius: 8, padding: "7px 10px", marginTop: 8, background: i === 0 ? "#fcffe8" : "#fff", borderColor: i === 0 ? "#d9f99d" : "#ececef" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{n}</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.sub, marginTop: 2 }}><span>{d}</span><b style={{ color: C.text }}>{v}</b></div>
            </div>
          ))}
        </div>
      )}
      {view === 2 && (
        <div style={{ padding: "10px 12px", flex: 1, fontSize: 10.5 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, padding: "4px 4px 7px", borderBottom: "1px solid #ececef" }}>Deal Details</div>
          <div style={{ fontWeight: 700, fontSize: 12, marginTop: 7 }}>Horizon Labs</div>
          <div style={{ fontSize: 10, color: C.sub, marginBottom: 7 }}>Cloud Migration Package</div>
          <div style={{ border: "1px solid #ececef", borderRadius: 7, padding: "6px 9px", marginBottom: 6 }}>
            {[["阶段", "Lead"], ["Deal Value", "$42,000"], ["Expected Close", "Jun 15, 2026"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2.5px 0", borderBottom: "1px dashed #f1f1f3" }}><span style={{ color: C.sub }}>{k}</span><b>{v}</b></div>
            ))}
          </div>
          <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 7, padding: "6px 9px" }}>
            <b>Notes</b><br />Inbound lead from webinar. Interested in full cloud migration.
          </div>
        </div>
      )}
      {view > 0 && (
        <div style={{ display: "flex", borderTop: "1px solid #ececef" }}>
          {(["Pipeline", "Settings"] as const).map((t, i) => (
            <div key={t} style={{ flex: 1, textAlign: "center", padding: "6px 0 8px", fontSize: 10, color: i === 0 ? C.ink : C.muted, fontWeight: i === 0 ? 700 : 400, borderTop: i === 0 ? `2px solid ${C.ink}` : "2px solid transparent" }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export const MobileScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: f, fps, config: { damping: 13 } });
  const stepAt = (i: number) => 12 + i * 9;
  const warnAt = stepAt(6) + 9;
  const doneAt = 84;
  const fixAt = 102;
  const fixS = spring({ frame: f - fixAt, fps, config: { damping: 13 } });
  const viewIdx = f < stepAt(4) ? 0 : f < stepAt(5) ? 1 : 2;

  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      {/* 页头 */}
      <div style={{ width: 1240, display: "flex", alignItems: "center", gap: 12, marginBottom: 14, opacity: appear }}>
        <Icon name="smartphone" size={24} />
        <b style={{ fontSize: 24 }}>给商机添加备注（移动）</b>
        <Chip color="gray">VER-M-012</Chip>
        {f < doneAt ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: LIME_DEEP, color: "#ecfccb", borderRadius: 999, padding: "3px 14px", fontSize: 15, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "#bef264" }} />LIVE · RUN-M-089
          </span>
        ) : (
          <Chip color="amber"><Icon name="triangle-alert" size={14} /> 发现缺陷 · UI 缺失</Chip>
        )}
        <span style={{ marginLeft: "auto", color: C.muted, fontSize: 16 }}>Scenario: Mobile · Pixel 9 Pro · Android 15</span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* 左：步骤面板 */}
        <div style={{ width: 420, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, opacity: appear, boxShadow: "0 20px 60px rgba(24,24,27,.12)" }}>
          <div style={{ display: "flex", gap: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 10, paddingBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, borderBottom: `2px solid ${C.ink}` }}>步骤（7）</span>
            <span style={{ fontSize: 16, color: C.muted }}>环境</span>
          </div>
          {MOB_STEPS.map((s, i) => {
            const cur = f >= stepAt(i) && f < stepAt(i) + 9;
            const done = f >= stepAt(i) + 9;
            const warn = !!s.warn && f >= warnAt;
            return (
              <div key={s.t} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, marginBottom: 6, border: `1px solid ${cur ? LIME : warn ? C.amberBd : "#f1f1f3"}`, background: cur ? LIME_BG : warn ? C.amberBg : "#fff", boxShadow: cur ? "0 0 0 3px rgba(163,230,53,.25)" : "none" }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: warn ? "#fff" : done ? "#fff" : cur ? LIME_DEEP : C.sub, background: warn ? C.amber : done ? C.green : cur ? LIME : "#e4e4e7", flexShrink: 0 }}>
                  {warn ? "!" : done ? "✓" : cur ? "●" : i + 1}
                </div>
                <span style={{ fontSize: 17.5, fontWeight: 500, color: warn ? C.amber : cur ? LIME_DEEP : C.text }}>{s.t}</span>
                <span style={{ fontSize: 13, color: C.muted, background: "#f4f4f5", borderRadius: 5, padding: "1px 7px" }}>{s.kind}</span>
                <span style={{ marginLeft: "auto", fontSize: 13, color: C.muted, fontFamily: "ui-monospace,Menlo,monospace" }}>{done || warn ? s.ts : cur ? "…" : ""}</span>
              </div>
            );
          })}
          {f >= doneAt && (
            <div style={{ border: `1px solid ${C.amberBd}`, background: C.amberBg, borderRadius: 9, padding: "8px 11px", fontSize: 14, color: C.amber }}>
              <b>Output values</b> · finding = 缺少 Add Note 入口 · artifact = notes-gap.json
            </div>
          )}
        </div>

        {/* 右：手机舞台 */}
        <div style={{ width: 800, minHeight: 430, borderRadius: 14, border: `1px solid ${C.border}`, background: "#fff", padding: 16, opacity: appear, position: "relative", backgroundImage: "linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px)", backgroundSize: "22px 22px", boxShadow: "0 20px 60px rgba(24,24,27,.12)", display: "flex", gap: 20 }}>
          <PhoneMock view={viewIdx} />
          <div style={{ flex: 1, paddingTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#4f46e5)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="bot" size={15} /></div>
              <b style={{ fontSize: 16 }}>Agent 实时观察</b>
            </div>
            <div style={{ background: "#fcfcfd", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", fontSize: 14.5, color: C.sub, lineHeight: 1.7, minHeight: 76 }}>
              {f < stepAt(4) ? "填写登录表单：先 tap 邮箱输入框输入 demo@acme.crm，再处理密码框，键盘遮挡时先收起。"
                : f < stepAt(5) ? "凭据完整，tap 登录提交 —— 接口 200 · 96ms，进入 Pipeline。"
                : f < warnAt ? "底部导航 Pipeline 激活，tap Horizon Labs 进入商机详情。"
                : "详情页有 Notes 区，但没有任何「添加备注」入口 —— 下滑确认、tap 试探均无响应，判定 UI 缺失。"}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {[["mouse-pointer-click", "Tap"], ["type", "输入"], ["move-vertical", "滑动"], ["camera", "逐步截图"]].map(([ic, t]) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.sub, background: "#f4f4f5", borderRadius: 999, padding: "3px 11px" }}><Icon name={ic} size={13} /> {t}</span>
              ))}
            </div>
            {f >= fixAt && (
              <div style={{ marginTop: 12, opacity: fixS, transform: `translateY(${interpolate(fixS, [0, 1], [14, 0])}px)`, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", boxShadow: "0 8px 24px rgba(24,24,27,.1)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 600 }}>
                  <Icon name="message-square" size={16} color={C.accent} /> Fix in chat
                  <span style={{ marginLeft: "auto" }}><Chip color="indigo">已生成修复 PR !88</Chip></span>
                </div>
                <div style={{ fontSize: 13, color: C.sub, marginTop: 5 }}>一键回到 AI 工作区修复 → 修复前后对比（Before/After）→ 回归验证自动回写。</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Caption>移动端也一样：同一套执行记录、思考与证据链</Caption>
    </AbsoluteFill>
  );
};
