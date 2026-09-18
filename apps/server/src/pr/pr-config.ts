import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { mergeGate, type GateDecision } from '@verifyos/agent-core';

/**
 * T8：verifyos.config.yaml 解析 + 三层优先级合并 + PR 门禁策略。
 *
 * config.yaml 由 CLI `verifyos init` 生成（packages/cli/src/commands/init.ts），
 * 字段：project / app / environments / credential / llm；本模块额外读取可选的 pr 字段。
 *
 * pr 字段 schema（示例，写在仓库里随代码 review/version）：
 * ```yaml
 * pr:
 *   gate: fail_block            # 门禁策略：fail_block | strict | warn_only
 *   branches:                   # 触发分支规则（空 = 全分支触发）
 *     - feature/
 *     - main
 *   files:                      # 触发文件规则（空 = 全文件触发）
 *     - src/**
 *     - packages/agent-core/**
 *   verifications:              # 要跑的验证标题（空 = 跑影响分析建议的全部）
 *     - 主流程回归
 *     - 关键断言复验
 * ```
 *
 * 三层优先级：项目默认(config.yaml) < Test Plan < 单次 Run override。
 * 前一层由 config.yaml 提供，后两层由请求参数传入（webhook body 的 test_plan / override 字段）。
 */

// ---------- 类型 ----------

/** 门禁策略：fail_block=失败阻止/未知警告；strict=失败与未知都阻止；warn_only=永不阻止仅警告 */
export type GatePolicy = 'fail_block' | 'strict' | 'warn_only';

/** G1 门禁模式：blocking=断言失败阻止合并（现状默认）；reporting=只评论不拦合并（ℹ️ 非阻塞标注） */
export type GateMode = 'blocking' | 'reporting';

/** G1 分档计划：smoke=PR 冒烟档（默认）；full=全量回归档 */
export type PlanTier = 'smoke' | 'full';

/** G1 升档 full 的触发条件：分支 * 通配（如 release/*）或 MR label 命中 */
export interface FullTriggers {
  branches: string[];
  labels: string[];
}

export interface PrConfig {
  /** 门禁策略标识 */
  gate: GatePolicy;
  /** G1 门禁模式（默认 blocking；reporting 时门禁结果只影响评论文本不拦截合并） */
  gateMode: GateMode;
  /** G1 分档计划（默认 smoke；webhook 阶段用 resolvePlan 按 fullTriggers 动态判定） */
  plan: PlanTier;
  /** G1 升档 full 的触发条件（分支通配 / MR label） */
  fullTriggers: FullTriggers;
  /** 触发分支规则（glob，空数组 = 不限分支） */
  branches: string[];
  /** 触发文件规则（glob，空数组 = 不限文件） */
  files: string[];
  /** 要跑的验证标题（空数组 = 跑全部影响分析建议） */
  verifications: string[];
  /** ② 硬断言步骤（真实 UI 操作链，MR 回归时追加在登录+AI 回归之后；空 = 不追加） */
  hardSteps: HardStepCfg[];
}

/** ② config 里的硬断言步骤定义（verifyos.config.yaml pr.hardSteps 列表项）。
 *  goto 支持 {{envUrl}} 占位（渲染为项目环境 url）。 */
export interface HardStepCfg {
  title: string;
  goto?: string;
  /** 确定性动作链（零 LLM） */
  actions?: Array<{ type: string; selector?: string; value?: string; url?: string }>;
  /** AI 步骤指令（提供时 kind=ai，忽略 actions） */
  ai?: string;
  assert?: { kind: string; value: string };
  /** 触达校验 URL 子串（防假绿） */
  targetRef?: string;
}

export interface VerifyosConfig {
  project?: { name?: string };
  app?: { url?: string };
  environments?: Array<{ name?: string; url?: string }>;
  credential?: { role?: string };
  llm?: { model?: string };
  pr?: Partial<PrConfig>;
}

// ---------- 默认值（兜底） ----------

