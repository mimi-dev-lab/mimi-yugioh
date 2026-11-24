// 展开路线重放：把卡组数据里的一条路线（起手 + 步骤）按步喂给决斗会话，走到我方回合结束，返回终场。纯逻辑，引擎由调用方传进来。
// 每步的 do 是一串回应，每个回应对着引擎当前的提示，对不上就抛错（带步号和说明）：
//   'pass' / 'yes' / 'no' / 'end-turn'   选当前提示里有这个动作的选项
//   { idle: 动作, code }                 主阶段里对某张卡做某个动作（activate、summon、special-summon…）
//   { chain: code }                      连锁窗口里发动某张卡的效果
//   { pick: [code…] }                    选卡 / 选素材：按密码选，同一密码在列表里靠前的先选（卡组、手牌排在场上和墓地之前）
//   { option: i } / { place: i } / { position: i }   选第 i 个选项 / 格子 / 表示形式
//   { finishPick: true }                 逐张选的提示里选「选完」
//   idle 和 chain 的回应可以多带 desc（效果描述号）：同一张卡有几个能发动的效果时用它指定哪一个
//   'finish'                             之后的连锁窗口全放行，直到我方回合结束
import { openHandSession } from './duel-session.js';

export function indicesFor(prompt, response) {
  const { options } = prompt;
  const named = (action) => options.findIndex((o) => o.action === action);
  if (typeof response === 'string') return [named(response)];
  const sameDesc = (o) => response.desc === undefined || o.description === response.desc;
  if (response.idle !== undefined) return [options.findIndex((o) => o.action === response.idle && o.code === response.code && sameDesc(o))];
  if (response.chain !== undefined) return [options.findIndex((o) => o.action === 'chain' && o.code === response.chain && sameDesc(o))];
  if (response.finishPick) return prompt.kind === 'pick-one' ? [named('finish')] : [-1];
  if (response.option !== undefined) return prompt.kind === 'option' ? [response.option] : [-1];
  if (response.place !== undefined) return prompt.kind === 'place' ? [response.place] : [-1];
  if (response.position !== undefined) return prompt.kind === 'position' ? [response.position] : [-1];
  if (response.pick !== undefined) {
    if (prompt.kind !== 'cards' && prompt.kind !== 'pick-one') return [-1];
    const picked = [];
    for (const code of response.pick) picked.push(options.findIndex((o, i) => o.code === code && o.action !== 'unselect' && !picked.includes(i)));
    return picked;
  }
  throw new Error(`看不懂的回应 ${JSON.stringify(response)}`);
}

// 一步 = 主阶段的一个命令，或连锁窗口里发动一个效果；它后面的选卡、选格子、放行都算在这一步里。路线的「每一步之后的场面」按这个切
const startsStep = (prompt, indices) => prompt.kind === 'idle' || (prompt.kind === 'chain' && prompt.options[indices[0]]?.action === 'chain');

const ACTION_NAMES = { summon: '召唤', 'monster-set': '盖放怪兽', 'special-summon': '特殊召唤', 'position-change': '改变表示形式', 'spell-set': '盖放', activate: '发动', 'to-battle': '进入战斗阶段', 'end-turn': '结束回合' };

// 路线每步的文字：这一步里的每个选择怎么写
function labelFor(deck, prompt, indices) {
  const md = (code) => deck.cards[code]?.md ?? String(code);
  const chosen = indices.map((i) => prompt.options[i]);
  const one = chosen[0];
  switch (prompt.kind) {
    case 'idle': return `${ACTION_NAMES[one.action] ?? one.action}${one.code === undefined ? '' : ` ${md(one.code)}`}`;
    case 'cards': return chosen.length ? `选 ${chosen.map((o) => md(o.code)).join('、')}` : '不选';
    case 'pick-one': return one.action === 'finish' ? '选完' : `${one.action === 'unselect' ? '取消' : '选'} ${md(one.code)}`;
    case 'chain': return one.action === 'pass' ? '不发动' : `连锁发动 ${md(one.code)}`;
    case 'yes-no': return one.action === 'yes' ? '发动' : '不发动';
    case 'place': return `放在 ${one.location === 0x4 ? '怪兽区' : '魔陷区'} 第 ${one.sequence + 1} 格`;
    default: return `选第 ${indices[0] + 1} 项`;
  }
}

