/**
 * 内存 inventory 存储：浏览 / 搜索 / 标注（internal / external / deprecated）。
 *
 * 同 method+path 视为同一 API：upsert 时覆盖内容但保留原 id，不产生重复条目。
 * 持久化留待后续（A5 覆盖率看板落地时引入数据库），本阶段内存实现即可支撑验收。
 */
import type { ApiDefinition, HttpMethod } from '../types/models.js';
import { classifyByRules, classifyDefinitions } from './classify.js';
import { keyOf } from './normalize.js';

/** 标注输入：scope 对应 internal/external，status 对应 deprecated */
export interface AnnotateInput {
  scope?: 'internal' | 'external';
  status?: 'active' | 'deprecated';
}

export class InventoryStore {
  private readonly byId = new Map<string, ApiDefinition>();
  private readonly byKey = new Map<string, ApiDefinition>();

  constructor(initial: ApiDefinition[] = []) {
    this.upsert(initial);
  }

  /** 批量写入（同 method+path 合并） */
  upsert(definitions: ApiDefinition[]): void {
    for (const definition of definitions) this.add(definition);
  }

  /** 写入单条：同 method+path 覆盖内容、保留原 id 与 created_at */
  add(definition: ApiDefinition): void {
    const key = keyOf(definition.method, definition.path);
    const existing = this.byKey.get(key);
    if (existing) {
      const merged: ApiDefinition = {
        ...definition,
        id: existing.id,
        created_at: existing.created_at,
      };
      this.byId.set(merged.id, merged);
      this.byKey.set(key, merged);
      return;
    }
    this.byId.set(definition.id, definition);
    this.byKey.set(key, definition);
  }

  get(id: string): ApiDefinition | undefined {
    return this.byId.get(id);
  }

  getByKey(method: HttpMethod, path: string): ApiDefinition | undefined {
    return this.byKey.get(keyOf(method, path));
  }

  /** 浏览：返回全部 API（按 method+path 排序便于阅读） */
  list(): ApiDefinition[] {
    return [...this.byKey.values()].sort((a, b) => keyOf(a.method, a.path).localeCompare(keyOf(b.method, b.path)));
  }

  /** 搜索：大小写不敏感匹配 method/path/host/tags/scope/status */
  search(query: string): ApiDefinition[] {
    const q = query.trim().toLowerCase();
    if (q === '') return this.list();
    return this.list().filter((d) => {
      return (
        d.method.toLowerCase().includes(q) ||
        d.path.toLowerCase().includes(q) ||
        d.host.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        (d.scope ?? '').toLowerCase().includes(q) ||
        d.status.toLowerCase().includes(q)
      );
    });
  }

  /** 标注：设置 scope（internal/external）或 status（active/deprecated）；人工标注与 auto_tags 互补 */
  annotate(id: string, input: AnnotateInput): ApiDefinition | undefined {
    const definition = this.byId.get(id);
    if (!definition) return undefined;
    const next: ApiDefinition = { ...definition, updated_at: new Date().toISOString() };
    if (input.scope !== undefined) next.scope = input.scope;
    if (input.status !== undefined) next.status = input.status;
    this.byId.set(next.id, next);
    this.byKey.set(keyOf(next.method, next.path), next);
    return next;
  }

  /**
   * P1.4 自动标注：批量重算 auto_tags（规则式，可选 baseHost）。
   * 只更新 auto_tags（自动的补充），不动人工 scope/status/tags；返回更新后的列表。
   */
  autoAnnotate(baseHost?: string): ApiDefinition[] {
    const defs = this.list();
    const base = baseHost ?? inferStoreBaseHost(defs);
    const tagged = defs.map((def) => ({
      ...def,
      updated_at: new Date().toISOString(),
      auto_tags: classifyByRules(def, { baseHost: base }),
    }));
    this.upsert(tagged);
    return tagged;
  }

  remove(id: string): boolean {
    const definition = this.byId.get(id);
    if (!definition) return false;
    this.byId.delete(id);
    this.byKey.delete(keyOf(definition.method, definition.path));
    return true;
  }

  get size(): number {
    return this.byKey.size;
  }
}

/** 门店版多数派 host 推断（与 classify.inferBaseHost 同语义，避免循环依赖直接内联实现） */
function inferStoreBaseHost(defs: ApiDefinition[]): string {
  const counts = new Map<string, number>();
  for (const def of defs) {
    if (!def.host) continue;
    counts.set(def.host, (counts.get(def.host) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [host, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > bestCount) {
      best = host;
      bestCount = count;
    }
  }
  return best;
}

export { classifyDefinitions };
