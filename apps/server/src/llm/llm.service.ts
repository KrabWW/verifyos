import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

/**
 * LLM Gateway（A4）：OpenAI 兼容统一入口，GLM / DeepSeek / Qwen 可配置切换。
 * prompt 模板集中管理（后续 Epic B/C 逐步沉淀到此）。
 */
@Injectable()
export class LlmService {
  private client: OpenAI;
  readonly model: string;

  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: process.env.LLM_API_KEY || 'missing-key',
    });
    this.model = process.env.LLM_MODEL || 'glm-4.6';
  }

  async chat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], options?: { signal?: AbortSignal }) {
    // TODO(Epic B)：接 Langfuse hook（LANGFUSE_ENABLED=true 时全量 trace）
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.2,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return res.choices[0]?.message?.content ?? '';
  }
}
