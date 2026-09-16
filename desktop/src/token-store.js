// VerifyOS Desktop 本地 token 持久化（纯 Node 模块，便于独立验证）
// 存储为 JSON 文件：{ "token": "...", "updatedAt": "ISO时间" }
const fs = require('fs');
const path = require('path');

function createTokenStore(dir) {
  const file = path.join(dir, 'token.json');

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return typeof data.token === 'string' ? data.token : '';
    } catch {
      // 文件不存在或损坏时返回空串
      return '';
    }
  }

  function write(token) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ token, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  }

  function clear() {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // 文件不存在时忽略
    }
  }

  function filePath() {
    return file;
  }

  return { read, write, clear, filePath };
}

module.exports = { createTokenStore };
