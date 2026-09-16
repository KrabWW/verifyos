# VerifyOS 插件创建指南（Everything is a Plugin）

> 目标读者：想给 Agent 增加新能力的使用者 / 交付工程师 / AI 助手。
> 一句话总结：**能力边界随需求加深而生长** —— 需求来了没有现成工具？自己注册一个插件，不需要改平台代码。

---

## 1. 理念：Everything is a Plugin

传统自动化平台的能力集是出厂固化的：功能要等版本排期，集成要等平台开发。VerifyOS 借鉴两条设计脉络，把「能力」做成**可生长的插件体系**：

- **Cordis 插件框架**（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 所用）：一切能力皆插件——数据库查询、HTTP 调用、外部系统连接器，都是往同一个注册表（Plugin Registry）加条目；插件自带 manifest（能力声明）与 config（运行时配置），宿主按 manifest 调度、按权限门控。
- **ego-lite 的 Space 理念**：能力边界不是设计出来的，是**随需求加深逐步生长**出来的。今天只需要「验证完成推企微通知」，那就只注册一个通知插件；明天要读 Jira，再注册一个 Jira 连接器。平台不预判需求，只提供一致的注册协议。

落到产品上的三个推论：

1. **统一视图**：内置工具（builtin）、MCP 连接器（mcp）、用户自建（custom）在插件库里是同一种东西——都有 manifest、config schema、权限档、启用开关。
2. **同一调用路径**：custom 插件与内置工具走同一套权限三档门控与审计（audit_log），不存在「绕过管控的后门能力」。
3. **自助创建**：创建插件是表单级操作（或直接把提示词模板丢给 AI 助手），不需要发版、不需要改平台代码。

---

## 2. 插件模型

### 2.1 kind 三类

| kind | 含义 | 来源 | 可删除 |
|------|------|------|--------|
| `builtin` | 引擎内置工具（db.query / db.exec / http / browser / code.view / vision / evidence / report，共 8 个） | agent-core ToolRegistry | 否 |
| `mcp` | 外部 MCP server 连接器（内部 CMDB / 禅道 Issue / GitLab MR，共 3 个） | McpToolAdapter | 否 |
| `custom` | 用户自建插件（如「企业微信通知插件」） | POST /api/plugins | **是** |

### 2.2 manifest 字段规范

manifest 是插件的能力声明（jsonb），规范如下：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 插件名，建议中文可读名或 `domain.action` 形式 |
| `version` | string | 是 | 语义化版本，如 `0.1.0` |
| `kind` | string | 是 | `builtin` / `mcp` / `custom` |
| `description` | string | 是 | 一句话说明插件给 Agent 增加什么能力 |
| `tools` | array | 是 | 能力条目列表，每项 `{ name, description, permission }` |
| `tools[].permission` | string | 是 | 单工具权限档（见 2.4） |
| `config` | object | 否 | 运行时配置默认值（如 `{ maxRows: 100 }`） |

### 2.3 config_schema 的作用

config_schema 定义**用户需要填哪些运行时配置**（jsonb，JSON Schema 风格）。它不参与执行，而是：

1. 驱动 UI：详情抽屉 / 创建向导据此生成配置表单；
2. 约束取值：`type` / `enum` / `required` / `default` 描述合法取值；
3. 凭据解耦：密钥类配置（webhook 地址、token）走全局凭据体系（AES-256-GCM 加密），schema 里只声明字段，不落明文。

### 2.4 权限三档（auto / ask / forbidden）

与内置工具同一门控语义（E1）：

| 档位 | 语义 | 典型场景 |
|------|------|----------|
| `auto` | 自动执行，结果入证据链 | 只读查询、HTTP GET、报告生成 |
| `ask` | 执行前弹卡，`WAITING_FOR_APPROVAL` 人工批准后执行 | 写库、外发通知、MR 评论 |
| `forbidden` | 阶段内禁用 | 生产库写入、危险操作 |

---

## 3. 从 0 创建一个 custom 插件（完整示例：企业微信通知插件）

### 3.1 manifest

```json
{
  "name": "企业微信通知插件",
  "version": "0.1.0",
  "kind": "custom",
  "description": "验证完成 / 缺陷升级时，推送企业微信群机器人消息",
  "tools": [
    {
      "name": "wecom.notify",
      "description": "向指定群机器人 Webhook 发送文本/markdown 消息",
      "permission": "ask"
    }
  ],
  "config": {
    "notify_on": "verify_done"
  }
}
```

