/** WS 事件流实测：连 server 收 run.watch 演示流（A3 协议端到端验证） */
import { io } from 'socket.io-client';

const socket = io('http://127.0.0.1:8080', { path: '/ws' });
const events: string[] = [];

socket.on('connect', () => {
  console.log('connected → emit run.watch');
  socket.emit('run.watch', { runId: 'run_demo_ws' });
});

socket.on('run.event', (e: { type: string; stepId?: string; summary?: string }) => {
  events.push(e.type);
  const extra = e.stepId ? ` [${e.stepId}]` : '';
  const s = e.summary ? ` ${e.summary}` : '';
  console.log(`  ◀ ${e.type}${extra}${s}`);
});

socket.on('connect_error', (err: Error) => {
  console.error('connect_error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log(`\n收到 ${events.length} 个事件：${events.join(' → ')}`);
  const ok = events[0] === 'run.started' && events[events.length - 1] === 'run.completed';
  console.log(ok ? '✅ 协议端到端 OK（run.started → run.completed）' : '❌ 事件流不完整');
  process.exit(ok ? 0 : 1);
}, 3500);