// 一步的文字：发起的动作 + 选了哪些卡；「不发动」「放在第几格」「选第几项」「选完」这类机械确认折叠掉。labels 是这一步每个选择的 labelFor
function summarizeLabels(labels) {
  const picks = [...new Set(labels.slice(1).filter((t) => /^选 /.test(t)).flatMap((t) => t.slice(2).split('、')))];
  const shown = picks.length > 3 ? `${picks.slice(0, 3).join('、')} 等 ${picks.length} 张` : picks.join('、');
  return `${labels[0]}${shown ? ` · 选 ${shown}` : ''}`;
}

const describeOptions = (prompt) => prompt.options.map((o) => [o.action, o.code].filter((x) => x !== undefined).join(' ')).join(' | ');

// 用路线自己写的起手开局；seed 是洗牌的种子（不给用 1），路线不该依赖洗牌。boards 是按 startsStep 切的每一步之后的场面
export async function playRoute(engine, deck, route, { seed } = {}) {
  const session = await openHandSession(engine, deck, route.hand, seed);
  try {
    const boards = [];
    const labels = []; // 每一步每个选择的文字
    const startBoard = session.board();
    const choose = (prompt, indices) => {
      const text = labelFor(deck, prompt, indices);
      session.choose(indices);
      if (startsStep(prompt, indices) || !boards.length) { boards.push(null); labels.push([]); }
      boards[boards.length - 1] = session.board();
      labels.at(-1).push(text);
    };
    route.steps.forEach((step, stepIndex) => {
      for (const response of step.do) {
        const where = `第 ${stepIndex + 1} 步「${step.text}」的回应 ${JSON.stringify(response)}`;
        if (response === 'finish') {
          for (let guard = 0; guard < 100 && !session.endBoard; guard++) {
            const prompt = session.prompt();
            const pass = prompt?.kind === 'chain' ? prompt.options.findIndex((o) => o.action === 'pass') : -1;
            if (pass < 0) throw new Error(`${where}：回合还没结束，却遇到了放行不了的提示 ${prompt?.kind} [${prompt ? describeOptions(prompt) : ''}]`);
            choose(prompt, [pass]);
          }
          if (!session.endBoard) throw new Error(`${where}：放行了 100 次回合还没结束`);
          continue;
        }
        const prompt = session.prompt();
        if (!prompt) throw new Error(`${where}：决斗已经结束`);
        const indices = indicesFor(prompt, response);
        if (indices.some((i) => i < 0)) throw new Error(`${where}：当前提示是 ${prompt.kind}，合法项里没有它 [${describeOptions(prompt)}]`);
        choose(prompt, indices);
      }
    });
    if (!session.endBoard) throw new Error('步骤走完了，我方回合还没结束（最后一步应该是 finish）');
    return { endBoard: session.endBoard, startBoard, boards, steps: labels.map((l) => summarizeLabels(l)), scriptErrors: [...session.scriptErrors] };
  } finally {
    session.close();
  }
}

// 终场和路线上写的是否一致：返回差异列表（空 = 一致）。场上的卡不看顺序
export function diffEnd(route, endBoard) {
  const sorted = (codes) => [...codes].sort((a, b) => a - b).join(',');
  const problems = [];
  const monsters = endBoard.monsters.map((c) => c.code);
  const spellTraps = endBoard.spellTraps.map((c) => c.code);
  if (sorted(monsters) !== sorted(route.end.monsters)) problems.push(`怪兽区 ${monsters} ≠ ${route.end.monsters}`);
  if (sorted(spellTraps) !== sorted(route.end.spellTraps)) problems.push(`魔陷区 ${spellTraps} ≠ ${route.end.spellTraps}`);
  if (endBoard.hand.length !== route.end.hand) problems.push(`手牌 ${endBoard.hand.length} 张 ≠ ${route.end.hand}`);
  return problems;
}
