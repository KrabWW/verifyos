import { Controller, Get, Param } from '@nestjs/common';
import { ExploreService } from './explore/explore.service';

/**
 * G15：移动测试详情页数据源。
 * - GET /api/mobile/runs/:id/outputs → output_value 表（Agent 显式保存的 Output Values，按 run short_id 关联）
 * - GET /api/mobile/runs/:id/meta    → 设备信息（run.output.device / target.platform）+ Classification + 最近 5 次同 VER Run
 */
@Controller('api/mobile')
export class MobileController {
  constructor(private readonly exploreSvc: ExploreService) {}

  @Get('runs/:id/outputs')
  async outputs(@Param('id') id: string) {
    try {
      await this.exploreSvc.ensureReady();
      const run = await this.exploreSvc.pg.query(`SELECT id FROM run WHERE short_id = $1 LIMIT 1`, [id]);
      if (run.rows.length === 0) return { found: false, items: [] };
      const r = await this.exploreSvc.pg.query(
        `SELECT key, value, created_at FROM output_value WHERE run_id = $1 ORDER BY id`,
        [run.rows[0].id],
      );
      return { found: true, items: r.rows };
    } catch {
      return { found: false, items: [] };
    }
  }

  @Get('runs/:id/meta')
  async meta(@Param('id') id: string) {
    try {
      await this.exploreSvc.ensureReady();
      const run = await this.exploreSvc.pg.query(
        `SELECT id, verification_id, target, output FROM run WHERE short_id = $1 LIMIT 1`,
        [id],
      );
      if (run.rows.length === 0) return { found: false };
      const row = run.rows[0] as { id: number; verification_id: number | null; target: Record<string, unknown> | null; output: Record<string, unknown> | null };
      const output = row.output ?? {};
      const target = row.target ?? {};

      // 最近 5 次同 VER Run（verification_id 相同；无 VER 的 run 没有可比对象）
      let recentRuns: Array<{ runId: string; verdict: string | null; createdAt: string | Date }> = [];
      if (row.verification_id) {
        const r = await this.exploreSvc.pg.query(
          `SELECT short_id, verdict, created_at FROM run
           WHERE verification_id = $1 AND short_id <> $2
           ORDER BY id DESC LIMIT 5`,
          [row.verification_id, id],
        );
        recentRuns = (r.rows as Array<{ short_id: string; verdict: string | null; created_at: string | Date }>).map((x) => ({
          runId: x.short_id,
          verdict: x.verdict,
          createdAt: x.created_at,
        }));
      }
      return {
        found: true,
        device: output.device ?? null,
        platform: target.platform ?? 'web',
        ua: output.ua ?? null,
        // Classification：run 表暂无分类字段（triage 侧数据未回写 run）——诚实返回 null
        classification: (output.classification as string | undefined) ?? null,
        recentRuns,
      };
    } catch {
      return { found: false };
    }
  }
}
