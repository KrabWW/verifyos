import {
  Controller, Get, Post, Param, Query, BadRequestException, HttpException, HttpStatus,
} from '@nestjs/common';
import { ExploreService } from './explore/explore.service';
import * as fs from 'fs';
import * as path from 'path';

/**
 * F11: MR 列表 + Review 详情（对齐原型 s-pr 双态）。
 * 数据三来源（诚实标注）：
 *  1. seed——原型 !128 等演示数据（review.jsonb 完整三段式），表空时自动种入；
 *  2. webhook——POST /api/webhooks/gitlab 重放时 upsert（webhooks.controller 挂钩）；
 *  3. writeback——GitLab token 就绪前的 stub：状态翻转 + 评论落盘 out/mr-comments/ + 审计留痕。
 */
interface MrReviewArea { title: string; severity: 'info' | 'high' | 'red'; related?: string | null; hint: string; action?: 'gen-qa' | 'link-qa' | null; qaId?: string }
interface MrReviewTest { title: string; status: 'pass' | 'unknown' | 'fail'; source: string; durationSec: number; tag?: string }
interface MrReview { verdict: 'pass' | 'unknown' | 'fail'; summary: string; checkedAt: string; areas: MrReviewArea[]; tests: MrReviewTest[]; bot: string }

@Controller('api/mrs')
export class MrsController {
  constructor(private readonly exploreSvc: ExploreService) {}

  private get pg() { return this.exploreSvc.pg; }

  /** 数字 iid 参数统一防护（J01 任务2）：NaN → 400 */
  private numericIid(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new BadRequestException('invalid id');
    return n;
  }