### 3.2 config schema

```json
{
  "webhook_url": {
    "type": "string",
    "title": "群机器人 Webhook 地址",
    "required": true
  },
  "notify_on": {
    "type": "string",
    "title": "通知时机",
    "enum": ["verify_done", "issue_escalated"],
    "default": "verify_done"
  }
}
```

### 3.3 注册步骤

1. 打开左侧导航「工具与插件」→ 默认进入「插件库」tab；
2. 点右上角「＋ 创建插件」；
3. 填基本信息：名称 `企业微信通知插件`，描述如上；
4. 能力与权限：kind 固定为 `custom`，权限选 `ask`（外发通知应经人工批准）；
5. Config Schema：预填模板改成 3.2 的 JSON；
6. 点「创建（draft）」→ 落库为 draft，并自动打开详情抽屉；
7. 在详情抽屉点「启用」→ 状态变为 enabled，Agent 即可在对话/验证流中调度。

对应的 API 调用（与 UI 等价）：

```bash
# 创建（落库 draft）
curl -X POST http://127.0.0.1:8080/api/plugins \
  -H 'Content-Type: application/json' \
  -d '{"name":"企业微信通知插件","description":"验证完成/缺陷升级时推送企业微信群机器人","permission":"ask","config_schema":{"webhook_url":{"type":"string","title":"群机器人 Webhook 地址","required":true}}}'

# 启用
curl -X PATCH http://127.0.0.1:8080/api/plugins/plg_xxxxxx \
  -H 'Content-Type: application/json' -d '{"status":"enabled"}'
```

### 3.4 在对话 / 验证中触发

- **对话**：对 AI 助手说「验证完成后用企业微信通知插件推一下结果」——助手检索插件库命中 `wecom.notify`，按 `ask` 档弹卡请求批准，批准后执行并写审计；
- **验证流**：验证编排里把「通知」作为收尾步骤，Run 结束时按 `notify_on` 配置触发；每次调用都落 `audit_log`（actor / action / target / meta），可在「工具注册表 & 审计」tab 回溯。

---

## 4. 插件创建提示词模板（复制给 AI 助手）

这正是产品目标：**随需求加深，用户把模板丢给 AI 助手，让 AI 生成并注册插件**。直接复制下面整段：

```text
请帮我为 VerifyOS 创建一个自定义插件，需求如下：
【用一句话描述你的需求，例如：每次验证完成后，把结果摘要推送到企业微信群】

请按以下规范产出并注册：
1. 生成 manifest（JSON），字段：name / version(0.1.0) / kind("custom") /
   description / tools[{name, description, permission}] / config；
2. 生成 config_schema（JSON Schema 风格），声明用户需填的运行时配置
   （type/title/enum/required/default；密钥类字段只声明、不明文）；
3. 权限档建议：只读/查询类选 auto；外发/写操作类选 ask；危险操作选 forbidden；
4. 用 POST /api/plugins 注册（落库为 draft），把返回的 short_id 告诉我；
5. 提示我确认后用 PATCH /api/plugins/{short_id} 启用。

补充上下文（可选）：
【目标系统 / Webhook 地址或连接方式 / 消息格式要求 / 触发时机】
```

AI 助手收到后会给出 manifest + config_schema 草案，调用 API 注册，并在你确认后启用——全程无需改平台代码。

---

## 5. API 速查

Base：`http://127.0.0.1:8080`

| 方法 | 路径 | 说明 | 关键参数 |
|------|------|------|----------|
| GET | `/api/plugins` | 插件列表 | query：`kind`（builtin/mcp/custom）、`status`（enabled/disabled/draft） |
| GET | `/api/plugins/:shortId` | 插件详情 | 路径参数 short_id（`plg_xxx`） |
| POST | `/api/plugins` | 创建 custom 插件 | body：`name`（必填）、`description`、`permission`、`config_schema`、`manifest?`；short_id 自动生成，落库 draft |
| PATCH | `/api/plugins/:shortId` | 更新 | body（可选多）：`status`、`manifest`、`config_schema`、`permission` |
| DELETE | `/api/plugins/:shortId` | 删除 | 仅 `kind=custom` 可删；builtin/mcp 返回 400 |

> 插件行字段：`id / short_id / name / version / kind / description / status / manifest / config_schema / permission / source / created_at / updated_at`。所有写操作即时生效并被审计覆盖。

