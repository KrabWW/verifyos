import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

/** 极简静态服务器（冒烟测试用）：serve 指定目录，/ 映射 login.html */
export function serveStatic(dir: string): Promise<{ url: string; port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const rel = (req.url ?? '/').split('?')[0];
    const file = path.join(dir, rel === '/' ? 'login.html' : rel);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, port, close: () => server.close() });
    });
  });
}
