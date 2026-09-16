import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  BadRequestException, NotFoundException, HttpException, HttpStatus,
} from '@nestjs/common';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from './explore.service';

@Controller('api')
export class CredentialsController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  /** 数字 id 参数统一防护（J01 任务2）：NaN → 400 */
  private numericId(raw: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new BadRequestException('invalid id');
    return n;
  }

  // ---------- 凭据管理（B3 引擎 + 管理界面数据源） ----------
  @Get('credentials')
  async listCredentials(@Query('projectId') projectId?: string) {
    await this.exploreSvc.ensureReady();
    const raw = (projectId ?? '').trim();
    const pid = raw === '' ? 1 : this.numericId(raw);
    const r = await this.exploreSvc.pg.query(
      `SELECT id, short_id, name, role, type, created_at
       FROM credential WHERE project_id = $1 ORDER BY created_at DESC`,
      [pid],
    );
    return { items: r.rows };
  }

  @Post('credentials')
  async addCredential(@Body() body: {
    name: string; role: string; kind?: string;
    username: string; password: string; projectId?: number;
  }) {
    await this.exploreSvc.ensureReady();
    // 必填缺失 → 400（而非 PG NOT NULL 裸 500）
    if (!body?.name || !String(body.name).trim()) throw new BadRequestException('name required');
    const payloadEnc = this.crypto.encrypt(JSON.stringify({
      username: body.username, password: body.password,
    }));
    const shortId = `cred_${Math.random().toString(36).slice(2, 8)}`;
    const r = await this.exploreSvc.pg.query(
      `INSERT INTO credential(short_id, project_id, name, role, type, payload_enc)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [shortId, Number(body?.projectId ?? 1), body.name, body.role ?? '管理员', body.kind ?? 'form', payloadEnc],
    );
    return { id: r.rows[0].id };
  }

  /** 编辑/轮换：更新加密值并打轮换时间戳（rotated_at）；不存在 → 404（0 行更新不再假成功） */
  @Put('credentials/:id')
  async updCredential(
    @Param('id') id: string,
    @Body() body: { name?: string; role?: string; username?: string; password?: string },
  ) {
    await this.exploreSvc.ensureReady();
    const credId = this.numericId(id);
    const exists = await this.exploreSvc.pg.query(`SELECT id FROM credential WHERE id = $1`, [credId]);
    if (exists.rows.length === 0) throw new NotFoundException('not found');
    const sets: string[] = [];
    const vals: unknown[] = [credId];
    if (body?.name) { sets.push(`name = $${vals.length + 1}`); vals.push(body.name); }
    if (body?.role) { sets.push(`role = $${vals.length + 1}`); vals.push(body.role); }
    if (body?.username || body?.password) {
      const cur = await this.exploreSvc.pg.query(`SELECT payload_enc FROM credential WHERE id = $1`, [credId]);
      const curVals = cur.rows.length > 0
        ? (JSON.parse(this.crypto.decrypt(cur.rows[0].payload_enc as string)) as Record<string, string>)
        : {};
      const merged = { username: body.username ?? curVals.username, password: body.password ?? curVals.password };
      sets.push(`payload_enc = $${vals.length + 1}`);
      vals.push(this.crypto.encrypt(JSON.stringify(merged)));
      sets.push(`rotated_at = now()`);
    }
    if (sets.length === 0) return { ok: false, reason: 'no fields to update' };
    await this.exploreSvc.pg.query(`UPDATE credential SET ${sets.join(', ')} WHERE id = $1`, vals);
    return { ok: true, rotated: !!(body?.username || body?.password) };
  }

  @Delete('credentials/:id')
  async delCredential(@Param('id') id: string) {
    await this.exploreSvc.ensureReady();
    const credId = this.numericId(id);
    const r = await this.exploreSvc.pg.query(`DELETE FROM credential WHERE id = $1 RETURNING id`, [credId]);
    // 0 行删除 → 404（不再假成功）
    if (r.rows.length === 0) throw new NotFoundException('not found');
    return { ok: true };
  }
}
