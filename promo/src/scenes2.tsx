import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, Chip } from "./ui";
import { Icon } from "./icons";
import { AgentBubble, TaskCard, Caption } from "./scenes1";

const AppFrame: React.FC<{ children: React.ReactNode; pad?: number }> = ({ children, pad = 16 }) => (
  <div
    style={{
      width: 1020, background: C.bg, borderRadius: 18, border: `1px solid ${C.border2}`,
      boxShadow: "0 30px 80px rgba(24,24,27,.18)", overflow: "hidden", fontFamily: FONT,
    }}
  >
    <div style={{ height: 44, background: "#f4f4f5", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: 5, background: "#f87171" }} />
        <div style={{ width: 10, height: 10, borderRadius: 5, background: "#fbbf24" }} />
        <div style={{ width: 10, height: 10, borderRadius: 5, background: "#34d399" }} />
      </div>
      <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 16, color: C.sub, padding: "3px 12px" }}>
        <Icon name="lock" size={14} color={C.muted} style={{ marginRight: 5 }} />VerifyOS · AI 工作区
      </div>
    </div>
    <div style={{ padding: pad, display: "flex", flexDirection: "column", gap: 16, minHeight: 500 }}>{children}</div>
  </div>
);

/* ============ 场景 4：登录表单（动态 UI / Human-in-the-loop） ============ */
export const LoginScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const formS = spring({ frame: f, fps, config: { damping: 13 } });
  const typing = (from: number, len: number) =>
    Math.floor(interpolate(f, [from, from + len * 1.4], [0, len], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const user = "admin@crm.test".slice(0, typing(24, 15));
  const pwd = "••••••••".slice(0, typing(46, 8));
  const saved = f > 78;
  const savedS = spring({ frame: f - 78, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <AppFrame>
        <AgentBubble><Icon name="key-round" size={20} color={C.amber} /> 需要登录信息 —— 请提供测试账号，我会加密保存并继续分析。</AgentBubble>
        <div
          style={{
            width: 640, alignSelf: "center", background: "#fcfcfd",
            border: `1px solid ${saved ? C.greenBd : C.amberBd}`,
            borderRadius: 14, padding: "18px 22px",
            opacity: formS, transform: `translateY(${interpolate(formS, [0, 1], [18, 0])}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 600, marginBottom: 14 }}>
            <Icon name="key-round" size={21} color={C.sub} /> 登录凭据
            <span style={{ marginLeft: "auto" }}>
              <Chip color={saved ? "green" : "amber"}>{saved ? "✓ 已保存" : "等待你填写"}</Chip>
            </span>
          </div>
          <Field label="角色" value="管理员" shown={f > 12} blink={Math.floor(f / 10) % 2} />
          <Field label="用户名" value={user} shown={f > 20} cursor={f < 46} blink={Math.floor(f / 10) % 2} />
          <Field label="密码" value={pwd} shown={f > 42} cursor={f >= 46 && f < 78} password blink={Math.floor(f / 10) % 2} />
          <div style={{ fontSize: 17, color: C.sub, margin: "10px 0 14px" }}>
            ✓ 保存到项目配置（加密存储，下次复用） · 支持 OTP / TOTP / Magic Link
          </div>
          {saved ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.green, fontSize: 20, fontWeight: 600, opacity: savedS }}>
              ✓ 凭据已保存 · 正在以登录态重新分析…
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ background: f > 64 ? C.ink : "#e4e4e7", color: f > 64 ? "#fff" : C.muted, borderRadius: 10, padding: "9px 24px", fontSize: 20, fontWeight: 600, transform: `scale(${f > 66 && f < 74 ? 1.08 : 1})` }}>
                保存并继续
              </div>
            </div>
          )}
        </div>
      </AppFrame>
      <Caption>登录信息填一次，凭据加密保存，探索自动继续</Caption>
    </AbsoluteFill>
  );
};

const Field: React.FC<{ label: string; value: string; shown: boolean; cursor?: boolean; password?: boolean; blink?: number }> = ({ label, value, shown, cursor, password, blink = 0 }) => (
  <div style={{ marginBottom: 12, opacity: shown ? 1 : 0.25 }}>
    <div style={{ fontSize: 16, color: C.sub, marginBottom: 4 }}>{label}</div>
    <div style={{ background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 9, padding: "9px 14px", fontSize: 21, color: C.text, fontFamily: FONT }}>
      {password ? "•".repeat(value.length) : value}
      {cursor && <span style={{ opacity: blink ? 0 : 1, color: C.ink }}>|</span>}
    </div>
  </div>
);

/* ============ 场景 5：认证爬取 → 应用地图数字 ============ */
export const Crawl2Scene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: f, fps, config: { damping: 13 } });
  const pages = Math.floor(interpolate(f, [12, 62], [0, 18], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const done = f > 66;
  const statsS = spring({ frame: f - 66, fps, config: { damping: 13 } });
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <AppFrame>
        <div style={{ opacity: appear }}>
          <TaskCard
            title={<><Icon name="globe" size={21} color={C.sub} /> 认证爬取</>}
            status={done ? { text: "✓ 完成", color: "green" as const } : { text: "爬取中…", color: "blue" as const }}
            rows={[["浏览器状态", "admin_logged_in（免重复登录）"], ["已爬取", `${pages} / 18 页面`]]}
            progress={interpolate(f, [12, 66], [4, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
            note={done ? "Authenticated crawl complete" : "正在遍历订单 / 员工 / 权限相关页面…"}
          />
        </div>
        {done && (
          <div style={{ display: "flex", gap: 16, opacity: statsS, transform: `translateY(${interpolate(statsS, [0, 1], [16, 0])}px)` }}>
            {[["18", "页面"], ["42", "交互"], ["12", "业务流程"], ["3", "高风险缺口"]].map(([n, l], i) => (
              <div key={l} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 26px", textAlign: "center", minWidth: 130 }}>
                <div style={{ fontSize: 42, fontWeight: 700, color: i === 3 ? C.red : C.text }}>{n}</div>
                <div style={{ fontSize: 17, color: C.sub }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </AppFrame>
      <Caption>18 个页面 · 42 个交互 · 12 条流程，自动沉淀为应用地图</Caption>
    </AbsoluteFill>
  );
};

/* ============ 场景 6：建议 QA 点（Safe AI Mutation） ============ */
const QA_ITEMS: [string, string, "red" | "amber" | "gray", boolean][] = [
  ["发送合同签署", "高 · 92%", "red", true],
  ["编辑客户信息", "高 · 95%", "red", true],
  ["创建组织", "中 · 90%", "amber", true],
  ["撰写并发送邮件", "中 · 88%", "amber", true],
  ["添加并删除备注", "低 · 81%", "gray", false],
  ["为客户添加标签", "低 · 79%", "gray", false],
];
export const SuggestScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardS = spring({ frame: f, fps, config: { damping: 13 } });
  const checkedAt = (i: number) => 20 + i * 7;
  const selCount = QA_ITEMS.filter((it, i) => it[3] && f > checkedAt(i)).length;
  const createAt = 74;
  const created = f > createAt;
  const createdS = spring({ frame: f - createAt, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <AppFrame>
        <AgentBubble><Icon name="sparkles" size={20} color={C.accent} /> 根据业务风险，我挑选了 6 个建议 QA 点，请勾选确认：</AgentBubble>
        <div
          style={{
            width: 680, alignSelf: "center", background: "#fcfcfd", border: `1px solid ${C.border}`,
            borderRadius: 14, padding: "14px 20px", opacity: cardS, transform: `translateY(${interpolate(cardS, [0, 1], [16, 0])}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", fontSize: 21, fontWeight: 600, marginBottom: 10 }}>
            <Icon name="sparkles" size={20} color={C.accent} /> 建议的 QA 点 <span style={{ marginLeft: "auto" }}><Chip color="indigo">确认后才创建</Chip></span>
          </div>
          {QA_ITEMS.map(([title, meta, color], i) => {
            const checked = f > checkedAt(i);
            const tick = spring({ frame: f - checkedAt(i), fps, config: { damping: 15 } });
            const dim = QA_ITEMS[i][3] === false && created;
            return (
              <div key={title} style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 2px", borderBottom: `1px solid #f1f1f3`, opacity: dim ? 0.35 : 1 }}>
                <div
                  style={{
                    width: 24, height: 24, borderRadius: 6, border: `2px solid ${checked ? C.ink : C.border2}`,
                    background: checked ? C.ink : "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 15, fontWeight: 700,
                    transform: `scale(${interpolate(tick, [0, 1], [0.6, 1])})`,
                  }}
                >
                  {checked ? "✓" : ""}
                </div>
                <span style={{ fontSize: 21, flex: 1 }}>{title}</span>
                <Chip color={color}>{meta}</Chip>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 18, color: C.sub }}>已选 <b style={{ color: C.text }}>{selCount}</b> / 6</span>
            <div style={{ marginLeft: "auto" }}>
              {created ? (
                <Chip color="green" >✓ 已创建 {selCount} 个验证</Chip>
              ) : (
                <div style={{ background: f > 66 ? C.ink : "#e4e4e7", color: f > 66 ? "#fff" : C.muted, borderRadius: 10, padding: "8px 22px", fontSize: 20, fontWeight: 600 }}>
                  创建所选验证
                </div>
              )}
            </div>
          </div>
        </div>
        {created && (
          <div style={{ opacity: createdS, alignSelf: "center", color: C.green, fontSize: 22, fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
            ✓ 4 个验证已创建 · 依赖自动建立（登录 → 各业务验证）
          </div>
        )}
      </AppFrame>
      <Caption>AI 只建议，你来确认 —— 绝不未经同意创建</Caption>
    </AbsoluteFill>
  );
};

/* ============ 场景 7：验证 · 执行（合并单页三态，QA.tech 式） ============ */
const MERGED_STEPS: { t: string; kind: string; ts: string }[] = [
  { t: "管理员登录", kind: "模块", ts: "23:14:01" },
  { t: "打开员工管理", kind: "AI 操作", ts: "23:14:03" },
  { t: "点击「新增员工」", kind: "AI 操作", ts: "23:14:05" },
  { t: "填写 姓名「张三」", kind: "确定性", ts: "23:14:06" },
  { t: "点击保存", kind: "AI 操作", ts: "23:14:08" },
  { t: "断言：列表包含张三", kind: "断言", ts: "未执行" },
];
const LIME = "#a3e635", LIME_BG = "#fcffe8", LIME_DEEP = "#365314";

export const RunScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: f, fps, config: { damping: 13 } });
  // 时间轴：步骤 12 起每 10 帧；step5 失败 @52；证据 @70
  const stepAt = (i: number) => 12 + i * 10;
  const failAt = 52;
  const evidAt = 70;
  const evidS = spring({ frame: f - evidAt, fps, config: { damping: 13 } });
  const browserScale = interpolate(f, [evidAt, evidAt + 8], [1, 0.86], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // 浏览器视图：0-3 随步骤
  const viewIdx = f < stepAt(1) ? 0 : f < stepAt(2) ? 1 : f < stepAt(3) ? 2 : 3;
  const filled = f > stepAt(3);

  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      {/* 页头 */}
      <div
        style={{
          width: 1240, display: "flex", alignItems: "center", gap: 12, marginBottom: 14, opacity: appear,
        }}
      >
        <b style={{ fontSize: 24 }}>新增员工</b>
        <Chip color="gray">VER-001</Chip>
        <Chip color="indigo">Actor：管理员</Chip>
        {f < evidAt ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: LIME_DEEP, color: "#ecfccb", borderRadius: 999, padding: "3px 14px", fontSize: 15, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: "#bef264" }}>●</span>LIVE · {(interpolate(f, [0, failAt], [0, 5.9], { extrapolateRight: "clamp" })).toFixed(1)}s
          </span>
        ) : (
          <Chip color="red">✕ 失败 · RUN-1928 · 42s</Chip>
        )}
        <span style={{ marginLeft: "auto", color: C.muted, fontSize: 16 }}>浏览器状态 admin_logged_in</span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* 左：步骤面板（定义即时间轴） */}
        <div
          style={{
            width: 420, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: 12,
            opacity: appear, boxShadow: "0 20px 60px rgba(24,24,27,.12)",
          }}
        >
          <div style={{ display: "flex", gap: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 10, paddingBottom: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600, borderBottom: `2px solid ${C.ink}` }}>步骤（6）</span>
            <span style={{ fontSize: 16, color: C.muted }}>设置</span>
          </div>
          {MERGED_STEPS.map((s, i) => {
            const cur = f >= stepAt(i) && f < stepAt(i) + 10 && i < 5;
            const done = f >= stepAt(i) + 10 && i < 5;
            const bad = i === 4 && f >= failAt;
            const isWait = i === 5;
            return (
              <div
                key={s.t}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, marginBottom: 6,
                  border: `1px solid ${cur ? LIME : bad ? C.redBd : "#f1f1f3"}`,
                  background: cur ? LIME_BG : bad ? C.redBg : "#fff",
                  boxShadow: cur ? "0 0 0 3px rgba(163,230,53,.25)" : "none",
                  opacity: isWait ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, color: bad ? "#fff" : done ? "#fff" : cur ? LIME_DEEP : C.sub,
                    background: bad ? C.red : done ? C.green : cur ? LIME : "#e4e4e7", flexShrink: 0,
                  }}
                >
                  {bad ? "✕" : done ? "✓" : cur ? "●" : i + 1}
                </div>
                <span style={{ fontSize: 17.5, fontWeight: 500, color: bad ? C.red : cur ? LIME_DEEP : C.text }}>{s.t}</span>
                <span style={{ fontSize: 13, color: C.muted, background: "#f4f4f5", borderRadius: 5, padding: "1px 7px" }}>{s.kind}</span>
                <span style={{ marginLeft: "auto", fontSize: 13, color: C.muted, fontFamily: "ui-monospace,Menlo,monospace" }}>
                  {isWait ? "未执行" : done || bad ? s.ts : cur ? "…" : ""}
                </span>
              </div>
            );
          })}
          <div style={{ textAlign: "center", color: C.muted, fontSize: 15, border: "1px dashed #d4d4d8", borderRadius: 9, padding: 7, marginTop: 2 }}>
            ＋ 插入步骤（模块 · AI 操作 · 确定性 · 断言）
          </div>
        </div>

        {/* 右：三态舞台 */}
        <div
          style={{
            width: 800, minHeight: 430, borderRadius: 14, border: `1px solid ${C.border}`, background: "#fff",
            padding: 12, opacity: appear, position: "relative", overflow: "hidden",
            backgroundImage: "linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px)",
            backgroundSize: "22px 22px",
            boxShadow: "0 20px 60px rgba(24,24,27,.12)",
          }}
        >
          {/* 态2：实时浏览器（证据态缩小让位） */}
          <div
            style={{
              transform: `scale(${browserScale})`, transformOrigin: "top left", width: "100%",
              opacity: f < evidAt ? 1 : 0.35, transition: "none", position: evidS > 0.5 ? "absolute" : "relative", top: 0, left: 12,
            }}
          >
            {/* 深色外框浏览器（QA.tech 同款） */}
            <div style={{ border: "6px solid #18181b", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#27272a", padding: "7px 10px" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {["#f87171", "#fbbf24", "#34d399"].map((c) => (
                    <div key={c} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />
                  ))}
                </div>
                <div style={{ flex: 1, background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, color: "#a1a1aa", fontSize: 13, padding: "2px 10px", fontFamily: "ui-monospace,Menlo,monospace" }}>
                  <Icon name="lock" size={11} color={C.muted} style={{ marginRight: 4 }} />crm.test.example.com{viewIdx === 0 ? "/login" : viewIdx === 1 ? "/employees" : "/employees/new"}
                </div>
                <span style={{ fontSize: 12, color: "#93c5fd", background: "rgba(37,99,235,.15)", borderRadius: 999, padding: "1px 9px" }}>Agent 驱动中</span>
              </div>
              <div style={{ padding: 14, minHeight: 210 }}>
                {viewIdx === 0 && (
                  <div style={{ maxWidth: 230, margin: "14px auto" }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>ACME CRM 登录</div>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 10px", fontSize: 15, marginBottom: 7, color: "#18181b" }}>admin@crm.test</div>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 10px", fontSize: 15, marginBottom: 10 }}>••••••••</div>
                    <div style={{ background: C.ink, color: "#fff", borderRadius: 7, padding: "7px 0", textAlign: "center", fontSize: 15, fontWeight: 600 }}>登录</div>
                  </div>
                )}
                {viewIdx === 1 && (
                  <div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <div style={{ background: "#f4f4f5", borderRadius: 6, padding: "3px 10px", fontSize: 13 }}>＋ 新增员工</div>
                      <div style={{ background: "#f4f4f5", borderRadius: 6, padding: "3px 10px", fontSize: 13 }}>⬇ 导出</div>
                    </div>
                    {[["李四", "产品部"], ["王五", "研发部"]].map(([n, d]) => (
                      <div key={n} style={{ display: "flex", gap: 10, borderBottom: "1px solid #f1f1f3", padding: "7px 4px", fontSize: 14.5 }}>
                        <span style={{ flex: 1 }}>{n}</span><span style={{ flex: 1, color: C.sub }}>{d}</span><span style={{ color: C.green, fontSize: 13 }}>● 在职</span>
                      </div>
                    ))}
                  </div>
                )}
                {viewIdx >= 2 && (
                  <div style={{ maxWidth: 300, margin: "6px auto" }}>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 9 }}>新增员工</div>
                    {[
                      ["姓名", filled ? "张三" : ""],
                      ["员工编号", filled ? "ZS-001" : ""],
                      ["部门", "研发部"],
                    ].map(([l, v]) => (
                      <div key={l} style={{ marginBottom: 7 }}>
                        <div style={{ fontSize: 12, color: C.sub }}>{l}</div>
                        <div style={{ border: `1px solid ${filled ? "#a3e635" : "#e5e7eb"}`, borderRadius: 6, padding: "5px 10px", fontSize: 14.5 }}>{v || " "}</div>
                      </div>
                    ))}
                    <div style={{ background: C.ink, color: "#fff", display: "inline-block", borderRadius: 6, padding: "5px 16px", fontSize: 14, fontWeight: 600, marginTop: 3 }}>保存</div>
                    {f >= failAt && (
                      <div style={{ background: C.redBg, border: `1px solid ${C.redBd}`, color: C.red, borderRadius: 6, padding: "6px 10px", fontSize: 13, marginTop: 9 }}>
                        <Icon name="triangle-alert" size={13} /> 保存失败：服务器内部错误（500）
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* 进度条 */}
            <div style={{ height: 7, background: "#e4e4e7", borderRadius: 4, marginTop: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${interpolate(f, [0, failAt], [4, 88], { extrapolateRight: "clamp" })}%`, background: "linear-gradient(90deg,#4d7c0f,#a3e635)" }} />
            </div>
            <div style={{ fontSize: 13.5, color: C.sub, marginTop: 6 }}>
              {f < stepAt(1) ? "复用浏览器状态，免重复登录" : f < failAt ? "AI 定位 · conf 96% · 缓存回放" : "API 500 · duplicate key uk_emp_code"}
            </div>
          </div>

          {/* 态3：证据面板（右上滑入） */}
          {f >= evidAt && (
            <div
              style={{
                position: "absolute", top: 12, right: 12, width: 730,
                opacity: evidS, transform: `translateX(${interpolate(evidS, [0, 1], [60, 0])}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.redBg, border: `1px solid ${C.redBd}`, borderRadius: 10, padding: "8px 14px", marginBottom: 10 }}>
                <b style={{ color: C.red, fontSize: 19 }}>✕ 失败</b>
                <Chip color="gray">RUN-1928</Chip>
                <span style={{ color: C.sub, fontSize: 15 }}>42s · 刚刚</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <span style={{ background: C.ink, color: "#fff", borderRadius: 8, padding: "5px 14px", fontSize: 15, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="search" size={14} /> 失败分析</span>
                  <span style={{ border: `1px solid ${C.border2}`, borderRadius: 8, padding: "5px 14px", fontSize: 15, color: C.sub }}>创建问题</span>
                </span>
              </div>
              <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", boxShadow: "0 12px 40px rgba(24,24,27,.14)" }}>
                <div style={{ display: "flex", gap: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 9, paddingBottom: 7 }}>
                  {[<><Icon name="bot" size={15} /> AI 分析</>, "最终截图", "视频回放", "Network", "Console", "Trace"].map((t, i) => (
                    <span key={i} style={{ fontSize: 14.5, color: i === 0 ? C.ink : C.muted, fontWeight: i === 0 ? 600 : 400, borderBottom: i === 0 ? `2px solid ${C.ink}` : "none", paddingBottom: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>{t}</span>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <b style={{ fontSize: 18 }}>疑似原因：后端唯一索引冲突</b>
                  <Chip color="indigo">置信度 92%</Chip>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, letterSpacing: 1, margin: "7px 0 3px" }}>NOTES</div>
                <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.75 }}>
                  • 第 5 步保存触发 POST /api/employee → 500（312ms）<br />
                  • DB 日志：duplicate key "uk_emp_code" (ZS-001)
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, letterSpacing: 1, margin: "8px 0 3px" }}>HYPOTHESES</div>
                <div style={{ fontSize: 14.5, color: C.sub, lineHeight: 1.75 }}>
                  ① 产品 Bug：后端未做唯一性预检（92%）<br />
                  ② 环境数据残留：ZS-001 已存在（61%）
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Caption>每一步都有证据，失败自动归因，直达根因</Caption>
    </AbsoluteFill>
  );
};

/* ============ 场景 8：Outro ============ */
export const OutroScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame: f, fps, config: { damping: 12 } });
  const s2 = spring({ frame: f - 18, fps, config: { damping: 14 } });
  const s3 = spring({ frame: f - 36, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: "#101014", justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 460px at 50% 45%, rgba(163,230,53,.28), transparent 70%)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: s1, transform: `translateY(${interpolate(s1, [0, 1], [24, 0])}px)` }}>
        <div style={{ width: 84, height: 84, borderRadius: 22, background: C.ink, border: "1px solid rgba(190,242,100,.35)", color: C.limeSoft, fontSize: 44, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 50px rgba(163,230,53,.35)" }}>✓</div>
        <div>
          <div style={{ color: "#fff", fontSize: 56, fontWeight: 700 }}>VerifyOS</div>
          <div style={{ color: C.limeSoft, fontSize: 24, letterSpacing: 4 }}>中 文 A I 测 试 平 台</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 26, marginTop: 46, opacity: s2, transform: `translateY(${interpolate(s2, [0, 1], [18, 0])}px)` }}>
        {["私有化部署", "国产大模型", "禅道 / Jira 集成", "GitLab PR 验证"].map((t) => (
          <span key={t} style={{ color: "#d4d4d8", fontSize: 24, border: "1px solid rgba(255,255,255,.22)", borderRadius: 999, padding: "10px 26px" }}>{t}</span>
        ))}
      </div>
      <div style={{ marginTop: 52, color: "#fff", fontSize: 30, fontWeight: 600, opacity: s3 }}>
        测试，从一句话开始。<span style={{ color: C.limeSoft }}>verifyos.example</span>
      </div>
    </AbsoluteFill>
  );
};
