/**
 * P1.1 验收检查：import:har 导入产物在 session 存储中完整可见。
 * 运行：npx tsx scripts/check-import.ts（import:har 之后）
 */
import { JsonFileRecordStore } from '../src/recorder/storage.js';

let failures = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
  } else {
    failures += 1;
    console.error(`  [FAIL] ${msg}`);
  }
}

const store = new JsonFileRecordStore('data/recording.json');
const records = store.list();

assert(records.length === 4, `session 重载可见 4 条记录（实际 ${records.length}）`);
const orders = records.find((r) => r.path === '/api/orders');
assert(orders?.method === 'POST' && orders.status_code === 201, 'POST /api/orders 可见 status=201');
assert(orders?.request_body === JSON.stringify({ sku: 'SKU-001', quantity: 2 }), 'HTTPS 明文请求体可见');
assert((orders?.response_body ?? '').includes('order_id'), 'HTTPS 明文响应体可见');
assert(orders?.request_class === 'ajax', '分级 ajax 正确');
const js = records.find((r) => r.path === '/static/app.js');
assert(js?.is_noise === true && js.request_class === 'embedded', '静态资源标噪音');
assert(records.every((r) => r.source === 'extension'), 'source=extension');

console.log(failures === 0 ? 'ALL PASS：导入的 session 数据完整可见。' : `存在 ${failures} 项失败。`);
process.exit(failures === 0 ? 0 : 1);