export function defaultPrConfig(): PrConfig {
  return {
    gate: 'fail_block',
    gateMode: 'blocking',
    plan: 'smoke',
    fullTriggers: { branches: ['release/*'], labels: [] },
    branches: [],
    files: [],
    verifications: [],
    hardSteps: [],
  };
}

// ---------- 极简 YAML 子集解析（不依赖 js-yaml 类型，覆盖 init 生成结构） ----------

interface Line {
  indent: number; // 前导空格数
  text: string;   // 去掉前导空格与行尾注释后的内容（已 trim 右侧）
}

function preprocess(raw: string): Line[] {
  const out: Line[] = [];
  for (const src of raw.split(/\r?\n/)) {
    // 去掉行尾注释（简单处理：忽略引号内的 #，覆盖本项目配置场景）
    let line = src;
    let quote: '"' | "'" | null = null;
    let cut = -1;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '#') {
        cut = i;
        break;
      }
    }
    if (cut >= 0) line = line.slice(0, cut);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    out.push({ indent, text: line.trim() });
  }
  return out;
}

function splitKey(text: string): { key: string; valueText: string } | null {
  const m = /^([^:]+):\s*(.*)$/.exec(text);
  if (!m) return null;
  return { key: m[1].trim(), valueText: m[2].trim() };
}

function scalar(text: string): unknown {
  if (text === '' || text === '~' || text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

interface ParseResult {
  val: unknown;
  next: number;
}

function parseNode(lines: Line[], pos: number, indent: number): ParseResult {
  if (pos >= lines.length) return { val: undefined, next: pos };
  const line = lines[pos];
  if (line.text.startsWith('- ')) return parseSequence(lines, pos, indent);
  return parseMapping(lines, pos, indent);
}

function parseBlockValue(lines: Line[], pos: number, parentIndent: number): ParseResult {
  if (pos >= lines.length) return { val: undefined, next: pos };
  if (lines[pos].indent <= parentIndent) return { val: undefined, next: pos };
  return parseNode(lines, pos, lines[pos].indent);
}

function parseMapping(lines: Line[], pos: number, indent: number): ParseResult {
  const obj: Record<string, unknown> = {};
  let i = pos;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) { i++; continue; }
    const kv = splitKey(line.text);
    if (!kv) { i++; continue; }
    if (kv.valueText === '') {
      const child = parseBlockValue(lines, i + 1, line.indent);
      obj[kv.key] = child.val;
      i = child.next;
    } else {
      obj[kv.key] = scalar(kv.valueText);
      i++;
    }
  }
  return { val: obj, next: i };
}

function parseSequence(lines: Line[], pos: number, indent: number): ParseResult {
  const arr: unknown[] = [];
  let i = pos;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== indent || !line.text.startsWith('- ')) break;
    const rest = line.text.slice(2).trim();
    if (rest === '') {
      const child = parseBlockValue(lines, i + 1, indent);
      arr.push(child.val);
      i = child.next;
      continue;
    }
    const kv = splitKey(rest);
    if (kv) {
      // 列表项是一个 map（首个 key 内联在 - 之后）
      const obj: Record<string, unknown> = {};
      if (kv.valueText === '') {
        const child = parseBlockValue(lines, i + 1, indent);
        obj[kv.key] = child.val;
        i = child.next;
      } else {
        obj[kv.key] = scalar(kv.valueText);
        i++;
      }
      // 同一 map 项的后续 key（缩进更深）
      while (i < lines.length) {
        const cl = lines[i];
        if (cl.indent <= indent) break;
        const ckv = splitKey(cl.text);
        if (!ckv) { i++; continue; }
        if (ckv.valueText === '') {
          const child = parseBlockValue(lines, i + 1, cl.indent);
          obj[ckv.key] = child.val;
          i = child.next;
        } else {
          obj[ckv.key] = scalar(ckv.valueText);
          i++;
        }
      }
      arr.push(obj);
      continue;
    }
    arr.push(scalar(rest));
    i++;
  }
  return { val: arr, next: i };
}