  /** 原型种子（review 文案 = 原型 s-pr 详情态原文；表空自动种入） */
  private static readonly SEED: Array<Record<string, unknown>> = [
    {
      iid: 128, title: 'fix: 退款回调金额计算', state: 'opened', author: '张伟', repo: 'order-api',
      source_branch: 'fix/refund-callback', additions: 42, deletions: 8,
      review: {
        verdict: 'unknown',
        checkedAt: '5 分钟前 · Auto-triggered when deployment was ready',
        summary: '对本 PR 的改动（refund/callback.ts +42 −8）动态生成并执行了 9 项验证，8 项通过：金额计算分支的边界值（0、负数、超过实付）全部覆盖并通过；回调持久化与订单状态流转回归正常。「重复退款幂等拦截」步骤全绿但未触达本次修改的回调分支 —— 按 UNKNOWN 处理，不允许假绿。动态探索额外发现 2 个与本 PR 相关的问题，详见下方改进区。',
        areas: [
          { title: 'HTTP request failed', severity: 'info', related: null, hint: 'Vercel preview 反馈脚本加载失败。Third-party, unrelated to this PR.', action: null },
          { title: '金额为 0 时仍可提交退款', severity: 'high', related: '本 PR 相关', hint: '动态探索发现：金额下限未校验。建议补充 QA 点「退款金额必须 > 0」并禁用空金额提交。', action: 'gen-qa' },
          { title: '连点退款按钮出现两条回调日志', severity: 'high', related: '本 PR 直接相关', hint: '39ms 内两条 POST /refund/callback 持久化成功 —— 正是本次修改的持久化路径。建议后端加唯一约束，已关联 QA-1022。', action: 'link-qa', qaId: 'QA-1022' },
        ] as MrReviewArea[],
        tests: [
          { title: '退款金额等于实付可提交', status: 'pass', source: 'QA-1024 · 定向回归', durationSec: 38 },
          { title: '退款金额为 0 被拒绝', status: 'pass', source: 'QA-1031 · 变更生成', durationSec: 24, tag: '新增边界' },
          { title: '退款金额超过实付被拒绝', status: 'pass', source: 'QA-1024 · 定向回归', durationSec: 31 },
          { title: '回调成功写入退款记录', status: 'pass', source: 'QA-0996 · 定向回归', durationSec: 45 },
          { title: '重复退款幂等拦截', status: 'unknown', source: 'QA-1022 · 未触达修改分支 → UNKNOWN', durationSec: 38 },
          { title: '退款后订单状态流转', status: 'pass', source: 'QA-1019 · 定向回归', durationSec: 26 },
          { title: '登录（前置模块）', status: 'pass', source: 'Browser State 复用', durationSec: 12 },
          { title: '动态探索：连点退款按钮', status: 'pass', source: '探索 #1026', durationSec: 52, tag: '新发现' },
          { title: '动态探索：金额边界 fuzz', status: 'pass', source: '探索 #1026', durationSec: 47, tag: '新发现' },
        ] as MrReviewTest[],
        bot: '✓ 8 项通过 · ⚠ 1 项无法验证（未触达回调分支，按 UNKNOWN 处理）· 💡 2 个新发现（已附证据）。',
      } as MrReview,
    },
    { iid: 131, title: 'feat: 会员积分抵扣', state: 'opened', author: '李娜', repo: 'order-api', source_branch: 'feat/points-deduct', running: true },
    {
      iid: 127, title: 'refactor: 订单状态机重构', state: 'merged', author: '王强', repo: 'order-api',
      source_branch: 'refactor/order-state-machine', additions: 210, deletions: 96,
      review: {
        verdict: 'pass', checkedAt: '昨天', summary: '动态生成 14 项验证全部通过，状态机全路径回归无异常。',
        areas: [], bot: '✓ 14 项通过，可安全合并。',
        tests: [
          { title: '订单创建 → 待支付', status: 'pass', source: 'QA-0881 · 定向回归', durationSec: 21 },
          { title: '支付超时自动取消', status: 'pass', source: 'QA-0882 · 定向回归', durationSec: 33 },
          { title: '状态回退拒绝', status: 'pass', source: 'QA-0883 · 定向回归', durationSec: 19 },
        ] as MrReviewTest[],
      } as MrReview,
    },
    {
      iid: 119, title: 'feat: 深色模式开关', state: 'merged', author: '李娜', repo: 'order-web',
      source_branch: 'feat/dark-mode', additions: 64, deletions: 12,
      review: {
        verdict: 'pass', checkedAt: '3 天前', summary: '7 项验证通过；动态探索发现 2 个与主题切换无关的改进点。',
        areas: [
          { title: '对比度不足的次要文本', severity: 'high', related: null, hint: '深色模式下 placeholder 对比度 3.1:1（建议 4.5:1）。与本次改动无关，已记录。', action: 'gen-qa' },
        ] as MrReviewArea[],
        bot: '✓ 7 项通过 · 💡 2 个新发现（与本 PR 无关）。',
        tests: [
          { title: '深色模式切换持久化', status: 'pass', source: 'QA-0910 · 变更生成', durationSec: 18 },
          { title: '列表页深色渲染', status: 'pass', source: 'QA-0911 · 变更生成', durationSec: 22 },
        ] as MrReviewTest[],
      } as MrReview,
    },
    {
      iid: 112, title: 'fix: 员工编号唯一索引', state: 'merged', author: '张伟', repo: 'order-api',
      source_branch: 'fix/emp-unique-index', additions: 15, deletions: 3,
      review: {
        verdict: 'pass', checkedAt: '上周', summary: '5 项验证通过：重复编号创建被拒绝，存量数据迁移无冲突。',
        areas: [], bot: '✓ 5 项通过。',
        tests: [{ title: '重复编号创建被拒绝', status: 'pass', source: 'QA-0777 · 定向回归', durationSec: 17 }] as MrReviewTest[],
      } as MrReview,
    },
    { iid: 108, title: 'chore: 依赖升级', state: 'closed', author: '王强', repo: 'order-web', source_branch: 'chore/deps-upgrade' },
  ];

  /** 表空自动种入原型数据（幂等：仅 COUNT=0 时） */
  private async ensureSeed(): Promise<void> {
    const c = await this.pg.query(`SELECT COUNT(*)::int AS n FROM mr`);
    if ((c.rows[0] as { n: number }).n > 0) return;
    for (const m of MrsController.SEED) {
      await this.pg.query(
        `INSERT INTO mr(iid, title, state, author, repo, source_branch, target_branch, additions, deletions, running, review)
         VALUES ($1,$2,$3,$4,$5,$6,'main',$7,$8,$9,$10::jsonb)
         ON CONFLICT (iid) DO NOTHING`,
        [m.iid, m.title, m.state, m.author, m.repo, m.source_branch, m.additions ?? 0, m.deletions ?? 0, m.running ?? false, m.review ? JSON.stringify(m.review) : null],
      );
    }
    console.log('[mrs] seed 原型 MR 数据已种入（6 条）');
  }

