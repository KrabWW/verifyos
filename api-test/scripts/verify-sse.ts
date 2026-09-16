/**
 * P2.8 SSE 验收脚本（单命令原子模式）。
 *
 * 运行：node node_modules/.bin/tsx scripts/verify-sse.ts
 *
 * 沙箱会回收后台进程，任何「起服务→另开命令验证」的两步模式都不可靠，
 * 故本脚本在单进程单命令内完成全链路：起 http server 挂 SSE 端点 → consumeSse 消费 →
 * 断言 → 关服 → process.exit。
 *
 * 覆盖（24 条断言）：
 * - 快乐路径 /sse/case：状态 200 + Content-Type text/event-stream；事件顺序
 *   start(gen-case) → N×delta(+progress) → done；done 携带完整 TestCase；id 自增；
 * - /sse/assertion：gen-assertion 流，done.result.count 与带 meta 的 delta 数一致；
 * - /sse/diagnose：gen-diagnose 流，done.result.root_cause = business_change（值变化）；
 * - 错误路径 /sse/error：生成器抛错 → error 事件（含 message）→ 连接关闭（最后一个事件）；
 * - 中断路径 /sse/long：客户端 AbortController.abort() → AbortError → 服务端请求
 *   close（不挂死，3s 内）。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createSseResponse,
  streamFromIterator,
  type StreamChunk,
} from '../src/stream/sse.js';
import { streamGenAssertion, streamGenCase, streamDiagnose } from '../src/stream/generate-stream.js';
import { consumeSse } from '../src/stream/client.js';

let failures = 0;

function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 事件收集器：记录 (event, data, id) 序列并统计 */
function collector() {
  const events: Array<{ event: string; data: any; id: number | null }> = [];
  return {
    onEvent: (event: string, data: unknown, id: number | null) => {
      events.push({ event, data, id });
    },
    events,
    of: (name: string) => events.filter((e) => e.event === name),
    names: () => events.map((e) => e.event),
  };
}

/** SSE 样例响应（含噪音字段 created_at，验证断言 mode 差异） */
const SAMPLE_RESPONSE = {
  id: 'u_123',
  name: '李雷',
  vip: true,
  created_at: '2026-09-09T10:00:00.000Z',
};

