/**
 * G3：动态探索发现（Live Findings）分类 + 指纹去重。
 * finding 来源：explore 事件 e.finding = { level: 'red'|'amber'|'yellow', title, detail }
 * 纯函数、零依赖；被 webhooks.controller（MR review 合并）与后续工单复用。
 */

export interface LiveFinding {
  level: 'red' | 'amber' | 'yellow';
  title: string;
  detail: string;
  /** 去重合并后附加：出现次数（跨轮） */
  occurrences?: number;
  /** 去重合并后附加：置信度 0-1，合并一次 +0.15（封顶 0.95） */
  confidence?: number;
  /** 去重后标注：与本条合并的历史指纹列表 */
  mergedFrom?: string[];
}

export type FindingKind = 'defect' | 'risk' | 'navigational';

/** 归一化文本：小写、去标点/空白 */
function normText(s: string): string {
  return (s || '').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
}

/** 标题关键词 → 类别。defect=确定性缺陷；risk=需人判断；navigational=导航/环境噪音 */
const DEFECT_PAT = /(http 5\d\d|http 4\d\d|控制台错误|console error|空白页|白屏|崩溃|无法|失败|报错|exception|uncaught)/i;
const NAV_PAT = /(登录墙|重定向|跳转|导航|链接|入口|菜单|锚点|canonical|404 提示页)/i;

export function classifyFinding(f: LiveFinding): FindingKind {
  const text = `${f.title} ${f.detail}`;
  if (DEFECT_PAT.test(text)) return 'defect';
  if (NAV_PAT.test(text)) return 'navigational';
  // red 且非导航词 → 至少 risk
  return f.level === 'red' ? 'risk' : 'risk';
}

/**
 * 指纹：归一标题 + detail 首个 URL 路径（或前 24 个归一字符）。
 * 同站点同一问题跨轮通常标题一致、URL 相同——指纹稳定且可人读。
 */
export function fingerprint(f: LiveFinding): string {
  const m = (f.detail || '').match(/\(([^)]*https?:\/\/[^)]*)\)/);
  let loc = '';
  if (m) {
    try { loc = new URL(m[1]).pathname; } catch { loc = m[1].slice(0, 48); }
  }
  const tail = loc || normText(f.detail).slice(0, 24);
  return `${normText(f.title)}::${normText(tail)}`;
}

/** 相似度：指纹相等，或归一标题相等且 detail 归一前 16 字符相等 */
function similar(a: string, b: string, fa: LiveFinding, fb: LiveFinding): boolean {
  if (a === b) return true;
  const [ta] = a.split('::');
  const [tb] = b.split('::');
  return !!ta && ta === tb && normText(fa.detail).slice(0, 16) === normText(fb.detail).slice(0, 16);
}

/**
 * 去重：kept 保留顺序；与已保留项相似 → 合并（occurrences+1、confidence+0.15 封顶 0.95、记 mergedFrom）。
 * 初次出现置信度 0.5（defect 0.7）。返回 { kept, mergedCount }。
 */
export function dedupeFindings(findings: LiveFinding[]): { kept: LiveFinding[]; mergedCount: number } {
  const kept: LiveFinding[] = [];
  const fps: string[] = [];
  let mergedCount = 0;
  for (const f of findings) {
    const fp = fingerprint(f);
    const idx = fps.findIndex((p) => similar(p, fp, kept[fps.indexOf(p)], f));
    if (idx >= 0) {
      const t = kept[idx];
      t.occurrences = (t.occurrences ?? 1) + 1;
      const base = t.confidence ?? (classifyFinding(t) === 'defect' ? 0.7 : 0.5);
      t.confidence = Math.min(0.95, base + 0.15);
      t.mergedFrom = [...(t.mergedFrom ?? []), fp];
      mergedCount++;
    } else {
      kept.push({ ...f, occurrences: 1, confidence: classifyFinding(f) === 'defect' ? 0.7 : 0.5 });
      fps.push(fp);
    }
  }
  return { kept, mergedCount };
}

/** 三分：UI 分区展示用（defect 置顶） */
export function splitFindings(findings: LiveFinding[]): Record<FindingKind, LiveFinding[]> {
  const out: Record<FindingKind, LiveFinding[]> = { defect: [], risk: [], navigational: [] };
  for (const f of findings) out[classifyFinding(f)].push(f);
  return out;
}