  @Get()
  async list(@Query('state') state?: string) {
    await this.exploreSvc.ensureReady();
    await this.ensureSeed();
    const where = state && state !== 'all' ? `WHERE state = $1` : '';
    const vals = state && state !== 'all' ? [state] : [];
    const rows = await this.pg.query(
      `SELECT iid, title, state, author, repo, source_branch, target_branch, additions, deletions, running, review, created_at
       FROM mr ${where} ORDER BY iid DESC`, vals,
    );
    const stats = await this.pg.query(
      `SELECT state, COUNT(*)::int AS n FROM mr GROUP BY state`,
    );
    const statMap: Record<string, number> = {};
    for (const r of stats.rows as Array<{ state: string; n: number }>) statMap[r.state] = r.n;
    return {
      stats: {
        all: Object.values(statMap).reduce((a, b) => a + b, 0),
        opened: statMap.opened ?? 0,
        merged: statMap.merged ?? 0,
        closed: statMap.closed ?? 0,
      },
      items: rows.rows,
    };
  }

  @Get(':iid')
  async detail(@Param('iid') iid: string) {
    await this.exploreSvc.ensureReady();
    const r = await this.pg.query(`SELECT * FROM mr WHERE iid = $1 LIMIT 1`, [this.numericIid(iid)]);
    if (r.rows.length === 0) return { found: false };
    return { found: true, ...r.rows[0] };
  }

  /** 回写 MR 状态（GitLab token 就绪前 stub）：评论落盘 out/mr-comments/ + updated_at 翻转 + 审计留痕；不存在 → 404（body 兼容） */
  @Post(':iid/writeback')
  async writeback(@Param('iid') iid: string) {
    await this.exploreSvc.ensureReady();
    const mrIid = this.numericIid(iid);
    const r = await this.pg.query(`SELECT iid, title, review FROM mr WHERE iid = $1 LIMIT 1`, [mrIid]);
    // 业务失败 → 404（body 保持 {ok:false,reason} 兼容前端特判）
    if (r.rows.length === 0) throw new HttpException({ ok: false, reason: 'MR not found' }, HttpStatus.NOT_FOUND);
    const mr = r.rows[0] as { iid: number; title: string; review: MrReview | null };
    const verdictLabel = mr.review?.verdict === 'pass' ? '✓ 通过' : mr.review?.verdict === 'fail' ? '✗ 阻止合并' : '⚠ 警告（不阻止合并）';
    const body = [
      `## VerifyOS Review · MR !${mr.iid}`,
      ``,
      `**结果：${verdictLabel}**`,
      ``,
      mr.review?.bot ?? '（无 Review 数据）',
      ``,
      `<details><summary>TESTS RUN (${mr.review?.tests.length ?? 0})</summary>`,
      ...(mr.review?.tests ?? []).map((t) => `- ${t.status === 'pass' ? '✓' : t.status === 'unknown' ? '?' : '✗'} ${t.title}（${t.source} · ${t.durationSec}s）`),
      `</details>`,
      ``,
      `-- VerifyOS Bot（stub 回写：GitLab token 接入后自动发布到 MR Conversation）`,
    ].join('\n');
    const dir = path.resolve(process.cwd(), '../../out/mr-comments');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `mr-${mr.iid}-comment.md`);
    fs.writeFileSync(file, body, 'utf8');
    await this.pg.query(`UPDATE mr SET updated_at = now() WHERE iid = $1`, [mr.iid]);
    await this.pg.query(
      `INSERT INTO audit_log(actor, action, target, meta) VALUES ('verifyos-bot','mr.writeback',$1,$2::jsonb)`,
      [`MR !${mr.iid}`, JSON.stringify({ file, verdict: mr.review?.verdict ?? null })],
    );
    return { ok: true, file, verdictLabel, note: 'stub 回写：GitLab token 接入后经 API 发布到 MR Conversation' };
  }
}
