# T13 原生移动 App 自动化：技术选型与触发链路设计

> 状态：低优先级后置（Web 设备模拟已覆盖演示场景，原生 App 测试重、CI 跑不动）。
> 本文是「技术选型 + 触发链路设计」交付物；真机/云真机与 Maestro/Appium 实跑后置。

## 1. 现状与问题

当前「移动」能力在 `packages/agent-core/src/runner.ts` 的 `DEVICE_PROFILES` 里实现：
本质是 **移动 Web 设备模拟**——用 Playwright 的 viewport / userAgent / hasTouch / isMobile / deviceScaleFactor
叠加在 Stagehand 的 `contextOptions` 上（见 `runner.ts` 的 `deviceProfile()` 与 `contextOptions` 注入），
跑的还是 Web 页面。它不是原生 App 自动化：没有 APK/IPA、没有 Android Emulator / iOS Simulator、
没有 UI 元素树（Native 侧无 DOM/CSS selector）。

因此 T13 要解决的是：**原生移动 App 自动化的技术选型 + 触发链路设计**，实跑后置。

## 2. 技术选型：Maestro vs Appium

| 维度 | Maestro | Appium |
| --- | --- | --- |
| 定位 | 移动 UI 测试，声明式 YAML flow | 跨平台移动自动化框架，WebDriver 协议 |
| 平台 | iOS + Android（原生） | iOS + Android（原生 / 混合 / Web） |
| 上手成本 | 低：YAML 描述 tap / inputText / assertVisible，无需写代码 | 高：需写测试代码（Java/Python/JS），维护 driver 与 capability |
| 元素定位 | 文本 / id / 语义（accessibility label），对 AI 语义定位友好 | XPath / id / accessibility id / 多种策略，生态最全 |
| 安装运维 | 轻：单二进制 + JVM，依赖少 | 重：Appium Server + 各平台 driver（UiAutomator2 / XCUITest）+ 依赖链 |
| 真机矩阵 | 弱：单机驱动为主，云真机需自配 | 强：Sauce Labs / BrowserStack / 自建 farm 生态成熟 |
| CI 集成 | 简单（maestro test 一条命令） | 较复杂（server 编排 + 设备管理） |
| 声明式 / AI 适配 | 天然声明式，flow 可直接由 AI 生成 | 命令式，需桥接 |
| 社区 / 生态 | 中小（Mobile.dev，成长快） | 大而成熟（业界事实标准） |

### 结论（倾向）

- **只做 UI 级原生验证（冒烟 / 关键路径 / 回归）→ 选 Maestro**：声明式 YAML 与 VerifyOS
  现有的「步骤 → 自然语言 → 可固化」模型最贴合，AI 生成 flow 成本低，CI 与本地模拟器跑得轻。
- **要跨 iOS+Android+真机矩阵、混合 App（WebView/Hybrid）、或与企业现有 Appium 资产对接 → 选 Appium**：
  生态最全，云真机（BrowserStack 等）与 CI farm 支持成熟，但运维与代码成本高。

**推荐路径**：先 Maestro 起手做模拟器级 UI 验证（轻、快、声明式），Appium 作为真机矩阵后置可选升级。
两者共用同一 `NativeAppRunConfig`（见第 4 节），触发链路抽象平台无关，切换成本低。

### 与 Momentic 的对齐

学 Momentic 的诚实口径：「移动 setup 复杂且不成熟」。VerifyOS 现阶段不承诺原生 App 全自动化，
Web 设备模拟已覆盖演示场景；原生能力以「占位 + 明确后置」落地，不假装执行。

## 3. 真机 / 云真机策略（后置）

- **先模拟器**：Android Emulator（avd）与 iOS Simulator（xcrun simctl）本地跑通 Maestro flow。
- **再真机/云真机**：Appium + BrowserStack/Sauce Labs 或自建 farm；Maestro 单机真机（adb/idb 直连）。
- CI 暂不接入原生矩阵（重、慢），保留手动/按需触发入口。

