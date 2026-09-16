---
name: verifyos-maintain
description: 当 run 返回 fail / unknown、验证反复失败、需要排查失败原因、去除 flake、修复过期 selector 时使用。教 Agent「失败先查缓存/证据而非盲改」：用 read_run 看步骤结果与证据（screenshot / trace / har / console）定位根因，识别 flake 与 selector 过期，并结合 selector 固化 / 缓存回放机制修复。
---

# verifyos-maintain：排查失败 / 去 flake / 修过期步骤

核心原则：**失败先查缓存 / 证据，而非盲改。** run 返回 `fail` / `unknown` 时，第一步永远是 `read_run` 看证据，而不是猜着改步骤或改代码。

## 触发条件

- `run` 返回 `verdict: "fail"` 或 `"unknown"`
- 同一条验证多次跑，结果时好时坏（疑似 flake）
- 以前能过的验证现在失败（疑似 selector 过期 / 页面改版）

## 一、先看 run 详情：read_run

拿到 runId 后（`run` 返回里有，或 `list_verifications` 找到 short_id 后查最近 run）：

```
read_run({ id: "run_9f3a…" })
```

返回结构（与 run 相同）：
```json
{
  "ok": true,
  "runId": "run_9f3a…",
  "verdict": "fail",
  "llmCalls": 5,
  "durationMs": 12340,
  "failedStep": "st_edit",
  "failureSummary": "Timeout 5000ms exceeded: waiting for selector `button.edit-btn`",
  "evidenceKeys": [
    "run_9f3a…/screenshot-st_edit-1a2b3c.png",
    "run_9f3a…/trace-run-4d5e6f.zip",
    "run_9f3a…/network-run-7f8g9h.har",
    "run_9f3a…/console-run-0a1b2c.log"
  ],
  "visitedUrls": ["http://localhost:3000/list.html"],
  "stepResults": [
    { "id": "st_login",   "verdict": "pass", "llmCalls": 0, "cacheHit": false, "durationMs": 210 },
    { "id": "st_edit",    "verdict": "fail", "llmCalls": 1, "cacheHit": false, "durationMs": 5210 },
    { "id": "st_assert",  "verdict": "pass", "llmCalls": 0, "cacheHit": false, "durationMs": 95 }
  ]
}
```

**读法（按顺序）：**
1. `failedStep` 指出失败步骤 id，`failureSummary` 给出引擎报错原文——先读这两行。
2. `stepResults` 定位是第几步挂的；`llmCalls` 判断失败步是否走了 LLM（`cacheHit: true` 说明是缓存重放失败，`false` + `llmCalls>0` 说明是 LLM act 失败）。
3. `evidenceKeys` 列出本次证据文件：`screenshot`（每步截图）、`trace`（trace.zip）、`network`（HAR）、`console`（页面 console/error 日志）、`video`（webm）。
4. `visitedUrls` 判断触达路径：断言/`targetRef` 步骤是否真的到了目标页。

> 证据是判定依据，不是装饰。截图能看「页面到底长啥样」，console 能看「页面有没有 JS 报错」，HAR 能看「接口通没通」——先看证据再下结论。

## 二、识别 flake（时间断言 / 随机数据）

flake = 同一条验证时好时坏，根因通常不是功能坏了，而是断言写得不稳：

| flake 根因 | 表现 | 修法 |
| --- | --- | --- |
| 时间 / 随机数据断言 | 断言值每次都在变（时间戳、随机 id、订单号） | 不要断言具体值，改断言稳定的 URL 片段 / 固定文案 / 元素存在性 |
| 硬编码 selector 依赖动态 class | CSS class 带哈希每次变 | 换稳定选择器（`#id` / `[name=...]` / `data-testid`） |
| 未等元素就断言 | 页面异步加载，5s 超时偶发 | 让步骤先完成动作再断言；必要时拆步骤 |
| 依赖外部状态 | 依赖某个前置数据是否存在 | 补前置 `module` 步骤造数据 / 登录，隔离外部状态 |

判断是否 flake：连跑 2–3 次同一验证，看 `failureSummary` 是否每次都不同、`failedStep` 是否漂移。漂移 = flake 信号。

## 三、修过期 selector（结合固化 / 缓存回放机制）

### selector 固化机制（T16）

`ai` 步骤首次跑通后，引擎会**自动抽取 selector 写回**：
- 跑通时经「交互探针（localStorage 跨导航存活）→ activeElement → instruction 文本反查」三策略提取 selector
- 提取成功后写入 `LocatorCache`，并持久化到后端 `locator_cache` 表
- 下次跑同一 `instruction` 命中缓存 → **零 LLM 确定性重放**（`cacheHit: true`）

**selector 过期 = 页面改版导致缓存的 selector 失配。** 表现：`cacheHit: true` 却 `fail`，`failureSummary` 是 `Timeout waiting for selector` 之类。

### 修复路径（按优先级）

1. **先确认是页面改了还是 selector 脆了**：看该步 `screenshot`，比对页面现状。
2. **改更稳的 selector**：在验证编辑器把过期步骤改为 `#id` / `[name=...]` / `data-testid` 等稳定选择器；若本来就是脆 selector，优先换稳。
3. **让缓存失效重固化**：改 `instruction` 文案（哪怕微调），或清掉该 `instruction` 对应的 `locator_cache` 记录，让引擎重新 act 一次、重新抽取 selector。
4. **手动固化确定性写法**：确认目标后，直接把 `ai` 步骤补上 `selector`/`action`/`value` 三字段，或改为 `module` 步骤（`actions` 数组），彻底零 LLM。

> 不要直接改代码去「迁就」测试，除非证据（截图/console/HAR）证明是应用本身的 bug——那是另一回事，回到 verifyos-spec：先写受影响测试再改。

## 四、unknown 的专属排查（防假绿）

`verdict: "unknown"` 通常是 `targetRef` 触达校验没过：步骤全绿但 `visitedUrls` 没经过 `targetRef`。

排查：
- 看 `visitedUrls`，确认实际跳到了哪
- 确认 `targetRef` 是否填错（拼写 / 大小写 / 是否真的是 URL 子串）
- 若页面确实改了跳转目标，同步更新 `targetRef`（或确认这是不是 bug）

## 五、失败排查决策树

```
run 返回 fail/unknown
  └─ read_run({ id }) 拿详情
       ├─ failureSummary 是 selector 超时 + cacheHit:true → selector 过期 → 走「三、修过期 selector」
       ├─ failedStep 漂移 / 多次结果不一致 → flake → 走「二、识别 flake」
       ├─ verdict:unknown 且步骤全绿 → targetRef 未触达 → 走「四」
       ├─ 证据(console/HAR/screenshot)显示应用 JS 报错 / 接口 5xx → 应用本身 bug → 回到 verifyos-spec 先写测试再改代码
       └─ 仍无头绪 → 用 read_run 反复核对 stepResults 逐步骤定位，绝不盲改步骤凑绿
```
