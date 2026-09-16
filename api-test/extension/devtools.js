/**
 * DevTools 入口：注册「VerifyOS 录制」panel。
 * panel 是真正的捕获工作区（chrome.devtools.network 仅在 DevTools 上下文可用）。
 */
chrome.devtools.panels.create(
  'VerifyOS 录制',
  null, // 不用图标（避免额外资源）
  'panel.html',
  () => {
    // panel 创建回调：无需处理（panel.js 自行初始化）
  },
);
