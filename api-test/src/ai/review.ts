/**
 * P2.3 生成结果 → 勾选卡片 → 人审入库（Review Pipeline）。
 *
 * 对标 MeterSphere 的「生成结果勾选入库」交互（只学交互模式，不搬实现）：
 * 1. buildCandidates(生成结果)：把规则引擎 / AI 生成的产物转成候选卡片数组，
 *    默认全选（checked=true），reason 写「AI 依据」一句话；
 * 2. confirm(ids)：勾选的入库——写入内存 store，入库条目带 aiCreate=true 标记；
 * 3. reject(ids)：拒绝的卡片移出可入库集合（此后 confirm 会被跳过）；
 * 4. confirmAll()：当前仍勾选的全部入库。
 *
 * 入库语义：AI 生成不直接生效，必须经人勾选确认（aiCreate 标记 + 用例 payload
 * 内 review_status='pending' 保持人审语义）。存储为内存实现（模式参考
 * src/coverage/store.ts / src/inventory/store.ts），后续可平滑换 SQLite/Postgres。
 */
import { randomUUID } from 'node:crypto';
import type { TestCase } from '../types/models.js';

/** 候选种类 */
export type ReviewKind = 'case' | 'assertion' | 'scenario';

/** 勾选卡片（UI 无关的展示模型：前端只负责渲染 checked 与收集勾选 id） */
export interface ReviewCandidate {
  id: string;
  kind: ReviewKind;
  /** 卡片标题 */
  title: string;
  /** 结构化数据（case → TestCase；assertion → Assertion[]；scenario → 步骤描述） */
  payload: unknown;
  /** 默认勾选状态（默认全选） */
  checked: boolean;
  /** AI 依据（一句话，人审时快速判断生成理由） */
  reason: string;
  /** 来源恒为 ai */
  source: 'ai';
}

/** buildCandidates 的输入（生成产物 → 卡片的统一入口） */
export interface ReviewInput {
  kind: ReviewKind;
  title: string;
  payload: unknown;
  /** AI 依据（缺省给默认一句话） */
  reason?: string;
}

/** 入库记录（带 aiCreate 标记字段） */
export interface StoredAiRecord {
  id: string;
  kind: ReviewKind;
  title: string;
  payload: unknown;
  /** AI 创建标记（区分人工创建的资产） */
  aiCreate: boolean;
  created_at: string;
}

/** 入库存储抽象（当前内存实现，后续可换持久化） */
export interface ReviewStore {
  append(record: StoredAiRecord): void;
  get(id: string): StoredAiRecord | undefined;
  list(): StoredAiRecord[];
  readonly size: number;
}

/** 内存 store（模式参考 coverage/store.ts：追加 + 只读查询） */
export class InMemoryReviewStore implements ReviewStore {
  private readonly records: StoredAiRecord[] = [];

  append(record: StoredAiRecord): void {
    this.records.push(record);
  }

  get(id: string): StoredAiRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  list(): StoredAiRecord[] {
    return [...this.records];
  }

  get size(): number {
    return this.records.length;
  }
}

/** confirm 返回：成功条数 + 跳过条数 + 逐条跳过原因 */
export interface CommitResult {
  committed: number;
  skipped: number;
  skipped_reasons: Array<{ id: string; reason: string }>;
  /** 本次成功入库的记录 */
  records: StoredAiRecord[];
}

/** 卡片内部状态（checked 之外的人审生命周期） */
type CardState = 'open' | 'committed' | 'rejected';

/** 单张卡片构造（assistant 生成候选的入口；buildCandidates 复用同一默认值逻辑） */
export function makeCandidate(input: ReviewInput): ReviewCandidate {
  return {
    id: randomUUID(),
    kind: input.kind,
    title: input.title,
    payload: input.payload,
    checked: true,
    reason: input.reason ?? 'AI 生成，依据见生成说明，待人工审阅',
    source: 'ai',
  };
}

/**
 * 勾选人审管线：一次 buildCandidates 为一批，confirm / reject / confirmAll
 * 在这批卡片上闭环；重复 confirm 同一 id 会被跳过（幂等）。
 */