async function main(): Promise<void> {
  // ---------------------------------------------------------------
  // 起服务：单进程内挂 5 个 SSE 端点
  // ---------------------------------------------------------------
  const openRequests = new Set<IncomingMessage>();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    openRequests.add(req);
    req.on('close', () => openRequests.delete(req)); // 客户端断开/正常结束时移除

    const url = req.url ?? '';

    if (url === '/sse/case') {
      const writer = createSseResponse(res);
      void streamFromIterator(
        writer,
        streamGenCase({ method: 'GET', path: '/api/users?page=2', response: SAMPLE_RESPONSE, status_code: 200 }),
        { kind: 'gen-case' },
      );
      return;
    }

    if (url === '/sse/assertion') {
      const writer = createSseResponse(res);
      void streamFromIterator(
        writer,
        streamGenAssertion({ response: SAMPLE_RESPONSE, status_code: 200 }),
        { kind: 'gen-assertion' },
      );
      return;
    }

    if (url === '/sse/diagnose') {
      const writer = createSseResponse(res);
      void streamFromIterator(
        writer,
        streamDiagnose({
          assertions: [
            { type: 'status', operator: 'eq', expected: 200, mode: 'strict' },
            { type: 'jsonpath', target: '$.name', operator: 'eq', expected: '李雷', mode: 'strict' },
          ],
          response: { id: 'u_123', name: '韩梅梅' },
          status_code: 200,
          request: { method: 'GET', path: '/api/users/123' },
        }),
        { kind: 'diagnose' },
      );
      return;
    }

    if (url === '/sse/error') {
      const writer = createSseResponse(res);
      // 生成器吐 2 段后抛错：验证 error 事件 + 发完必须 close
      async function* boom(): AsyncGenerator<StreamChunk> {
        yield { text: '开始生成…\n' };
        await sleep(20);
        yield { text: '分析响应…\n' };
        await sleep(20);
        throw new Error('生成器模拟故障：响应体解析失败');
      }
      void streamFromIterator(writer, boom(), { kind: 'gen-case' });
      return;
    }

    if (url === '/sse/long') {
      const writer = createSseResponse(res);
      // 慢速长流（300 段 × 15ms），供客户端中断测试；断连后自动停止
      async function* longStream(): AsyncGenerator<StreamChunk> {
        for (let i = 1; i <= 300; i += 1) {
          if (res.destroyed || res.writableEnded) return; // 客户端断开，停止产出
          yield { text: `段落 ${i}…\n`, progress: Math.round((i / 300) * 100) };
          await sleep(15);
        }
      }
      void streamFromIterator(writer, longStream(), { kind: 'gen-case' });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  // ---------------------------------------------------------------
  // 1. 快乐路径：/sse/case（gen-case 全事件序列）
  // ---------------------------------------------------------------
  console.log('--- 快乐路径：/sse/case（start → N×delta → done） ---');
  {
    const c = collector();
    let openedStatus = -1;
    let openedType = '';
    await consumeSse(`${base}/sse/case`, c.onEvent, {
      onOpen: (r) => {
        openedStatus = r.status;
        openedType = r.headers.get('content-type') ?? '';
      },
    });

    const names = c.names();
    const starts = c.of('start');
    const deltas = c.of('delta');
    const progress = c.of('progress');
    const dones = c.of('done');
    const errors = c.of('error');
    const joinedText = deltas.map((d) => String(d.data?.text ?? '')).join('');

    assert(openedStatus === 200, `HTTP 状态 200（实际 ${openedStatus}）`);
    assert(openedType.startsWith('text/event-stream'), `Content-Type 为 text/event-stream（实际 ${openedType}）`);
    assert(names[0] === 'start' && starts.length === 1 && starts[0]!.data?.kind === 'gen-case', `首事件 start 且 kind=gen-case（实际 ${names[0]}）`);
    assert(names[names.length - 1] === 'done' && dones.length === 1, `末事件 done 且仅 1 条（实际 ${names[names.length - 1]}）`);
    assert(errors.length === 0, '快乐路径无 error 事件');
    assert(deltas.length >= 5, `delta 数 >= 5（实际 ${deltas.length}）`);
    assert(progress.length >= 1 && progress.every((p, i) => i === 0 || Number(p.data?.percent) >= Number(progress[i - 1]!.data?.percent)), `progress 事件 ${progress.length} 条且百分比单调不减`);
    const lastProgress = progress.at(-1);
    assert(lastProgress?.data?.percent === 100, `最终 progress=100（实际 ${String(lastProgress?.data?.percent)}）`);
    assert(joinedText.includes('分析请求') && joinedText.includes('用例 1 标题') && joinedText.includes('GET /api/users'), 'delta 文本拼接含「分析请求/用例 1 标题/GET /api/users」');
    const result = dones[0]!.data?.result;
    assert(Array.isArray(result?.assertions) && result.assertions.length > 0, `done.result 携带断言列表（${result?.assertions?.length} 条）`);
    assert(typeof result?.name === 'string' && result.name.includes('GET /api/users'), `done.result.name 含 GET /api/users（实际 ${String(result?.name)}）`);
    const ids = c.events.map((e) => e.id);
    assert(ids[0] === 1 && ids.every((id, i) => i === 0 || id === ids[i - 1]! + 1), `帧 id 从 1 起严格自增（首 ${ids[0]}，末 ${ids.at(-1)}）`);
    // 噪音字段（created_at）断言标 ignore，非噪音（name）标 strict
    const createdAtAssert = result?.assertions?.find((a: any) => a.target === '$.created_at' && a.operator === 'exists');
    const nameAssert = result?.assertions?.find((a: any) => a.target === '$.name' && a.operator === 'eq');
    assert(createdAtAssert?.mode === 'ignore' && nameAssert?.mode === 'strict', '噪音字段 ignore / 稳定字段 strict（复用规则式断言生成）');
  }

  // ---------------------------------------------------------------
  // 2. /sse/assertion（gen-assertion 流）
  // ---------------------------------------------------------------
  console.log('--- /sse/assertion（逐条断言流） ---');
  {
    const c = collector();
    await consumeSse(`${base}/sse/assertion`, c.onEvent);
    const starts = c.of('start');
    const metaDeltas = c.of('delta').filter((d) => d.data?.meta?.assertion);
    const dones = c.of('done');
    assert(starts[0]?.data?.kind === 'gen-assertion', `start.kind=gen-assertion（实际 ${String(starts[0]?.data?.kind)}）`);
    const count = dones[0]?.data?.result?.count;
    assert(count === metaDeltas.length && count > 0, `done.result.count=${count} 与携带 meta.assertion 的 delta 数（${metaDeltas.length}）一致`);
  }

  // ---------------------------------------------------------------
  // 3. /sse/diagnose（gen-diagnose 流 + 根因复用）
  // ---------------------------------------------------------------
  console.log('--- /sse/diagnose（诊断结论流） ---');
  {
    const c = collector();
    await consumeSse(`${base}/sse/diagnose`, c.onEvent);
    const starts = c.of('start');
    const joinedText = c.of('delta').map((d) => String(d.data?.text ?? '')).join('');
    const result = c.of('done')[0]?.data?.result;
    assert(starts[0]?.data?.kind === 'diagnose', `start.kind=diagnose（实际 ${String(starts[0]?.data?.kind)}）`);
    assert(joinedText.includes('根因分类') && joinedText.includes('business_change'), 'delta 文本含「根因分类」与 business_change（复用 diagnoseFailure）');
    assert(result?.passed === false && result?.root_cause === 'business_change', `done.result.root_cause=business_change（实际 ${String(result?.root_cause)}）`);
  }

  // ---------------------------------------------------------------
  // 4. 错误路径：生成器抛错 → error 事件 → 连接关闭
  // ---------------------------------------------------------------
  console.log('--- 错误路径：/sse/error（error 事件 + 强制关闭） ---');
  {
    const c = collector();
    await consumeSse(`${base}/sse/error`, c.onEvent); // 对端 close 后 resolve，不悬挂
    const names = c.names();
    const errors = c.of('error');
    assert(errors.length === 1 && String(errors[0]!.data?.message).includes('生成器模拟故障'), `收到 error 事件且含故障信息（实际 ${String(errors[0]!.data?.message)}）`);
    assert(names[names.length - 1] === 'error', `error 后连接关闭，error 为最后事件（实际 ${names[names.length - 1]}）`);
  }

  // ---------------------------------------------------------------
  // 5. 中断路径：客户端 abort → 服务端不挂死
  // ---------------------------------------------------------------
  console.log('--- 中断路径：/sse/long（AbortController） ---');
  {
    const c = collector();
    const controller = new AbortController();
    let abortError: unknown = null;
    const consumePromise = consumeSse(`${base}/sse/long`, c.onEvent, { signal: controller.signal });
    // 收到 3 条事件后主动中止
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (c.events.length >= 3) {
          clearInterval(timer);
          resolve();
        }
      }, 10);
    });
    controller.abort();
    try {
      await consumePromise;
    } catch (err) {
      abortError = err;
    }
    assert(abortError !== null && (abortError as Error).name === 'AbortError', `客户端 abort 抛 AbortError（实际 ${String((abortError as Error)?.name)}）`);
    assert(c.events.length >= 3 && c.events.length < 300, `中止前已收 ${c.events.length} 条事件（<300，流未自然跑完）`);

    // 服务端不挂死：abort 后该请求 3s 内触发 close（openRequests 归零），且服务仍能响应新请求
    const requestClosed = await Promise.race([
      (async () => {
        const deadline = Date.now() + 3000;
        while (openRequests.size > 0 && Date.now() < deadline) {
          await sleep(50);
        }
        return openRequests.size === 0;
      })(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
    ]);
    assert(requestClosed, `客户端 abort 后服务端请求已 close（未挂死，openRequests=${openRequests.size}）`);

    // 服务仍可响应新请求（探 404 端点，不走 SSE）
    let probeStatus = -1;
    try {
      const probe = await fetch(`${base}/no-such-endpoint`);
      probeStatus = probe.status;
      await probe.text();
    } catch {
      probeStatus = -1;
    }
    assert(probeStatus === 404, `abort 后服务仍可响应新请求（探针 404，实际 ${probeStatus}）`);
  }

  // ---------------------------------------------------------------
  // 收尾：关服 + 退出
  // ---------------------------------------------------------------
  server.close();
  await new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    setTimeout(resolve, 100);
  });

  console.log('---');
  console.log(failures === 0 ? 'ALL PASS：SSE 流式输出（服务端协议 + 生成源 + 客户端消费 + error/abort 路径）闭环跑通。' : `存在 ${failures} 项失败。`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
