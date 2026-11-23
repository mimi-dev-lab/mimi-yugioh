/* 游戏王 in the web workspace (the browser version of Hermes Desktop): sidebar item 游戏王, route /yugioh.
   A shell. Rules, dealing, scoring and the engine live in the yugioh service (src/), reached through this plugin's backend
   (../dashboard/plugin_api.py) and ctx.rest, which adds /api/plugins/yugioh and the web workspace's own login and path prefix;
   this file only draws the hand in progress and sends the choices the user makes:
   GET /hand (prompt with legal options, board, step log, clock), POST /hand/start (a seed replays the same hand), /hand/choose, /hand/hint, /hand/end,
   GET /cards (names, roles, the three things), GET /card-image?code= (JSON with base64; drawn as a data: address),
   GET /quiz, POST /quiz/next, /quiz/answer (记卡: the next question, answer it; the service times it and does the FSRS scheduling).
   Tabs: 首页 (start a hand), 记卡 (quick-answer quiz), 记录 (placeholder until its ticket). The hand itself is a full-screen state entered from 首页;
   when it ends the settlement screen (design-r3/clock-result) shows the score broken down, the curve, both final boards and the step-by-step comparison.
   While a hand is on, nothing here shows how far the board is from the best one: the service does not send it.
   A disk plugin: plain ESM, no build step, importing only @hermes/plugin-sdk, react and react/jsx-runtime. No outside
   fonts, images or requests.
   The look is its own (design-r3/clock-play): a true-black ground, #c8ff3d as the accent, grey text no darker than #bdbdbd,
   independent of the workspace's light / dark theme. */