function parseYaml(text: string): unknown {
  const lines = preprocess(text);
  if (lines.length === 0) return {};
  return parseMapping(lines, 0, lines[0].indent).val;
}

// ---------- 读取与归约 ----------

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((x) => x.length > 0);
}

function asRecord(v: unknown): Record<string, unknown> {
  return (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
}

/** 把解析出的 pr 对象归约为 PrConfig（缺省字段用默认兜底） */
function normalizePr(raw: unknown): PrConfig {
  const base = defaultPrConfig();
  if (!raw || typeof raw !== 'object') return base;
  const o = asRecord(raw);
  const gate = String(o.gate ?? '') as GatePolicy;
  if (gate === 'fail_block' || gate === 'strict' || gate === 'warn_only') base.gate = gate;
  const gateMode = String(o.gateMode ?? '') as GateMode;
  if (gateMode === 'blocking' || gateMode === 'reporting') base.gateMode = gateMode;
  const plan = String(o.plan ?? '') as PlanTier;
  if (plan === 'smoke' || plan === 'full') base.plan = plan;
  // fullTriggers：极简解析器下保持 {branches: string[], labels: string[]} 简单数组结构
  if (o.fullTriggers != null && typeof o.fullTriggers === 'object' && !Array.isArray(o.fullTriggers)) {
    const ft = asRecord(o.fullTriggers);
    base.fullTriggers = { branches: asStringArray(ft.branches), labels: asStringArray(ft.labels) };
  }
  base.branches = asStringArray(o.branches);
  base.files = asStringArray(o.files);
  base.verifications = asStringArray(o.verifications);
  // ② 硬断言步骤解析：容错归约（非法项丢弃，不阻塞 webhook）
  if (Array.isArray(o.hardSteps)) {
    base.hardSteps = o.hardSteps.map(asRecord).map((s) => ({
      title: String(s.title ?? '硬断言步骤'),
      ...(typeof s.goto === 'string' ? { goto: s.goto } : {}),
      ...(Array.isArray(s.actions)
        ? { actions: s.actions.map(asRecord).map((a) => ({
            type: String(a.type ?? 'click'),
            ...(typeof a.selector === 'string' ? { selector: a.selector } : {}),
            ...(typeof a.value === 'string' ? { value: a.value } : {}),
            ...(typeof a.url === 'string' ? { url: a.url } : {}),
          })) }
        : {}),
      ...(typeof s.ai === 'string' ? { ai: s.ai } : {}),
      ...(s.assert && typeof s.assert === 'object'
        ? { assert: (() => { const a = asRecord(s.assert); return { kind: String(a.kind ?? ''), value: String(a.value ?? '') }; })() }
        : {}),
      ...(typeof s.targetRef === 'string' ? { targetRef: s.targetRef } : {}),
    }));
  }
  return base;
}

/** 解析 verifyos.config.yaml 文本为 VerifyosConfig（解析失败返回空对象，调用方兜底） */
export function parseProjectConfig(text: string): VerifyosConfig {
  try {
    const v = parseYaml(text);
    const o = asRecord(v);
    return {
      project: asRecord(o.project) as VerifyosConfig['project'],
      app: asRecord(o.app) as VerifyosConfig['app'],
      environments: Array.isArray(o.environments) ? o.environments.map((e) => asRecord(e)) : [],
      credential: asRecord(o.credential) as VerifyosConfig['credential'],
      llm: asRecord(o.llm) as VerifyosConfig['llm'],
      pr: normalizePr(o.pr),
    };
  } catch {
    return {};
  }
}

/** 从 startDir 向上查找 verifyos.config.yaml（支持 VERIFYOS_CONFIG 显式指定） */
export function resolveConfigPath(startDir: string): string | null {
  const explicit = process.env.VERIFYOS_CONFIG;
  if (explicit) return existsSync(explicit) ? resolve(explicit) : null;
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, 'verifyos.config.yaml');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 读取项目配置（找不到文件或解析失败返回 {}，pr 走默认兜底） */
export function loadProjectConfig(startDir: string): VerifyosConfig {
  const file = resolveConfigPath(startDir);
  if (!file) return {};
  try {
    return parseProjectConfig(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** 读 pr 配置（项目默认层）；找不到文件时用默认值 */
export function loadPrConfig(startDir: string): { pr: PrConfig; source: string | null } {
  const file = resolveConfigPath(startDir);
  if (!file) return { pr: defaultPrConfig(), source: null };
  const cfg = loadProjectConfig(startDir);
  return { pr: normalizePr(cfg.pr), source: file };
}

// ---------- 三层优先级合并 ----------

/**
 * 三层优先级：项目默认(config.yaml) < Test Plan < 单次 Run override。
 * 后续层覆盖前一层；数组字段按「是否提供」整体替换（空数组也是有效覆盖）。
 */
export function mergePrConfig(base: PrConfig, ...layers: Array<Partial<PrConfig> | null | undefined>): PrConfig {
  const out: PrConfig = {
    gate: base.gate,
    gateMode: base.gateMode,
    plan: base.plan,
    fullTriggers: { branches: [...base.fullTriggers.branches], labels: [...base.fullTriggers.labels] },
    branches: [...base.branches],
    files: [...base.files],
    verifications: [...base.verifications],
    hardSteps: base.hardSteps.map((s) => ({ ...s })),
  };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.gate !== undefined) out.gate = layer.gate;
    if (layer.gateMode !== undefined) out.gateMode = layer.gateMode;
    if (layer.plan !== undefined) out.plan = layer.plan;
    if (layer.fullTriggers !== undefined) {
      out.fullTriggers = { branches: [...layer.fullTriggers.branches], labels: [...layer.fullTriggers.labels] };
    }
    if (layer.branches !== undefined) out.branches = [...layer.branches];
    if (layer.files !== undefined) out.files = [...layer.files];
    if (layer.verifications !== undefined) out.verifications = [...layer.verifications];
    if (layer.hardSteps !== undefined) out.hardSteps = layer.hardSteps.map((s) => ({ ...s }));
  }
  return out;
}

/** 从请求体（webhook body）提取 Test Plan 层与 Run override 层 */
export function extractPrLayers(body: Record<string, unknown>): {
  testPlan: Partial<PrConfig>;
  override: Partial<PrConfig>;
} {
  const pick = (v: unknown): Partial<PrConfig> => {
    if (!v || typeof v !== 'object') return {};
    const o = asRecord(v);
    const out: Partial<PrConfig> = {};
    const gate = String(o.gate ?? '') as GatePolicy;
    if (gate === 'fail_block' || gate === 'strict' || gate === 'warn_only') out.gate = gate;
    const gateMode = String(o.gateMode ?? '') as GateMode;
    if (gateMode === 'blocking' || gateMode === 'reporting') out.gateMode = gateMode;
    const plan = String(o.plan ?? '') as PlanTier;
    if (plan === 'smoke' || plan === 'full') out.plan = plan;
    if (o.fullTriggers != null && typeof o.fullTriggers === 'object' && !Array.isArray(o.fullTriggers)) {
      const ft = asRecord(o.fullTriggers);
      out.fullTriggers = { branches: asStringArray(ft.branches), labels: asStringArray(ft.labels) };
    }
    if (Array.isArray(o.branches)) out.branches = asStringArray(o.branches);
    if (Array.isArray(o.files)) out.files = asStringArray(o.files);
    if (Array.isArray(o.verifications)) out.verifications = asStringArray(o.verifications);
    if (Array.isArray(o.hardSteps)) out.hardSteps = o.hardSteps.map(asRecord).map((s) => ({ title: String(s.title ?? '硬断言步骤') }));
    return out;
  };
  return { testPlan: pick(body.test_plan), override: pick(body.override) };
}

// ---------- 触发规则 ----------

/** glob 匹配（* 任意段内字符，** 任意字符；无通配符时做前缀/全等匹配） */
export function globMatch(pattern: string, value: string): boolean {
  const p = pattern.trim();
  if (p === '' || p === '*') return true;
  if (!/[?*]/.test(p)) {
    return p.endsWith('/') ? value.startsWith(p) : value === p;
  }
  const re = new RegExp(
    '^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$',
  );
  return re.test(value);
}

/** 分支触发判定：branches 空 = 不限；否则 source_branch 命中任一规则即触发 */
export function branchMatches(branches: string[], branch: string): boolean {
  if (branches.length === 0) return true;
  return branches.some((p) => globMatch(p, branch));
}

/** 文件触发判定：files 空 = 不限；否则任一 changed file 命中即触发 */
export function fileMatches(files: string[], changedFiles: string[]): boolean {
  if (files.length === 0) return true;
  return changedFiles.some((f) => files.some((p) => globMatch(p, f)));
}

/** 综合触发判定（分支规则与文件规则是 AND 关系：都满足才触发定向回归） */
export function shouldTriggerPr(
  pr: PrConfig,
  sourceBranch: string,
  changedFiles: string[],
): { trigger: boolean; reason: string } {
  const b = branchMatches(pr.branches, sourceBranch);
  if (!b) {
    return { trigger: false, reason: `source_branch=${sourceBranch} 未命中 branches 触发规则 ${JSON.stringify(pr.branches)}` };
  }
  const f = fileMatches(pr.files, changedFiles);
  if (!f) {
    return { trigger: false, reason: `变更文件未命中 files 触发规则 ${JSON.stringify(pr.files)}` };
  }
  return { trigger: true, reason: `branches/files 触发规则命中，按 config 定向回归` };
}

// ---------- G1：分档计划 ----------

/**
 * G1 分档计划判定（纯函数）：
 * - source branch 命中任一 fullTriggers.branches（* 通配，globMatch）→ 'full'
 * - 任一 MR label 命中 fullTriggers.labels（精确相等）→ 'full'
 * - 都未命中 → 'smoke'（PR 冒烟档，默认）
 */
export function resolvePlan(pr: PrConfig, branch: string, labels: string[]): PlanTier {
  const ft = pr.fullTriggers ?? defaultPrConfig().fullTriggers;
  if (ft.branches.some((p) => globMatch(p, branch))) return 'full';
  if ((labels ?? []).some((l) => ft.labels.includes(l))) return 'full';
  return 'smoke';
}

// ---------- 门禁策略（对齐 agent-core mergeGate） ----------

export type VerdictLike = 'pass' | 'fail' | 'unknown';

/**
 * 把 config 门禁策略映射为 block/warn 阈值。
 * - fail_block（默认）：fail → block，unknown → warn（与 agent-core mergeGate 完全一致）
 * - strict：fail → block，unknown → block
 * - warn_only：永不 block，失败/未知仅 warn
 */
export function applyGate(gate: GatePolicy, verdict: VerdictLike): { decision: GateDecision; reason: string } {
  if (gate === 'fail_block') {
    // 对齐 agent-core mergeGate（review.ts:89）——直接复用，保证口径一致
    return mergeGate({ verdict } as Parameters<typeof mergeGate>[0]);
  }
  if (gate === 'strict') {
    if (verdict === 'fail') return { decision: 'block', reason: '存在断言失败，阻止合并' };
    if (verdict === 'unknown') return { decision: 'block', reason: '存在无法验证步骤（UNKNOWN），strict 策略阻止合并' };
    return { decision: 'allow', reason: '全部通过' };
  }
  // warn_only
  if (verdict === 'fail') return { decision: 'warn', reason: '存在断言失败，warn_only 策略仅警告不阻止' };
  if (verdict === 'unknown') return { decision: 'warn', reason: '存在无法验证步骤（UNKNOWN），仅警告' };
  return { decision: 'allow', reason: '全部通过' };
}
