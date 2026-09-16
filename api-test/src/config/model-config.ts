/**
 * P2.7 模型双层配置（对标 MeterSphere #28 的思路：平台预设 + 用户自带 key）。
 *
 * 设计说明（双层）：
 * - 第一层「平台预设」：内置四家 provider（智谱 / DeepSeek / OpenAI 兼容 / 本地 Ollama），
 *   只带 base_url + 推荐模型，api_key 永远留空，见 presets.ts；
 * - 第二层「用户层」：用户为某个预设 id 补 key / 换模型，或创建全新自定义 provider，
 *   持久化到 `.verifyos/model-config.json`（同 id 字段级覆盖，用户优先）。
 *
 * api_key 脱敏纪律：
 * - 本模块所有对外返回的结构（listProviders / loadModelConfig 的 provider 条目）
 *   只携带 masked_api_key 与 has_api_key 标记，不携带明文；
 * - 明文 key 只有一个出口：getActiveLlmConfig() 返回给 AI 调用层的 LlmConfig；
 * - 持久化文件本身必须存明文（否则无法用于真实调用），写入时收紧权限为 0600。
 *
 * 与 src/ai/ 的边界：本模块只产出 `LlmConfig` 同形结构体（base_url/api_key/model），
 * 不 import、不感知 ai 层实现，由主 agent 统一接线。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDER_PRESETS } from './presets.js';

/** AI 调用层所需的最小连接配置（与 src/ai/ 的 LlmConfig 同形，纯结构体） */
export interface LlmConfig {
  base_url: string;
  api_key: string;
  model: string;
}

/** 平台预设条目（第一层，api_key 恒为空） */
export interface ProviderPreset {
  id: string;
  name: string;
  base_url: string;
  model: string;
  description: string;
  /** 本地服务（如 Ollama）：无需 api_key 即视为 ready */
  local?: boolean;
}

/** 用户层 provider 覆盖（第二层，全部可选：给哪个字段就覆盖哪个） */
export interface UserProviderConfig {
  /** 自定义 provider 的显示名（覆盖预设时无效） */
  name?: string;
  base_url?: string;
  model?: string;
  /** 明文 key 只落盘到用户配置文件，不随任何导出结构外传 */
  api_key?: string;
}

/** 用户层整体（即 .verifyos/model-config.json 的文件内容） */
export interface UserLayer {
  providers: Record<string, UserProviderConfig>;
  active_provider_id?: string;
}

/** saveUserLayer 的增量更新 */
export interface UserLayerUpdate {
  /** 新增或字段级覆盖（同 id 只更新给出的字段） */
  upsert?: Record<string, UserProviderConfig>;
  /** 删除 provider（同时若是 active 则 active 一并清除） */
  remove?: string[];
  /** 设置 active；传 null 表示清除 */
  active_provider_id?: string | null;
}

/** 合并后的 provider 条目（对外安全形态：只有掩码 key，无明文） */
export interface MergedProvider {
  id: string;
  name: string;
  base_url: string;
  model: string;
  description: string;
  source: 'preset' | 'custom';
  /** 是否已具备可用条件（有 key，或本地服务无需 key） */
  ready: boolean;
  has_api_key: boolean;
  masked_api_key: string;
}

/** loadModelConfig 的返回形态 */
export interface ModelConfigState {
  providers: MergedProvider[];
  active_provider_id: string | null;
}

/** 给前端下拉的选项（listProviders 返回） */
export type ProviderOption = MergedProvider;

/** 默认持久化目录（相对当前工作目录） */
export const DEFAULT_CONFIG_DIR = '.verifyos';
/** 持久化文件名 */
export const CONFIG_FILE_NAME = 'model-config.json';

/**
 * api_key 脱敏：只留前 4 后 4，中间打码。
 * 短 key（<=8 位）只露前 2 位，避免把短 key 全露出去。
 */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return `${key.slice(0, 2)}****`;
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 用户层文件路径 */
function layerFilePath(configDir: string): string {
  return join(configDir, CONFIG_FILE_NAME);
}