---

## 六、UI 扩展：让插件长出自己的菜单与页面（M 系列）

在 manifest 中声明 `ui.menu`，启用后平台侧栏自动出现「插件」分区里的菜单项，点击进入插件自己的页面：

```json
{
  "ui": {
    "menu": [{
      "label": "订单库面板",
      "icon": "Database",
      "entry": {
        "type": "declarative",
        "blocks": [
          { "type": "kv",    "title": "连接信息", "rows": [["主机", "…"], ["库", "ai_analysis"]] },
          { "type": "text",  "title": "Schema 摘要", "text": "orders(id,user_id,status,…)" },
          { "type": "table", "title": "适用测试面", "rows": [["测试面", "示例"], ["数据一致性", "下单后库存是否扣减"]] },
          { "type": "link",  "title": "去 QA 点生成验证", "route": "qa" }
        ]
      }
    }]
  }
}
```

- `entry.type = "declarative"`：结构化 blocks（kv / text / table / link），平台通用渲染器绘制——**推荐**，无代码执行风险
- `entry.type = "iframe"`：嵌入外部页面 URL（受目标站 X-Frame-Options 限制）
- 停用插件 → 菜单与页面自动消失（时间可组合性：卸载即回滚）

## 七、工具映射：插件工具如何真正被执行（M 系列）

manifest.tools 每项可声明 `implements`，指向**基座工具**（内置 8 工具之一）：

```json
"tools": [
  { "name": "order-db.query", "implements": "db.query", "description": "订单库只读 SQL", "permission": "ask" }
]
```

- `POST /api/tools/invoke { "name": "order-db.query", "args": { "sql": "SELECT 1" } }` → 平台解析到基座 `db.query` 执行，返回带 `viaPlugin` 标记并入审计
- 未声明 `implements` 时按名称末段自动匹配内置工具（如 `http.get` → `http`）
- 插件 `config` 中的 `schemaSummary` 等声明会自动注入 AI 对话上下文（M1）——AI 回答时知道你的库有哪些表
- 诚实边界：当前基座调用走平台统一连接，**插件独立数据源连接隔离属后续**（config 里的连接信息先作为 AI 上下文与探活用途）

## 八、共创：导出 / 导入（M 系列）

- **导出**：插件库卡片「导出」按钮 → 下载 `<short_id>-plugin.json`（password/token 等敏感字段自动脱敏置空）
- **导入**：「导入插件」按钮选 JSON → 落库为 draft（short_id 重新生成，避免冲突）→ 启用即用
- **共创流程**：A 用「创建插件」向导做出插件 → 导出 JSON → 群里/仓库分享 → B 导入 → 按自己的环境改 config → 启用
- 提示词模板（第五节）生成后同样走导出/导入归档

---

## 九、代码插件（DSH 进程内）

前面几节讲的是「声明式插件」——通过 manifest 把平台**已有的**内置能力映射出来（`implements` 指向 `db.query` / `http` 等 8 基座工具）。它的天花板是「基座有什么能力」。

**代码插件**则不同：自带代码，加载进平台进程内运行，可以 `import pg` / `import axios` 连**任意外部服务**，不受基座能力集限制。两者对比如下：

| 维度 | 声明式插件 | 代码插件（DSH） |
|------|-----------|-----------------|
| 能力来源 | 映射内置 8 工具（`implements`） | 插件自带的 `.ts` 代码 |
| 运行位置 | 平台基座工具执行 | 平台进程内（同进程） |
| 能否连外部服务 | 不能（走平台统一连接） | 能（自建连接池 / 任意 SDK） |
| 安全模型 | 低风险，白名单映射 | 信任模型（代码可信，见 9.5） |
| 回滚 | 停用即撤回菜单/映射 | 卸载调 `onDispose` + 逐个撤回工具 |
| 适用 | 通知、只读查询等常见场景 | 连外部库 / 三方系统 / 复杂编排 |

### 9.1 activate(ctx) 约定

代码插件 = 一个 `.ts` 文件，**默认导出**一个异步激活函数：

```ts
export default async function activate(ctx: Ctx) {
  // 激活期：建立连接、注册工具
  ctx.registerTool({ /* ... */ });
  return {
    onDispose: async () => { /* 回滚：关闭连接 */ },
  };
}
```

