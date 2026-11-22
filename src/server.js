// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件）。
// 现在只有 GET /health；决斗接口随后的票加。环境变量、「现在」只在这里取。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；引擎数据（卡库和脚本）默认放在里面的 engine/，YUGIOH_ENGINE 能换
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
const ENGINE = process.env.YUGIOH_ENGINE ?? join(DATA, 'engine');

const json = (res, status, value) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && pathname === '/health') return json(res, 200, { ok: true });
  return json(res, 404, { error: '没有这个接口' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port} 数据 ${DATA} 引擎 ${ENGINE}`);
});