import { ROUTES_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";
import { createElement as h, useState, useEffect, useCallback, useRef } from "react";

const TABS = ["首页", "记卡", "记录"];
const HINT_FACTOR = 0.8; // same number as the service's scoring (DESIGN.md「评分」); only shown on the hint button
// engine location bits
const LOC = { hand: 0x2, monsters: 0x4, spellTraps: 0x8, grave: 0x10, banished: 0x20, extra: 0x40 };
const ZONE_TITLE = { extra: "额外卡组", grave: "墓地", banished: "除外区" }; // the card lists opened from the side of the field
const ACTION_LABEL = { summon: "召唤", "monster-set": "盖放", "special-summon": "特殊召唤", "position-change": "改变表示形式", "spell-set": "盖放", activate: "发动" };
const ZONE_LABEL = { 0x1: "卡组", 0x2: "手牌", 0x4: "场上", 0x8: "场上", 0x10: "墓地", 0x20: "除外", 0x40: "额外" };
// what the engine is asking a card for (HINTMSG_* in the scripts' constant.lua)
const HINT_LABEL = { 500: "解放", 501: "丢弃", 502: "破坏", 503: "除外", 504: "送去墓地", 505: "回到手牌", 506: "加入手牌", 507: "回到卡组", 508: "通常召唤", 509: "特殊召唤", 510: "盖放",
  511: "当融合素材", 512: "当同调素材", 513: "当超量素材", 531: "解放", 533: "当连接素材", 549: "作为攻击对象", 551: "作为对象" };
const POSITION_LABEL = { 1: "攻击表示", 2: "里侧攻击表示", 4: "守备表示", 8: "里侧守备表示" };

const clock = (ms) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const factorText = (hints) => { const t = (HINT_FACTOR ** hints).toFixed(2); return t.endsWith("0") ? t.slice(0, -1) : t; };
const message = (e) => String(e?.message ?? e).replace(/^\d+:\s*/, "");

// card pictures: one request per card per page load, kept as data: addresses (ctx.rest only reads JSON)
const imageCache = new Map();
function loadImage(rest, code) {
  if (!imageCache.has(code)) {
    imageCache.set(code, rest(`/card-image?code=${code}`).then((r) => `data:${r.type};base64,${r.base64}`).catch(() => null));
  }
  return imageCache.get(code);
}
function CardArt({ rest, code, md, className = "" }) {
  const [src, setSrc] = useState(undefined);
  useEffect(() => {
    let live = true;
    loadImage(rest, code).then((s) => { if (live) setSrc(s); });
    return () => { live = false; };
  }, [rest, code]);
  if (src) return h("img", { className: `yg-art ${className}`, src, alt: md, draggable: false });
  return h("div", { className: `yg-art yg-noart ${className}`, "aria-label": md }, src === undefined ? "" : md);
}

// ---- one card on the table: art, name underneath (md_name), green dot when it has a legal action ----
function Card({ rest, card, selected, ok, onClick, small, dim }) {
  return h("button", { className: `yg-card${selected ? " sel" : ""}${small ? " small" : ""}${dim ? " dim" : ""}`, onClick, "aria-label": card.md, "aria-pressed": selected },
    h(CardArt, { rest, code: card.code, md: card.md }),
    ok ? h("span", { className: "yg-ok", title: "有可做的操作" }) : null,
    h("span", { className: "yg-name" }, card.md));
}
const Slot = ({ label, dashed, children, tall }) => h("div", { className: `yg-slot${dashed ? " dashed" : ""}${tall === false ? " flat" : ""}` }, children ?? (label ? h("span", { className: "yg-zt" }, label) : null));

// ---- the prompt the engine is waiting on (everything but the main phase): options listed with card pictures ----
function PromptPanel({ rest, prompt, busy, send }) {
  const [picked, setPicked] = useState([]);
  useEffect(() => setPicked([]), [prompt]);
  const opts = prompt.options.map((o, i) => ({ ...o, i }));
  const single = prompt.min === 1 && prompt.max === 1;
  // identical cards (two 烙印龙 阿尔比昂) are one tile with a count; clicking takes one more of the group
  const groups = [];
  for (const o of opts) {
    const g = o.code === undefined ? null : groups.find((x) => x.code === o.code && x.location === o.location && x.action === o.action);
    if (g) g.idx.push(o.i); else groups.push({ ...o, idx: [o.i] });
  }
  const takenIn = (g) => g.idx.filter((i) => picked.includes(i));
  const clickGroup = (g) => {
    if (single) return send([g.idx[0]]);
    const taken = takenIn(g);
    if (taken.length < g.idx.length && picked.length < prompt.max) return setPicked([...picked, g.idx.find((i) => !picked.includes(i))]);
    return setPicked(picked.filter((i) => !g.idx.includes(i)));
  };
  const cardOption = (g, onClick, extra) => h("button", { key: g.i, className: `yg-opt${takenIn(g).length ? " sel" : ""}`, onClick, disabled: busy },
    h(CardArt, { rest, code: g.code, md: g.md }),
    g.idx.length > 1 ? h("span", { className: "yg-count" }, !single && prompt.kind === "cards" ? `${takenIn(g).length}/${g.idx.length}` : `×${g.idx.length}`) : null,
    h("span", { className: "yg-name" }, g.md), extra ? h("span", { className: "yg-sub" }, extra) : null);
  const textOption = (o, text) => h("button", { key: o.i, className: "yg-btn wide", onClick: () => send([o.i]), disabled: busy }, text);
  const src = prompt.source ? `${prompt.source.action} ${prompt.source.md} · ` : "";
  const cancel = prompt.cancel ? h("button", { key: "cancel", className: "yg-btn", disabled: busy, onClick: () => send([]) }, "取消") : null;
  let title; let body;
  switch (prompt.kind) {
    case "cards": {
      const zones = [...new Set(opts.map((o) => ZONE_LABEL[o.location]))];
      const what = HINT_LABEL[prompt.hint];
      title = `${src}选 ${prompt.min}${prompt.max !== prompt.min ? `–${prompt.max}` : ""} 张${zones.length === 1 && zones[0] ? `${zones[0]}的` : ""}卡${what ? `：${what}` : ""}`;
      body = [h("div", { className: "yg-opts", key: "o" }, groups.map((g) => cardOption(g, () => clickGroup(g)))),
        h("div", { className: "yg-row", key: "b" },
          single ? null : h("button", { className: "yg-btn primary", disabled: busy || picked.length < prompt.min || picked.length > prompt.max, onClick: () => send([...picked].sort((a, b) => a - b)) }, `确定（${picked.length}）`), cancel)];
      break;
    }
    case "pick-one": {
      const what = HINT_LABEL[prompt.hint];
      title = `${src}逐张选择${what ? `：${what}` : ""}`;
      body = [h("div", { className: "yg-opts", key: "o" }, groups.filter((g) => g.action !== "finish").map((g) => cardOption(g, () => send([g.idx[0]]), g.action === "unselect" ? "已选 · 点击取消" : null))),
        h("div", { className: "yg-row", key: "b" }, opts.filter((o) => o.action === "finish").map((o) => h("button", { key: o.i, className: "yg-btn primary", onClick: () => send([o.i]), disabled: busy }, "选完")), cancel)];
      break;
    }
    case "chain":
      title = "连锁：要发动吗？";
      body = h("div", { className: "yg-opts" }, groups.map((g) => (g.action === "pass"
        ? h("button", { key: g.i, className: "yg-btn", onClick: () => send([g.idx[0]]), disabled: busy }, "不发动")
        : cardOption(g, () => send([g.idx[0]]), "发动"))));
      break;
    case "yes-no": {
      const subject = opts.find((o) => o.md);
      title = subject ? `是否发动「${subject.md}」的效果？` : "是否发动？";
      body = [subject ? h(CardArt, { key: "a", rest, code: subject.code, md: subject.md, className: "yg-big" }) : null,
        h("div", { className: "yg-row", key: "b" }, opts.map((o) => h("button", { key: o.i, className: `yg-btn${o.action === "yes" ? " primary" : ""}`, onClick: () => send([o.i]), disabled: busy }, o.action === "yes" ? "发动" : "不发动")))];
      break;
    }
    case "option":
      title = `${src}选一项`;
      body = h("div", { className: "yg-col" }, opts.map((o) => textOption(o, `第 ${o.i + 1} 项`)));
      break;
    case "position":
      title = `${src}选表示形式`;
      body = h("div", { className: "yg-row" }, opts.map((o) => textOption(o, POSITION_LABEL[o.position] ?? `形式 ${o.position}`)));
      break;
    case "place": {
      const mine = opts.filter((o) => o.player === 0);
      title = `${src}选放置的位置`;
      body = h("div", { className: "yg-row wrap" }, (mine.length ? mine : opts).map((o) => textOption(o,
        o.location === LOC.monsters ? (o.sequence >= 5 ? `额外怪兽区 ${o.sequence - 4}` : `怪兽区 第 ${o.sequence + 1} 格`) : (o.sequence === 5 ? "场地区" : `魔陷区 第 ${o.sequence + 1} 格`))));
      break;
    }
    default:
      title = "这个提示界面还不支持";
      body = h("p", { className: "yg-lab" }, `引擎在等一个这里没做界面的选择（${prompt.kind}）。`);
  }
  return h("div", { className: "yg-prompt", role: "dialog", "aria-label": "引擎的选择" }, h("div", { className: "yg-prompt-title" }, title), body);
}

// ---- the hand in progress ----
function Play({ rest, hand, cards, busy, send, end, hint }) {
  const [sel, setSel] = useState(null); // { zone, code, sequence }
  const [zoneOpen, setZoneOpen] = useState(null); // "extra" | "grave" | "banished": the card list on top
  const [now, setNow] = useState(0);
  const base = useRef({ at: 0, ms: 0 });
  useEffect(() => { base.current = { at: performance.now(), ms: hand.elapsedMs }; setNow(hand.elapsedMs); }, [hand.elapsedMs, hand.id]);
  useEffect(() => {
    if (hand.status !== "playing") return undefined;
    const t = setInterval(() => setNow(base.current.ms + (performance.now() - base.current.at)), 250);
    return () => clearInterval(t);
  }, [hand.status, hand.id]);
  useEffect(() => setSel(null), [hand.id]);

  const board = hand.board;
  const prompt = hand.prompt;
  const idle = prompt?.kind === "idle" ? prompt : null;
  const actionsFor = (zone, card) => (idle ? idle.options.map((o, i) => ({ ...o, i })).filter((o) => o.code === card.code && o.location === LOC[zone] && o.sequence === card.sequence && ACTION_LABEL[o.action]) : []);
  const endPhase = idle ? idle.options.findIndex((o) => o.action === "end-turn") : -1;
  const info = sel ? cards[sel.code] : null;
  const legal = sel ? actionsFor(sel.zone, sel) : [];
  const pickCard = (zone, card) => { setSel({ zone, code: card.code, sequence: card.sequence }); setZoneOpen(null); };
  const isSel = (zone, card) => sel && sel.zone === zone && sel.code === card.code && sel.sequence === card.sequence;
  const cardEl = (zone, card, props = {}) => h(Card, { key: `${zone}-${card.sequence}-${card.code}`, rest, card, selected: isSel(zone, card), ok: actionsFor(zone, card).length > 0, onClick: () => pickCard(zone, card), ...props });

  const at = (list, seq) => list.find((c) => c.sequence === seq);
  const mz = (seq) => { const c = at(board.monsters, seq); return h(Slot, { key: `m${seq}` }, c ? cardEl("monsters", c) : null); };
  const sz = (seq) => { const c = at(board.spellTraps, seq); return h(Slot, { key: `s${seq}`, tall: false }, c ? cardEl("spellTraps", c) : null); };
  const emz = (seq) => { const c = at(board.monsters, seq); return c ? h(Slot, { key: `e${seq}` }, cardEl("monsters", c)) : h(Slot, { key: `e${seq}`, dashed: true, label: "额外怪兽区" }); };
  const field = at(board.spellTraps, 5);
  const topGrave = board.grave.at(-1);
  const anyLegal = (zone) => board[zone].some((c) => actionsFor(zone, c).length > 0);
  // 额外 / 除外 are buttons that open the card list; a green dot says some card in it has a legal action right now
  const zoneButton = (zone, label) => h("button", { className: "yg-slot flat yg-zbtn", "aria-label": ZONE_TITLE[zone], onClick: () => setZoneOpen(zone), disabled: board[zone].length === 0 },
    h("span", { className: "yg-zt" }, `${label} ${board[zone].length}`), anyLegal(zone) ? h("span", { className: "yg-ok", title: "有可做的操作" }) : null);
  const restrictions = hand.restrictions ?? [];
  const rows = hand.steps ?? [];

  return h("div", { className: "yg-play", "data-status": hand.status },
    h("section", { className: "yg-top" },
      h("div", { className: "yg-clock" },
        h("div", { className: "yg-lab" }, `第 ${hand.number} 手 · 用时`),
        h("div", { className: "yg-time", "aria-label": "用时" }, clock(now)),
        h("div", { className: "yg-col tight" },
          h("div", { className: "yg-line" }, h("span", { className: "yg-lab" }, "提示"), h("span", { className: "yg-mono" }, `${hand.hints} 次 · ×${factorText(hand.hints)}`)),
          h("div", { className: "yg-lab" }, "场面分在结束回合后才揭晓"))),
      h("div", { className: "yg-log" },
        h("div", { className: "yg-line" }, h("strong", null, "操作记录"), h("span", { className: "yg-lab" }, "每一步花了什么、换来什么")),
        h("div", { className: "yg-table", "aria-label": "操作记录" },
          ["步", "时间", "操作", "花了 → 换来"].map((t) => h("span", { key: t, className: "yg-lab th" }, t)),
          rows.flatMap((r) => [
            h("span", { key: `${r.step}n`, className: "yg-mono td" }, r.step),
            h("span", { key: `${r.step}t`, className: "yg-mono td dim" }, clock(r.atMs)),
            h("span", { key: `${r.step}x`, className: "td", title: r.text }, r.summary ?? r.text),
            h("span", { key: `${r.step}c`, className: "td soft" }, `${r.spent} → ${r.gained}`),
          ]),
          hand.status === "playing" && (idle || rows.length === 0) ? [h("span", { key: "pn", className: "yg-mono td now" }, rows.length + 1), h("span", { key: "pt", className: "yg-mono td now" }, clock(now)), h("span", { key: "px", className: "td now" }, "轮到你"), h("span", { key: "pc", className: "td" })] : null))),
    h("section", { className: "yg-bottom" },
      h("div", { className: "yg-board" },
        h("div", { className: "yg-line" }, h("strong", null, "场地"), h("span", { className: "yg-lab" }, `召唤权 ${hand.normalSummonUsed ? "已用" : "未用"}`), h("span", { className: "yg-fill" }),
          restrictions.length ? h("span", { className: "yg-warn yg-mono" }, restrictions.join("；")) : null),
        h("div", { className: "yg-field" },
          h("div", { className: "yg-side" }, h(Slot, { label: "场地魔法" }, field ? cardEl("spellTraps", field) : null), zoneButton("extra", "额外")),
          h("div", { className: "yg-zones" },
            h("div", { className: "yg-rowz emz" }, h("span", { className: "gap" }), emz(5), h("span", { className: "gap" }), emz(6), h("span", { className: "gap" })),
            h("div", { className: "yg-rowz mz" }, [0, 1, 2, 3, 4].map(mz)),
            h("div", { className: "yg-rowz sz" }, [0, 1, 2, 3, 4].map(sz))),
          h("div", { className: "yg-side" },
            h("div", { className: "yg-grave" }, h("span", { className: "yg-zt top" }, `墓地 ${board.grave.length}`),
              h(Slot, { label: "" }, topGrave ? h(Card, { rest, card: topGrave, dim: true, ok: anyLegal("grave"), onClick: () => setZoneOpen(zoneOpen === "grave" ? null : "grave"), selected: zoneOpen === "grave" }) : null)),
            h("div", { className: "yg-row" }, zoneButton("banished", "除外"), h(Slot, { label: `卡组 ${board.deck}`, tall: false })))),
        h("div", { className: "yg-handrow" }, h("span", { className: "yg-lab" }, `手牌 ${board.hand.length}`), board.hand.map((c) => cardEl("hand", c, { small: true })))),
      h("div", { className: "yg-detail" },
        info ? [
          h("div", { className: "yg-line", key: "t" }, h("span", { className: "yg-title" }, info.md), h("span", { className: "yg-chip on" }, info.role)),
          h("div", { className: "yg-ops", key: "o" }, legal.length
            ? legal.map((o, n) => h("button", { key: o.i, className: `yg-btn${n === 0 ? " primary" : ""}`, disabled: busy || !idle, onClick: () => send([o.i]) }, `${o.action === "special-summon" && o.location === LOC.extra ? "额外卡组特殊召唤" : ACTION_LABEL[o.action]}${o.action === "activate" && legal.filter((x) => x.action === "activate").length > 1 ? ` · 效果 ${o.i + 1}` : ""}`))
            : h("span", { className: "yg-lab" }, idle ? "现在没有可做的操作" : "先回答上面的选择")),
          h("div", { className: "yg-facts", key: "f" },
            [["干什么", info.does], ["条件代价", info.cost], ["限制", info.limit, true]].map(([k, v, warn]) => h("div", { key: k, className: "yg-fact" }, h("span", { className: "yg-lab" }, k), h("span", { className: warn ? "yg-warn" : "" }, v)))),
        ] : h("p", { className: "yg-lab pad" }, "点手牌、场上或墓地的一张卡，看它现在能做什么，和它的角色、三件事。"),
        h("div", { className: "yg-final" },
          h("button", { className: "yg-btn ghost", disabled: busy || hand.status !== "playing", onClick: hint, title: "照提示走下一步；每用一次分数 ×0.8" }, "提示", h("span", { className: "yg-mono yg-lab" }, `分数 ×${HINT_FACTOR}`)),
          endPhase >= 0 ? h("button", { className: "yg-btn ghost yg-phase", disabled: busy, onClick: () => send([endPhase]), title: "先进结束阶段：结束阶段才能发动的效果（回手、检索）由你来选；直接「结束回合」会把它们都放过" }, "进结束阶段") : null,
          h("button", { className: "yg-btn solid", disabled: busy, onClick: end }, "结束回合"))),
    ),
    zoneOpen ? h("div", { className: "yg-modal", role: "dialog", "aria-label": ZONE_TITLE[zoneOpen] },
      h("div", { className: "yg-prompt" }, h("div", { className: "yg-prompt-title" }, `${ZONE_TITLE[zoneOpen]}（${board[zoneOpen].length}）· 带绿点的卡现在有操作可做`),
        h("div", { className: "yg-zlist" }, board[zoneOpen].map((c) => cardEl(zoneOpen, c, { small: true, dim: zoneOpen === "grave" }))),
        h("div", { className: "yg-row" }, h("button", { className: "yg-btn", onClick: () => setZoneOpen(null) }, "关上")))) : null,
    prompt && prompt.kind !== "idle" && hand.status === "playing" ? h("div", { className: "yg-modal" }, h(PromptPanel, { rest, prompt, busy, send })) : null);
}

// ---- settlement (design-r3/clock-result): score broken into its parts, the curve, both final boards, the step-by-step comparison ----
const SEARCH_NOTE = { pending: "搜索还没搜完", "timed-out": "搜索超时", failed: "搜索失败", none: "这手没有搜索结果", "replay-failed": "缓存的搜索路线在这手的种子下走不通，已重搜" };
function benchmarkText(b) {
  if (b.source === "search") return "基准：最好场面搜索搜出的路线（用你的起手和种子重放得到）";
  const note = b.search !== "done" && SEARCH_NOTE[b.search] ? `（${SEARCH_NOTE[b.search]}）` : "";
  if (b.source === "game8") return `基准：Game8 路线「${b.name ?? b.routeId}」${note}`;
  return `基准：你在这手牌上的最好成绩${note}。没有搜索和 Game8 路线可比，场面分偏高`;
}

function Stat({ label, value, sub, tone }) {
  return h("div", { className: "yg-rstat" },
    h("div", { className: "yg-lab" }, label),
    h("div", { className: `yg-rnum yg-mono ${tone ?? ""}` }, value),
    h("div", { className: "yg-lab sub" }, sub));
}

// the value after each step, drawn as steps: white = you, green dashed = the best route; the stretch where the step you diverged on sits is shaded
function Curve({ result }) {
  const user = result.curve.user;
  const best = result.curve.best;
  const n = Math.max(user.length, best?.length ?? 0, 1);
  const W = 880, H = 160, L = 56, R = 70, T = 14, B = 28;
  const x = (k) => L + (k / n) * (W - L - R);
  const y = (v) => T + (1 - Math.min(1, Math.max(0, v))) * (H - T - B);
  const path = (list) => [`M${x(0)},${y(0)}`, ...list.map((v, i) => `H${x(i + 1)}V${y(v)}`), `H${W - R + 24}`].join("");
  const d = result.divergeStep;
  return h("svg", { className: "yg-curve", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "每一步之后的场面曲线" },
    d ? h("rect", { x: x(d - 1), y: T, width: x(d) - x(d - 1), height: H - T - B, fill: "#1a120d" }) : null,
    h("line", { x1: L, x2: W - R + 24, y1: y(0.9), y2: y(0.9), stroke: "#6f8f2a", strokeDasharray: "3 4" }),
    [[1, "100%"], [0.9, "90%"], [0, "0"]].map(([v, t]) => h("text", { key: t, x: L - 8, y: y(v) + 4, textAnchor: "end", fontSize: 11, fill: v === 0.9 ? "#c8ff3d" : "#bdbdbd", className: "yg-mono" }, t)),
    Array.from({ length: n }, (_, i) => h("text", { key: i, x: x(i + 1), y: H - 8, textAnchor: "middle", fontSize: 11, fill: "#bdbdbd", className: "yg-mono" }, i + 1)),
    d ? h("text", { x: (x(d - 1) + x(d)) / 2, y: H - 8, textAnchor: "middle", fontSize: 11, fill: "#ff9a6b" }, "走偏") : null,
    best ? h("path", { d: path(best), fill: "none", stroke: "#c8ff3d", strokeWidth: 2, strokeDasharray: "5 4" }) : null,
    h("path", { d: path(user), fill: "none", stroke: "#ececec", strokeWidth: 2.5 }),
    best ? h("text", { x: W - 2, y: y(best.at(-1)) - 6, textAnchor: "end", fontSize: 12, fill: "#c8ff3d", fontWeight: 600 }, `最好 ${Math.round(best.at(-1) * 100)}%`) : null,
    h("text", { x: W - 2, y: y(user.at(-1)) + 16, textAnchor: "end", fontSize: 12, fill: "#ececec" }, `你 ${Math.round(user.at(-1) * 100)}%`));
}

function MiniCard({ rest, card, missing }) {
  if (missing) return h("div", { className: "yg-mini" }, h("div", { className: "yg-mini-art gap" }), h("span", { className: "yg-mini-name warn" }, `少 ${card.md}`));
  return h("div", { className: "yg-mini" }, h("div", { className: "yg-mini-art" }, h(CardArt, { rest, code: card.code, md: card.md })), h("span", { className: "yg-mini-name" }, card.md));
}

// both final fields side by side, slot for slot: the user's row has exactly as many slots as the best row (cards only the user has are named in a line under it), a card the best field has and the user's does not is a dashed slot "少 name"
function Finals({ rest, result }) {
  const mine = [...result.finalBoard.monsters, ...result.finalBoard.spellTraps];
  const best = result.bestBoard ? [...result.bestBoard.monsters, ...result.bestBoard.spellTraps] : null;
  const left = [...mine];
  const slots = (best ?? []).map((c) => {
    const i = left.findIndex((m) => m.code === c.code);
    return i >= 0 ? { card: left.splice(i, 1)[0] } : { card: c, missing: true };
  });
  const row = (cards) => h("div", { className: "yg-minis", style: { gridTemplateColumns: `repeat(${Math.max(cards.length, 1)}, minmax(0, 52px))` } }, cards.map((c, i) => h(MiniCard, { key: i, rest, card: c.card, missing: c.missing })));
  const head = (p) => (p ? `打断 ${p.interrupts} · 手牌 ${p.hand}` : "");
  return h("div", { className: "yg-finals" },
    best ? h("div", { className: "yg-final-block", "aria-label": "最好终场" },
      h("div", { className: "yg-line" }, h("strong", null, "最好终场"), h("span", { className: "yg-fill" }), h("span", { className: "yg-mono yg-lab" }, head(result.parts.best))),
      row(best.map((c) => ({ card: c })))) : h("p", { className: "yg-lab" }, "没有最好终场可画：基准是你自己以前的成绩"),
    h("div", { className: "yg-final-block", "aria-label": "你的终场" },
      h("div", { className: "yg-line" }, h("strong", null, "你的终场"), h("span", { className: "yg-fill" }), h("span", { className: "yg-mono yg-lab" }, head(result.parts.user))),
      row(best ? slots : mine.map((c) => ({ card: c }))),
      best && left.length ? h("span", { className: "yg-lab" }, `另有 ${left.map((c) => c.md).join("、")}（最好终场里没有）`) : null));
}

// one row per step (rows = the longer of the two routes): best on the left, you on the right; the step you diverged on is lit up across the row; the whole block scrolls
function StepCompare({ result }) {
  const { steps, bestSteps, divergeStep: d } = result;
  const n = Math.max(steps.length, bestSteps?.length ?? 0);
  const spend = (s) => `花 ${s.spent} → ${s.gained}`;
  const side = (s, empty, tone) => (s
    ? [h("strong", { key: "t", className: tone }, s.summary), h("span", { key: "s", className: "soft" }, spend(s)), s.hinted ? h("span", { key: "h", className: "yg-warn hinted" }, "用提示") : null]
    : h("span", { className: "yg-lab" }, empty));
  const rows = Array.from({ length: n }, (_, i) => {
    const u = steps[i];
    const b = bestSteps?.[i];
    const diverge = d === i + 1;
    const same = bestSteps && !!u && !!b && (!d || i + 1 < d);
    return h("div", { key: i, className: `yg-sr${diverge ? " diverge" : ""}`, "data-step": i + 1 },
      h("div", { className: `yg-mono yg-sn${diverge ? " warn" : ""}` }, i + 1, diverge ? h("span", { className: "yg-lab warn" }, "走偏") : null),
      bestSteps ? h("div", { className: "yg-sb" }, h("span", { className: "yg-lab" }, same ? "最好 = 你" : "最好"), side(b, "最好路线已经结束", "best")) : null,
      h("div", { className: "yg-su" }, h("span", { className: "yg-lab" }, "你"), same ? h("span", { className: "yg-lab" }, "两边相同") : null, side(u, "你已经结束", "")));
  });
  return h("section", { className: "yg-steps", "aria-label": "逐步对照" },
    h("div", { className: "yg-stephead" }, h("strong", null, "逐步对照"), h("span", { className: "yg-lab" }, `${n} 步`)),
    h("div", { className: "yg-srs" }, rows));
}

function Settled({ rest, result, busy, onAgain, onReplay, onHome }) {
  const hintedSteps = result.steps.filter((s) => s.hinted).map((s) => s.step);
  const time = clock(result.durationMs);
  const speedSub = !result.speedCounted ? `用时 ${time} · 场面未到 90，不加速度分` : result.speedBonus === 0 ? `用时 ${time}，超过 5:00 不加` : `用时 ${time}，60 秒内满 +20，5:00 降到 0`;
  const parts = result.parts;
  const typeText = `${result.handTypeStats.name}起手平均 ${result.handTypeStats.average}`;
  return h("div", { className: "yg-result", "aria-label": "结算" },
    h("section", { className: "yg-rtop" },
      h(Stat, { label: "场面分", value: result.fieldScore, sub: parts.best ? `打断 ${parts.user.interrupts}/${parts.best.interrupts} · 手牌 ${parts.user.hand}/${parts.best.hand}` : `打断 ${parts.user.interrupts} · 手牌 ${parts.user.hand}` }),
      h("span", { className: "yg-op" }, "+"),
      h(Stat, { label: "速度加成", value: result.speedCounted ? `+${result.speedBonus}` : "0", sub: speedSub, tone: result.speedBonus ? "" : "dim" }),
      h("span", { className: "yg-op" }, "×"),
      h(Stat, { label: result.hints ? `提示 ${result.hints} 次` : "提示 0 次", value: result.hintFactor.toFixed(result.hints > 1 ? 2 : 1), sub: hintedSteps.length ? `第 ${hintedSteps.join("、")} 步用了提示` : "没用提示", tone: result.hints ? "warn" : "" }),
      h("span", { className: "yg-op" }, "="),
      h(Stat, { label: "总分", value: result.total, sub: typeText, tone: "total" }),
      h("div", { className: "yg-rbtns" },
        h("button", { className: "yg-btn primary big", disabled: busy, onClick: onAgain }, "再来一手"),
        h("button", { className: "yg-btn big", disabled: busy, onClick: onReplay }, "重打这一手"),
        h("button", { className: "yg-btn small", onClick: onHome }, "回首页"))),
    h("section", { className: "yg-rmid" },
      h("div", { className: "yg-rcurve" },
        h("div", { className: "yg-line" }, h("strong", null, "每一步之后的场面"), h("span", { className: "yg-lab" }, `白 = 你${result.curve.best ? " · 绿虚线 = 最好路线" : ""}${result.divergeStep ? ` · 第 ${result.divergeStep} 步开始分开` : result.curve.best ? " · 一直没分开" : ""}`)),
        h(Curve, { result })),
      h(Finals, { rest, result })),
    h(StepCompare, { result }),
    h("p", { className: "yg-lab yg-bench", "data-source": result.benchmark.source }, benchmarkText(result.benchmark)));
}

// ---- end of settlement ----

// ---- home (design-r3/clock-home): every hand as a point (time × field), best and latest marked, the speed-bonus zone on the linear rule, per-type averages, the benchmark curve ----
const TYPE_COLOR = { "white-albaz": "#c8ff3d", other: "#ececec", "branded-fusion": "#ff9a6b", brick: "#8a8a8a" };
const typeColor = (id) => TYPE_COLOR[id] ?? "#bdbdbd";
// same numbers as the service's scoring (DESIGN.md「评分」): full bonus up to FULL_BONUS_S, none from NO_BONUS_S, linear between; only for a field score from SPEED_MIN
const FULL_BONUS_S = 60;
const NO_BONUS_S = 300;
const SPEED_MIN = 0.9;
const Y_MIN = 0.4; // the vertical axis shows 40–100%: every point is above it in practice, and the zone is 10 points tall
const QUICK_ANSWER_S = 5; // a quick answer in 记卡 (EASY_MS in src/quiz.js), for "about N minutes"

function Scatter({ home }) {
  const W = 820, H = 620, L = 62, R = 26, T = 40, B = 64;
  const spanS = Math.max(NO_BONUS_S, Math.ceil(Math.max(0, ...home.points.map((p) => p.durationMs)) / 60000) * 60);
  const x = (s) => L + (s / spanS) * (W - L - R);
  const y = (v) => T + (1 - (Math.max(v, Y_MIN) - Y_MIN) / (1 - Y_MIN)) * (H - T - B);
  const step = spanS > 600 ? 120 : 60;
  const { best, last } = home;
  const same = best && last && best.number === last.number;
  const label = (p, text, dy) => {
    const right = x(p.durationMs / 1000) > W - 230;
    const tx = x(p.durationMs / 1000) + (right ? -14 : 14), ty = y(p.fieldScore / 100) + dy, w = text.t.length * 7.4 + 12;
    // a solid plate behind the text so the dots under it do not eat the letters
    return h("g", { key: text.t },
      h("rect", { x: right ? tx - w + 6 : tx - 6, y: ty - 15, width: w, height: 21, rx: 4, fill: "#000", fillOpacity: 0.88, stroke: text.color, strokeOpacity: 0.5 }),
      h("text", { x: tx, y: ty, textAnchor: right ? "end" : "start", fontSize: 13, fontWeight: 600, fill: text.color, className: "yg-mono" }, text.t));
  };
  return h("svg", { className: "yg-scatter", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "每一手的用时和场面" },
    h("defs", null, h("linearGradient", { id: "yg-zone", gradientUnits: "userSpaceOnUse", x1: x(FULL_BONUS_S), x2: x(NO_BONUS_S), y1: 0, y2: 0 },
      h("stop", { offset: 0, stopColor: "#c8ff3d", stopOpacity: 0.26 }), h("stop", { offset: 1, stopColor: "#c8ff3d", stopOpacity: 0 }))),
    h("rect", { x: x(0), y: y(1), width: x(NO_BONUS_S) - x(0), height: y(SPEED_MIN) - y(1), fill: "url(#yg-zone)" }),
    // the bonus at the two ends of the slope sits under the time axis, away from the dots
    [[FULL_BONUS_S, "+20"], [NO_BONUS_S, "+0"]].map(([s, t]) => h("text", { key: s, x: x(s), y: H - B + 38, textAnchor: s === NO_BONUS_S ? "end" : "middle", fontSize: 11, fill: "#c8ff3d", className: "yg-mono" }, `速度加成 ${t}`)),
    h("line", { x1: L, x2: W - R, y1: y(SPEED_MIN), y2: y(SPEED_MIN), stroke: "#6f8f2a", strokeDasharray: "4 4" }),
    h("line", { x1: L, x2: W - R, y1: y(0.5), y2: y(0.5), stroke: "#333" }),
    h("path", { d: `M${L},${T}V${H - B}H${W - R}`, fill: "none", stroke: "#8a8a8a" }),
    [[1, "100%"], [SPEED_MIN, "90%"], [0.7, "70%"], [0.5, "50%"], [Y_MIN, "40%"]].map(([v, t]) => h("text", { key: t, x: L - 8, y: y(v) + 4, textAnchor: "end", fontSize: 12, fill: v === SPEED_MIN ? "#c8ff3d" : "#bdbdbd", className: "yg-mono" }, t)),
    Array.from({ length: Math.floor(spanS / step) + 1 }, (_, i) => h("text", { key: i, x: x(i * step), y: H - B + 22, textAnchor: "middle", fontSize: 12, fill: "#bdbdbd", className: "yg-mono" }, clock(i * step * 1000))),
    h("text", { x: (L + W - R) / 2, y: H - 6, textAnchor: "middle", fontSize: 12, fill: "#bdbdbd" }, "用时"),
    home.points.length === 0 ? h("text", { x: (L + W - R) / 2, y: H / 2, textAnchor: "middle", fontSize: 15, fill: "#bdbdbd" }, "还没有记录：打完第一手，这里会出现一个点") : null,
    home.points.map((p) => h("circle", { key: p.number, cx: x(p.durationMs / 1000), cy: y(p.fieldScore / 100), r: best && p.number === best.number ? 9 : 6, fill: typeColor(p.handType), fillOpacity: 0.92 })),
    last ? h("circle", { cx: x(last.durationMs / 1000), cy: y(last.fieldScore / 100), r: 13, fill: "none", stroke: "#fff", strokeWidth: 2 }) : null,
    best ? label(best, { color: "#c8ff3d", t: `${same ? "最好 · 刚才" : "最好"} ${best.total}（${clock(best.durationMs)} · ${best.fieldScore}%）` }, same ? -16 : -14) : null,
    last && !same ? label(last, { color: "#fff", t: `刚才 ${clock(last.durationMs)} · ${last.fieldScore}%` }, 5) : null);
}

// the real progress: the total of each benchmark hand in the order played (the service only tells which ones are benchmarks here, in the curve)
function Progress({ progress }) {
  const pts = progress.points;
  const W = 300, H = 64, L = 6, R = 6, T = 8, B = 8;
  const x = (i) => (pts.length < 2 ? (L + W - R) / 2 : L + (i / (pts.length - 1)) * (W - L - R));
  const y = (v) => T + (1 - Math.min(120, Math.max(0, v)) / 120) * (H - T - B);
  return h("div", { className: "yg-prog" },
    h("div", { className: "yg-lab" }, progress.average === null ? "真实进步（固定的基准手）" : `真实进步（固定的基准手）· ${pts.length} 次 · 平均 ${progress.average} 分`),
    pts.length < 2
      ? h("p", { className: "yg-lab" }, "打过 2 次以上才画曲线；用没有提示的固定手量进步，比分数涨没涨更可信。")
      : h("svg", { className: "yg-progsvg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "基准手的总分曲线" },
        h("line", { x1: L, x2: W - R, y1: y(100), y2: y(100), stroke: "#333" }),
        h("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.total)}`).join(""), fill: "none", stroke: "#c8ff3d", strokeWidth: 2 }),
        pts.map((p, i) => h("circle", { key: p.index, cx: x(i), cy: y(p.total), r: 3, fill: "#c8ff3d" }))));
}

function Home({ home, due, busy, ready, hasHand, onStart, onResume, onQuiz }) {
  const best = home?.best;
  const tip = home?.tip;
  const minutes = due ? Math.max(1, Math.ceil((due * QUICK_ANSWER_S) / 60)) : 0;
  return h("div", { className: "yg-dash", "aria-label": "首页" },
    h("section", { className: "yg-panel yg-chart" },
      h("div", { className: "yg-line" }, h("strong", null, "每一手：用时 × 场面"), h("span", { className: "yg-lab" }, "越往左上越好 · 一个点是一手")),
      h("p", { className: "yg-lab yg-zonenote" }, "绿色渐变 = 速度加成区：场面 ≥ 90%，60 秒内 +20，到 5:00 线性降为 0 · 纵轴只画 40–100%"),
      home ? h(Scatter, { home }) : null),
    h("div", { className: "yg-side" },
      h("section", { className: "yg-start" },
        h("p", null, "随机 5 张 · 先攻 · 计时从发牌开始"),
        h("div", { className: "yg-row" },
          h("button", { className: "yg-startbtn", disabled: busy || !ready, onClick: onStart }, "开始一手"),
          hasHand ? h("button", { className: "yg-resumebtn", onClick: onResume }, "继续这一手") : null)),
      due === null ? null : h("button", { className: "yg-panel yg-due", onClick: onQuiz },
        h("span", { className: "yg-bignum yg-mono" }, due),
        h("span", null, h("strong", null, due ? "张卡到期" : "没有到期的卡"), h("div", { className: "yg-lab" }, due ? `记卡 · 快答约 ${minutes} 分钟` : "记卡 · 之后到期的会出现在这里"))),
      h("section", { className: "yg-panel yg-best" },
        h("div", { className: "yg-lab" }, "个人最好"),
        best
          ? h("div", { className: "yg-col tight" },
            h("div", { className: "yg-line" }, h("span", { className: "yg-bestnum yg-mono" }, best.total), h("span", { className: "yg-lab" }, `场面 ${best.fieldScore} + 速度 ${best.speedBonus}`)),
            h("div", { className: "yg-lab" }, `${clock(best.durationMs)} · ${best.handTypeName} · 第 ${best.number} 手`))
          : h("p", { className: "yg-lab" }, "还没有：打完一手就有了。")),
      h("section", { className: "yg-panel yg-types" },
        h("div", { className: "yg-lab" }, "各类起手 · 平均场面 · 平均用时"),
        home && home.types.length
          ? h("ul", { className: "yg-typelist" }, home.types.map((t) => h("li", { key: t.id },
            h("span", { className: "yg-dot", style: { background: typeColor(t.id) } }),
            h("span", { className: "yg-fill" }, t.name),
            h("strong", { className: "yg-mono" }, `${t.avgFieldScore}%`), h("span", { className: "yg-mono yg-lab" }, clock(t.avgDurationMs)))))
          : h("p", { className: "yg-lab" }, "打完一手就有各类起手的平均场面和用时。"),
        home ? h(Progress, { progress: home.progress }) : null,
        h("p", { className: "yg-tip" }, tip
          ? `${tip.name}：平均场面 ${tip.avgFieldScore}%、平均用时 ${clock(tip.avgDurationMs)}，最值得练，发牌会多发这类。`
          : "每类起手打满 3 手，这里会写最值得练的是哪类。"))));
}
// ---- end of home ----

// ---- 记卡: one question at a time, timed by the service from the moment it is handed out ----
const BAR_MS = 10000; // the bar's full length; 5 s is where a right answer counts as Easy (EASY_MS / HARD_MS in src/quiz.js)
const EASY_S = 5;
const seconds = (ms) => (ms / 1000).toFixed(1);
const dueText = (ms) => {
  const m = ms / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} 分钟后`;
  if (m < 60 * 24) return `${Math.round(m / 60)} 小时后`;
  return `${Math.round(m / 60 / 24)} 天后`;
};
const KIND_TEXT = { identify: "看卡图", fill: "补缺项", find: "按需求找卡" };

function Spark({ history }) {
  if (!history.length) return h("span", { className: "yg-lab" }, "这张卡还没答过");
  const top = Math.max(...history, 1);
  const pts = history.map((v, i) => `${history.length === 1 ? 100 : (i / (history.length - 1)) * 190 + 5},${44 - (v / top) * 38}`);
  return h("div", { className: "yg-spark", "aria-label": "这张卡的答题用时" },
    h("svg", { viewBox: "0 0 200 50", width: 200, height: 50 }, h("polyline", { points: pts.join(" "), fill: "none", stroke: "#bdbdbd", strokeWidth: 2 })),
    h("span", { className: "yg-mono yg-lab first" }, seconds(history[0])),
    h("span", { className: "yg-mono last" }, seconds(history.at(-1))));
}

function Quiz({ rest }) {
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState(null); // the question in hand; null = on the start screen
  const [option, setOption] = useState(null);
  const [roles, setRoles] = useState([]);
  const [result, setResult] = useState(null); // the answer's outcome; the question stays up behind it
  const [answered, setAnswered] = useState(0);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = useRef(0);
  const guard = useCallback(async (fn) => {
    setBusy(true); setError("");
    try { return await fn(); } catch (e) { setError(message(e)); return null; } finally { setBusy(false); }
  }, []);
  const refresh = useCallback(() => guard(async () => setSummary(await rest("/quiz"))), [rest, guard]);
  useEffect(() => { refresh(); }, [refresh]);

  const next = useCallback((count) => guard(async () => {
    const r = await rest("/quiz/next", { method: "POST", body: {} });
    setOption(null); setRoles([]); setResult(null); setNow(0);
    if (r.done) { setQ(null); setDone(true); return; }
    base.current = performance.now();
    setDone(false); setAnswered(count); setQ(r);
  }), [rest, guard]);
  const finish = () => { setQ(null); setDone(false); setAnswered(0); refresh(); };

  const asking = q && !result;
  useEffect(() => {
    if (!asking) return undefined;
    const t = setInterval(() => setNow(performance.now() - base.current), 100);
    return () => clearInterval(t);
  }, [asking, q]);

  const submit = useCallback(() => guard(async () => {
    if (option === null) return;
    setResult(await rest("/quiz/answer", { method: "POST", body: { option, roles } }));
  }), [rest, guard, option, roles]);
  const toggleRole = (r) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  // number keys: 1-4 pick the answer, 5-9 and 0 toggle the roles (identify), Enter submits, then goes on to the next question
  useEffect(() => {
    if (!q) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || busy) return;
      if (e.key === "Enter") { e.preventDefault(); if (result) next(answered + 1); else submit(); return; }
      if (result || !/^[0-9]$/.test(e.key)) return;
      const n = e.key === "0" ? 10 : Number(e.key);
      if (n <= q.options.length) setOption(n - 1);
      else if (q.roles && n - q.options.length - 1 < q.roles.length) toggleRole(q.roles[n - q.options.length - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, result, busy, answered, next, submit]);

  const head = (right) => h("div", { className: "yg-qhead" },
    h("div", { className: "yg-line" }, h("strong", { className: "yg-qtitle" }, "记卡 · 快答"), h("span", { className: "yg-lab" }, "看卡图 · 补三件事 · 按需求找卡 混合出题")), right);
  const err = error ? h("div", { className: "yg-error", role: "alert" }, error) : null;

  if (!q) {
    const due = summary?.due ?? 0;
    return h("div", { className: "yg-quiz", "aria-label": "记卡" }, head(null), err,
      h("div", { className: "yg-home" },
        h("h2", null, done || (summary && due === 0) ? "现在没有到期的卡" : `${due} 张卡到期`),
        h("p", { className: "yg-lab" }, done ? "这一轮到期的都答完了。答得又快又对的卡过几天再来，答错或很慢的卡很快会再出现。没有每日题量，有空再来。" : "按功能记卡：每张卡的名字、角色，和「干什么、条件或代价、限制」三件事。快答的卡间隔变长，答错或很慢的卡很快再考。"),
        h("div", { className: "yg-row" }, h("button", { className: "yg-btn primary big", disabled: busy || !summary || due === 0, onClick: () => next(0) }, "开始记卡"))));
  }

  const barFull = Math.min(1, (result ? result.ms : now) / BAR_MS);
  const ms = result ? result.ms : now;
  const right = h("div", { className: "yg-line" },
    h("span", { className: "yg-mono yg-qcount" }, `${answered + 1} / ${answered + q.due}`),
    h("span", { className: "yg-lab" }, `还剩 ${q.due - 1} 张到期`),
    h("button", { className: "yg-btn small", onClick: finish }, "结束"));
  const timer = h("section", { className: "yg-qtimer" },
    h("div", { className: "yg-qused" }, h("div", { className: "yg-lab" }, "本题已用"), h("div", { className: "yg-time small", "aria-label": "本题已用" }, seconds(ms), h("span", { className: "yg-unit" }, "秒"))),
    h("div", { className: "yg-bar" },
      h("div", { className: "yg-track" }, h("div", { className: "yg-fill-bar", style: { width: `${barFull * 100}%` } })),
      q.lastMs != null ? h("div", { className: "yg-mark", style: { left: `${(q.lastMs / BAR_MS) * 100}%` } }, h("span", { className: "yg-lab" }, `上次 ${seconds(q.lastMs)} 秒`)) : null,
      h("div", { className: "yg-mark mid", style: { left: `${(EASY_S * 1000 / BAR_MS) * 100}%` } }, h("span", null, `${EASY_S} 秒内答对 → 间隔加长`)),
      h("span", { className: "yg-lab end" }, `${BAR_MS / 1000} 秒`)),
    h("div", { className: "yg-qhist" }, h("span", { className: "yg-lab" }, "这张卡的答题用时"), h(Spark, { history: q.history })));

  const shownCode = result ? result.card.code : q.image;
  const caption = result ? `Master Duel 卡名：${result.card.md}`
    : q.kind === "identify" ? "Master Duel 卡名：？（卡图上是另一套译名）" : q.kind === "fill" ? `Master Duel 卡名：${q.name}` : "按需求找卡：卡图答完再翻开";
  const art = h("section", { className: "yg-qart" },
    shownCode ? h(CardArt, { rest, code: shownCode, md: result ? result.card.md : q.name ?? "", className: "yg-qimg" }) : h("div", { className: "yg-art yg-noart yg-qimg" }, "？"),
    h("span", { className: "yg-lab" }, caption));

  const optionBtn = (o, i) => {
    const state = result ? (i === result.answerIndex ? " ok" : i === option ? " bad" : "") : option === i ? " on" : "";
    return h("button", { key: i, className: `yg-qopt${state}`, disabled: busy || !!result, onClick: () => setOption(i), "aria-pressed": option === i }, h("b", { className: "yg-mono" }, i + 1), h("span", null, o.text));
  };
  const roleChips = q.roles ? h("div", { className: "yg-qroles" },
    h("div", { className: "yg-lab" }, "角色（可多选）"),
    h("div", { className: "yg-row wrap" }, q.roles.map((r) => {
      const state = result ? (result.answerRoles.includes(r) ? " ok" : roles.includes(r) ? " bad" : "") : roles.includes(r) ? " on" : "";
      return h("button", { key: r, className: `yg-role${state}`, disabled: busy || !!result, onClick: () => toggleRole(r), "aria-pressed": roles.includes(r) }, r);
    }))) : null;
  const given = q.given ? h("div", { className: "yg-facts yg-qgiven" }, q.given.map((g) => h("div", { key: g.label, className: "yg-fact" }, h("span", { className: "yg-lab" }, g.label), h("span", null, g.text)))) : null;
  const feedback = result ? h("div", { className: `yg-feedback ${result.correct ? "right" : "wrong"}`, role: "status" },
    h("div", { className: "yg-line" }, h("strong", null, result.correct ? "答对了" : "答错了"),
      h("span", { className: "yg-mono" }, `${seconds(result.ms)} 秒 · ${result.rating}`), h("span", { className: "yg-lab" }, `下次 ${dueText(result.dueInMs)}再考`)),
    h("div", { className: "yg-line" }, h("span", { className: "yg-title" }, result.card.md), h("span", { className: "yg-chip on" }, result.card.role)),
    h("div", { className: "yg-facts" }, [["干什么", result.card.does], ["条件代价", result.card.cost], ["限制", result.card.limit]].map(([k, v]) => h("div", { key: k, className: "yg-fact" }, h("span", { className: "yg-lab" }, k), h("span", null, v))))) : null;
  const hint = q.kind === "identify" ? "数字键 1–4 选名字，5–0 选角色，回车提交 · 名字和角色都对才算对" : "数字键 1–4 选答案，回车提交";

  return h("div", { className: "yg-quiz", "aria-label": "记卡", "data-kind": q.kind }, head(right), err, timer,
    h("div", { className: "yg-qbody" }, art,
      h("section", { className: "yg-qmain" },
        h("div", { className: "yg-line" }, h("h2", { className: "yg-qprompt" }, q.prompt), h("span", { className: "yg-chip" }, KIND_TEXT[q.kind])),
        given,
        h("div", { className: "yg-qopts" }, q.options.map(optionBtn)),
        roleChips, feedback,
        h("div", { className: "yg-qfoot" }, h("span", { className: "yg-lab" }, result ? "回车下一题" : hint),
          result ? h("button", { className: "yg-btn solid big", disabled: busy, onClick: () => next(answered + 1) }, "下一题")
            : h("button", { className: "yg-btn solid big", disabled: busy || option === null, onClick: submit }, "提交")))));
}

function YugiohApp({ rest }) {
  const [tab, setTab] = useState("首页");
  const [hand, setHand] = useState(null);
  const [cards, setCards] = useState({});
  const [result, setResult] = useState(null);
  const [screen, setScreen] = useState("home"); // home | play | settled
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [home, setHome] = useState(null); // GET /home: the points, best, per-type averages, benchmark curve
  const [due, setDue] = useState(null); // GET /quiz: cards due for 记卡 (null until known)

  const call = useCallback(async (fn) => {
    setBusy(true); setError("");
    try { return await fn(); } catch (e) { setError(message(e)); return null; } finally { setBusy(false); }
  }, []);
  useEffect(() => {
    (async () => {
      const c = await call(() => rest("/cards"));
      if (c) setCards(c.cards);
      try { setHand(await rest("/hand")); } catch { setHand(null); } // 404: no hand in progress
      setReady(true);
    })();
  }, [rest, call]);

  // 首页的数据：回到首页（开始时、打完一手回来、换页签）就重新取
  useEffect(() => {
    if (screen !== "home" || tab !== "首页") return;
    (async () => {
      try { setHome(await rest("/home")); } catch { /* the error banner belongs to actions; the home keeps what it had */ }
      try { setDue((await rest("/quiz")).due); } catch { setDue(null); }
    })();
  }, [rest, screen, tab]);

  const start = (seed) => call(async () => { const v = await rest("/hand/start", { method: "POST", body: seed === undefined ? {} : { seed } }); setHand(v); setResult(null); setScreen("play"); });
  const send = (indices) => call(async () => setHand(await rest("/hand/choose", { method: "POST", body: { indices } })));
  const hint = () => call(async () => { const t = await rest("/hand/hint", { method: "POST", body: {} }); setHand(await rest("/hand/choose", { method: "POST", body: { indices: t.indices } })); });
  const end = () => call(async () => { const r = await rest("/hand/end", { method: "POST", body: {} }); setResult(r); setHand(null); setScreen("settled"); });

  const header = h("header", { className: "yg-head" }, h("h1", null, "游戏王"),
    home ? h("span", { className: "yg-lab" }, `烙印 · 已打 ${home.hands} 手`) : null,
    h("nav", { className: "yg-tabs" }, TABS.map((t) => h("button", { key: t, className: `yg-tab${tab === t ? " on" : ""}`, onClick: () => { setTab(t); setScreen("home"); } }, t))));
  let main;
  if (screen === "play" && hand) main = h(Play, { rest, hand, cards, busy, send, end, hint });
  else if (screen === "settled" && result) main = h(Settled, { rest, result, busy, onAgain: () => start(), onReplay: () => start(result.seed), onHome: () => setScreen("home") });
  else if (tab === "记卡") main = h(Quiz, { rest });
  else if (tab !== "首页") main = h("div", { className: "yg-home" }, h("h2", null, tab), h("p", { className: "yg-lab" }, `「${tab}」还没做，在后面的票里。`));
  else main = h(Home, { home, due, busy, ready, hasHand: !!hand, onStart: () => start(), onResume: () => setScreen("play"), onQuiz: () => setTab("记卡") });
  return h("div", { className: "yg", "data-ready": ready ? "true" : "false" },
    screen === "play" || (screen === "settled" && result) ? null : header,
    error ? h("div", { className: "yg-error", role: "alert" }, error) : null,
    main);
}

const CSS = `
.yg { position: relative; min-height: 100%; box-sizing: border-box; background: #000; color: #ececec; padding: 16px 20px;
  font-family: "PingFang SC", "Noto Sans SC", system-ui, sans-serif; font-size: 13px; }
.yg *, .yg *::before, .yg *::after { box-sizing: border-box; }
.yg button { font: inherit; color: inherit; cursor: pointer; }
.yg h1, .yg h2, .yg p { margin: 0; }
.yg-mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.yg-lab { font-size: 12px; color: #bdbdbd; letter-spacing: .06em; }
.yg-warn { color: #ff9a6b; }
.yg-head { display: flex; align-items: center; gap: 24px; margin-bottom: 18px; }
.yg-head h1 { font-size: 18px; }
.yg-tabs { display: flex; gap: 6px; margin-left: auto; }
.yg-tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 12px; color: #bdbdbd; }
.yg-tab.on { color: #c8ff3d; border-color: #c8ff3d; }
.yg-error { border: 1px solid #ff9a6b; color: #ff9a6b; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; }
.yg-dash { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; align-items: stretch; }
.yg-panel { border: 1px solid #2a2a2a; border-radius: 10px; padding: 16px 18px; background: #000; text-align: left; }
.yg-zonenote { margin: 0; color: #c8ff3d; }
.yg-chart { display: flex; flex-direction: column; gap: 6px; }
.yg-scatter { width: 100%; height: auto; flex: 1; }
.yg-side { display: flex; flex-direction: column; gap: 14px; }
.yg-start { background: #c8ff3d; color: #000; border-radius: 10px; padding: 16px 20px 18px; min-height: 150px; display: flex; flex-direction: column; justify-content: space-between; }
.yg-start p { font-weight: 600; font-size: 12px; }
.yg .yg-startbtn { background: none; border: 0; padding: 0; color: #000; font-size: 36px; font-weight: 700; text-align: left; }
.yg .yg-startbtn:disabled { opacity: .5; cursor: default; }
.yg .yg-resumebtn { margin-left: auto; border: 1px solid #000; border-radius: 5px; background: none; color: #000; min-height: 34px; padding: 0 14px; font-weight: 600; }
.yg .yg-due { display: flex; color: inherit; align-items: center; gap: 14px; width: 100%; }
.yg-bignum { font-size: 40px; line-height: 1; }
.yg-bestnum { font-size: 52px; line-height: 1; color: #c8ff3d; }
.yg-types { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.yg-typelist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.yg-typelist li { display: flex; align-items: center; gap: 10px; }
.yg-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.yg-prog { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.yg-progsvg { width: 100%; height: auto; }
.yg-tip { font-weight: 600; font-size: 12px; line-height: 1.5; }

.yg-home { display: flex; flex-direction: column; gap: 16px; padding: 24px 4px; max-width: 640px; }
.yg-home h2 { font-size: 20px; }
.yg-row { display: flex; gap: 8px; align-items: center; } .yg-row.wrap { flex-wrap: wrap; }
.yg-col { display: flex; flex-direction: column; gap: 8px; } .yg-col.tight { gap: 6px; }
.yg-line { display: flex; align-items: baseline; gap: 16px; }
.yg-fill { flex: 1; }
.yg-btn { min-height: 34px; padding: 0 14px; border-radius: 5px; border: 1px solid #3a3a3a; background: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.yg-btn.big { min-height: 48px; padding: 0 28px; font-size: 15px; }
.yg-btn.wide { min-width: 120px; }
.yg-btn.primary { background: #c8ff3d; border-color: #c8ff3d; color: #000; font-weight: 600; }
.yg-btn.solid { background: #ececec; border-color: #ececec; color: #000; font-weight: 600; }
.yg-btn:disabled { opacity: .65; cursor: default; }
.yg-play { position: relative; height: calc(100vh - 92px); min-height: 700px; display: flex; flex-direction: column; gap: 14px; }
.yg-play section { min-height: 0; }
.yg-top { height: 264px; border: 1px solid #1f1f1f; border-radius: 8px; display: flex; overflow: hidden; flex: none; }
.yg-clock { width: 270px; flex: none; padding: 18px 22px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #1f1f1f; }
.yg-time { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 84px; line-height: .9; color: #c8ff3d; letter-spacing: -.03em; }
.yg-log { flex: 1; padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; min-width: 0; overflow: auto; }
.yg-table { display: grid; grid-template-columns: 28px 56px minmax(0, 1fr) minmax(0, 1fr); column-gap: 12px; line-height: 1.5; }
.yg-table .th, .yg-table .td { padding: 8px 0; border-bottom: 1px solid #1c1c1c; }
.yg-rest { color: #bdbdbd; font-size: 12px; }
.yg-table .td.dim { color: #bdbdbd; } .yg-table .td.soft { color: #d6d6d6; }
.yg-table .now { color: #c8ff3d; border-bottom: 0; }
.yg-bottom { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: 14px; }
.yg-board, .yg-detail { border: 1px solid #1f1f1f; border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.yg-field { flex: 1; display: flex; gap: 14px; justify-content: center; align-items: flex-start; padding-top: 16px; }
.yg-side { display: flex; flex-direction: column; gap: 22px; }
.yg-zones { display: flex; flex-direction: column; gap: 10px; }
.yg-rowz { display: flex; gap: 8px; } .yg-rowz.mz { margin-bottom: 20px; }
.yg-rowz .gap { width: 72px; }
.yg-slot { width: 72px; height: 104px; border: 1px solid #262626; border-radius: 3px; background: #070707; position: relative; flex: none; display: flex; align-items: center; justify-content: center; text-align: center; }
.yg-slot.flat { height: 52px; } .yg-slot.dashed { border-style: dashed; height: 70px; }
.yg-rowz.sz .yg-slot { height: 44px; } .yg-rowz.emz .yg-slot { height: 70px; }
.yg-zt { font-size: 10px; color: #bdbdbd; line-height: 1.4; } .yg-zt.top { position: absolute; top: -16px; left: 0; right: 0; }
.yg-grave { position: relative; }
.yg-zbtn { font: inherit; color: inherit; cursor: pointer; } .yg-zbtn:disabled { cursor: default; opacity: .6; } .yg-zbtn .yg-ok { top: 4px; right: 4px; }
.yg-card { position: relative; width: 100%; height: 100%; padding: 0; background: none; border: 0; border-radius: 3px; }
.yg-card.sel { outline: 2px solid #c8ff3d; outline-offset: 2px; }
.yg-card.dim img, .yg-card.dim .yg-noart { opacity: .75; }
.yg-card .yg-name { position: absolute; left: -14px; right: -14px; top: 107px; font-size: 10px; color: #d6d6d6; text-align: center; line-height: 1.3; }
.yg-card.sel .yg-name { color: #c8ff3d; }
.yg-card.small { width: 66px; height: 96px; margin-bottom: 20px; }
.yg-card.small .yg-name { top: 99px; left: -8px; right: -8px; font-size: 10px; }
.yg-handrow { gap: 16px; }
.yg-art { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; display: block; }
.yg-noart { background: #141414; border: 1px solid #262626; color: #d6d6d6; font-size: 10px; display: flex; align-items: center; justify-content: center; padding: 4px; text-align: center; overflow: hidden; }
.yg-ok { position: absolute; right: -4px; top: -4px; width: 11px; height: 11px; border-radius: 6px; background: #c8ff3d; border: 2px solid #000; }
.yg-handrow { display: flex; gap: 12px; align-items: flex-end; justify-content: center; border-top: 1px solid #1a1a1a; padding-top: 10px; min-height: 122px; }
.yg-handrow .yg-lab { align-self: center; margin-right: 8px; }
.yg-title { font-size: 16px; font-weight: 600; }
.yg-chip { font-size: 11px; padding: 2px 8px; border-radius: 9px; border: 1px solid #444; color: #bdbdbd; }
.yg-chip.on { background: #c8ff3d; border-color: #c8ff3d; color: #000; font-weight: 600; }
.yg-ops { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.yg-facts { display: flex; flex-direction: column; font-size: 12px; line-height: 1.55; }
.yg-fact { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 8px; padding: 8px 0; border-top: 1px solid #1c1c1c; }
.yg-detail .pad { padding: 8px 0; }
.yg-final { margin-top: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.yg-final .yg-btn { min-height: 46px; } .yg-final .yg-phase { grid-column: 1 / -1; min-height: 34px; }
.yg-modal { position: absolute; inset: 0; background: rgba(0, 0, 0, .82); display: flex; align-items: center; justify-content: center; z-index: 5; }
.yg-prompt { background: #0b0b0b; border: 1px solid #3a3a3a; border-radius: 10px; padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; max-width: 900px; max-height: 90%; overflow: auto; align-items: center; }
.yg-prompt-title { font-size: 15px; font-weight: 600; }
.yg-zlist { display: flex; flex-wrap: wrap; gap: 14px 22px; justify-content: center; align-items: flex-start; max-width: 720px; padding-bottom: 12px; } .yg-zlist .yg-card { flex: none; margin-bottom: 26px; }
.yg-opts { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: flex-start; }
.yg-opt { width: 88px; padding: 0; position: relative; background: none; border: 0; border-radius: 4px; height: 128px; margin-bottom: 44px; }
.yg-opt.sel { outline: 2px solid #c8ff3d; outline-offset: 2px; }
.yg-opt .yg-art { height: 128px; }
.yg-opt .yg-name { position: absolute; left: -6px; right: -6px; top: 132px; font-size: 11px; color: #d6d6d6; text-align: center; line-height: 1.3; }
.yg-opt .yg-sub { position: absolute; left: 0; right: 0; top: 168px; font-size: 10px; color: #c8ff3d; text-align: center; }
.yg-count { position: absolute; right: 2px; top: 2px; min-width: 22px; padding: 1px 5px; border-radius: 9px; background: #c8ff3d; color: #000; font-size: 11px; font-weight: 600; }
.yg-big { width: 120px; height: 175px; }
.yg-quiz { display: flex; flex-direction: column; gap: 14px; }
.yg-qhead { display: flex; align-items: center; justify-content: space-between; }
.yg-qtitle { font-size: 16px; } .yg-qcount { font-size: 16px; }
.yg-btn.small { min-height: 28px; padding: 0 10px; font-size: 12px; }
.yg-qtimer { border: 1px solid #1f1f1f; border-radius: 8px; padding: 20px 26px; display: flex; align-items: center; gap: 36px; min-height: 120px; }
.yg-qused { width: 190px; flex: none; }
.yg-time.small { font-size: 64px; } .yg-unit { font-size: 20px; margin-left: 4px; letter-spacing: 0; }
.yg-bar { flex: 1; position: relative; padding-bottom: 36px; }
.yg-track { height: 16px; background: #161616; border-radius: 2px; overflow: hidden; }
.yg-fill-bar { height: 100%; background: #c8ff3d; }
.yg-mark { position: absolute; top: -6px; width: 2px; height: 28px; background: #ececec; }
.yg-mark span { position: absolute; top: 34px; left: 0; transform: translateX(-50%); white-space: nowrap; font-size: 12px; color: #bdbdbd; }
.yg-mark.mid span { color: #ececec; font-weight: 600; }
.yg-bar .end { position: absolute; right: 0; top: 26px; }
.yg-qhist { width: 210px; flex: none; display: flex; flex-direction: column; gap: 4px; }
.yg-spark { position: relative; width: 200px; height: 50px; }
.yg-spark .first { position: absolute; left: 0; bottom: -4px; } .yg-spark .last { position: absolute; right: 0; top: 0; color: #c8ff3d; font-size: 11px; }
.yg-qbody { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 14px; }
.yg-qart { border: 1px solid #1f1f1f; border-radius: 8px; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 420px; }
.yg-qimg { width: 250px; height: 365px; flex: none; object-fit: cover; }
.yg-qmain { display: flex; flex-direction: column; gap: 14px; padding: 4px 4px 0; min-width: 0; }
.yg-qprompt { font-size: 20px; font-weight: 600; }
.yg-qopts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.yg-qopt { min-height: 52px; border: 1px solid #333; border-radius: 6px; background: none; display: flex; align-items: center; gap: 12px; padding: 8px 16px; text-align: left; font-size: 15px; line-height: 1.4; }
.yg-qopt b { font-weight: 400; color: #c8ff3d; font-size: 13px; }
.yg-qopt.on, .yg-role.on { border-color: #c8ff3d; } .yg-qopt.ok, .yg-role.ok { border-color: #c8ff3d; background: #14200a; } .yg-qopt.bad, .yg-role.bad { border-color: #ff9a6b; background: #25140c; }
.yg-qroles { display: flex; flex-direction: column; gap: 10px; }
.yg-role { height: 40px; padding: 0 16px; border: 1px solid #333; border-radius: 20px; background: none; font-size: 13px; }
.yg-qgiven { border-bottom: 1px solid #1c1c1c; }
.yg-feedback { border: 1px solid #333; border-radius: 8px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.yg-feedback.right { border-color: #c8ff3d; } .yg-feedback.wrong { border-color: #ff9a6b; }
.yg-qfoot { margin-top: auto; border-top: 1px solid #1c1c1c; padding-top: 14px; display: flex; align-items: center; justify-content: space-between; }
.yg-result { display: flex; flex-direction: column; gap: 12px; height: calc(100vh - 110px); min-height: 640px; }
.yg-result > section { flex: none; }
.yg-rtop { display: flex; align-items: flex-start; gap: 22px; padding: 0 4px 10px; border-bottom: 1px solid #1c1c1c; }
.yg-rstat { display: flex; flex-direction: column; gap: 6px; min-width: 150px; }
.yg-rstat .sub { letter-spacing: 0; }
.yg-rnum { font-size: 52px; line-height: 1; color: #ececec; letter-spacing: -.04em; }
.yg-rnum.dim { color: #8a8a8a; } .yg-rnum.warn { color: #ff9a6b; } .yg-rnum.total { color: #c8ff3d; font-size: 68px; }
.yg-op { font-size: 32px; color: #8a8a8a; align-self: center; margin-top: 14px; }
.yg-rbtns { margin-left: auto; display: flex; flex-direction: column; gap: 6px; width: 170px; }
.yg-rmid { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 24px; }
.yg-rcurve { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.yg-curve { width: 100%; height: auto; display: block; }
.yg-finals { display: flex; flex-direction: column; gap: 10px; }
.yg-final-block { display: flex; flex-direction: column; gap: 6px; }
.yg-minis { display: grid; gap: 8px; justify-content: start; }
.yg-mini { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.yg-mini-art { width: 100%; aspect-ratio: 56 / 80; position: relative; } .yg-mini-art .yg-art { height: 100%; }
.yg-mini-art.gap { border: 1px dashed #ff9a6b; border-radius: 3px; }
.yg-mini-name { font-size: 10px; line-height: 1.3; text-align: center; color: #d6d6d6; } .yg-mini-name.warn { color: #ff9a6b; }
.yg-result > .yg-steps { flex: 1; min-height: 120px; }
.yg-steps { display: flex; border: 1px solid #1f1f1f; border-radius: 8px; overflow: hidden; }
.yg-stephead { width: 90px; flex: none; padding: 12px; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid #1c1c1c; }
.yg-srs { flex: 1; min-height: 0; overflow-y: auto; }
.yg-sr { display: grid; grid-template-columns: 56px minmax(0, 1fr) minmax(0, 1fr); gap: 16px; padding: 10px 14px; border-bottom: 1px solid #1c1c1c; font-size: 12px; line-height: 1.5; }
.yg-sr > div { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
.yg-sr.diverge { background: #1a120d; box-shadow: inset 3px 0 0 #ff9a6b; }
.yg-sn { font-size: 14px; } .yg-sr .warn { color: #ff9a6b; } .yg-sr .best { color: #c8ff3d; } .yg-sr .soft { color: #bdbdbd; }
.yg-bench { padding: 0 4px; }
@media (max-width: 900px) { .yg-bottom { grid-template-columns: 1fr; } .yg-rmid { grid-template-columns: 1fr; } }
`;

export default {
  id: "yugioh",
  name: "游戏王",
  description: "游戏王 (a shell over the yugioh service)",
  register(ctx) {
    const style = document.createElement("style");
    style.dataset.plugin = "yugioh";
    style.textContent = CSS;
    document.head.appendChild(style);
    ctx.onDispose(() => style.remove());
    const rest = (path, opts) => ctx.rest(path, opts);
    ctx.registerMany([
      { id: "page", area: ROUTES_AREA, data: { path: "/yugioh" }, render: () => h(YugiohApp, { rest }) },
      { id: "nav", area: SIDEBAR_NAV_AREA, data: { path: "/yugioh", label: "游戏王", codicon: "game" } },
    ]);
  },
};
