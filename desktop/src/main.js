// VerifyOS Desktop 主进程
// 职责：创建窗口加载 Web 控制台，提供本地 token 文件读写，控制台不可用时回退本地 shell 页。
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { createTokenStore } = require('./token-store');

// Web 控制台地址（dev 默认 ;5174，可用 VERIFYOS_WEB_URL 覆盖；打包后指向前端静态产物）
const WEB_URL = process.env.VERIFYOS_WEB_URL || 'http://localhost:5174';

// 冒烟模式：环境变量 VERIFYOS_SMOKE=1 或命令行 --smoke 触发
const SMOKE = process.env.VERIFYOS_SMOKE === '1' || process.argv.includes('--smoke');
// 冒烟日志文件（无头环境 stdout 可能丢失，写文件作为证据）
const SMOKE_LOG = '/tmp/verifyos-desktop-smoke.log';
function smokeLog(line) {
  const msg = `[smoke] ${line}\n`;
  try {
    fs.appendFileSync(SMOKE_LOG, msg, 'utf8');
  } catch {
    // 写日志失败不阻塞
  }
  console.log(msg.trim());
}

// 本地 token 存储：app.getPath('userData')/token.json
const tokenStore = createTokenStore(app.getPath('userData'));
const readToken = () => tokenStore.read();
const writeToken = (t) => tokenStore.write(t);
const clearToken = () => tokenStore.clear();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'VerifyOS Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 优先加载 Web 控制台；失败则回退本地 shell 页（标题栏 + token 输入）
  mainWindow.loadURL(WEB_URL).catch(() => {
    if (!mainWindow) return;
    console.log(`[desktop] Web 控制台加载失败（${WEB_URL}），回退本地 shell 页`);
    mainWindow.loadFile(path.join(__dirname, 'shell.html'));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'VerifyOS',
      submenu: [
        { label: 'Token 设置', click: () => openTokenWindow() },
        { type: 'separator' },
        { label: '重新加载控制台', click: () => reloadConsole() },
        { label: '在浏览器打开', click: () => shell.openExternal(WEB_URL) },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [{ role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 打开独立的 Token 设置窗口
function openTokenWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 360,
    title: 'VerifyOS · Token 设置',
    parent: mainWindow ?? undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'shell.html'));
  win.setMenuBarVisibility(false);
}

function reloadConsole() {
  if (!mainWindow) return;
  mainWindow.loadURL(WEB_URL).catch(() => {
    mainWindow.loadFile(path.join(__dirname, 'shell.html'));
  });
}

// ---- IPC：token 持久化 + 控制台导航（供渲染层通过 preload 调用） ----
ipcMain.handle('token:get', () => readToken());
ipcMain.handle('token:save', (_event, token) => {
  writeToken(String(token ?? '').trim());
  return true;
});
ipcMain.handle('token:clear', () => {
  clearToken();
  return true;
});
ipcMain.handle('app:open-console', () => {
  reloadConsole();
  return true;
});
ipcMain.handle('app:get-web-url', () => WEB_URL);

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  if (SMOKE) {
    smokeLog('app ready');
    runSmoke();
  }

  // macOS：点击 Dock 图标且无窗口时重建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 冒烟模式：窗口加载完成后打印标记并退出，用于无头验证「壳能启动 + 页面加载成功」
function runSmoke() {
  const timer = setTimeout(() => {
    smokeLog('TIMEOUT');
    app.exit(1);
  }, 15000);

  mainWindow.webContents.once('did-finish-load', () => {
    clearTimeout(timer);
    smokeLog('did-finish-load');
    smokeLog('url=' + mainWindow.webContents.getURL());
    smokeLog('token=' + JSON.stringify(readToken()));
    smokeLog('OK');
    setTimeout(() => app.exit(0), 200);
  });
}