加载器用 `require('tsx/cjs')` 打全局 TS hook，再 `require(插件文件)` 取默认导出并 `await activate(ctx)`。返回的 `onDispose` 会在卸载时被调用。

### 9.2 ctx 白名单

插件**只能**通过 `ctx` 拿能力，不暴露 `require` / `fs` / `process`（虽然同进程，仍做 API 规范收敛）：

| 成员 | 类型 | 说明 |
|------|------|------|
| `registerTool(def)` | `(def) => void` | 注册一个工具进 ToolRegistry，`def = { name, description, permission, run }`；`run` 返回 `{ ok, data?, error? }` |
| `llm(prompt)` | `(prompt) => Promise<string>` | 调平台 LLM（用于插件内做摘要/结构化） |
| `db.query(sql, params?)` | `(sql, params?) => Promise<{ rows }>` | 平台只读 PG（`SELECT`）；注意这是**平台库**，不是外部库 |
| `config` | `Record<string, unknown>` | 运行时配置，来自 `manifest.config`（创建向导里填的值） |
| `log(...args)` | `(...args) => void` | 打日志，带 `[plugin:short_id]` 前缀 |

完整类型（可直接拷进插件文件）：

```ts
interface Ctx {
  registerTool: (def: {
    name: string;
    description: string;
    permission: 'auto' | 'ask' | 'forbidden';
    run: (args: Record<string, unknown>) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  }) => void;
  llm: (prompt: string) => Promise<string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
  config: Record<string, unknown>;
  log: (...args: unknown[]) => void;
}
```

### 9.3 生命周期

```
创建向导填 entry.file → 启用 → 「加载」→ activate(ctx) 建立连接 + registerTool 注册工具
                                                            ↓
                                          Agent 调用 → run(args) 执行（auto 直接 / ask 弹卡批准）
                                                            ↓
                          卸载/禁用 → onDispose() 回滚（关连接池）→ 逐个 unregister 已注册工具
```

关键点：**时间可组合性**——插件注册的工具在卸载时会被逐个撤回，连接池在 `onDispose` 里关闭，不残留任何状态。

### 9.4 完整可复制示例：外部数据库连接插件

这是一个「连外部数据库」的代码插件：`activate` 里 `import pg` 建外部 `Pool`（连接串来自 `config.connectionString`），注册两个工具（`ext-db.query` 只读查询、`ext-db.count` 表计数），`onDispose` 关闭连接池。拷走改 `connectionString` 即用。

文件 `apps/server/plugins/external-db.plugin.ts`：

```ts
// 外部数据库连接插件：演示代码插件连任意外部数据库（非平台 PG）。
interface Ctx {
  registerTool: (def: {
    name: string;
    description: string;
    permission: 'auto' | 'ask' | 'forbidden';
    run: (args: Record<string, unknown>) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  }) => void;
  llm: (prompt: string) => Promise<string>;
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };
  config: Record<string, unknown>;
  log: (...args: unknown[]) => void;
}

export default async function activate(ctx: Ctx) {
  // 1. 连接串来自 manifest.config（插件作者在创建向导里填），动态 import pg 建外部库连接。
  const { Pool } = await import('pg');
  const connectionString = String(ctx.config.connectionString ?? '').trim();
  if (!connectionString) {
    ctx.log('外部库插件：manifest.config 缺少 connectionString，跳过建连（工具不可用）');
    return { onDispose: () => { ctx.log('外部库插件卸载（未建立连接，无需回滚）'); } };
  }

  // 2. Pool 建在 activate 闭包：两个工具的 run 都引用它，onDispose 里统一关闭。
  const pool = new Pool({ connectionString });

  // 3. 只读查询（permission='ask'：写前人工批准；强制只读 + LIMIT 100 防全表扫）。
  ctx.registerTool({
    name: 'ext-db.query',
    description: '对外部数据库执行只读 SQL 查询（仅 SELECT/WITH，自动补 LIMIT 100，最多 100 行）',
    permission: 'ask',
    run: async (args) => {
      try {
        const raw = String(args.sql ?? '').trim().replace(/;\s*$/, '');
        if (!raw) return { ok: false, error: 'sql 参数为空' };
        if (!/^(select|with)\b/i.test(raw)) {
          return { ok: false, error: 'ext-db.query 仅支持只读查询（SELECT / WITH）' };
        }
        const safeSql = /limit\s+\d+/i.test(raw) ? raw : `${raw} LIMIT 100`;
        const r = await pool.query(safeSql);
        return { ok: true, data: { rows: r.rows, count: r.rows.length } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  });

  // 4. 表计数（permission='auto'：只读统计自动执行）。
  ctx.registerTool({
    name: 'ext-db.count',
    description: '统计外部数据库某张表（可带 schema）的行数',
    permission: 'auto',
    run: async (args) => {
      try {
        const table = String(args.table ?? '').trim();
        if (!table) return { ok: false, error: 'table 参数为空' };
        // 表名无法参数化：白名单校验 + 双引号包裹防 SQL 注入
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(table)) {
          return { ok: false, error: 'table 仅允许 [schema.]表名（字母/数字/下划线）' };
        }
        const quoted = table.split('.').map((p) => `"${p}"`).join('.');
        const r = await pool.query(`SELECT count(*)::int AS n FROM ${quoted}`);
        return { ok: true, data: { table, count: r.rows[0]?.n ?? 0 } };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  });

  ctx.log('外部库插件激活', JSON.stringify({ host: connectionString }));

  // 5. 卸载回滚：关闭外部连接池。
  return {
    onDispose: async () => {
      ctx.log('外部库插件卸载——关闭外部连接池');
      await pool.end();
    },
  };
}
```

