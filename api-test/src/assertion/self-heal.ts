/**
 * P1.8 自愈断言（schema drift 映射）：响应结构演化后自动重定向断言 target。
 *
 * 场景：接口改版（字段改名/挪位置）导致旧断言的 JSONPath 在新响应里失配。
 * healAssertions 对每条带 target 的断言：
 * 1. target 在新响应里仍存在 -> 原样保留；
 * 2. 不存在 -> 在新响应里找映射，按优先级：
 *    a. 同值字段（value_match）：旧响应该位置的叶子值与新响应某叶子值相等
 *       （改名但值未变，如 user_id -> account.uid 且同值）；值相等且末段 key
 *       也相同的候选优先，多个候选取最浅路径，保证确定性；
 *    b. 同名不同位置（name_match）：新响应里存在同 key 叶子（字段挪了位置，
 *       如 items[0].sku -> products[0].sku）；旧值类型相同的候选优先；
 * 3. 找不到映射 -> 断言不改（原样保留在 healed 中），target 记入 broken 供人审。
 *
 * 每个旧 target 至多产生一条映射（同一字段的 exists/type/eq 多条断言共享映射），
 * 所有映射记录进 changes（from/to/reason），人可审、可回滚。
 *
 * 对标 Keploy 的 test 自愈思路；规则式，LLM 增强后置。
 */
import type { Assertion } from '../types/models.js';
import { buildJsonPath, walkLeaves } from '../generator/schema.js';
import { evaluateJsonPath, parseJsonPath } from './jsonpath.js';

/** 一次映射变更（人可审） */
export interface HealChange {
  /** 旧 target（断言原 JSONPath） */
  from: string;
  /** 新 target（重定向后的 JSONPath） */
  to: string;
  /** 映射依据（value_match=同值字段 / name_match=同名不同位置）+ 候选说明 */
  reason: string;
}

/** 无法映射的 target（断言保持原样，等人工处理） */
export interface BrokenTarget {
  /** 失配且找不到映射的 target */
  target: string;
  /** 找不到映射的原因（人读） */
  reason: string;
}

/** 自愈结果 */
export interface HealResult {
  /** 自愈后的断言列表（含未受影响与无法映射的原样断言，顺序与输入一致） */
  healed: Assertion[];
  /** 映射变更记录（每个旧 target 至多一条） */
  changes: HealChange[];
  /** 找不到映射的 target 列表 */
  broken: BrokenTarget[];
}

/** 新响应叶子索引（一次遍历，两策略共用）：路径串 + 末段 key + 值 + 深度 */
interface LeafCandidate {
  path: string;
  key: string;
  value: unknown;
  depth: number;
}

/** 标量叶子值相等（Object.is 覆盖 NaN；对象/数组叶子值不走同值策略） */
function sameLeafValue(a: unknown, b: unknown): boolean {
  if (a !== null && typeof a === 'object') return false;
  if (b !== null && typeof b === 'object') return false;
  return Object.is(a, b);
}

/** JSON 类型名（与 diagnose.ts 的 typeName 一致口径） */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** 索引新响应全部叶子（跳过根叶子 $：重定向到根无意义） */
function indexLeaves(response: unknown): LeafCandidate[] {
  return walkLeaves(response)
    .filter((l) => l.path.length > 0)
    .map((l) => ({
      path: buildJsonPath(l.path),
      key: l.key,
      value: l.value,
      depth: l.path.length,
    }));
}

/** 多候选排序取最优：打分高者优先（稳定排序保证确定性），再按文档顺序 */
function pickBest<T>(candidates: T[], score: (c: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = score(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/**
 * 为失配 target 找映射：先同值、后同名；找不到返回 null。
 * @param target 旧 target（断言 JSONPath）
 * @param oldValue 旧响应该位置的值（路径在旧响应也失配时为 undefined）
 * @param leaves 新响应叶子索引
 */
function findMapping(
  target: string,
  oldValue: unknown,
  leaves: LeafCandidate[],
): { to: string; reason: string } | null {
  const segs = parseJsonPath(target);
  const oldKey = segs === null || segs.length === 0 ? '' : String(segs[segs.length - 1]);

  // 策略 a：同值字段（旧值为标量时才有意义；值相等 +1，末段同名再 +1，浅路径优先）
  if (oldValue !== undefined && oldValue !== null && typeof oldValue !== 'object') {
    const byValue = leaves.filter((l) => sameLeafValue(l.value, oldValue));
    const best = pickBest(byValue, (l) => (l.key === oldKey ? 2 : 1) - l.depth * 0.01);
    if (best !== undefined) {
      return {
        to: best.path,
        reason:
          `value_match: 旧值 ${JSON.stringify(oldValue)} 在新响应 ${best.path} 处出现` +
          (best.key === oldKey ? '（末段字段名相同）' : ''),
      };
    }
  }

  // 策略 b：同名不同位置（旧值类型相同的候选优先，浅路径优先）
  if (oldKey !== '') {
    const byName = leaves.filter((l) => l.key === oldKey);
    const oldType = oldValue === undefined ? undefined : typeName(oldValue);
    const best = pickBest(byName, (l) => (oldType !== undefined && typeName(l.value) === oldType ? 2 : 1) - l.depth * 0.01);
    if (best !== undefined) {
      return {
        to: best.path,
        reason: `name_match: 字段 ${oldKey} 在新响应 ${best.path} 处出现（同名不同位置）`,
      };
    }
  }

  return null;
}

/**
 * 自愈断言：新响应 schema 漂移时自动重定向失配 target。
 * @param assertions 期望断言列表（带 $ 开头 target 的断言参与映射，其余原样保留）
 * @param oldResponse 旧响应（断言生成时的基线，用于取旧 target 处的值）
 * @param newResponse 新响应（漂移后的实际结构）
 */
export function healAssertions(
  assertions: Assertion[],
  oldResponse: unknown,
  newResponse: unknown,
): HealResult {
  const leaves = indexLeaves(newResponse);

  // target -> 新 target 的映射缓存：同一字段多条断言共享一次映射决策
  const remap = new Map<string, string>();
  const changes: HealChange[] = [];
  const broken: BrokenTarget[] = [];

  const resolveTarget = (target: string): string => {
    const cached = remap.get(target);
    if (cached !== undefined) return cached;

    // 1. 新响应仍存在 -> 不变
    const segs = parseJsonPath(target);
    if (segs !== null && evaluateJsonPath(newResponse, segs).found) {
      remap.set(target, target);
      return target;
    }

    // 2. 已判定 broken -> 不改
    if (broken.some((b) => b.target === target)) return target;

    // 3. 找映射（旧值从旧响应取）
    const oldSegs = parseJsonPath(target);
    const oldGot = oldSegs === null ? undefined : evaluateJsonPath(oldResponse, oldSegs);
    const oldValue = oldGot?.found ? oldGot.value : undefined;
    const mapping = findMapping(target, oldValue, leaves);

    if (mapping === null) {
      broken.push({
        target,
        reason: 'no_match: 新响应中既无同值字段也无同名字段，疑似字段被删除',
      });
      remap.set(target, target);
      return target;
    }

    remap.set(target, mapping.to);
    changes.push({ from: target, to: mapping.to, reason: mapping.reason });
    return mapping.to;
  };

  const healed = assertions.map((a) => {
    if (a.target === undefined || !a.target.startsWith('$')) return a; // status / 顶层 schema 断言等原样保留
    const to = resolveTarget(a.target);
    return to === a.target ? a : { ...a, target: to };
  });

  return { healed, changes, broken };
}
