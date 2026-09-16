// VerifyOS Desktop 本地 token 持久化验证脚本（纯 Node，无 Electron 依赖）
// 用法：node scripts/verify-token-store.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTokenStore } = require('../src/token-store');

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verifyos-token-test-'));
  const store = createTokenStore(dir);
  const results = [];

  // 1. 初始为空
  results.push(['read(空)', store.read() === '', store.read()]);

  // 2. 写入 + 读回
  store.write('test-token-abc123');
  results.push(['write+read', store.read() === 'test-token-abc123', store.read()]);

  // 3. 文件内容含 updatedAt
  const raw = JSON.parse(fs.readFileSync(store.filePath(), 'utf8'));
  results.push(['updatedAt 存在', typeof raw.updatedAt === 'string', raw.updatedAt]);

  // 4. 覆盖写入
  store.write('token-v2');
  results.push(['覆盖写', store.read() === 'token-v2', store.read()]);

  // 5. 清除
  store.clear();
  results.push(['clear 后为空', store.read() === '', store.read()]);

  // 6. 损坏文件容错
  fs.writeFileSync(store.filePath(), '{ 不是合法 JSON', 'utf8');
  results.push(['损坏文件返回空', store.read() === '', store.read()]);

  // 输出结果
  let pass = 0;
  for (const [name, ok, got] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  => ${JSON.stringify(got)}`);
    if (ok) pass += 1;
  }
  console.log(`\n结果：${pass}/${results.length} 通过`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(pass === results.length ? 0 : 1);
}

main();
