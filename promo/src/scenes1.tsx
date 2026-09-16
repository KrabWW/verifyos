import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { C, FONT, Chip, AppWindow } from "./ui";
import { Icon } from "./icons";

/* ============ 场景 1：Hero（黑 + lime 品牌语言） ============ */
export const HeroScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = spring({ frame: f, fps, config: { damping: 12 }, delay: 5 });
  const s2 = spring({ frame: f, fps, config: { damping: 14 }, delay: 25 });
  const s3 = spring({ frame: f, fps, config: { damping: 14 }, delay: 45 });
  const glow = interpolate(f, [0, 60], [0.18, 0.38], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#101014", justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(600px 400px at 50% 42%, rgba(163,230,53,${glow}), transparent 70%)`,
        }}
      />
      <div
        style={{
          transform: `scale(${interpolate(s1, [0, 1], [0.6, 1])}) translateY(${interpolate(s1, [0, 1], [30, 0])}px)`,
          opacity: s1,
          width: 120, height: 120, borderRadius: 30, background: C.ink,
          border: "1px solid rgba(190,242,100,.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: C.limeSoft, fontSize: 62, fontWeight: 700,
          boxShadow: "0 20px 70px rgba(163,230,53,.35)",
        }}
      >
        ✓
      </div>
      <div style={{ opacity: s2, transform: `translateY(${interpolate(s2, [0, 1], [20, 0])}px)`, marginTop: 42, textAlign: "center" }}>
        <div style={{ color: "#fff", fontSize: 74, fontWeight: 700, letterSpacing: 2 }}>VerifyOS</div>
        <div style={{ color: C.limeSoft, fontSize: 30, marginTop: 10, letterSpacing: 6 }}>中 文 A I 测 试 平 台</div>
      </div>
      <div style={{ opacity: s3, marginTop: 46 }}>
        <span style={{ color: "#d4d4d8", fontSize: 34, fontWeight: 500 }}>
          测试，从<span style={{ color: "#fff" }}>一句话</span>开始
        </span>
      </div>
    </AbsoluteFill>
  );
};

/* ============ 场景 2：一句话输入 ============ */
export const InputScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = "帮我分析订单系统，找出没测到的关键流程";
  const chars = Math.floor(interpolate(f, [10, 55], [0, text.length], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }));
  const showSend = f > 60;
  const sendS = spring({ frame: f - 60, fps, config: { damping: 12 } });
  const sent = f > 78;
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <AppWindow width={1020} title="VerifyOS · AI 工作区">
        <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 30 }}>
          <div style={{ alignSelf: "flex-start", maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <div
                style={{
                  background: "#f4f4f5", color: C.text, borderRadius: "16px 16px 4px 16px",
                  padding: "14px 20px", fontSize: 24, minHeight: 30, minWidth: 300,
                }}
              >
                {text.slice(0, chars)}
                <span style={{ opacity: Math.floor(f / 8) % 2 ? 0 : 1, color: C.muted }}>|</span>
              </div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#e4e4e7", color: C.sub, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, flexShrink: 0 }}>我</div>
            </div>
            {sent && (
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✓</div>
                <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "16px 16px 16px 4px", padding: "14px 20px", fontSize: 24, color: C.text }}>
                  好的，我来分析 <b>crm.test.example.com</b>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                transform: `scale(${showSend ? interpolate(sendS, [0, 1], [1, 1.12]) : 0.9})`,
                background: showSend ? C.ink : "#e4e4e7",
                color: showSend ? "#fff" : C.muted,
                borderRadius: 12, padding: "10px 26px", fontSize: 22, fontWeight: 600,
              }}
            >
              发送 ↵
            </div>
          </div>
        </div>
      </AppWindow>
      <Caption>你只需要说清楚：要验证什么</Caption>
    </AbsoluteFill>
  );
};

