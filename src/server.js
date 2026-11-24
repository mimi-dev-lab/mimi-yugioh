// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件「游戏王」，一份烙印教程）。接口见 DESIGN.md「接口」。环境变量只在这里取。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deckOverview } from './deck.js';
import { BRANDED } from './decks/branded.js';
import { openStore } from './store.js';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；服务只读里面的卡图 images/
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
const DECK = BRANDED;
const OVERVIEW = deckOverview(DECK);

const store = openStore(DATA);

const json = (res, status, value) => { const text = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json' }).end(text); }; // 先序列化再写头：序列化出错时还能回 500

function route(req, pathname, query) {
  switch (`${req.method} ${pathname}`) {
    case 'GET /health': return [200, { ok: true }];
    // 卡组一览：每张卡的卡名（Master Duel 简中、日文）、作用、张数、效果说明（三件事）和对手回合怎么打断，按作用分组排好。不含卡图
    case 'GET /deck': return [200, OVERVIEW];
    // 卡图：JSON 里放 base64，插件后端原样转发、页面拼成 data: 地址（ctx.rest 只会读 JSON）。没有这张图是 404，页面改写卡名
    case 'GET /card-image': {
      const bytes = store.readImage(query.get('code'));
      if (!bytes) return [404, { error: '没有这张卡图（先跑 scripts/sync-card-images.js）' }];
      return [200, { code: Number(query.get('code')), type: 'image/webp', base64: bytes.toString('base64') }];
    }
    default: return [404, { error: '没有这个接口' }];
  }
}

const server = http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://127.0.0.1');
  try {
    const [status, body] = route(req, pathname, searchParams);
    json(res, status, body);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port} 数据 ${DATA}`);
});
