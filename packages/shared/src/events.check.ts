/**
 * 事件协议自检（A3 验收脚本）：构造完整事件流并 zod 校验。
 * 运行：pnpm --filter @verifyos/shared run check:events
 */
import { RunEvent, ev } from './events.js';

const target = {
  applicationShortId: 'app_order01',
  platform: 'web' as const,
  environment: { url: 'https://crm.test.example.com', isPreview: false },
};

const flow: unknown[] = [
  ev.runStarted('run_0001', target, 'manual'),
  ev.stepStarted('run_0001', 'st_01', 0, '管理员登录', 'module'),
  ev.thinking('run_0001', 'st_01', '复用浏览器状态 admin_logged_in，免重复登录'),
  ev.action('run_0001', 'st_01', 'browser', 'navigate', { url: '/employees' }),
  ev.observation('run_0001', 'st_01', true, '员工列表页加载完成', 412),
  ev.stepCompleted('run_0001', 'st_01', 'pass', true),
  ev.stepStarted('run_0001', 'st_02', 1, '点击保存', 'ai'),
  ev.action('run_0001', 'st_02', 'browser', 'click', { semantic: '保存按钮' }),
  ev.observation('run_0001', 'st_02', false, 'POST /api/employee 500 · duplicate key uk_emp_code', 312),
  ev.stepCompleted('run_0001', 'st_02', 'fail', false),
  ev.runCompleted('run_0001', 'fail', { emp_code: 'ZS-001' }, '后端唯一索引冲突'),
];

let ok = 0;
for (const [i, e] of flow.entries()) {
  const r = RunEvent.safeParse(e);
  if (!r.success) {
    console.error(`✗ event[${i}] invalid:`, r.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '));
    process.exit(1);
  }
  ok++;
}
console.log(`✓ Run 事件协议 v1：${ok}/${flow.length} 事件全部合法（run.started → run.completed）`);
