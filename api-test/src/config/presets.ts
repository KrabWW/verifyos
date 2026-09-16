/**
 * P2.7 平台预设 provider 列表（第一层）。
 *
 * 说明：任务书原计划 presets.json，但本项目 tsconfig 只读不可改，且 ESM + NodeNext
 * 下 JSON 导入需要 import attributes，故按任务书允许的备选方案改为 .ts 导出常量。
 *
 * 预设只带 base_url + 推荐模型名 + 说明，api_key 一律留空（由用户层自带）。
 */
import type { ProviderPreset } from './model-config.js';

/**
 * 四家内置预设（对标 MeterSphere「平台预设 + 用户自带 key」的双层思路）：
 * - 智谱 GLM：open.bigmodel.cn，OpenAI 兼容路径 /api/paas/v4；
 * - DeepSeek：官方 API，OpenAI 兼容；
 * - OpenAI：作为「OpenAI 兼容自定义」的示例预设（任何兼容网关都可改 base_url 使用）；
 * - Ollama：本地部署，无需 api_key（ready 判定豁免）。
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'zhipu',
    name: '智谱 GLM',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    description: '智谱 AI GLM 系列，OpenAI 兼容接口，需在 open.bigmodel.cn 申请 API key。',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    base_url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    description: 'DeepSeek 官方 API，OpenAI 兼容接口，需在 platform.deepseek.com 申请 API key。',
  },
  {
    id: 'openai',
    name: 'OpenAI 兼容自定义',
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    description: 'OpenAI 官方或任意兼容网关（如 one-api / new-api 中转），改 base_url 即可接入。',
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    base_url: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    description: '本机 Ollama 服务，无需 API key；模型名需与本机已拉取的模型一致。',
    local: true,
  },
];
