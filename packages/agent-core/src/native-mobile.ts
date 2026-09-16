/**
 * T13 原生移动 App 自动化（Maestro/Appium）——触发链路类型与占位实现。
 *
 * 现状：runner.ts 的 DEVICE_PROFILES 是「移动 Web 设备模拟」（Playwright viewport/UA/触控叠加），
 *       本质仍是跑 Web 页面，不是原生 App 自动化。本模块定义原生 App 的触发 target 与平台语义，
 *       并提供诚实的占位实现——返回「原生 App 自动化待 Maestro/Appium 接入」说明，不假装执行。
 *
 * 后置范围：真机/云真机接入后置；先模拟器（Android Emulator / iOS Simulator）。
 */

// ---------- 触发 target 与平台语义 ----------

/**
 * 设备触发 target（run() 的 device 参数扩展方向）：
 * - web-sim：现有「移动 Web 设备模拟」（DEVICE_PROFILES viewport/UA/触控），默认值，向后兼容
 * - android：原生 Android App（后置 Maestro/Appium 驱动模拟器/真机）
 * - ios：原生 iOS App（后置 Maestro/Appium 驱动模拟器/真机）
 */
export type DeviceTarget = 'web-sim' | 'android' | 'ios';

/** 原生移动平台（run 落库 target.platform 的 native 扩展语义） */
export type NativeMobilePlatform = 'android' | 'ios';

/**
 * run 表 target.platform 的完整扩展类型（设计 + 类型，不破坏现有 web）。
 * 现有 shared Platform = 'web' | 'mobile' | 'api'；native 后置落地时在此基础追加 android/ios。
 */
export type RunTargetPlatform = 'web' | 'mobile' | 'api' | NativeMobilePlatform;

/** 判断是否为原生 target */
export function isNativeTarget(target: DeviceTarget | undefined): target is NativeMobilePlatform {
  return target === 'android' || target === 'ios';
}

/** 原生 target → 平台（非原生返回 null） */
export function nativePlatformOf(target: DeviceTarget): NativeMobilePlatform | null {
  return isNativeTarget(target) ? target : null;
}

// ---------- 原生 App 运行配置（占位，供 Maestro/Appium 接入后使用） ----------

export interface NativeAppRunConfig {
  /** 应用标识：Android packageName 或 iOS bundleId */
  appId: string;
  /** 平台 */
  platform: NativeMobilePlatform;
  /** 模拟器/真机设备名（Android avd 名或 iOS sim 名）；空则用默认模拟器 */
  device?: string;
  /** Maestro flow YAML 路径（选 Maestro 时） */
  maestroFlow?: string;
  /** Appium capabilities（选 Appium 时） */
  appiumCaps?: Record<string, unknown>;
}

// ---------- 占位说明 ----------

/** 原生 App 自动化未接入的统一说明（诚实占位，不假装执行） */
export function nativePlaceholderMessage(target: NativeMobilePlatform, config?: NativeAppRunConfig): string {
  const app = config?.appId ? `（${config.appId}）` : '';
  return `原生 App 自动化待 Maestro/Appium 接入：${target}${app} 当前为触发链路占位实现，未真实驱动模拟器/真机。`;
}

/** 占位 RunStarted 的 environment.url（native:// 伪协议表达原生 target，不进入 Stagehand 导航） */
export function nativeEnvironmentUrl(target: NativeMobilePlatform, config?: NativeAppRunConfig): string {
  return `native://${config?.appId ?? target}`;
}
