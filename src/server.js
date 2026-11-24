// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件「游戏王」，一份烙印教程）。接口见 DESIGN.md「接口」。环境变量只在这里取。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { deckOverview } from './deck.js';
import { BRANDED } from './decks/branded.js';
import { openEngine } from './duel-session.js';
import { openEngineFiles } from './engine-files.js';
import { replayRoute, routeListItem } from './route-view.js';
import { openStore } from './store.js';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；服务只读里面的卡图 images/
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
// 引擎数据（卡库、脚本）：路线要用它重放；默认在数据目录里，测试和 ./ci 指到复用的缓存目录
const ENGINE = process.env.YUGIOH_ENGINE ?? join(DATA, 'engine');
const OVERVIEW = deckOverview(BRANDED);

const store = openStore(DATA);

// 路线：启动时用引擎把 BRANDED 的每条路线重放一遍并缓存（场面快照都来自这里，不是手写的）。引擎数据缺失或哪条重放不通，
// 只有 /routes 和 /route 回 503 和原因，别的接口不受影响。服务先开，重放在后台跑，请求等它跑完
const ROUTES = (async () => {
  try {
    const files = openEngineFiles(ENGINE);
    try {
      const engine = await openEngine(files);
      const routes = [];
      for (const def of BRANDED.routes) {
        try { routes.push(await replayRoute(engine, BRANDED, def)); } catch (e) { throw new Error(`路线「${def.name}」重放不通：${e.message}`); }
      }
      return { routes };
    } finally { files.close(); }
  } catch (e) {
    const reason = e.code === 'ENGINE_MISSING' ? `引擎数据不在 ${ENGINE}（${e.message}）` : e.message;
    console.error(`路线重放失败：${reason}`);
    return { error: reason };
  }
})();

const json = (res, status, value) => { const text = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json' }).end(text); }; // 先序列化再写头：序列化出错时还能回 500

async function route(req, pathname, query) {
  switch (`${req.method} ${pathname}`) {
    case 'GET /health': return [200, { ok: true }];
    // 卡组一览：每张卡的卡名（Master Duel 简中、日文）、作用、张数、效果说明（三件事）和对手回合怎么打断，按作用分组排好。不含卡图
    case 'GET /deck': return [200, OVERVIEW];
    // 展开路线：列表（需要的起手卡、终场打断数、来源、验证日期）和单条（每一步的说明、场面快照、和上一步的差异、终场汇总）
    case 'GET /routes': {
      const { routes, error } = await ROUTES;
      return error ? [503, { error }] : [200, { routes: routes.map(routeListItem) }];
    }
    case 'GET /route': {
      const { routes, error } = await ROUTES;
      if (error) return [503, { error }];
      const found = routes.find((r) => r.id === query.get('id'));
      return found ? [200, found] : [404, { error: '没有这条路线' }];
    }
    // 卡图：JSON 里放 base64，插件后端原样转发、页面拼成 data: 地址（ctx.rest 只会读 JSON）。没有这张图是 404，页面改写卡名
    case 'GET /card-image': {
      const bytes = store.readImage(query.get('code'));
      if (!bytes) return [404, { error: '没有这张卡图（先跑 scripts/sync-card-images.js）' }];
      return [200, { code: Number(query.get('code')), type: 'image/webp', base64: bytes.toString('base64') }];
    }
    default: return [404, { error: '没有这个接口' }];
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://127.0.0.1');
  try {
    const [status, body] = await route(req, pathname, searchParams);
    json(res, status, body);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port} 数据 ${DATA}`);
});
