/**
 * G3：影响面（areas）× Run 步骤 覆盖标注。
 * 原型语义：每个 affected area 标注「已回归覆盖 step#N」或「未覆盖 + 原因」。
 * 纯函数、零依赖。
 */

export interface CoverageArea {
  title: string;
  severity: 'high' | 'medium' | 'info';
  related?: string | null;
  hint?: string | null;
  action?: string | null;
  /** 标注输出：被哪个步骤覆盖（1-based） */
  coveredBy?: string;
  /** 标注输出：未覆盖原因 */
  uncoveredReason?: string;
}

export interface CoverageStep {
  /** 步骤描述/指令文本（deterministic 的 label 或 ai 的 instruction） */
  text: string;
  kind?: string;
}

/** 归一：小写去空白标点 */
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[\s\p{P}]+/gu, '');
}

/** 提取词元：区域标题按 2-6 字滑窗 + 英数词，步文本含任一即算命中 */
function tokens(title: string): string[] {
  const t = norm(title);
  const out = new Set<string>();
  for (const w of title.match(/[A-Za-z0-9_]{3,}/g) ?? []) out.add(w.toLowerCase());
  if ([...t].length >= 2) {
    const chars = [...t];
    for (let n = 2; n <= Math.min(6, chars.length); n++) {
      for (let i = 0; i + n <= chars.length; i++) out.add(chars.slice(i, i + n).join(''));
    }
  }
  return [...out];
}

function stepText(s: CoverageStep): string {
  return typeof s === 'string' ? s : `${(s as CoverageStep).text ?? ''}`;
}

/**
 * 标注覆盖：标题词元与步骤文本求交（≥1 命中即覆盖，取最长命中步）。
 * 无步骤 → uncoveredReason='本次 Run 无回归步骤'；有步骤但不沾边 → '步骤未触达该区域'。
 */
export function annotateCoverage(areas: CoverageArea[], steps: CoverageStep[]): CoverageArea[] {
  const enriched = steps.map((s, i) => ({ n: i + 1, norm: norm(stepText(s)), raw: stepText(s) }));
  return areas.map((a) => {
    const tks = tokens(a.title);
    let best: { n: number; len: number } | null = null;
    for (const st of enriched) {
      let len = 0;
      for (const tk of tks) if (tk.length > len && st.norm.includes(tk)) len = tk.length;
      if (len > 0 && (!best || len > best.len)) best = { n: st.n, len };
    }
    if (best) return { ...a, coveredBy: `step#${best.n}` };
    return { ...a, uncoveredReason: enriched.length === 0 ? '本次 Run 无回归步骤' : '步骤未触达该区域' };
  });
}
