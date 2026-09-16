/**
 * popup：显示捕获统计（读 background 维护的 storage.captured）+ 清空入口。
 * 捕获主流程在 panel.js（devtools 上下文），这里只做状态展示。
 */

function refreshStats() {
  chrome.storage.local.get(['captured'], (result) => {
    const captured = Array.isArray(result.captured) ? result.captured : [];
    const ajax = captured.filter((r) => r && r.request_class === 'ajax').length;
    const countEl = document.getElementById('count');
    const ajaxEl = document.getElementById('ajax');
    if (countEl) countEl.textContent = String(captured.length);
    if (ajaxEl) ajaxEl.textContent = String(ajax);
  });
}

document.getElementById('clear')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURED' }, () => {
    refreshStats();
  });
});

document.addEventListener('DOMContentLoaded', refreshStats);
