// 本机服务：只监听 127.0.0.1，没有自己的网页（给用户的入口是 Hermes 里的插件）。接口见 DESIGN.md「接口」。环境变量、「现在」只在这里取。
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BRANDED } from './decks/branded.js';
import { openEngine } from './duel-session.js';
import { openEngineFiles } from './engine-files.js';
import { HandError, startHand } from './hand.js';
import { openStore } from './store.js';

const PORT = Number(process.env.PORT ?? 4519);
// 数据目录在仓外，不进 git；引擎数据（卡库和脚本）默认放在里面的 engine/，YUGIOH_ENGINE 能换
const DATA = process.env.YUGIOH_DATA ?? join(homedir(), '.mimi-yugioh');
const ENGINE = process.env.YUGIOH_ENGINE ?? join(DATA, 'engine');
const DECK = BRANDED;

const store = openStore(DATA);
let enginePromise = null; // 第一次打牌才打开引擎：没下载引擎数据时 /health 照样能用
const engine = () => (enginePromise ??= openEngine(openEngineFiles(ENGINE)).catch((e) => { enginePromise = null; throw e; }));

let active = null; // 进行中的一手（同一时间只有一手）
let handCount = 0;

// 把一手没打完就作废的情况记进日志：服务重启时留在 active.json 里的、或者被新开的一手顶掉的
const voidHand = (info, reason) => { store.appendHand({ type: 'void', ...info, reason }); store.clearActive(); };
const stale = store.readActive();
if (stale) voidHand(stale, '服务重启，进行中的一手作废');

const json = (res, status, value) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
const readBody = async (req) => {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new HandError('请求体不是 JSON'); }
};
const needActive = () => { if (!active) throw new HandError('没有进行中的一手', 404); return active; };

async function route(req, pathname, query) {
  const key = `${req.method} ${pathname}`;
  const now = Date.now();
  switch (key) {
    case 'GET /health': return [200, { ok: true }];
    // 开始一手：seed（0 到 2^32-1 的整数）可以注入，不给就用现在的时间
    case 'POST /hand/start': {
      const body = await readBody(req);
      if (body.seed !== undefined && !(Number.isInteger(body.seed) && body.seed >= 0 && body.seed < 2 ** 32)) throw new HandError('seed 要是 0 到 2^32-1 的整数');
      if (active) { active.close(); voidHand(active.info, '开了新的一手，这一手作废'); active = null; }
      const seed = body.seed ?? (now % 2 ** 32);
      active = await startHand(await engine(), DECK, { id: `${now}-${++handCount}`, seed, now });
      store.setActive(active.info);
      return [200, active.view(now)];
    }
    case 'GET /hand': return [200, needActive().view(now)];
    case 'POST /hand/choose': {
      const hand = needActive();
      const { indices } = await readBody(req);
      hand.submit(indices, now);
      return [200, hand.view(now)];
    }
    case 'POST /hand/end': {
      const hand = needActive();
      const { settlement, record } = await hand.end(now, store.readHands());
      store.appendHand(record);
      store.clearActive();
      active = null;
      return [200, settlement];
    }
    // 卡组里每张卡的卡名（Master Duel 简中）、角色和三件事：页面点卡时显示。不含卡图
    case 'GET /cards': return [200, { cards: Object.fromEntries(Object.entries(DECK.cards).map(([code, c]) => [code, { md: c.md, role: c.role, does: c.does, cost: c.cost, limit: c.limit }])) }];
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
    if (e instanceof HandError) return json(res, e.status, { error: e.message });
    console.error(e);
    return json(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port} 数据 ${DATA} 引擎 ${ENGINE}`);
});
