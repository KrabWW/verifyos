import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const ChatIntentSchema = z.object({
  action: z
    .enum(['explore', 'run_tests', 'show_qa_points', 'show_map', 'chat'])
    .describe('用户想做的动作：explore=探索一个网站生成QA点 / run_tests=跑一次验证 / show_qa_points=查看已有QA点 / show_map=查看应用地图 / chat=闲聊或问能力'),
  target_url: z.string().optional().describe('用户提到的目标网站 URL（如有）'),
  intent_text: z.string().optional().describe('提炼后的业务意图/测试重点'),
  reply: z.string().describe('给用户的中文回复（说明你要做什么，友好专业，≤120字）'),
});
export type ChatIntent = z.infer<typeof ChatIntentSchema>;

export interface ChatLlmConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

const SYSTEM_CONTEXT = `你是 VerifyOS（中文 AI 测试平台）的 AI 助手。平台能力：
1. explore：对一个网站做 AI 探索（爬取→自动登录→生成 Coverage Graph→LLM 提取 QA 点候选）
2. run_tests：对已探索的应用跑一次验证（真浏览器执行 + 截图/网络证据 + UNKNOWN 防假绿）
3. show_qa_points：查看已生成的 QA 点库
4. show_map：查看应用地图（页面覆盖图）
当前演示站点由系统提供（本地演示 CRM：登录墙→员工列表→详情，账号 admin/test123；用户未明确指定外部 URL 时由系统注入正确入口，你不要在 target_url 里编造端口）。
用户说"帮我测 XX"/"探索 XX"→explore；"跑一下验证"/"执行测试"→run_tests；"看看 QA 点"/"有什么测试建议"→show_qa_points；"应用地图"/"覆盖情况"→show_map；
问候/问你能干什么→chat（reply 里介绍能力并引导）。用户给了 URL 或说"这个站"→提取 URL 到 target_url。
回复风格约束：使用简体中文、直接口语化；**禁止使用 emoji 表情符号**（平台 UI 图标已统一为矢量图标，聊天文本中再出现 emoji 会破坏视觉一致性）；要点用「·」或换行分隔，不堆砌修饰。`;

/** 解析用户自然语言 → 结构化动作计划（LLM structured output） */
export async function parseChatIntent(
  message: string,
  llm: ChatLlmConfig,
  /** U20：图片附件（dataURL）——glm-4.5v 是视觉模型，带图时走多模态 messages */
  images: string[] = [],
  /** M1：已装插件上下文（schema 摘要/工具声明）——拼进 prompt 让 AI 具备插件带来的领域知识 */
  pluginContext = '',
): Promise<ChatIntent> {
  const provider = createOpenAICompatible({ name: 'glm', apiKey: llm.apiKey, baseURL: llm.baseURL });
  const prompt = `${SYSTEM_CONTEXT}${pluginContext}\n\n用户说：「${message}」\n请解析为动作计划。`;
  if (images.length === 0) {
    const { object } = await generateObject({
      model: provider(llm.model),
      schema: ChatIntentSchema,
      prompt,
    });
    return object;
  }
  const { object } = await generateObject({
    model: provider(llm.model),
    schema: ChatIntentSchema,
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt },
          ...images.slice(0, 2).map((data) => ({ type: 'image' as const, image: data })),
        ],
      },
    ],
  });
  return object;
}
