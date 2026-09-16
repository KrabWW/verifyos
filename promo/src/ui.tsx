import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Series,
  Audio,
  staticFile,
  useVideoConfig,
} from "remotion";
import { Icon } from "./icons";

// ---------- 设计令牌（与 prototype.html V4 一致：黑主色 + lime + AI 语义紫） ----------
export const C = {
  bg: "#f7f7f8",
  panel: "#ffffff",
  border: "#e5e7eb",
  border2: "#d4d4d8",
  text: "#18181b",
  sub: "#71717a",
  muted: "#a1a1aa",
  accent: "#4f46e5",
  accentBg: "#eef2ff",
  ink: "#18181b",
  lime: "#a3e635",
  limeBg: "#fcffe8",
  limeDeep: "#365314",
  limeSoft: "#bef264",
  green: "#16a34a", greenBg: "#f0fdf4", greenBd: "#bbf7d0",
  red: "#dc2626", redBg: "#fef2f2", redBd: "#fecaca",
  amber: "#d97706", amberBg: "#fffbeb", amberBd: "#fde68a",
  blue: "#2563eb", blueBg: "#eff6ff", blueBd: "#bfdbfe",
  grayBg: "#f4f4f5",
};

export const FONT =
  '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

// ---------- 通用小组件 ----------
export const Chip: React.FC<{
  color?: "green" | "red" | "amber" | "blue" | "gray" | "indigo";
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ color = "gray", children, style }) => {
  const map = {
    green: [C.greenBg, C.green, C.greenBd],
    red: [C.redBg, C.red, C.redBd],
    amber: [C.amberBg, C.amber, C.amberBd],
    blue: [C.blueBg, C.blue, C.blueBd],
    gray: [C.grayBg, C.sub, "#e4e4e7"],
    indigo: [C.accentBg, C.accent, "#c7d2fe"],
  } as const;
  const [b, t, bd] = map[color];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: b,
        color: t,
        border: `1px solid ${bd}`,
        borderRadius: 6,
        padding: "2px 9px",
        fontSize: 19,
        fontWeight: 500,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export const AppWindow: React.FC<{
  children: React.ReactNode;
  title?: string;
  width?: number | string;
  style?: React.CSSProperties;
}> = ({ children, title = "VerifyOS · 订单管理系统", width = 1080, style }) => (
  <div
    style={{
      width,
      background: C.bg,
      borderRadius: 18,
      border: `1px solid ${C.border2}`,
      boxShadow: "0 30px 80px rgba(24,24,27,.18)",
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        height: 44,
        background: "#f4f4f5",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 16px",
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <Dot color="#f87171" /><Dot color="#fbbf24" /><Dot color="#34d399" />
      </div>
      <div
        style={{
          flex: 1,
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 7,
          fontSize: 16,
          color: C.sub,
          padding: "3px 12px",
          fontFamily: FONT,
        }}
      >
        <Icon name="lock" size={14} color={C.muted} style={{ marginRight: 5 }} />
        {title}
      </div>
    </div>
    <div style={{ display: "flex" }}>
      {/* 侧边栏 */}
      <div
        style={{
          width: 190,
          background: C.panel,
          borderRight: `1px solid ${C.border}`,
          padding: "14px 10px",
          fontSize: 18,
          color: C.sub,
          lineHeight: 2.1,
        }}
      >
        <div style={{ fontWeight: 700, color: C.text, marginBottom: 8, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: C.ink, color: C.limeSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✓</span>
          VerifyOS
        </div>
        {([
          ["sparkles", "AI 工作区"],
          ["compass", "探索"],
          ["target", "QA 点"],
          ["flask-conical", "验证"],
          ["play", "执行"],
          ["map", "应用地图"],
          ["bug", "问题"],
        ] as const).map(([ic, t], i) => (
          <div
            key={t}
            style={{
              padding: "3px 10px",
              borderRadius: 7,
              background: i === 0 ? C.ink : "transparent",
              color: i === 0 ? "#fff" : C.sub,
              fontWeight: i === 0 ? 600 : 400,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name={ic} size={17} color={i === 0 ? C.limeSoft : C.sub} />
            {t}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, padding: "20px 22px", minHeight: 520 }}>{children}</div>
    </div>
  </div>
);

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ width: 10, height: 10, borderRadius: 5, background: color }} />
);
