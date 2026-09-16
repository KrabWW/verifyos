---
name: verifyos-spec
description: 当接到代码改动 / 修复 / 新功能任务时，在动手改代码之前使用。教 Agent「先写受影响测试再改代码」：用 verifyos MCP 的 list_verifications / read_run 摸清现有验证覆盖，先补一条验证锁定受影响行为，改完再用 run 确认回归。
---

# verifyos-spec：改代码前先写受影响测试

原则：**MCP 给工具，改代码前先用验证锁定「受影响的行为」，再动手改。** 否则改完才发现破坏了已有功能，只能在报错里瞎猜。

## 触发条件

出现以下任一场景时先执行本流程：
- 接到「修 bug」「加功能」「重构」「改 UI/文案」等代码改动任务
- 改动可能影响已有页面 / 流程 / 分支
- 需要在改动后确认「没有回归」

## 流程：Spec 先行（四步）

### 第 1 步：看现有覆盖

用 `list_verifications` 列出现有验证，找出与改动相关的条目：

```
list_verifications()
```
返回：
```json
{ "ok": true, "count": 3, "items": [
  { "short_id": "ver_a1b2c3", "title": "管理员登录后跳转列表", "status": "ready" },
  { "short_id": "ver_d4e5f6", "title": "编辑保存成功", "status": "ready" },
  { "short_id": "ver_g7h8i9", "title": "删除二次确认", "status": "ready" }
] }
```

想确认某条验证的具体步骤（是否覆盖了你正要改的路径），用 `read_run` 看它最近一次 run 的 `stepResults` / `visitedUrls`：

```
read_run({ id: "ver_d4e5f6" })
```

### 第 2 步：识别受影响功能

把改动映射到「受影响的行为」：
- 改了某个按钮的 selector → 涉及它的 `module` / `ai` 步骤可能失效
- 改了跳转目标 URL → 涉及 `targetRef` / `url_contains` 断言的验证会 `fail` 或 `unknown`
- 改了页面文案 → `text_visible` 断言会失配
- 新增了分支 / 页面 → 需要一个新验证覆盖它

### 第 3 步：先补一条验证，再改代码

如果现有验证没覆盖到受影响行为，**先补**（在 VerifyOS 编辑器 / HTTP API 中新增或复制一条验证，写清步骤与 `targetRef`）：

```json
{ "id": "st_01", "title": "登录", "kind": "module",
  "actions": [
    { "type": "fill",  "selector": "#username", "value": "admin" },
    { "type": "fill",  "selector": "#password", "value": "test123" },
    { "type": "click", "selector": "button[type=\"submit\"]" }
  ] },
{ "id": "st_02", "title": "改动后仍跳转列表", "kind": "assertion",
  "assert": { "kind": "url_contains", "value": "list.html" },
  "targetRef": "list.html" }
```

用 `run` 先跑一遍，确认这条验证在当前代码上**能通过**（拿到基线）：
```
run({ ver: "ver_new1", startUrl: "http://localhost:3000/" })
```
> 基线必须 pass。若新验证本身在未改动代码上就 fail/unknown，说明验证写错了，先修验证（见 verifyos-test）。

### 第 4 步：改代码 → run 确认

改完代码，重跑同一条验证，确认回归：

```
run({ ver: "ver_new1" })
```
- 返回 `verdict: "pass"` → 改动没有破坏该行为
- 返回 `verdict: "fail"` / `"unknown"` → 按 verifyos-maintain 排查（先查证据，别盲改）

## 反例：不该这么做

- ❌ 直接改代码，改完不知道影响了什么，等 run 报错才被动查
- ❌ 先改代码、后补验证——补的验证只验证了「改动后的实现」，无法证明没回归
- ❌ 新验证在未改动代码上就跑不通，却硬继续改代码（基线不成立，回归无从谈起）
- ❌ 跳过 `list_verifications` 盲目新建验证，重复造轮子，覆盖碎片化