/** 读用户层：文件不存在或损坏时返回空层（损坏时告警，不抛错——配置缺失不是程序错误） */
export function loadUserLayer(configDir: string = DEFAULT_CONFIG_DIR): UserLayer {
  const file = layerFilePath(configDir);
  if (!existsSync(file)) return { providers: {} };
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('非对象');
    const raw = parsed as { providers?: unknown; active_provider_id?: unknown };
    const providers: Record<string, UserProviderConfig> = {};
    const rawProviders = typeof raw.providers === 'object' && raw.providers !== null ? (raw.providers as Record<string, unknown>) : {};
    for (const [id, value] of Object.entries(rawProviders)) {
      if (typeof value === 'object' && value !== null) providers[id] = value as UserProviderConfig;
    }
    return {
      providers,
      active_provider_id: typeof raw.active_provider_id === 'string' ? raw.active_provider_id : undefined,
    };
  } catch (err) {
    console.warn(`[model-config] 用户配置文件解析失败，按空配置处理（${file}）：${err instanceof Error ? err.message : err}`);
    return { providers: {} };
  }
}

/**
 * 保存用户层（增量合并：upsert 字段级覆盖、remove 删除、active 设置/清除）。
 * 文件写入权限收紧为 0600（仅当前用户可读）。
 */
export function saveUserLayer(update: UserLayerUpdate, configDir: string = DEFAULT_CONFIG_DIR): UserLayer {
  const layer = loadUserLayer(configDir);
  for (const [id, config] of Object.entries(update.upsert ?? {})) {
    layer.providers[id] = { ...(layer.providers[id] ?? {}), ...config };
  }
  for (const id of update.remove ?? []) {
    delete layer.providers[id];
    if (layer.active_provider_id === id) layer.active_provider_id = undefined;
  }
  if (update.active_provider_id !== undefined) {
    layer.active_provider_id = update.active_provider_id === null ? undefined : update.active_provider_id;
  }
  mkdirSync(configDir, { recursive: true });
  writeFileSync(layerFilePath(configDir), `${JSON.stringify(layer, null, 2)}\n`, { mode: 0o600 });
  return layer;
}

/** 合并双层：预设 + 用户覆盖（用户字段优先），自定义 provider 追加在后 */
export function loadModelConfig(configDir: string = DEFAULT_CONFIG_DIR): ModelConfigState {
  const user = loadUserLayer(configDir);
  const providers: MergedProvider[] = [];

  const toMerged = (base: ProviderPreset, override: UserProviderConfig | undefined, source: 'preset' | 'custom'): MergedProvider => {
    const apiKey = override?.api_key ?? '';
    const preset = PROVIDER_PRESETS.find((p) => p.id === base.id);
    const isLocal = preset?.local === true;
    return {
      id: base.id,
      name: override?.name ?? base.name,
      base_url: override?.base_url ?? base.base_url,
      model: override?.model ?? base.model,
      description: base.description,
      source,
      ready: apiKey !== '' || isLocal,
      has_api_key: apiKey !== '',
      masked_api_key: maskKey(apiKey),
    };
  };

  // 预设（含用户覆盖）
  for (const preset of PROVIDER_PRESETS) {
    providers.push(toMerged(preset, user.providers[preset.id], 'preset'));
  }
  // 自定义 provider（不在预设 id 集合里的用户条目），按 id 稳定排序
  const presetIds = new Set(PROVIDER_PRESETS.map((p) => p.id));
  for (const id of Object.keys(user.providers).filter((id) => !presetIds.has(id)).sort()) {
    const config = user.providers[id]!;
    providers.push(
      toMerged(
        { id, name: config.name ?? id, base_url: config.base_url ?? '', model: config.model ?? '', description: '用户自定义 provider' },
        config,
        'custom',
      ),
    );
  }

  return {
    providers,
    active_provider_id: user.active_provider_id ?? null,
  };
}

/** 前端下拉数据源：全部预设 + 自定义，含来源标记与 ready 标记（无用户配置时也全部可列出） */
export function listProviders(configDir: string = DEFAULT_CONFIG_DIR): ProviderOption[] {
  return loadModelConfig(configDir).providers;
}

/**
 * 解析当前 active 的 LLM 连接配置。
 * - active 未设置 → 返回 null（不报错）；
 * - active 指向不存在的 provider → 返回 null；
 * - api_key 可能为空串（如本地 Ollama），由调用方按 ready 判断可用性。
 */
export function getActiveLlmConfig(configDir: string = DEFAULT_CONFIG_DIR): LlmConfig | null {
  const user = loadUserLayer(configDir);
  const activeId = user.active_provider_id;
  if (activeId === undefined) return null;
  const override = user.providers[activeId];
  const preset = PROVIDER_PRESETS.find((p) => p.id === activeId);
  if (override === undefined && preset === undefined) return null;
  return {
    base_url: override?.base_url ?? preset?.base_url ?? '',
    api_key: override?.api_key ?? '',
    model: override?.model ?? preset?.model ?? '',
  };
}