## 4. 触发链路设计

现有 `RunRunner.run()` 的 `device` 参数语义是「移动 Web 设备模拟」的预设名（'iPhone 13' 等）。
原生 App 触发扩展为 `target` 字段（新增，默认 `web-sim` 保持向后兼容）：

```ts
// packages/agent-core/src/native-mobile.ts
export type DeviceTarget = 'web-sim' | 'android' | 'ios';
export type NativeMobilePlatform = 'android' | 'ios';
export interface NativeAppRunConfig {
  appId: string;          // Android packageName 或 iOS bundleId
  platform: NativeMobilePlatform;
  device?: string;        // avd / sim 名，空则默认模拟器
  maestroFlow?: string;   // Maestro flow YAML 路径
  appiumCaps?: Record<string, unknown>; // Appium capabilities
}
```

`RunRunner.run()` 新增 `target?: DeviceTarget` 与 `nativeApp?: NativeAppRunConfig`：

- `target` 缺省 / `'web-sim'`：走既有 Stagehand 链路（含 `device` 的 viewport/UA 模拟），**行为不变**。
- `target` 为 `'android'` / `'ios'`：短路返回诚实占位 outcome（见下），**不初始化 Stagehand、不驱动模拟器**。

占位 outcome（`runner.ts` 的 native 短路分支）：
- `verdict = 'unknown'`（无法确认，而非假 pass / 假 fail）
- `failureSummary = '原生 App 自动化待 Maestro/Appium 接入：<target>（<appId>）当前为触发链路占位实现，未真实驱动模拟器/真机。'`
- 事件流：`run.started`（platform='mobile' 占位，见第 5 节）→ `step.observation`(false, 上述说明) → `run.completed`(unknown)

## 5. platform 字段扩展与结果落库兼容

- 类型：`RunTargetPlatform = 'web' | 'mobile' | 'api' | 'android' | 'ios'`（`native-mobile.ts` 已定义）。
- run 表：`run.target` 是 `jsonb`（`migrations/001_init.sql:175`），**无 platform CHECK 约束**，
  可直接存 `android` / `ios`，不破坏现有 web 落库。
- 事件协议：`packages/shared/src/events.ts` 的 `Platform = z.enum(['web','mobile','api'])` 暂未扩展。
  占位分支以 `platform: 'mobile'` 表达「原生移动」，native 平台语义由 `nativeApp.platform` 承载。
  **后置落地时**建议把 `Platform` 扩展为 `['web','mobile','api','android','ios']`（向后兼容，仅追加枚举值）。
- `device_preset.platform` 有 `CHECK (platform IN ('web','mobile','api'))`（`001_init.sql:249`），
  原生 preset 需**后置追加迁移**放宽 CHECK（apps/server 范围，本次不改）。

## 6. 改动清单

- `packages/agent-core/src/native-mobile.ts`（新增）：target / 平台类型 + NativeAppRunConfig + 占位消息。
- `packages/agent-core/src/runner.ts`：`run()` 新增 `target` / `nativeApp`，native 短路占位；web-sim 链路不动。
- `packages/agent-core/src/index.ts`：导出 native-mobile 类型。
- `packages/agent-core/docs/native-mobile.md`（本文）。

## 7. 遗留 / 后置项

1. Maestro / Appium 实际驱动（模拟器 + 真机/云真机）接入，替换占位短路。
2. shared `Platform` 枚举追加 `android` / `ios`（需同步重编 shared dist）。
3. `device_preset.platform` CHECK 放宽 + 原生 preset 迁移（apps/server）。
4. 原生 UI 元素树 / 断言 → VerifyOS 现有 `StepDef` 的映射（native 无 CSS selector，需 semantic id 定位层）。
5. CI 原生矩阵（重、慢）暂缓，保留手动触发入口。