export class ReviewPipeline {
  private readonly cards = new Map<string, { candidate: ReviewCandidate; state: CardState }>();

  constructor(private readonly store: ReviewStore = new InMemoryReviewStore()) {}

  /** 生成结果 → 候选卡片数组（默认全选 + AI 依据；追加进本批，不覆盖旧批） */
  buildCandidates(inputs: readonly ReviewInput[]): ReviewCandidate[] {
    const created = inputs.map(makeCandidate);
    for (const candidate of created) this.cards.set(candidate.id, { candidate, state: 'open' });
    return created;
  }

  /** 收编已构造好的候选卡片（assistant 已带 id 的产出直接进管线，不换 id） */
  adopt(candidates: readonly ReviewCandidate[]): ReviewCandidate[] {
    for (const candidate of candidates) {
      if (!this.cards.has(candidate.id)) this.cards.set(candidate.id, { candidate, state: 'open' });
    }
    return [...candidates];
  }

  /** 当前全部卡片（含已入库 / 已拒绝，状态见内部记录） */
  list(): ReviewCandidate[] {
    return [...this.cards.values()].map((c) => c.candidate);
  }

  /** 勾选 / 取消勾选（UI checkbox 双向同步用） */
  setChecked(ids: readonly string[], checked: boolean): void {
    for (const id of ids) {
      const card = this.cards.get(id);
      if (card) card.candidate.checked = checked;
    }
  }

  /** 拒绝：卡片移出可入库集合（已入库的不可拒绝，返回被拒条数） */
  reject(ids: readonly string[]): number {
    let rejected = 0;
    for (const id of ids) {
      const card = this.cards.get(id);
      if (!card || card.state !== 'open') continue;
      card.state = 'rejected';
      card.candidate.checked = false;
      rejected += 1;
    }
    return rejected;
  }

  /**
   * 确认入库：只入「存在 + 仍勾选 + 未拒绝 + 未入库」的 id。
   * 重复提交同一 id → 跳过（原因：已入库）。
   */
  confirm(ids: readonly string[]): CommitResult {
    const now = new Date().toISOString();
    const records: StoredAiRecord[] = [];
    const skipped_reasons: Array<{ id: string; reason: string }> = [];

    for (const id of ids) {
      const card = this.cards.get(id);
      if (!card) {
        skipped_reasons.push({ id, reason: '候选不存在（可能来自其它批次）' });
        continue;
      }
      if (card.state === 'committed') {
        skipped_reasons.push({ id, reason: '已入库，重复提交跳过' });
        continue;
      }
      if (card.state === 'rejected') {
        skipped_reasons.push({ id, reason: '已被人工拒绝' });
        continue;
      }
      if (!card.candidate.checked) {
        skipped_reasons.push({ id, reason: '未勾选' });
        continue;
      }
      const record: StoredAiRecord = {
        id,
        kind: card.candidate.kind,
        title: card.candidate.title,
        payload: card.candidate.payload,
        aiCreate: true,
        created_at: now,
      };
      this.store.append(record);
      card.state = 'committed';
      records.push(record);
    }

    return { committed: records.length, skipped: skipped_reasons.length, skipped_reasons, records };
  }

  /** 全部确认：当前仍勾选且未定案的卡片一次入库 */
  confirmAll(): CommitResult {
    return this.confirm(
      [...this.cards.values()]
        .filter((c) => c.state === 'open' && c.candidate.checked)
        .map((c) => c.candidate.id),
    );
  }

  /** 已入库记录数（透传 store） */
  get committedCount(): number {
    return this.store.size;
  }

  /** 已入库记录（只读快照） */
  storedRecords(): StoredAiRecord[] {
    return this.store.list();
  }

  /** 便捷断言用：payload 为 TestCase 的入库记录 */
  listCaseRecords(): Array<StoredAiRecord & { payload: TestCase }> {
    return this.store.list().filter((r) => r.kind === 'case') as Array<StoredAiRecord & { payload: TestCase }>;
  }
}
