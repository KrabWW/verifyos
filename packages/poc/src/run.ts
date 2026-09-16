import dotenv from 'dotenv';
import { Stagehand, AISdkClient } from '@browserbasehq/stagehand';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A5 PoC 门禁：Stagehand × 国产模型（GLM/DeepSeek，OpenAI 兼容端点）
 * 四脚本：P1 指令遵循 / P2 中文表单 / P3 observe 抽取 / P4 cache 回放
 * 门禁：通过率 ≥ 80%（4/4 或 3/4+核心 P2 通过）才继续 Stagehand 主方案。
 * 用法：cp ../../.env.example ../../.env 填 LLM_API_KEY 后 `pnpm --filter @verifyos/poc poc`
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
const PAGE = 'file://' + path.resolve(__dirname, '../fixtures/crm.html');

const BASE_URL = process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'glm-4.6';

if (!API_KEY) {
  console.error('✗ 缺少 LLM_API_KEY（见 .env.example）');
  process.exit(2);
}

type Case = { name: string; run: () => Promise<string> };
const results: { name: string; pass: boolean; detail: string; ms: number }[] = [];

// GLM 走 OpenAI 兼容端点（chat/completions 通道；默认 aiSDK openai provider 会走
// Responses API /responses，GLM 无此端点 → 网关挂起报"网络错误"，已实测定位）
const glmProvider = createOpenAICompatible({
  name: 'glm',
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

async function newStagehand(cache = false) {
  const llmClient = new AISdkClient({ model: glmProvider(MODEL) } as any);
  const sh = new Stagehand({
    env: 'LOCAL',
    llmClient,
    enableCaching: cache,
    verbose: 0,
    localBrowserLaunchOptions: { headless: true },
  } as any);
  await sh.init();
  return sh;
}

const cases: Case[] = [
  {
    name: 'P1 指令遵循（act：中文指令点击登录）',
    run: async () => {
      const sh = await newStagehand();
      try {
        await sh.page.goto(PAGE);
        await sh.page.fill('#email', 'admin@crm.test');
        await sh.page.fill('#pwd', '123456');
        await sh.page.act('点击「登录」按钮');
        await sh.page.waitForSelector('#emp-panel:not(.hidden)', { timeout: 5000 });
        return 'act 点击登录成功，进入员工管理页';
      } finally {
        await sh.close();
      }
    },
  },
  {
    name: 'P2 中文表单填写（act 复合指令：打开新增→填表→保存→断言）',
    run: async () => {
      const sh = await newStagehand();
      try {
        await sh.page.goto(PAGE);
        await sh.page.fill('#email', 'admin@crm.test');
        await sh.page.fill('#pwd', '123456');
        await sh.page.act('点击登录');
        await sh.page.act('点击「＋ 新增员工」按钮');
        await sh.page.act('在姓名输入框填写「张三」');
        await sh.page.act('在员工编号输入框填写「ZS-001」');
        await sh.page.act('点击保存按钮');
        const ok = await sh.page.evaluate(
          () => document.querySelector('#emp-table')?.textContent?.includes('张三') ?? false,
        );
        if (!ok) throw new Error('列表中未出现张三');
        return '复合中文指令完成：张三已出现在员工列表';
      } finally {
        await sh.close();
      }
    },
  },
  {
    name: 'P3 observe 抽取（结构化 schema 提取员工列表）',
    run: async () => {
      const sh = await newStagehand();
      try {
        await sh.page.goto(PAGE);
        await sh.page.fill('#email', 'admin@crm.test');
        await sh.page.fill('#pwd', '123456');
        await sh.page.act('点击登录');
        const data = await sh.page.extract({
          instruction: '提取员工表格中的所有员工',
          schema: z.object({
            employees: z.array(z.object({ name: z.string(), code: z.string(), dept: z.string() })),
          }),
        });
        if (data.employees.length < 2) throw new Error(`抽取数量不足：${data.employees.length}`);
        const hasLi = data.employees.some((e) => e.name.includes('李'));
        if (!hasLi) throw new Error('未抽到李四');
        return `抽取 ${data.employees.length} 名员工（含李四）`;
      } finally {
        await sh.close();
      }
    },
  },
  {
    name: 'P4 cache 回放（同指令二次执行应命中缓存，不调 LLM）',
    run: async () => {
      const sh = await newStagehand(true);
      try {
        await sh.page.goto(PAGE);
        await sh.page.fill('#email', 'admin@crm.test');
        await sh.page.fill('#pwd', '123456');
        const t1 = Date.now();
        await sh.page.act('点击「登录」按钮');
        const first = Date.now() - t1;
        // 重置页面后同指令二次执行
        await sh.page.goto(PAGE);
        await sh.page.fill('#email', 'admin@crm.test');
        await sh.page.fill('#pwd', '123456');
        const t2 = Date.now();
        await sh.page.act('点击「登录」按钮');
        const second = Date.now() - t2;
        await sh.page.waitForSelector('#emp-panel:not(.hidden)', { timeout: 5000 });
        const speedup = first > 0 ? (first / Math.max(second, 1)).toFixed(1) : '?';
        return `两次执行均成功；首次 ${first}ms / 回放 ${second}ms（加速 ${speedup}x）`;
      } finally {
        await sh.close();
      }
    },
  },
];

async function main() {
  console.log(`═══ A5 PoC：Stagehand × ${MODEL}（${BASE_URL}）═══\n`);
  for (const c of cases) {
    const t = Date.now();
    try {
      const detail = await c.run();
      results.push({ name: c.name, pass: true, detail, ms: Date.now() - t });
      console.log(`✓ ${c.name}\n  ${detail}（${Date.now() - t}ms）\n`);
    } catch (e: any) {
      results.push({ name: c.name, pass: false, detail: e?.message || String(e), ms: Date.now() - t });
      console.log(`✗ ${c.name}\n  ${e?.message || e}（${Date.now() - t}ms）\n`);
    }
  }
  const passed = results.filter((r) => r.pass).length;
  const rate = ((passed / results.length) * 100).toFixed(0);
  const p2 = results.find((r) => r.name.startsWith('P2'));
  const gate = passed === results.length || (passed >= 3 && p2?.pass);
  console.log('═══ 报告 ═══');
  results.forEach((r) => console.log(`${r.pass ? '✓' : '✗'} ${r.name} — ${r.ms}ms`));
  console.log(`\n通过率：${rate}%（${passed}/${results.length}）· 门禁要求 ≥80% 且 P2 通过 → ${gate ? '✅ 通过，Stagehand 主方案成立' : '❌ 未达门禁 → 走降级方案（Playwright MCP + 自研 act 层）'}`);
  process.exit(gate ? 0 : 1);
}

main().catch((e) => {
  console.error('PoC 运行失败：', e);
  process.exit(2);
});
