/**
 * 环境变量管理（A8）：多环境（baseURL / token 等）定义、存储、切换。
 *
 * EnvironmentStore 提供内存级的环境增删查；跑场景时从 store 取某个环境，
 * 其 base_url + vars 作为变量上下文的「最低优先级」基础。
 */
import type { Environment } from './types.js';

/** 环境存储：按 name 索引，支持多环境切换 */
export class EnvironmentStore {
  private readonly envs = new Map<string, Environment>();

  /** 添加或覆盖一个环境 */
  add(env: Environment): void {
    this.envs.set(env.name, env);
  }

  /** 按名字取环境；不存在返回 undefined */
  get(name: string): Environment | undefined {
    return this.envs.get(name);
  }

  /** 列出全部环境 */
  list(): Environment[] {
    return [...this.envs.values()];
  }

  /** 环境数量 */
  get size(): number {
    return this.envs.size;
  }
}
