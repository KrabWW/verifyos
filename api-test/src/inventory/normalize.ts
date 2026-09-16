/**
 * 路径规范化工具。
 *
 * inventory 的统一路径约定（见 models.ts）：动态段用 `:param` 占位，例如 `/users/:id`。
 * 两种来源的路径写法不同，统一在此归一：
 * - spec 路径：OpenAPI 用 `{id}` 表示动态段；
 * - 流量路径：真实请求里是具体值（数字 / UUID / 长 hex），需要启发式还原成占位段。
 */
import type { HttpMethod } from '../types/models.js';

/** OpenAPI 规范路径 `{id}` → `:id` */
export function normalizeSpecPath(path: string): string {
  return path.replace(/\{([^{}]+)\}/g, (_match, name: string) => `:${name}`);
}

/** 判断某个路径段是否「明显是动态值」：纯数字 / UUID / 长 hex（mongodb oid 等） */
function isDynamicSegment(segment: string): boolean {
  if (segment === '') return false;
  if (/^\d+$/.test(segment)) return true;
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(segment)) return true;
  if (/^[0-9a-fA-F]{16,}$/.test(segment)) return true;
  return false;
}

/** 流量路径规范化：把动态值段替换为 `:id`，其余段保持不变 */
export function normalizeTrafficPath(path: string): string {
  return path
    .split('/')
    .map((segment, index) => (index === 0 ? segment : isDynamicSegment(segment) ? ':id' : segment))
    .join('/');
}

/** inventory 主键：method（大写）+ 规范化 path，作为「同一个 API」的判据 */
export function keyOf(method: HttpMethod, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}