配套 manifest（`entry.file` 指向插件文件的**绝对路径**，`config.connectionString` 即创建向导里填的连接串）：

```json
{
  "name": "外部数据库连接插件",
  "version": "0.1.0",
  "kind": "custom",
  "description": "连接外部业务库做只读查询与表计数",
  "entry": { "file": "/absolute/path/to/external-db.plugin.ts" },
  "tools": [
    { "name": "ext-db.query", "description": "只读 SQL（SELECT/WITH，LIMIT 100）", "permission": "ask" },
    { "name": "ext-db.count", "description": "表行数统计", "permission": "auto" }
  ],
  "config": { "connectionString": "postgres://user:pass@external-host:5432/mydb" }
}
```

> `manifest.tools` 供 UI 展示 / AI 检索用；真正的工具注册发生在 `activate` 里的 `ctx.registerTool`（加载时写入 ToolRegistry，卸载时逐个撤回）。

### 9.5 安全模型

代码插件运行在**平台同进程**里，因此它的安全边界是**信任模型**，不是沙箱：

- 插件代码与平台同进程，能 `import` 任意已安装依赖（`pg`、`axios` 等），**代码必须可信**——只加载自己写的、或可信来源的插件；
- `ctx` 白名单是 **API 规范收敛**（让插件作者只用这套接口、不碰内部细节），**不是**安全隔离——恶意代码仍可通过 `import('child_process')` 越界；
- 权限三档（auto/ask/forbidden）依然生效：`run` 执行前仍经 `WAITING_FOR_APPROVAL` 门控与 `audit_log` 审计；
- **不可信的第三方服务，请走 MCP 连接器**（进程外、有独立沙箱与传输边界），不要用代码插件直接加载第三方代码。

### 9.6 如何安装

1. 左侧导航「工具与插件」→ 插件库 → 「＋ 创建插件」；
2. 基本信息：名称 `外部数据库连接插件`，kind 选 `custom`；
3. manifest 里填 `entry.file`（插件 `.ts` 文件绝对路径）+ `config.connectionString`（外部库连接串）；
4. 点「创建（draft）」→ 详情抽屉「启用」；
5. 点「加载」按钮（或 `POST /api/plugin-runtime/{short_id}/load`）→ `activate` 执行，工具出现在「工具注册表」；
6. Agent 对话 / 验证流中即可调用 `ext-db.query`（ask 弹卡）与 `ext-db.count`（auto 直接执行）。

等价的 API 调用：

```bash
# 加载代码插件（触发 activate + registerTool）
curl --noproxy '*' -X POST http://127.0.0.1:8080/api/plugin-runtime/plg_xxxxxx/load

# 查看已加载插件的工具清单
curl --noproxy '*' http://127.0.0.1:8080/api/plugin-runtime

# 卸载（触发 onDispose 回滚 + 撤回工具）
curl --noproxy '*' -X POST http://127.0.0.1:8080/api/plugin-runtime/plg_xxxxxx/unload
```

> 连接失败不会让加载崩溃：`activate` 里 `new Pool` 不立即连库，真正的连接发生在首次 `run`，失败时被 `try/catch` 捕获返回 `ok:false`，不会向外抛异常。
