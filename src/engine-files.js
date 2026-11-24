// 引擎数据的读取：卡库 cards.cdb（node:sqlite）和卡牌脚本。目录由调用方传进来（scripts/prepare-engine.js 下载的那份），只读不写。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TYPE_LINK = 0x4000000;

export function openEngineFiles(dir) {
  const cdb = join(dir, 'cards.cdb');
  if (!existsSync(cdb)) throw Object.assign(new Error(`没有 ${cdb}：先跑 node scripts/prepare-engine.js`), { code: 'ENGINE_MISSING' });
  const db = new DatabaseSync(cdb, { readOnly: true });
  const names = new Map(db.prepare('select id, name from texts').all().map((r) => [r.id, r.name]));
  const getData = db.prepare('select * from datas where id = ?');

  // 引擎要的卡牌数据格式（ocgcore-wasm 的 cardReader）
  // 读过的卡和脚本记在内存里：搜索要反复回滚重开决斗，每次重新读文件和卡库太慢
  const cards = new Map();
  const cardReader = (code) => {
    if (!cards.has(code)) cards.set(code, readCard(code));
    return cards.get(code);
  };
  const readCard = (code) => {
    const r = getData.get(code);
    if (!r) return null;
    const setcodes = [];
    for (let i = 0n; i < 4n; i++) {
      const v = Number((BigInt(r.setcode) >> (i * 16n)) & 0xffffn);
      if (v) setcodes.push(v);
    }
    const level = Number(r.level);
    const link = (Number(r.type) & TYPE_LINK) !== 0;
    return {
      code: r.id, alias: r.alias, setcodes, type: Number(r.type), level: level & 0xff, attribute: Number(r.attribute), race: BigInt(r.race),
      attack: r.atk, defense: link ? 0 : r.def, lscale: (level >> 24) & 0xff, rscale: (level >> 16) & 0xff, link_marker: link ? r.def : 0,
    };
  };
  const scripts = new Map();
  const scriptReader = (name) => {
    if (!scripts.has(name)) scripts.set(name, readScript(name));
    return scripts.get(name);
  };
  const readScript = (name) => {
    for (const path of [join(dir, 'scripts/official', name), join(dir, 'scripts', name)]) if (existsSync(path)) return readFileSync(path, 'utf8');
    return null;
  };
  // cards.cdb 里的名字（日文），不是 Master Duel 的简体中文卡名
  const name = (code) => names.get(code) ?? String(code);
  return { cardReader, scriptReader, name, close: () => db.close() };
}
