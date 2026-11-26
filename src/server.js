// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件「游戏王」，一份烙印教程）。接口见 DESIGN.md「接口」。环境变量只在这里取。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { buildRouteAnim } from './anim-page.js';
import { deckOverview } from './deck.js';
import { BRANDED } from './decks/branded.js';
import { SIM_HANDS } from './decks/branded-endgames.js';
import { openEngine } from './duel-session.js';
import { buildEndgames } from './endgame.js';
import { openEngineFiles } from './engine-files.js';
import { featuresFrom } from './features.js';
import { lookupView } from './lookup.js';
import { replayRoute, routeListItem } from './route-view.js';
import { buildSubway } from './subway.js';
import { treeView } from './tree.js';
import { openStore } from './store.js';
import { readHyperframes } from './vendor-files.js';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；服务只读里面的卡图 images/
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
// 引擎数据（卡库、脚本）：路线要用它重放；默认在数据目录里，测试和 ./ci 指到复用的缓存目录
const ENGINE = process.env.YUGIOH_ENGINE ?? join(DATA, 'engine');
const OVERVIEW = deckOverview(BRANDED);
// 试用功能的开关：YUGIOH_FEATURES_OFF=ledger,tree 关掉哪几个（名字见 src/features.js）
const FEATURES = featuresFrom((process.env.YUGIOH_FEATURES_OFF ?? '').split(',').map((s) => s.trim()).filter(Boolean));

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
        try { routes.push(await replayRoute(engine, BRANDED, def, { features: FEATURES })); } catch (e) { throw new Error(`路线「${def.name}」重放不通：${e.message}`); }
      }
      return { routes, lookup: lookupView(BRANDED, routes), subway: FEATURES.subway ? buildSubway(BRANDED, routes) : null, endgames: FEATURES.endgame ? buildEndgames(BRANDED, routes, { hands: SIM_HANDS }) : null, tree: FEATURES.tree ? treeView(BRANDED, routes) : null };
    } finally { files.close(); }
  } catch (e) {
    const reason = e.code === 'ENGINE_MISSING' ? `引擎数据不在 ${ENGINE}（${e.message}）` : e.message;
    console.error(`路线重放失败：${reason}`);
    return { error: reason };
  }
})();

// 路线动画页：第一次要才拼（带卡图和 HyperFrames 运行时，几 MB），按路线 id 缓存；卡图在数据目录里换了要重启服务才会变
let VENDOR = null;
const ANIMS = new Map();
function animFor(route) {
  if (!ANIMS.has(route.id)) {
    VENDOR ??= readHyperframes();
    ANIMS.set(route.id, buildRouteAnim({ route, roleTerms: BRANDED.roleTags.terms, readImage: (code) => store.readImage(code), vendor: VENDOR }));
  }
  return ANIMS.get(route.id);
}

const json = (res, status, value) => { const text = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json' }).end(text); }; // 先序列化再写头：序列化出错时还能回 500

async function route(req, pathname, query) {
  switch (`${req.method} ${pathname}`) {
    case 'GET /health': return [200, { ok: true }];
    // 卡组一览：每张卡的卡名（Master Duel 简中、日文）、作用、张数、效果说明（三件事）和对手回合怎么打断，按作用分组排好。不含卡图
    case 'GET /deck': return [200, OVERVIEW];
    // 展开路线：列表（需要的起手卡、终场打断数、来源、验证日期；另带起手速查 lookup：关键卡 → 路线，缺卡改走哪条）和单条（每一步的说明、场面快照、和上一步的差异、终场汇总）
    case 'GET /routes': {
      const { routes, lookup, error } = await ROUTES;
      return error ? [503, { error }] : [200, { routes: routes.map(routeListItem), lookup, features: FEATURES }];
    }
    case 'GET /route': {
      const { routes, error } = await ROUTES;
      if (error) return [503, { error }];
      const found = routes.find((r) => r.id === query.get('id'));
      return found ? [200, found] : [404, { error: '没有这条路线' }];
    }
    // 汇流地铁图（试用功能 subway，关了是 404）：{ stations, edges, layers, rows, routes }，见 src/subway.js；站的 stops 是点它跳到的路线步骤
    case 'GET /subway': {
      const { subway, error } = await ROUTES;
      if (error) return [503, { error }];
      return subway ? [200, subway] : [404, { error: '地铁图这个功能关着（YUGIOH_FEATURES_OFF 里有 subway）' }];
    }
    // 终场倒推（试用功能 endgame，关了是 404）：{ hands, endgames: [{ id, name, interrupts, seen, route, start, keyCards, blocks（每块带 missing：缺它时的补法）, alsoRoutes }] }，见 src/endgame.js
    case 'GET /endgames': {
      const { endgames, error } = await ROUTES;
      if (error) return [503, { error }];
      return endgames ? [200, endgames] : [404, { error: '终场倒推这个功能关着（YUGIOH_FEATURES_OFF 里有 endgame）' }];
    }
    // 决策树（试用功能 tree，关了是 404）：{ root（嵌套的问题 / 叶子）, leaves（平铺的叶子，带从根走来的回答）}，见 src/tree.js
    case 'GET /tree': {
      const { tree, error } = await ROUTES;
      if (error) return [503, { error }];
      return tree ? [200, tree] : [404, { error: '决策树这个功能关着（YUGIOH_FEATURES_OFF 里有 tree）' }];
    }
    // 路线动画：{ src（data:text/html 地址，插件页放进 SandboxedFrame）, starts / ends（位置 0 = 起手、1..N = 第几步的开始帧、结束帧，秒）, duration, stage }
    case 'GET /route-anim': {
      const { routes, error } = await ROUTES;
      if (error) return [503, { error }];
      const found = routes.find((r) => r.id === query.get('id'));
      return found ? [200, animFor(found)] : [404, { error: '没有这条路线' }];
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
