import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { CredentialCrypto } from '@verifyos/agent-core';
import { ExploreService } from '../explore/explore.service';

/**
 * Figma 连接器（T12）：真调 Figma REST API 拉文档树（Frame/Component/文本），
 * 作为需求导入的输入源（替代 ImportView 里的「凭据未配置」说明卡占位）。
 * 凭证读取顺序：env FIGMA_TOKEN → 凭据库（role = figma，payload_enc 解密后取 token）。
 */

export interface FigmaFrame {
  id: string;
  name: string;
  type: string;
  /** 该 Frame 下（含嵌套组件内）的文本节点字符 */
  text: string[];
  /** 该 Frame 下的组件名 */
  components: string[];
}

export interface FigmaReadResult {
  ok: boolean;
  fileKey: string;
  fileName: string;
  /** 连接失败时优雅降级（非报错） */
  degraded: boolean;
  reason?: string;
  frames: FigmaFrame[];
  components: string[];
  textNodes: string[];
  /** 组装好的可解析文本摘要（模块：Frame 名 + 文本行），可直接进 imports/parse 拆分 */
  summary: string;
}

/** Figma REST 文档树节点（仅取用到的字段） */
interface FigmaNode {
  id?: string;
  name?: string;
  type?: string;
  characters?: string;
  children?: FigmaNode[];
}

/** 视为「模块/Frame」的节点类型（SECTION 等价画板分组） */
const FRAME_TYPES = new Set(['FRAME', 'SECTION']);

@Injectable()
export class FigmaReader {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly crypto: CredentialCrypto,
  ) {}

  /** 读取 token：env 优先，凭据库 role=figma 兜底 */
  private async readToken(): Promise<string> {
    const env = (process.env.FIGMA_TOKEN ?? '').trim();
    if (env) return env;
    try {
      await this.exploreSvc.ensureReady();
      const r = await this.exploreSvc.pg.query(
        `SELECT payload_enc FROM credential WHERE role = $1 ORDER BY created_at DESC LIMIT 1`,
        ['figma'],
      );
      if (r.rows.length > 0) {
        const vals = JSON.parse(this.crypto.decrypt(r.rows[0].payload_enc as string)) as Record<string, string>;
        const t = (vals.token ?? vals.figmaToken ?? vals.accessToken ?? '').trim();
        if (t) return t;
      }
    } catch (err) {
      console.log('[figma] 凭据库读取失败（继续用 env 兜底）：', err instanceof Error ? err.message : err);
    }
    return '';
  }

  /** 拉取并解析 Figma 文件；token 缺失抛诚实错误，连接失败优雅降级返回 degraded */
  async readFile(fileKey: string): Promise<FigmaReadResult> {
    const key = (fileKey ?? '').trim();
    if (!key) throw new HttpException({ ok: false, reason: '缺少 fileKey' }, HttpStatus.BAD_REQUEST);

    const token = await this.readToken();
    if (!token) {
      throw new HttpException(
        { ok: false, reason: '未配置 FIGMA_TOKEN（需 Figma Personal Access Token，或凭据库 role=figma 存 token）' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const base = (process.env.FIGMA_API_BASE ?? 'https://api.figma.com').replace(/\/+$/, '');
    const endpoint = `${base}/v1/files/${encodeURIComponent(key)}`;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'GET',
        headers: { 'X-Figma-Token': token },
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[figma] 请求异常：', msg);
      return this.degraded(key, `连接 Figma API 失败（${msg}）`);
    }

    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`[figma] Figma API 返回 HTTP ${res.status}：`, text);
      if (res.status === 401 || res.status === 403) {
        throw new HttpException(
          { ok: false, reason: `FIGMA_TOKEN 无权限或已失效（Figma API 返回 ${res.status}）` },
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (res.status === 404) {
        throw new HttpException(
          { ok: false, reason: 'Figma 文件不存在或无权访问（fileKey 无效）' },
          HttpStatus.NOT_FOUND,
        );
      }
      return this.degraded(key, `Figma API 返回 HTTP ${res.status}`);
    }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json) return this.degraded(key, 'Figma API 返回空响应');
    return this.extract(key, json);
  }

  /** 遍历文档树，抽取 Frame/组件/文本，并组装可解析摘要 */
  private extract(fileKey: string, json: Record<string, unknown>): FigmaReadResult {
    const fileName = typeof json.name === 'string' && json.name ? json.name : fileKey;
    const frames: FigmaFrame[] = [];
    const components: string[] = [];
    const textNodes: string[] = [];
    const ungrouped: string[] = [];

    const walk = (node: FigmaNode | undefined, current: FigmaFrame | null): FigmaFrame | null => {
      if (!node) return current;
      const type = node.type ?? '';
      const name = node.name ?? '';
      let frame = current;
      if (FRAME_TYPES.has(type)) {
        frame = { id: node.id ?? '', name, type, text: [], components: [] };
        frames.push(frame);
      }
      if (type === 'COMPONENT' || type === 'COMPONENT_SET') {
        components.push(name);
        if (frame) frame.components.push(name);
      }
      if (type === 'TEXT' && (node.characters ?? '').trim()) {
        const chars = node.characters as string;
        textNodes.push(chars);
        if (frame) frame.text.push(chars);
        else ungrouped.push(chars);
      }
      for (const child of node.children ?? []) walk(child, frame);
      return current;
    };
    walk(json.document as FigmaNode | undefined, null);

    // 不在任何 Frame 下的孤立文本兜底归入「（未分组）」
    if (ungrouped.length > 0) {
      frames.push({ id: '', name: '（未分组）', type: 'TEXT', text: ungrouped, components: [] });
    }

    const summary = frames
      .map((f) => {
        const lines: string[] = [`模块：${f.name}`];
        if (f.components.length > 0) lines.push(...f.components.map((c) => `组件：${c}`));
        lines.push(...f.text);
        return lines.join('\n');
      })
      .join('\n');

    return {
      ok: true,
      fileKey,
      fileName,
      degraded: false,
      frames,
      components,
      textNodes,
      summary,
    };
  }

  private degraded(fileKey: string, reason: string): FigmaReadResult {
    return {
      ok: false,
      fileKey,
      fileName: '',
      degraded: true,
      reason,
      frames: [],
      components: [],
      textNodes: [],
      summary: '',
    };
  }
}
