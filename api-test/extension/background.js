/**
 * background service worker（MV3）：
 * - 接收 panel 导出的 TrafficRecord JSON，落 chrome.downloads 下载；
 * - 维护 storage.captured 供 popup 展示统计。
 *
 * 说明：捕获本身在 panel（devtools 上下文）完成，background 只负责
 * 「下载文件」这件 panel 做不了的事（panel 无法直接触发保存文件对话框）。
 */

/** 生成导出文件名：verifyos-traffic-<时间戳>.json */
function exportFileName() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `verifyos-traffic-${ts}.json`;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'EXPORT_JSON') {
    const blob = new Blob([JSON.stringify(msg.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download(
      {
        url,
        filename: exportFileName(),
        saveAs: true, // 让用户选保存位置
      },
      (downloadId) => {
        URL.revokeObjectURL(url);
        sendResponse({ ok: downloadId !== undefined, downloadId });
      },
    );
    return true; // 异步 sendResponse
  }
  if (msg && msg.type === 'CLEAR_CAPTURED') {
    chrome.storage.local.set({ captured: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
