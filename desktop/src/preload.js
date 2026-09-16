// VerifyOS Desktop 预加载脚本
// 通过 contextBridge 把主进程能力安全暴露给渲染层（含 Web 控制台页面），
// 隔离上下文、不开启 nodeIntegration。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('verifyosDesktop', {
  // token 持久化
  getToken: () => ipcRenderer.invoke('token:get'),
  saveToken: (token) => ipcRenderer.invoke('token:save', token),
  clearToken: () => ipcRenderer.invoke('token:clear'),
  // 控制台导航
  openConsole: () => ipcRenderer.invoke('app:open-console'),
  getWebUrl: () => ipcRenderer.invoke('app:get-web-url'),
  // 环境信息
  platform: process.platform,
});
