---
name: verifyos-test
description: 当需要创建、修改 VerifyOS 验证（编写步骤 / 断言 / targetRef）或触发一次验证运行时使用。教 Agent 掌握验证步骤模型（module / deterministic / ai / assertion）的正确写法，并通过 verifyos MCP 的 run / list_verifications / read_run 工具触发与查看结果。避免写出畸形步骤后与报错死磕。
---

# verifyos-test：怎么建测试 / 断言 / 步骤

VerifyOS 的 MCP 只给「工具」，本 Skill 教「怎么用」。核心认知：**验证由一组有序步骤组成**，每一步有明确的 `kind`，引擎按 kind 决定执行方式。步骤写错（字段缺失 / kind 不匹配 / selector 不合法）会导致 run 直接 `fail` 或 `unknown`——先读懂模型，再写步骤。

## 一、验证步骤模型（4 种 kind）

步骤的 `kind` 只能是以下四种之一（枚举值固定，多一个字母引擎就不认）：

| kind | 含义 | 是否走 LLM | 关键字段 |
| --- | --- | --- | --- |
| `module` | 确定性动作序列（goto / fill / click） | 否（零 LLM，`llmCalls=0`） | `actions[]` |
| `deterministic` | 引擎内置确定性脚本步骤 | 否（零 LLM） | 引擎内置执行，无可视编辑 |
| `ai` | 自然语言步骤（Stagehand act） | 是（首跑）；固化后零 LLM | `instruction`（可选 `selector`/`action`/`value`） |
| `assertion` | 断言 | 否 | `assert: { kind, value }` |

所有步骤都可选带 `targetRef`（防假绿，见下）。

### 1. module —— 确定性 selector，零 LLM

用 CSS/Playwright selector 直接操作，不消耗 LLM，最快最稳。首选 `#id`、`[name=...]`、`data-testid` 等稳定选择器。

```json
{ "id": "st_login", "title": "管理员登录", "kind": "module",
  "actions": [
    { "type": "fill",  "selector": "#username", "value": "admin" },
    { "type": "fill",  "selector": "#password", "value": "test123" },
    { "type": "click", "selector": "button[type=\"submit\"]" }
  ]
}
```

`actions[]` 元素支持三种 `type`：
- `goto`：导航，字段 `url`
- `fill`：输入，字段 `selector` + `value`
- `click`：点击，字段 `selector`

### 2. ai —— 自然语言步骤

不确定 selector 时用自然语言描述，引擎用 Stagehand act 执行；跑通后会**自动抽取 selector 固化**（见 verifyos-maintain），下次零 LLM 重放。

```json
{ "id": "st_edit", "title": "打开第一行编辑", "kind": "ai",
  "instruction": "点击第一行的「编辑」按钮",
  "targetRef": "edit.html"
}
```

固化的 ai 步骤会带上确定性 selector（引擎回写，不要手编）：
```json
{ "id": "st_edit", "title": "打开第一行编辑", "kind": "ai",
  "instruction": "点击第一行的「编辑」按钮",
  "selector": "button.edit-btn", "action": "click",
  "targetRef": "edit.html"
}
```

### 3. assertion —— 三种断言

`assert.kind` 只能三选一，`value` 语义随 kind 变化：

| kind | `value` 填什么 | 引擎判定 |
| --- | --- | --- |
| `url_contains` | URL 片段（子串） | `page.url().includes(value)` |
| `text_visible` | 页面可见文本 | 等 `text=<value>` 出现（5s 超时） |
| `element_visible` | CSS selector | 等 `<value>` 元素可见（5s 超时） |

```json
{ "id": "st_assert", "title": "跳转到列表页", "kind": "assertion",
  "assert": { "kind": "url_contains", "value": "list.html" },
  "targetRef": "list.html"
}
```

### 4. targetRef —— 防假绿

`targetRef` 声明「这一步应当触达的目标（URL 子串 / 图节点 ref）」。步骤全绿但实际触达路径（`visitedUrls`）没经过 `targetRef` → 该步改判 `unknown`，整个 run 判 `unknown`（**UNKNOWN ≠ PASS**，不允许假绿）。

> 涉及页面跳转 / 分支的步骤，务必给 `targetRef`。例如点击「编辑」后应落到 `edit.html`，就写 `"targetRef": "edit.html"`。

## 二、用 verifyos MCP 触发验证

