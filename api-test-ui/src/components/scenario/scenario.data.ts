/**
 * ScenarioTree 演示数据：MeterSphere 形态的场景步骤树。
 *
 * 演示流：登录 → 循环 3 轮（查余额 → 条件分支[then: 创建订单 / else: 记录告警]）
 *       → 等待 → 全局断言 → 查列表 → 引用场景
 * 共 10 节点、最大深度 3；运行模拟结果 7 pass / 2 fail / 1 skipped。
 */

/** 六原语步骤类型 */
export type StepType = 'request' | 'condition' | 'loop' | 'wait' | 'assert' | 'ref';

/** 步骤执行状态 */
export type StepStatus = 'idle' | 'running' | 'pass' | 'fail' | 'skip';

/** 失败断言 diff（期望 vs 实际） */
export interface AssertionDiff {
  target: string;
  operator: string;
  expected: string;
  actual: string;
}

/** 场景树节点 */
export interface ScenarioNode {
  id: string;
  type: StepType;
  name: string;
  /** 仅 condition / loop / ref 等容器节点有 children */
  children?: ScenarioNode[];
  /** 原语配置（循环次数 / 条件表达式 / 等待时长 / 引用 ID 等） */
  config?: Record<string, unknown>;
  /** 条件分支标记：then / else（仅 condition 的直接子节点使用） */
  branch?: 'then' | 'else';
  status?: StepStatus;
  durationMs?: number;
  /** 启用开关：关闭后整棵子树跳过执行 */
  enabled: boolean;
  /** 运行模拟的最终结果 */
  sim?: Exclude<StepStatus, 'idle' | 'running'>;
  /** fail 时可展开的断言 diff */
  assertionDiff?: AssertionDiff[];
}

export const scenarioDemoNodes: ScenarioNode[] = [
  {
    id: 'n-login',
    type: 'request',
    name: '登录获取 Token',
    enabled: true,
    sim: 'pass',
    durationMs: 182,
    config: { method: 'POST', path: '/auth/login', extract: 'token → {{token}}' },
  },
  {
    id: 'n-loop',
    type: 'loop',
    name: '循环 3 轮 · 购买流程',
    enabled: true,
    sim: 'pass',
    durationMs: 1240,
    config: { times: 3, breakWhen: '{{balance}} < 10' },
    children: [
      {
        id: 'n-balance',
        type: 'request',
        name: '查询余额',
        enabled: true,
        sim: 'pass',
        durationMs: 96,
        config: { method: 'GET', path: '/pay/balance' },
      },
      {
        id: 'n-cond',
        type: 'condition',
        name: '余额充足？{{balance}} > 100',
        enabled: true,
        sim: 'pass',
        durationMs: 12,
        config: { expr: '{{balance}} > 100' },
        children: [
          {
            id: 'n-order',
            type: 'request',
            name: '创建订单',
            branch: 'then',
            enabled: true,
            sim: 'fail',
            durationMs: 231,
            config: { method: 'POST', path: '/orders' },
            assertionDiff: [
              { target: '$.data.order_id', operator: 'exists', expected: '存在', actual: 'null' },
              { target: 'status_code', operator: 'eq', expected: '201', actual: '500' },
            ],
          },
          {
            id: 'n-alert',
            type: 'request',
            name: '记录告警',
            branch: 'else',
            enabled: true,
            sim: 'skip',
            durationMs: 0,
            config: { method: 'POST', path: '/alerts' },
          },
        ],
      },
    ],
  },
  {
    id: 'n-wait',
    type: 'wait',
    name: '等待支付回调',
    enabled: true,
    sim: 'pass',
    durationMs: 500,
    config: { ms: 500 },
  },
  {
    id: 'n-assert',
    type: 'assert',
    name: '全局断言 · 支付链路',
    enabled: true,
    sim: 'fail',
    durationMs: 3,
    config: { scope: 'scenario' },
    assertionDiff: [
      { target: 'latency_ms', operator: 'lt', expected: '< 800', actual: '1423' },
    ],
  },
  {
    id: 'n-list',
    type: 'request',
    name: '查询订单列表',
    enabled: true,
    sim: 'pass',
    durationMs: 118,
    config: { method: 'GET', path: '/orders?page=1' },
  },
  {
    id: 'n-ref',
    type: 'ref',
    name: '引用场景 · 用户登录态校验',
    enabled: true,
    sim: 'pass',
    durationMs: 421,
    config: { scenarioId: 'scn-auth-01' },
  },
];
