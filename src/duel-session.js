// 决斗会话：包住规则引擎（ocgcore-wasm），一手牌一个会话。
// 开局（卡组、起手、种子）→ prompt() 当前提示和合法选项 → choose() 提交选择 → board() 查场面 → checkpoint() / rollback() 存档回滚。
// 只做规则裁判：每个提示只给引擎认的合法选项，选了不在里面的抛错。我方是 0 号玩家、先攻；对手是 1 号，用一套没有效果的通常怪兽凑数，它的提示由会话自动放弃。
import { expand } from './deck.js';
import createCore, { OcgDuelMode, OcgLocation as L, OcgMessageType as M, OcgPosition, OcgProcessResult, OcgQueryFlags as Q, OcgResponseType as R, SelectIdleCMDAction as A } from 'ocgcore-wasm';

// 通常怪兽（青眼白龙），给对手凑卡组：没有效果，不会打断我方展开
const VANILLA = 89631139;
const MAX_STEPS = 2000;

export async function openEngine(files) {
  return { core: await createCore({ sync: true }), files };
}


export async function startSession(engine, { hand, deck, extra = [], seed = [1n, 2n, 3n, 4n] }) {
  const { core, files } = engine;
  const scriptErrors = [];
  const history = []; // 已提交的引擎回应，回滚时重放
  let handle = null;
  let message = null; // 引擎停在哪个提示上
  let finished = false;
  let endBoard = null; // 我方回合结束（对手回合开始）时的场面（snapshot 的各区，另带那一刻的 used），没到那一刻是 null
  let normalSummonUsed = false; // 我方这回合的召唤权（通常召唤或盖放怪兽）用掉了没有
  let lastHint = null; // 最近一条给我方的选择提示（HINT_SELECTMSG 的字符串编号）
  let promptHint = null; // 当前提示对应的那一条
  const activated = []; // 我方发动过效果的卡的密码，按发动顺序
  const events = []; // 引擎发出的卡片移动和召唤消息（MSG_MOVE、MSG_SPSUMMONING…）按发生顺序的记录，路线重放按步切片
  let endEvents = null; // 我方回合结束那一刻 events 有几条；之后（对手回合）的消息不算
  const used = []; // 我方发动过、之后没离开那一格的效果 { code, description, zone, sequence }（description 是效果描述号，同提示里选项的 description）；终场带一份，打断数据此去掉自己回合锁住的效果
  let endUsed = null; // 我方回合结束那一刻的 used

  function build() {
    if (handle) core.destroyDuel(handle);
    scriptErrors.length = 0;
    handle = core.createDuel({
      flags: OcgDuelMode.MODE_MR5, seed,
      team1: { startingLP: 8000, startingDrawCount: 0, drawCountPerTurn: 1 },
      team2: { startingLP: 8000, startingDrawCount: 5, drawCountPerTurn: 1 },
      cardReader: files.cardReader, scriptReader: files.scriptReader, errorHandler: (_type, text) => scriptErrors.push(text),
    });
    if (!handle) throw new Error('引擎建不出决斗');
    for (const s of ['constant.lua', 'utility.lua']) core.loadScript(handle, s, files.scriptReader(s));
    const add = (team, code, location, sequence = 0) => core.duelNewCard(handle, { team, duelist: 0, code, controller: team, location, sequence, position: OcgPosition.FACEDOWN_DEFENSE });
    hand.forEach((c) => add(0, c, L.HAND));
    deck.forEach((c) => add(0, c, L.DECK, 2));
    extra.forEach((c) => add(0, c, L.EXTRA));
    Array(40).fill(VANILLA).forEach((c) => add(1, c, L.DECK, 2));
    core.startDuel(handle);
    finished = false;
    message = null;
    endBoard = null;
    normalSummonUsed = false;
    activated.length = 0;
    events.length = 0;
    endEvents = null;
    used.length = 0;
    endUsed = null;
    lastHint = null;
    promptHint = null;
  }

  // 场面的区名 → 引擎的位置（board() 的键，也是 used 里的 zone）
  const ZONE_LOCATIONS = { hand: L.HAND, monsters: L.MZONE, spellTraps: L.SZONE, grave: L.GRAVE, banished: L.REMOVED, deck: L.DECK, extra: L.EXTRA };
  const zoneNameOf = (location) => Object.keys(ZONE_LOCATIONS).find((z) => ZONE_LOCATIONS[z] === location) ?? String(location);

  // 我方的场面：每个区域里的卡（编号、名字、格子、表示形式），主卡组和额外卡组也列出每一张
  function snapshot() {
    const at = (location) => core.duelQueryLocation(handle, { flags: Q.CODE | Q.POSITION, controller: 0, location })
      .map((c, sequence) => (c ? { code: c.code, name: files.name(c.code), sequence, position: c.position } : null)).filter(Boolean);
    return Object.fromEntries(Object.entries(ZONE_LOCATIONS).map(([zone, location]) => [zone, at(location)]));
  }

  // 引擎消息里和卡片去向有关的，按发生顺序记进 events：
  //   move   { code, from, to, reason, summon?, chain? }：MSG_MOVE，起点终点是 { controller, location, sequence, position }。
  //          summon 是它之后紧跟的 MSG_SUMMONING / MSG_SPSUMMONING 说的召唤方式：normal，或 special / fusion / synchro / xyz / link / ritual
  //          （特殊召唤的种类取自这次召唤之前的素材移动的 reason：REASON_MATERIAL 加上 FUSION / SYNCHRO / XYZ / LINK / RITUAL）；
  //          chain 是它发生时正在连锁的第几环（CHAINING 开始，CHAIN_END 结束；发动效果前的支付、卡片本身从手牌盖上场不在连锁里）
  //          material: true 是这张卡作为融合 / 同调 / 超量 / 连接 / 仪式的素材被移走（reason 带 REASON_MATERIAL）
  //   chaining { code, controller, chain }：MSG_CHAINING，chain 是连锁环号（1 起）
  const KINDS = [[0x40000, 'fusion'], [0x80000, 'synchro'], [0x200000, 'xyz'], [0x10000000, 'link'], [0x100000, 'ritual']];
  const MATERIAL = 0x8;
  let chainNow = null;
  let materialKind = null;
  // used：我方的发动记下那张卡在哪一格；那一格的卡移走了（离场、去墓地…），它身上的记录跟着作废（引擎在卡离开时重置它身上的标记）
  function trackUsed(m) {
    if (m.type === M.CHAINING && m.triggering_controller === 0 && m.controller === 0) used.push({ code: m.code, description: String(m.description), zone: zoneNameOf(m.location), sequence: m.sequence });
    if (m.type === M.MOVE && m.from.controller === 0) {
      const from = zoneNameOf(m.from.location);
      for (let i = used.length - 1; i >= 0; i--) if (used[i].zone === from && used[i].sequence === m.from.sequence) used.splice(i, 1);
    }
  }
  function record(m) {
    const spot = (p) => ({ controller: p.controller, location: p.location, sequence: p.sequence, position: p.position, ...(p.overlay_sequence === undefined ? {} : { overlay: p.overlay_sequence }) });
    const annotate = (code, summon) => { const move = events.findLast((e) => e.type === 'move' && e.code === code); if (move) move.summon = summon; };
    switch (m.type) {
      case M.CHAINING: chainNow = m.chain_size; events.push({ type: 'chaining', code: m.code, controller: m.triggering_controller, chain: m.chain_size }); break;
      case M.CHAIN_SOLVING: chainNow = m.chain_size; break;
      case M.CHAIN_END: chainNow = null; break;
      case M.MOVE:
        events.push({ type: 'move', code: m.card, from: spot(m.from), to: spot(m.to), reason: m.reason, ...(m.reason & MATERIAL ? { material: true } : {}), ...(chainNow === null ? {} : { chain: chainNow }) });
        if (m.reason & MATERIAL) materialKind = KINDS.find(([flag]) => m.reason & flag)?.[1] ?? materialKind;
        break;
      case M.SUMMONING: annotate(m.code, 'normal'); break;
      case M.SPSUMMONING: annotate(m.code, materialKind ?? 'special'); materialKind = null; break;
      default:
    }
  }

  // 推进引擎直到它要我们选，或者决斗结束；对手的提示自动放弃
  function advance() {
    for (let guard = 0; guard < MAX_STEPS; guard++) {
      const status = core.duelProcess(handle);
      const messages = core.duelGetMessage(handle);
      for (const m of messages) {
        if (m.type === M.NEW_TURN && m.player === 1 && endEvents === null) { endEvents = events.length; endUsed = used.map((u) => ({ ...u })); }
        record(m);
        trackUsed(m);
        if (m.type === M.SUMMONING && m.controller === 0) normalSummonUsed = true;
        if (m.type === M.SET && m.controller === 0 && m.location === L.MZONE) normalSummonUsed = true;
        if (m.type === M.CHAINING && m.triggering_controller === 0) activated.push(m.code);
        if (m.type === M.HINT && m.player === 0 && m.hint_type === 3) lastHint = Number(m.hint); // HINT_SELECTMSG：下一个选卡提示是干什么的（constant.lua 的 HINTMSG_*）
      }
      if (!endBoard && messages.some((m) => m.type === M.NEW_TURN && m.player === 1)) endBoard = { ...snapshot(), used: endUsed };
      if (status === OcgProcessResult.END) { finished = true; message = null; return; }
      if (status !== OcgProcessResult.WAITING) continue;
      const m = messages[messages.length - 1];
      if (m.player === 1) { core.duelSetResponse(handle, autoResponse(m)); continue; }
      message = m;
      promptHint = lastHint;
      lastHint = null;
      return;
    }
    throw new Error('引擎推进了太多步还没停下');
  }

  // 一个提示 → { kind, player, min, max, options[] } 和每个选项对应的引擎回应
  function describe(m) {
    const info = (c) => ({ code: c.code, name: files.name(c.code), location: c.location, sequence: c.sequence, controller: c.controller });
    const out = (kind, options, responses, min = 1, max = 1) => ({ kind, player: m.player, min, max, options, responses });
    switch (m.type) {
      case M.SELECT_IDLECMD: {
        const options = []; const responses = [];
        const add = (action, list, label) => list.forEach((c, index) => { options.push({ action: label, ...info(c), ...(c.description === undefined ? {} : { description: String(c.description) }) }); responses.push({ type: R.SELECT_IDLECMD, action, index }); });
        add(A.SELECT_SUMMON, m.summons, 'summon');
        add(A.SELECT_MONSTER_SET, m.monster_sets, 'monster-set');
        add(A.SELECT_SPECIAL_SUMMON, m.special_summons, 'special-summon');
        add(A.SELECT_POS_CHANGE, m.pos_changes, 'position-change');
        add(A.SELECT_SPELL_SET, m.spell_sets, 'spell-set');
        add(A.SELECT_ACTIVATE, m.activates, 'activate');
        if (m.to_bp) { options.push({ action: 'to-battle' }); responses.push({ type: R.SELECT_IDLECMD, action: A.TO_BP, index: null }); }
        if (m.to_ep) { options.push({ action: 'end-turn' }); responses.push({ type: R.SELECT_IDLECMD, action: A.TO_EP, index: null }); }
        return out('idle', options, responses);
      }
      case M.SELECT_CARD:
      case M.SELECT_TRIBUTE:
        return { kind: 'cards', player: m.player, min: m.min, max: m.max, options: m.selects.map(info), responses: null, cancel: m.can_cancel };
      case M.SELECT_UNSELECT_CARD: {
        const options = [...m.select_cards.map((c) => ({ action: 'select', ...info(c) })), ...m.unselect_cards.map((c) => ({ action: 'unselect', ...info(c) }))];
        const responses = options.map((_, index) => ({ type: R.SELECT_UNSELECT_CARD, index }));
        if (m.can_finish) { options.push({ action: 'finish' }); responses.push({ type: R.SELECT_UNSELECT_CARD, index: null }); }
        return out('pick-one', options, responses);
      }
      case M.SELECT_CHAIN: {
        const options = m.selects.map((c) => ({ action: 'chain', ...info(c), description: String(c.description) }));
        const responses = m.selects.map((_, index) => ({ type: R.SELECT_CHAIN, index }));
        if (!m.forced) { options.push({ action: 'pass' }); responses.push({ type: R.SELECT_CHAIN, index: null }); }
        return out('chain', options, responses);
      }
      case M.SELECT_EFFECTYN:
        return out('yes-no', [{ action: 'yes', ...info(m), description: String(m.description) }, { action: 'no' }], [{ type: R.SELECT_EFFECTYN, yes: true }, { type: R.SELECT_EFFECTYN, yes: false }]);
      case M.SELECT_YESNO:
        return out('yes-no', [{ action: 'yes', description: String(m.description) }, { action: 'no' }], [{ type: R.SELECT_YESNO, yes: true }, { type: R.SELECT_YESNO, yes: false }]);
      case M.SELECT_OPTION:
        return out('option', m.options.map((d) => ({ description: String(d) })), m.options.map((_, index) => ({ type: R.SELECT_OPTION, index })));
      case M.SELECT_POSITION: {
        const options = []; const responses = [];
        for (let bit = 1; bit <= 8; bit <<= 1) if (m.positions & bit) { options.push({ position: bit }); responses.push({ type: R.SELECT_POSITION, position: bit }); }
        return out('position', options, responses);
      }
      case M.SELECT_PLACE:
        return { kind: 'place', player: m.player, min: m.count, max: m.count, options: freePlaces(m), responses: null };
      default:
        return { kind: 'unsupported', player: m.player, min: 0, max: 0, options: [], responses: [], messageType: m.type };
    }
  }

  // field_mask 里置位的是不能选的格子：怪兽区在 0–6 位、魔陷区在 8–15 位（我方），16 位起是对方
  function freePlaces(m) {
    const places = [];
    for (const [player, shift] of [[m.player, 0], [1 - m.player, 16]]) {
      for (const [location, base, count] of [[L.MZONE, 0, 7], [L.SZONE, 8, 8]]) {
        for (let sequence = 0; sequence < count; sequence++) if (!(m.field_mask & (1 << (shift + base + sequence)))) places.push({ player, location, sequence });
      }
    }
    return places;
  }

  function autoResponse(m) {
    switch (m.type) {
      case M.SELECT_IDLECMD: return { type: R.SELECT_IDLECMD, action: A.TO_EP, index: null };
      case M.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: m.forced ? 0 : null };
      case M.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: false };
      case M.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: false };
      case M.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: 3, index: null };
      default: throw new Error(`对手遇到了没处理的提示 ${m.type}`);
    }
  }

  build();
  advance();

  return {
    scriptErrors,
    get finished() { return finished; },
    // 当前提示 { kind, player, min, max, options[] }；决斗结束时是 null
    prompt() {
      if (!message) return null;
      const { responses: _r, ...prompt } = describe(message);
      return prompt.kind === 'cards' || prompt.kind === 'pick-one' ? { ...prompt, hint: promptHint } : prompt;
    },
    // 提交选择：选项的下标数组（单选的提示放一个）。选了不合法的抛错
    choose(indices) {
      if (!message) throw new Error('决斗已经结束，没有提示可选');
      const prompt = describe(message);
      if (prompt.kind === 'unsupported') throw new Error(`还不支持这种提示（引擎消息 ${prompt.messageType}）`);
      if (!Array.isArray(indices) || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= prompt.options.length)) throw new Error('选项下标不在合法范围内');
      if (new Set(indices).size !== indices.length) throw new Error('选项重复');
      if (indices.length < prompt.min || indices.length > prompt.max) {
        if (!(prompt.cancel && indices.length === 0)) throw new Error(`要选 ${prompt.min}–${prompt.max} 个，选了 ${indices.length} 个`);
      }
      let response;
      if (prompt.kind === 'cards') {
        const type = message.type === M.SELECT_CARD ? R.SELECT_CARD : R.SELECT_TRIBUTE;
        response = { type, indicies: indices.length ? indices : null };
      } else if (prompt.kind === 'place') {
        response = { type: R.SELECT_PLACE, places: indices.map((i) => prompt.options[i]) };
      } else {
        response = prompt.responses[indices[0]];
      }
      core.duelSetResponse(handle, response);
      history.push(response);
      advance();
    },
    board() { return snapshot(); },
    // 引擎消息的记录（见 record），到我方回合结束为止；按步切片用：先记下 events.length，走完这一步再取 events.slice(记下的数)
    get events() { return events.slice(0, endEvents ?? events.length); },
    get normalSummonUsed() { return normalSummonUsed; },
    get activated() { return [...activated]; },
    // 我方回合结束那一刻的场面（对手回合开始时记下），没结束是 null；回合结束后的抽牌不算在里面
    get endBoard() { return endBoard; },
    // 存档：记下现在走到第几个选择；回滚：同样的种子重放到那里，合法选项和存档时一致
    checkpoint() { return history.length; },
    rollback(checkpoint) {
      if (!Number.isInteger(checkpoint) || checkpoint < 0 || checkpoint > history.length) throw new Error('没有这个存档');
      const replay = history.slice(0, checkpoint);
      history.length = 0;
      build();
      advance();
      for (const response of replay) { core.duelSetResponse(handle, response); history.push(response); advance(); }
    },
    close() { if (handle) core.destroyDuel(handle); handle = null; },
  };
}

// 一手牌的引擎种子：从发牌的种子推出来，同一个种子同一副洗牌
const engineSeed = (seed) => [0, 1, 2, 3].map((i) => BigInt((seed + i) >>> 0));

// 开一手牌的会话：重放路线走这个入口，同一手起手、同一个种子，引擎洗牌和每一步的提示都一样。
// 起手以外的主卡组 = 主卡组 − 起手，按卡组数据里的顺序交给引擎（引擎按种子洗）；不给种子就用 1
export function openHandSession(engine, deck, hand, seed = 1) {
  const rest = expand(deck.main);
  for (const code of hand) {
    const i = rest.indexOf(code);
    if (i < 0) throw new Error(`起手里的 ${code} 不在主卡组里`);
    rest.splice(i, 1);
  }
  return startSession(engine, { hand, deck: rest, extra: expand(deck.extra), seed: engineSeed(seed) });
}

