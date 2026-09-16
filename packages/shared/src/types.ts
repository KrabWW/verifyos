import { z } from 'zod';

/**
 * 领域类型（B1 数据模型的 TS 映射，PRD §2.2 对齐）
 * 层级：Org → Project → Application(web/mobile/api) → Environment(含 preview)
 * 依赖：Resume From（恰 1 个，6h 复用）/ Wait For（多个）+ Output Values / Clipboard
 */

export const ApplicationType = z.enum(['web', 'mobile', 'api']);
export type ApplicationType = z.infer<typeof ApplicationType>;

export const DependencyKind = z.enum(['resume_from', 'wait_for']);
export type DependencyKind = z.infer<typeof DependencyKind>;

/** 依赖边：链内串行、链间并行（隔离 BrowserContext） */
export const Dependency = z.object({
  verificationShortId: z.string(),
  dependsOnShortId: z.string(),
  kind: DependencyKind,
});
export type Dependency = z.infer<typeof Dependency>;

/** Resume From 状态复用窗口：6 小时（对齐 qa.tech 文档） */
export const RESUME_STATE_TTL_MS = 6 * 60 * 60 * 1000;

/** Browser State：cookies + localStorage + sessionStorage 的快照引用 */
export const BrowserStateRef = z.object({
  shortId: z.string(),
  name: z.string(),
  originRunId: z.string().optional(),
  capturedAt: z.string().datetime(),
  storageUri: z.string(),
  environmentShortId: z.string(),
});
export type BrowserStateRef = z.infer<typeof BrowserStateRef>;

export const QaPointStatus = z.enum([
  'discovered', 'selected', 'draft', 'generated', 'ready',
  'running', 'passed', 'failed', 'unknown', 'confirmed',
]);
export type QaPointStatus = z.infer<typeof QaPointStatus>;

export const QaPoint = z.object({
  shortId: z.string(),
  title: z.string(),
  category: z.string().optional(),
  risk: z.enum(['high', 'medium', 'low']).optional(),
  status: QaPointStatus.default('discovered'),
  confidence: z.number().min(0).max(1).optional(),
  source: z
    .object({
      requirementRef: z.string().optional(),
      figmaRef: z.string().optional(),
      explorationId: z.string().optional(),
    })
    .optional(),
});
export type QaPoint = z.infer<typeof QaPoint>;

/** ToolRegistry 工具定义（PRD §8.4） */
export const ToolPermission = z.enum(['auto', 'ask', 'forbidden']);
export type ToolPermission = z.infer<typeof ToolPermission>;

export const ToolSpec = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  permission: ToolPermission,
});
export type ToolSpec = z.infer<typeof ToolSpec>;

/** 内置工具清单（第一版，权限档位见 PRD §8.4） */
export const BUILTIN_TOOLS: ToolSpec[] = [
  { name: 'browser', description: 'Stagehand act / observe / extract（Web 执行主路 · 缓存 + 自愈）', inputSchema: {}, permission: 'auto' },
  { name: 'http', description: 'API 调用 / 接口断言', inputSchema: {}, permission: 'auto' },
  { name: 'db.query', description: '数据库查询（只读账号 · LIMIT 强制 · 超时 5s · 入证据）', inputSchema: {}, permission: 'auto' },
  { name: 'db.exec', description: '数据库写入（测试数据准备 / 清理）', inputSchema: {}, permission: 'ask' },
  { name: 'code.view', description: '代码查看（GitLab API · 按文件 / 行号）', inputSchema: {}, permission: 'auto' },
  { name: 'vision', description: '视觉模型兜底（DOM 不可描述时）', inputSchema: {}, permission: 'ask' },
  { name: 'evidence', description: '证据采集归档（MinIO · 90 天保留）', inputSchema: {}, permission: 'auto' },
  { name: 'report', description: '报告与 MR 评论回写', inputSchema: {}, permission: 'auto' },
];
