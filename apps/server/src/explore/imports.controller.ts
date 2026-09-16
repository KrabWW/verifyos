import { Controller, Get, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { LlmService } from '../llm/llm.service';
import { FigmaReader } from '../connectors/figma.reader';

@Controller('api')
export class ImportsController {
  constructor(
    private readonly exploreSvc: ExploreService,
    private readonly llm: LlmService,
    private readonly figma: FigmaReader,
  ) {}

  // ---------- F3: 需求导入（文本拆分 + 交叉验证；docx 解析/Figma/飞书连接器属 MCP 后续） ----------

  @Post('imports/parse')
  parseImport(@Body() body: { text?: string; name?: string }) {
    const text = (body?.text ?? '').trim();
    // 必填缺失 → 400（body 保持 {ok:false,reason} 兼容前端特判）
    if (!text) throw new HttpException({ ok: false, reason: '文本为空' }, HttpStatus.BAD_REQUEST);
    const { structured, matrix } = this.buildStructured(text);
    return {
      ok: true, name: body?.name ?? '粘贴文本', structured, matrix,
      note: '启发式拆分（关键词/行首标记 + 顺序归属功能域）；.docx 二进制解析属 MarkItDown 集成后续，LLM 深度拆分为增强项',
    };
  }

  /** 启发式拆分核心：文本 → {structured, matrix}（parse 与 figma 共用） */
  private buildStructured(text: string) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const ruleRe = /^(?:业务规则|规则|R\d+)/;
    const critRe = /^(?:验收|验收标准|AC\d+)/;
    const roleRe = /角色[:：]\s*(.+)/;
    const domainRe = /^(?:#|模块[:：]|功能域[:：])\s*(.+)/;
    const rules = lines.filter((l) => ruleRe.test(l) || /必须|不能|仅|只允许|应拒绝/.test(l));
    const criteria = lines.filter((l) => critRe.test(l));
    const domains = lines.map((l) => l.match(domainRe)?.[1]).filter(Boolean) as string[];
    // 角色行可能一行多角色（「管理员、普通用户」）——拆成独立角色名
    const roles = lines
      .map((l) => l.match(roleRe)?.[1])
      .filter(Boolean)
      .flatMap((s) => (s as string).split(/[、，,\/]/).map((r) => r.trim()).filter(Boolean));
    const stateLine = lines.find((l) => /状态机|状态流转/.test(l));

    // F3-matrix：顺序扫描——规则归属最近出现的功能域；规则文本提及角色名则计入该角色列，否则计「通用」
    const FALLBACK_DOMAIN = '（未分模块）';
    let curDomain = domains[0] ?? FALLBACK_DOMAIN;
    const domainRows: string[] = [];
    const roleCols = [...roles, '通用'];
    const cellMap = new Map<string, number>(); // `${domain}||${role}` -> count
    for (const l of lines) {
      const dm = l.match(domainRe)?.[1];
      if (dm) { curDomain = dm; continue; }
      if (!(ruleRe.test(l) || /必须|不能|仅|只允许|应拒绝/.test(l))) continue;
      if (!domainRows.includes(curDomain)) domainRows.push(curDomain);
      const mentioned = roles.filter((r) => l.includes(r));
      const cols = mentioned.length > 0 ? mentioned : ['通用'];
      for (const c of cols) {
        const k = `${curDomain}||${c}`;
        cellMap.set(k, (cellMap.get(k) ?? 0) + 1);
      }
    }
    const matrixDomains = domainRows.length > 0 ? domainRows : (rules.length > 0 ? [curDomain] : []);
    const matrix = {
      domains: matrixDomains,
      roles: roleCols,
      cells: matrixDomains.map((d) => roleCols.map((r) => cellMap.get(`${d}||${r}`) ?? 0)),
    };

    const structured = {
      domains: domains.length ? domains : ['（未识别到显式模块标记——按整段文本处理）'],
      roles: roles.length ? roles : ['（未识别到角色行）'],
      ruleCount: rules.length, criteriaCount: criteria.length,
      stateMachine: stateLine ?? '（未识别）',
      rules, criteria,
    };
    return { structured, matrix };
  }

  // ---------- T12：Figma 读连接器（真调 Figma REST API 拉 Frame/文本 → 需求导入输入源） ----------

  @Post('imports/figma')
  async importFigma(@Body() body: { fileKey?: string }) {
    const fileKey = (body?.fileKey ?? '').trim();
    if (!fileKey) throw new HttpException({ ok: false, reason: '缺少 fileKey' }, HttpStatus.BAD_REQUEST);

    const result = await this.figma.readFile(fileKey);
    // 连接失败等场景已优雅降级（ok:false + degraded:true），不抛错、诚实返回原因
    if (!result.ok) {
      return {
        ok: true, source: 'figma', degraded: true, reason: result.reason, fileKey,
        frames: [], components: [], textNodes: [], summary: '', structured: null,
        note: `Figma 连接降级：${result.reason}`,
      };
    }

    const { structured, matrix } = this.buildStructured(result.summary);
    return {
      ok: true, source: 'figma', degraded: false, fileKey,
      fileName: result.fileName,
      frames: result.frames,
      components: result.components,
      textNodes: result.textNodes,
      summary: result.summary,
      structured, matrix,
      note: `已从 Figma 拉取 ${result.frames.length} 个 Frame、${result.components.length} 个组件、${result.textNodes.length} 个文本节点`,
    };
  }

  // ---------- F3-ignore：忽略清单持久化（cross-check 过滤，重启不丢） ----------

  @Post('imports/ignore')
  async ignoreFinding(@Body() body: { fingerprint?: string; title?: string }) {
    const fp = (body?.fingerprint ?? body?.title ?? '').trim();
    // 必填缺失 → 400（body 保持 {ok:false,reason} 兼容前端特判）
    if (!fp) throw new HttpException({ ok: false, reason: '缺少 fingerprint' }, HttpStatus.BAD_REQUEST);
    await this.exploreSvc.ensureReady();
    await this.exploreSvc.pg.query(
      `INSERT INTO import_ignore(fingerprint, title) VALUES ($1, $2) ON CONFLICT (fingerprint) DO NOTHING`,
      [fp, body?.title ?? fp],
    );
    return { ok: true };
  }

  @Get('imports/ignores')
  async listIgnores() {
    await this.exploreSvc.ensureReady();
    const r = await this.exploreSvc.pg.query(`SELECT fingerprint, title, created_at FROM import_ignore ORDER BY id DESC LIMIT 100`);
    return { ok: true, items: r.rows };
  }

  @Post('imports/cross-check')
  async crossCheck(@Body() body: { rules?: string[]; useLLM?: boolean }) {
    await this.exploreSvc.ensureReady();
    const rules = body?.rules ?? [];
    // F3-ignore：已忽略疑点（fingerprint=标题）本轮直接过滤
    const ignoredRows = await this.exploreSvc.pg.query(`SELECT fingerprint FROM import_ignore`);
    const ignored = new Set((ignoredRows.rows as Array<{ fingerprint: string }>).map((r) => r.fingerprint));
    const nodes = await this.exploreSvc.pg.query(`SELECT ref, title FROM graph_node WHERE application_id = 1 AND type = 'page'`);
    const qas = await this.exploreSvc.pg.query(`SELECT title FROM qa_point`);
    const nodeList = nodes.rows as Array<{ ref: string; title: string | null }>;
    const graphText = nodeList.map((n) => `${n.title ?? ''} ${n.ref}`).join('\n');
    const qaText = (qas.rows as Array<{ title: string }>).map((q) => q.title).join('\n');
    const keywords = ['删除', '导出', '导入', '批量', '审核', '驳回', '导出 Excel', '修改密码'];
    // F3-ignore：fp = 稳定指纹（标题 + 关键词），同类不同关键词的疑点可独立忽略
    const findings: Array<{ level: 'red' | 'amber' | 'yellow'; title: string; detail: string; fp: string }> = [];
    const rulesText = rules.join('\n');
    for (const r of rules) {
      const kw = keywords.find((k) => r.includes(k));
      if (!kw) continue;
      const inGraph = graphText.includes(kw);
      const inQa = qaText.includes(kw);
      if (!inGraph && !inQa) findings.push({ level: 'amber', title: 'Specification Gap · 需求有 · 系统未见', detail: `需求规则「${r.slice(0, 60)}」涉及「${kw}」——探索图与 QA 点库均未覆盖（可能未探索到或确属缺口）。`, fp: `Specification Gap::${kw}` });
      else if (!inQa) findings.push({ level: 'yellow', title: 'Undocumented · 图有 · QA 点缺', detail: `「${kw}」在系统图中存在但无对应 QA 点——建议补充验证「${r.slice(0, 40)}」。`, fp: `Undocumented::${kw}` });
    }
    // G16 档 4：Undocumented Behavior（图有 · 需求无）——原型承载了能力但需求只字未提
    for (const kw of keywords) {
      if (!graphText.includes(kw) || rulesText.includes(kw)) continue;
      const hit = nodeList.find((n) => `${n.title ?? ''} ${n.ref}`.includes(kw));
      findings.push({ level: 'yellow', title: 'Undocumented Behavior · 原型有 · 需求无', detail: `探索图节点「${hit?.title ?? hit?.ref ?? kw}」（${hit?.ref ?? '—'}）承载「${kw}」能力，但需求规则文本均未提及——实现超出需求声明，建议与产品对齐（是隐含约定还是过度实现）。`, fp: `Undocumented Behavior::${kw}` });
    }
    // G16 档 5：缺失需求推导（AI Test Design）——LLM 从规则推导未覆盖边界用例
    let llmUsed = false;
    let llmError = '';
    if (body?.useLLM && rules.length > 0) {
      try {
        const prompt = `你是资深测试设计师。以下是某产品的需求业务规则列表：\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n请推导 1-3 条规则未覆盖的边界用例（例如空输入、并发、极端数量、权限交叉等），严格输出 JSON 数组（不要多余文字）：[{"title":"用例名（10字内）","rationale":"为什么这是规则未覆盖的边界（40字内）"}]`;
        const raw = await this.llm.chat([{ role: 'user', content: prompt }]);
        const m = raw.match(/\[[\s\S]*\]/);
        const cases = m ? (JSON.parse(m[0]) as Array<{ title?: string; rationale?: string }>) : [];
        for (const c of cases.slice(0, 3)) {
          if (!c?.title) continue;
          findings.push({ level: 'amber', title: `缺失需求推导 · AI Test Design · ${c.title}`, detail: `LLM 从现有 ${rules.length} 条规则推导出未覆盖边界用例「${c.title}」：${c.rationale ?? '—'}（需求文本未声明该边界的行为——建议补规则或补 QA 点）。`, fp: `AI Test Design::${c.title}` });
        }
        llmUsed = true;
      } catch (e) {
        llmError = e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120);
      }
    }
    const visible = findings.filter((f) => !ignored.has(f.fp) && !ignored.has(f.title));
    return { ok: true, findings: visible.slice(0, 10), ignoredCount: findings.length - visible.length, llmUsed, llmError, note: '关键词级启发式匹配 + 图有需求无反查 + 可选 LLM 边界推导；三方语义交叉（需求×原型×运行系统）的深度增强属后续' };
  }
}
