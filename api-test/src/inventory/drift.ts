/**
 * 漂移检测：对比两次 spec 导入的 operation 集合，标出 API 的增 / 删 / 改。
 *
 * 判据：
 * - 主键 = method + normalized_path（新增 / 删除）；
 * - 签名哈希不同但主键相同 → 「改」，并列出变化字段；
 * - 签名相同 → 未变化。
 */
import type { OpenApiOperation } from './openapi.js';
import { keyOf } from './normalize.js';

/** 一个「改」的条目：新 operation + 旧 operation + 变化字段 */
export interface ChangedOperation {
  operation: OpenApiOperation;
  old: OpenApiOperation;
  changed_fields: string[];
}

/** 漂移检测结果 */
export interface DriftReport {
  added: OpenApiOperation[];
  removed: OpenApiOperation[];
  changed: ChangedOperation[];
  unchanged_count: number;
}

/** 生成 operation 的稳定签名（判定「改」的判据） */
export function operationSignature(op: OpenApiOperation): string {
  const params = op.parameters
    .map((p) => `${p.in}:${p.name}:${p.required ? '1' : '0'}`)
    .sort()
    .join(',');
  const codes = op.responses
    .map((r) => r.status_code)
    .sort((a, b) => a - b)
    .join(',');
  const body = op.request_body ? `${op.request_body.content_type ?? ''}` : '';
  return `${op.method} ${op.normalized_path} | params[${params}] | responses[${codes}] | body[${body}]`;
}

/** 列出两个 operation 的具体变化字段（summary/operation_id/参数/响应码/请求体） */
export function diffOperationFields(oldOp: OpenApiOperation, newOp: OpenApiOperation): string[] {
  const changed: string[] = [];
  if (oldOp.summary !== newOp.summary) changed.push('summary');
  if (oldOp.operation_id !== newOp.operation_id) changed.push('operation_id');

  const oldParams = oldOp.parameters
    .map((p) => `${p.in}:${p.name}:${p.required ? '1' : '0'}`)
    .sort()
    .join(',');
  const newParams = newOp.parameters
    .map((p) => `${p.in}:${p.name}:${p.required ? '1' : '0'}`)
    .sort()
    .join(',');
  if (oldParams !== newParams) changed.push('parameters');

  const oldCodes = oldOp.responses.map((r) => r.status_code).sort((a, b) => a - b).join(',');
  const newCodes = newOp.responses.map((r) => r.status_code).sort((a, b) => a - b).join(',');
  if (oldCodes !== newCodes) changed.push('responses');

  if ((oldOp.request_body?.content_type ?? '') !== (newOp.request_body?.content_type ?? '')) {
    changed.push('request_body');
  }
  return changed;
}

/** 对比两次导入的 operation 集合 */
export function detectDrift(oldOps: OpenApiOperation[], newOps: OpenApiOperation[]): DriftReport {
  const oldMap = new Map(oldOps.map((op) => [keyOf(op.method, op.normalized_path), op]));
  const newMap = new Map(newOps.map((op) => [keyOf(op.method, op.normalized_path), op]));

  const added: OpenApiOperation[] = [];
  const removed: OpenApiOperation[] = [];
  const changed: ChangedOperation[] = [];
  let unchangedCount = 0;

  for (const [key, op] of newMap) {
    const old = oldMap.get(key);
    if (!old) {
      added.push(op);
    } else if (operationSignature(op) !== operationSignature(old)) {
      changed.push({ operation: op, old, changed_fields: diffOperationFields(old, op) });
    } else {
      unchangedCount++;
    }
  }

  for (const [key, op] of oldMap) {
    if (!newMap.has(key)) removed.push(op);
  }

  return { added, removed, changed, unchanged_count: unchangedCount };
}