/* ============ 场景 3：探索 + 登录墙 ============ */
export const CrawlScene: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = spring({ frame: f, fps, config: { damping: 13 } });
  const prog = interpolate(f, [10, 70], [0, 46], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const foundLogin = f > 72;
  const loginS = spring({ frame: f - 72, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", fontFamily: FONT }}>
      <AppWindow width={1020} title="VerifyOS · 探索 #1024">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 16 }}>
          <div style={{ opacity: appear, transform: `translateY(${interpolate(appear, [0, 1], [16, 0])}px)` }}>
            <TaskCard
              title={<><Icon name="globe" size={21} color={C.sub} /> 网站分析</>}
              status={foundLogin ? { text: <><Icon name="triangle-alert" size={16} /> 发现登录墙</>, color: "amber" as const } : { text: "分析中…", color: "blue" as const }}
              rows={[
                ["起始", "https://crm.test.example.com"],
                ["最大深度", "3"],
              ]}
              progress={prog}
              note={foundLogin ? "整个应用在登录墙后，需要凭据继续" : "正在识别页面结构、导航与登录入口…"}
            />
          </div>
          {foundLogin && (
            <div style={{ opacity: loginS, transform: `translateY(${interpolate(loginS, [0, 1], [14, 0])}px)`, display: "flex", gap: 10, alignItems: "center" }}>
              <AgentBubble><Icon name="triangle-alert" size={20} color={C.amber} /> 首轮分析完成：应用需要登录。请提供一组测试账号 ↓</AgentBubble>
            </div>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            {[["check", "访问首页", "green"], ["check", "识别导航", "green"], ...(foundLogin ? [["triangle-alert", "登录墙", "amber"]] : [["", "· …", "gray"]])].map(([ic, t, color], i) => (
              <div key={i} style={{ opacity: interpolate(f, [10 + i * 18, 24 + i * 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), }}>
                <Chip color={color as any}>{ic ? <Icon name={ic} size={15} /> : null} {t}</Chip>
              </div>
            ))}
          </div>
        </div>
      </AppWindow>
      <Caption>Agent 自己探索系统，遇到登录会主动求助</Caption>
    </AbsoluteFill>
  );
};

export const AgentBubble: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", gap: 12 }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>✓</div>
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "16px 16px 16px 4px", padding: "13px 18px", fontSize: 23, color: C.text }}>
      {children}
    </div>
  </div>
);

export const TaskCard: React.FC<{
  title: React.ReactNode;
  status: { text: React.ReactNode; color: "green" | "red" | "amber" | "blue" | "gray" | "indigo" };
  rows: [string, string][];
  progress: number;
  note: string;
}> = ({ title, status, rows, progress, note }) => (
  <div style={{ width: 640, background: "#fcfcfd", border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 22, fontWeight: 600, marginBottom: 10 }}>
      {title}
      <span style={{ marginLeft: "auto" }}><Chip color={status.color}>{status.text}</Chip></span>
    </div>
    {rows.map(([k, v]) => (
      <div key={k} style={{ display: "flex", gap: 10, fontSize: 19, color: C.sub, marginBottom: 4 }}>
        <span>{k}</span><b style={{ color: C.text, fontWeight: 500 }}>{v}</b>
      </div>
    ))}
    <div style={{ height: 8, background: C.grayBg, borderRadius: 4, overflow: "hidden", margin: "10px 0 8px" }}>
      <div style={{ height: "100%", width: `${progress}%`, background: status.color === "amber" ? C.amber : `linear-gradient(90deg,#4d7c0f,${C.lime})`, borderRadius: 4 }} />
    </div>
    <div style={{ fontSize: 17, color: C.muted }}>{note}</div>
  </div>
);

/* ============ 底部字幕 ============ */
export const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - 8, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        position: "absolute",
        bottom: 58,
        left: 0, right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)`,
      }}
    >
      <div style={{ background: "rgba(24,24,27,.88)", color: "#fff", borderRadius: 999, padding: "12px 34px", fontSize: 26, fontWeight: 500, letterSpacing: 1 }}>
        {children}
      </div>
    </div>
  );
};