MCP 暴露 3 个工具：`run` / `read_run` / `list_verifications`。步骤本身存在后端验证记录里（在 VerifyOS 编辑器或 HTTP API 中编写），MCP 负责「触发 + 看结果」。

### list_verifications —— 列出验证库，拿到 short_id

入参：无（`{}`）。
返回结构：
```json
{ "ok": true, "count": 2, "items": [
  { "short_id": "ver_a1b2c3", "title": "管理员登录后跳转列表", "status": "ready" },
  { "short_id": "ver_d4e5f6", "title": "编辑保存成功", "status": "ready" }
] }
```

### run —— 触发一次验证并轮询到终态

入参（三选一可选）：
| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ver` | string | 否 | 验证 `short_id`；不传跑后端默认验证 |
| `startUrl` | string | 否 | 被测应用入口 URL；不传用后端默认入口 |
| `timeoutMs` | number | 否 | 轮询超时毫秒，默认 `120000` |

调用范式（Agent 语义层）：
```
run({ ver: "ver_a1b2c3" })
run({ ver: "ver_a1b2c3", startUrl: "http://localhost:3000/list.html", timeoutMs: 120000 })
```

底层 JSON-RPC 2.0 `tools/call`（对照即可，客户端会自动封装）：
```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
  "params": { "name": "run", "arguments": { "ver": "ver_a1b2c3", "timeoutMs": 120000 } } }
```

返回结构（终态）：
```json
{
  "ok": true,
  "runId": "run_9f3a…",
  "verdict": "pass",
  "llmCalls": 3,
  "durationMs": 8421,
  "failedStep": null,
  "failureSummary": null,
  "evidenceKeys": ["run_9f3a…/screenshot-st_assert-1a2b3c.png", "run_9f3a…/trace-run-4d5e6f.zip"],
  "visitedUrls": ["http://localhost:3000/list.html", "http://localhost:3000/edit.html"],
  "stepResults": [
    { "id": "st_login", "verdict": "pass", "llmCalls": 0, "cacheHit": false, "durationMs": 210 },
    { "id": "st_assert", "verdict": "pass", "llmCalls": 0, "cacheHit": false, "durationMs": 95 }
  ]
}
```

`verdict` 三种取值：`pass` / `fail` / `unknown`。失败时 `failedStep` 指向失败步骤 id，`failureSummary` 给原因。

### read_run —— 读取某次 run 详情

入参：`id`（`runId` / `short_id`，**必填**）。
```
read_run({ id: "run_9f3a…" })
```
返回结构与 `run` 相同（同一份摘要 JSON）。

## 三、正确写法 vs 反例（畸形步骤）

| 反例（❌ 会 fail/unknown 或引擎不认） | 问题 | 正确写法（✅） |
| --- | --- | --- |
| `"kind": "assertion", "assert": { "kind": "url_equal", "value": "x" }` | `url_equal` 不在三选一里，字段名/枚举错 | `"assert": { "kind": "url_contains", "value": "x" }` |
| `"kind": "module"`（无 `actions`） | 没有动作，跑不出任何行为 | 补 `actions`，或改用 `ai` + `instruction` |
| `"kind": "ai"`（无 `instruction`） | 无指令，不触发任何 LLM 动作 | 补 `instruction` |
| `"kind": "module", "actions": [{ "type": "click", "selector": "登录按钮" }]` | `"登录按钮"` 不是合法 CSS selector | 用 `#loginBtn` / `button[type=submit]`，或降级为 `ai` 自然语言步骤 |
| `"kind": "assertion", "assert": { "kind": "element_visible", "value": "保存成功" }` | `element_visible` 的 `value` 应是 CSS selector，不是文本 | 文本用 `text_visible`；元素用 `element_visible` + selector |
| 跳转步骤不带 `targetRef` | 全绿也可能假绿，验证失去意义 | 补 `targetRef: "edit.html"` |

**选择 kind 的决策顺序**：能确定 selector → `module`（零 LLM 最快）；不确定 → `ai`（自然语言，跑通自动固化）；只校验结果 → `assertion`；涉及跳转 → 给 `targetRef`。

## 四、前置条件

MCP 工具需要已配置 baseUrl：`verifyos login <url>` 或环境变量 `VERIFYOS_BASE_URL`。未配置时工具返回 `isError: true`（文本 `未配置 baseUrl…`），此时不要重试工具，先完成登录配置。
