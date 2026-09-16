import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, generateObject } from 'ai';
import { z } from 'zod';

/**
 * GLM × aiSDK 最小探针（控制变量定位 Stagehand 失败层）
 * T1 非流式小请求 / T2 流式小请求 / T3 大 prompt / T4 structured output
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const glm = createOpenAICompatible({
  name: 'glm',
  apiKey: process.env.LLM_API_KEY!,
  baseURL: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
});
const MODEL = process.env.LLM_MODEL || 'glm-4.6';

async function probe(name: string, fn: () => Promise<string>, timeoutMs = 60000) {
  const t = Date.now();
  try {
    const out = await Promise.race([
      fn(),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs)),
    ]);
    console.log(`✓ ${name} — ${Date.now() - t}ms — ${out.slice(0, 80)}`);
  } catch (e: any) {
    console.log(`✗ ${name} — ${Date.now() - t}ms — ${(e?.message || String(e)).slice(0, 160)}`);
  }
}

const bigPrompt = '请阅读以下模拟的页面 DOM 结构（已截断），并回答页面上有几个按钮。\n' + 'a '.repeat(15000) + '\n<div><button>登录</button><button>取消</button></div>';

await probe('T1 非流式 generateText（小 prompt）', async () => {
  const r = await generateText({ model: glm(MODEL), prompt: '用一句话回答：1+1=?' });
  return r.text;
});

await probe('T2 流式 streamText（小 prompt，SSE）', async () => {
  const r = await streamText({ model: glm(MODEL), prompt: '用一句话回答：2+2=?' });
  let out = '';
  for await (const chunk of r.textStream) out += chunk;
  return out || '(empty stream)';
});

await probe('T3 非流式大 prompt（~15k 字符，模拟 DOM 注入）', async () => {
  const r = await generateText({ model: glm(MODEL), prompt: bigPrompt });
  return r.text;
});

await probe('T4 generateObject（structured output / json schema）', async () => {
  const r = await generateObject({
    model: glm(MODEL),
    schema: z.object({ answer: z.number() }),
    prompt: '3+3=? 以 JSON 返回 {answer}',
  });
  return JSON.stringify(r.object);
});
