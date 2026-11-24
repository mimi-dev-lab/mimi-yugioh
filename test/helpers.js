// 测试共用的帮手：起被测的服务（PORT=0、临时数据目录）、打开引擎、驱动决斗会话。不碰常驻的服务和用户真实的数据目录
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEngineFiles } from '../src/engine-files.js';
import { openEngine } from '../src/duel-session.js';

export const SERVER = fileURLToPath(new URL('../src/server.js', import.meta.url));

export const dataDir = () => mkdtemp(join(tmpdir(), 'yugioh-data-'));

export async function start(env = {}) {
  const data = env.YUGIOH_DATA ?? await dataDir();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: '0', YUGIOH_DATA: data, ...env } });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const url = out.match(/http:\/\/[\w.:]+/)?.[0];
      if (url) resolve({ url, stop: () => child.kill() });
    });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
  });
}

// 引擎数据（公开的卡库和脚本）在复用的缓存目录里，./ci 的 engine 那一项负责下载；不是用户的数据
export const ENGINE_DIR = process.env.YUGIOH_ENGINE ?? join(homedir(), '.cache/mimi-yugioh/engine');
export const openTestEngine = () => openEngine(openEngineFiles(ENGINE_DIR));

// 编的卡（真实卡号）：烙印的几张
export const ID = {
  aluber: 62962630, bfusion: 44362883, albaz: 68468459, bystialLub: 32731036, quem: 45883110, ash: 14558127,
  albion: 87746184, lubSearing: 70534340, mirrorjade: 44146295, granguignol: 24915933, sprind: 1906812, titaniklad: 41373230,
  lost: 18973184, retribution: 17751597, red: 82738008,
};

// 探针的开局：起手阿鲁伯 + 4 张当占位的卡
export const PROBE_DUEL = {
  hand: [ID.aluber, ID.ash, ID.ash, ID.ash, ID.quem],
  deck: [ID.bfusion, ID.albaz, ID.bystialLub, ID.lost, ID.retribution, ID.red, ...Array(30).fill(ID.ash)],
  extra: [ID.albion, ID.lubSearing, ID.mirrorjade, ID.granguignol, ID.sprind, ID.titaniklad],
  seed: [7n, 11n, 13n, 17n],
};

// 按计划走：plan 的每项是 { idle: 动作, code } 或 { pick: [卡号…] }；没写到的提示取第一个合法项。
// 计划走完后把连锁等小提示按默认走完，停在主阶段。返回走完的计划步数
export function drive(session, plan) {
  let step = 0;
  for (let guard = 0; guard < 200; guard++) {
    const prompt = session.prompt();
    if (!prompt || (step >= plan.length && prompt.kind === 'idle')) break; // 计划走完、引擎回到主阶段
    if (step >= plan.length && prompt.kind === 'cards') { session.choose([...Array(prompt.min).keys()]); continue; }
    const want = plan[step];
    if (prompt.kind === 'idle' && want?.idle) {
      const i = prompt.options.findIndex((o) => o.action === want.idle && o.code === want.code);
      if (i < 0) throw new Error(`计划要 ${want.idle} ${want.code}，合法项里没有`);
      session.choose([i]);
      step++;
    } else if ((prompt.kind === 'cards' || prompt.kind === 'pick-one') && want?.pick) {
      const picked = [];
      for (const code of want.pick) {
        const i = prompt.options.findIndex((o, idx) => o.code === code && !picked.includes(idx) && o.action !== 'unselect');
        if (i >= 0) picked.push(i);
      }
      if (prompt.kind === 'cards') {
        session.choose(picked.slice(0, prompt.max));
        step++;
      } else if (picked.length) {
        session.choose([picked[0]]);
        want.pick = want.pick.filter((c) => c !== prompt.options[picked[0]].code);
        if (!want.pick.length) step++;
      } else {
        session.choose([prompt.options.findIndex((o) => o.action === 'finish')]);
        step++;
      }
    } else if (prompt.kind === 'chain') {
      const mine = prompt.options.findIndex((o) => o.action === 'chain' && o.code === ID.aluber);
      session.choose([mine >= 0 ? mine : prompt.options.length - 1]);
    } else if (prompt.kind === 'yes-no') {
      session.choose([step >= plan.length ? 1 : 0]); // 计划走完后不再发动追加的效果
    } else {
      session.choose(prompt.kind === 'cards' ? [...Array(prompt.min).keys()] : [0]);
    }
  }
  return step;
}
