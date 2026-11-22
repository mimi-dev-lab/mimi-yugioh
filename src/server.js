// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件）。环境变量、「现在」、开端口只在这里；每条路径做什么在 src/service.js（接口见 DESIGN.md「接口」）。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BRANDED } from './decks/branded.js';
import { openEngine } from './duel-session.js';
import { openEngineFiles } from './engine-files.js';
import { HandError } from './hand.js';
import { SEARCH_BUDGET_MS } from './search.js';
import { openService } from './service.js';
import { openStore } from './store.js';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；引擎数据（卡库和脚本）默认放在里面的 engine/，YUGIOH_ENGINE 能换
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
const ENGINE = process.env.YUGIOH_ENGINE ?? join(DATA, 'engine');
const SEARCH_MS = Number(process.env.YUGIOH_SEARCH_MS ?? SEARCH_BUDGET_MS); // 一手的搜索时间上限；0 = 不搜索

let enginePromise = null; // 第一次打牌才打开引擎：没下载引擎数据时 /health 照样能用
const engine = () => (enginePromise ??= openEngine(openEngineFiles(ENGINE)).catch((e) => { enginePromise = null; throw e; }));
const service = openService({ deck: BRANDED, store: openStore(DATA), engine, now: Date.now, searchMs: SEARCH_MS });

const json = (res, status, value) => { const text = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json' }).end(text); }; // 先序列化再写头：序列化出错时还能回 500
const bodyOf = (req) => async () => {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HandError('请求体不是 JSON'); }
};

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://127.0.0.1');
  try {
    const [status, body] = await service.handle(req.method, pathname, { query: searchParams, readBody: bodyOf(req) });
    json(res, status, body);
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port} 数据 ${DATA} 引擎 ${ENGINE}`);
});
