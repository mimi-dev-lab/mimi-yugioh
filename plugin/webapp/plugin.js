/* 游戏王 in the web workspace (the browser version of Hermes Desktop): sidebar item 游戏王, route /yugioh.
   A shell. Rules, dealing, scoring and the engine live in the yugioh service (src/), reached through this plugin's backend
   (../dashboard/plugin_api.py) and ctx.rest, which adds /api/plugins/yugioh and the web workspace's own login and path prefix;
   this file only draws the hand in progress and sends the choices the user makes:
   GET /hand (prompt with legal options, board, step log, clock), POST /hand/start, /hand/choose, /hand/end,
   GET /cards (names, roles, the three things), GET /card-image?code= (JSON with base64; drawn as a data: address).
   Tabs: 首页 (start a hand), 记卡, 记录 (placeholders until their tickets). The hand itself is a full-screen state entered from 首页.
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
const LOC = { hand: 0x2, monsters: 0x4, spellTraps: 0x8, grave: 0x10 };
const ACTION_LABEL = { summon: "召唤", "monster-set": "盖放", "special-summon": "特殊召唤", "position-change": "改变表示形式", "spell-set": "盖放", activate: "发动" };
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
  const toggle = (i) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const cardOption = (o, onClick, extra) => h("button", { key: o.i, className: `yg-opt${picked.includes(o.i) ? " sel" : ""}`, onClick, disabled: busy },
    h(CardArt, { rest, code: o.code, md: o.md }), h("span", { className: "yg-name" }, o.md), extra ? h("span", { className: "yg-sub" }, extra) : null);
  const textOption = (o, text) => h("button", { key: o.i, className: "yg-btn wide", onClick: () => send([o.i]), disabled: busy }, text);
  let title; let body;
  switch (prompt.kind) {
    case "cards":
      title = single ? "选一张" : `选 ${prompt.min}${prompt.max !== prompt.min ? `–${prompt.max}` : ""} 张`;
      body = [h("div", { className: "yg-opts", key: "o" }, opts.map((o) => cardOption(o, () => (single ? send([o.i]) : toggle(o.i))))),
        single ? null : h("div", { className: "yg-row", key: "b" },
          h("button", { className: "yg-btn primary", disabled: busy || picked.length < prompt.min || picked.length > prompt.max, onClick: () => send([...picked].sort((a, b) => a - b)) }, `确定（${picked.length}）`))];
      break;
    case "pick-one":
      title = "逐张选择";
      body = h("div", { className: "yg-opts" }, opts.map((o) => (o.action === "finish"
        ? h("button", { key: o.i, className: "yg-btn primary", onClick: () => send([o.i]), disabled: busy }, "选完")
        : cardOption(o, () => send([o.i]), o.action === "unselect" ? "已选 · 点击取消" : null))));
      break;
    case "chain":
      title = "连锁：要发动吗？";
      body = h("div", { className: "yg-opts" }, opts.map((o) => (o.action === "pass"
        ? h("button", { key: o.i, className: "yg-btn", onClick: () => send([o.i]), disabled: busy }, "不发动")
        : cardOption(o, () => send([o.i]), "发动"))));
      break;
    case "yes-no": {
      const subject = opts.find((o) => o.md);
      title = subject ? `是否发动「${subject.md}」的效果？` : "是否发动？";
      body = [subject ? h(CardArt, { key: "a", rest, code: subject.code, md: subject.md, className: "yg-big" }) : null,
        h("div", { className: "yg-row", key: "b" }, opts.map((o) => h("button", { key: o.i, className: `yg-btn${o.action === "yes" ? " primary" : ""}`, onClick: () => send([o.i]), disabled: busy }, o.action === "yes" ? "发动" : "不发动")))];
      break;
    }
    case "option":
      title = "选一项";
      body = h("div", { className: "yg-col" }, opts.map((o) => textOption(o, `第 ${o.i + 1} 项`)));
      break;
    case "position":
      title = "选表示形式";
      body = h("div", { className: "yg-row" }, opts.map((o) => textOption(o, POSITION_LABEL[o.position] ?? `形式 ${o.position}`)));
      break;
    case "place": {
      const mine = opts.filter((o) => o.player === 0);
      title = "选放置的位置";
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
function Play({ rest, hand, cards, busy, send, end }) {
  const [sel, setSel] = useState(null); // { zone, code, sequence }
  const [graveOpen, setGraveOpen] = useState(false);
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
  const info = sel ? cards[sel.code] : null;
  const legal = sel ? actionsFor(sel.zone, sel) : [];
  const pickCard = (zone, card) => { setSel({ zone, code: card.code, sequence: card.sequence }); setGraveOpen(false); };
  const isSel = (zone, card) => sel && sel.zone === zone && sel.code === card.code && sel.sequence === card.sequence;
  const cardEl = (zone, card, props = {}) => h(Card, { key: `${zone}-${card.sequence}-${card.code}`, rest, card, selected: isSel(zone, card), ok: actionsFor(zone, card).length > 0, onClick: () => pickCard(zone, card), ...props });

  const at = (list, seq) => list.find((c) => c.sequence === seq);
  const mz = (seq) => { const c = at(board.monsters, seq); return h(Slot, { key: `m${seq}` }, c ? cardEl("monsters", c) : null); };
  const sz = (seq) => { const c = at(board.spellTraps, seq); return h(Slot, { key: `s${seq}`, tall: false }, c ? cardEl("spellTraps", c) : null); };
  const emz = (seq) => { const c = at(board.monsters, seq); return c ? h(Slot, { key: `e${seq}` }, cardEl("monsters", c)) : h(Slot, { key: `e${seq}`, dashed: true, label: "额外怪兽区" }); };
  const field = at(board.spellTraps, 5);
  const topGrave = board.grave.at(-1);
  const restrictions = hand.restrictions ?? [];
  const rows = hand.steps ?? [];

  return h("div", { className: "yg-play", "data-status": hand.status },
    h("section", { className: "yg-top" },
      h("div", { className: "yg-clock" },
        h("div", { className: "yg-lab" }, `这一手 · 用时`),
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
            h("span", { key: `${r.step}x`, className: "td" }, r.text.split(" → ")[0], r.text.includes(" → ") ? h("span", { className: "yg-rest" }, ` → ${r.text.split(" → ").slice(1).join(" → ")}`) : null),
            h("span", { key: `${r.step}c`, className: "td soft" }, `${r.spent} → ${r.gained}`),
          ]),
          hand.status === "playing" && idle ? [h("span", { key: "pn", className: "yg-mono td now" }, rows.length + 1), h("span", { key: "pt", className: "yg-mono td now" }, clock(now)), h("span", { key: "px", className: "td now" }, "轮到你"), h("span", { key: "pc", className: "td" })] : null))),
    h("section", { className: "yg-bottom" },
      h("div", { className: "yg-board" },
        h("div", { className: "yg-line" }, h("strong", null, "场地"), h("span", { className: "yg-lab" }, `召唤权 ${hand.normalSummonUsed ? "已用" : "未用"}`), h("span", { className: "yg-fill" }),
          restrictions.length ? h("span", { className: "yg-warn yg-mono" }, restrictions.join("；")) : null),
        h("div", { className: "yg-field" },
          h("div", { className: "yg-side" }, h(Slot, { label: "场地魔法" }, field ? cardEl("spellTraps", field) : null), h(Slot, { label: `额外 ${board.extra.length}`, tall: false })),
          h("div", { className: "yg-zones" },
            h("div", { className: "yg-rowz emz" }, h("span", { className: "gap" }), emz(5), h("span", { className: "gap" }), emz(6), h("span", { className: "gap" })),
            h("div", { className: "yg-rowz mz" }, [0, 1, 2, 3, 4].map(mz)),
            h("div", { className: "yg-rowz sz" }, [0, 1, 2, 3, 4].map(sz))),
          h("div", { className: "yg-side" },
            h("div", { className: "yg-grave" }, h("span", { className: "yg-zt top" }, `墓地 ${board.grave.length}`),
              h(Slot, { label: "" }, topGrave ? h(Card, { rest, card: topGrave, dim: true, onClick: () => setGraveOpen(!graveOpen), selected: graveOpen }) : null)),
            h("div", { className: "yg-row" }, h(Slot, { label: `除外 ${board.banished.length}`, tall: false }), h(Slot, { label: `卡组 ${board.deck}`, tall: false })))),
        h("div", { className: "yg-handrow" }, h("span", { className: "yg-lab" }, `手牌 ${board.hand.length}`), board.hand.map((c) => cardEl("hand", c, { small: true })))),
      h("div", { className: "yg-detail" },
        info ? [
          h("div", { className: "yg-line", key: "t" }, h("span", { className: "yg-title" }, info.md), h("span", { className: "yg-chip on" }, info.role)),
          h("div", { className: "yg-ops", key: "o" }, legal.length
            ? legal.map((o, n) => h("button", { key: o.i, className: `yg-btn${n === 0 ? " primary" : ""}`, disabled: busy || !idle, onClick: () => send([o.i]) }, `${ACTION_LABEL[o.action]}${o.action === "activate" && legal.filter((x) => x.action === "activate").length > 1 ? ` · 效果 ${o.i + 1}` : ""}`))
            : h("span", { className: "yg-lab" }, idle ? "现在没有可做的操作" : "先回答上面的选择")),
          h("div", { className: "yg-facts", key: "f" },
            [["干什么", info.does], ["条件代价", info.cost], ["限制", info.limit, true]].map(([k, v, warn]) => h("div", { key: k, className: "yg-fact" }, h("span", { className: "yg-lab" }, k), h("span", { className: warn ? "yg-warn" : "" }, v)))),
        ] : h("p", { className: "yg-lab pad" }, "点手牌、场上或墓地的一张卡，看它现在能做什么，和它的角色、三件事。"),
        h("div", { className: "yg-final" },
          h("button", { className: "yg-btn ghost", disabled: true, title: "提示要等「最好场面搜索」做好才有（另一张票）；做好以后每用一次分数 ×0.8" }, "提示", h("span", { className: "yg-mono yg-lab" }, `分数 ×${HINT_FACTOR}`)),
          h("button", { className: "yg-btn solid", disabled: busy, onClick: end }, "结束回合"))),
    ),
    graveOpen ? h("div", { className: "yg-modal", role: "dialog", "aria-label": "墓地" },
      h("div", { className: "yg-prompt" }, h("div", { className: "yg-prompt-title" }, `墓地（${board.grave.length}）`),
        h("div", { className: "yg-opts" }, board.grave.map((c) => cardEl("grave", c))),
        h("div", { className: "yg-row" }, h("button", { className: "yg-btn", onClick: () => setGraveOpen(false) }, "关上")))) : null,
    prompt && prompt.kind !== "idle" && hand.status === "playing" ? h("div", { className: "yg-modal" }, h(PromptPanel, { rest, prompt, busy, send })) : null);
}

// ---- the small settlement shown for now: the full settlement screen is its own ticket ----
function Settled({ result, onAgain, onHome }) {
  return h("div", { className: "yg-home", "aria-label": "结算" },
    h("h2", null, "这一手结束了"),
    h("div", { className: "yg-grid4" }, [["总分", result.total], ["场面分", result.fieldScore], ["速度加成", result.speedCounted ? `+${result.speedBonus}` : "不计"], ["提示系数", `×${result.hintFactor}`]]
      .map(([k, v]) => h("div", { key: k, className: "yg-stat" }, h("span", { className: "yg-lab" }, k), h("span", { className: "yg-big-num yg-mono" }, v)))),
    h("p", { className: "yg-lab" }, "完整的结算屏（曲线、逐步对照）在另一张票里做。"),
    h("div", { className: "yg-row" }, h("button", { className: "yg-btn primary", onClick: onAgain }, "再来一手"), h("button", { className: "yg-btn", onClick: onHome }, "回首页")));
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

  const start = () => call(async () => { const v = await rest("/hand/start", { method: "POST", body: {} }); setHand(v); setResult(null); setScreen("play"); });
  const send = (indices) => call(async () => setHand(await rest("/hand/choose", { method: "POST", body: { indices } })));
  const end = () => call(async () => { const r = await rest("/hand/end", { method: "POST", body: {} }); setResult(r); setHand(null); setScreen("settled"); });

  const header = h("header", { className: "yg-head" }, h("h1", null, "游戏王"),
    h("nav", { className: "yg-tabs" }, TABS.map((t) => h("button", { key: t, className: `yg-tab${tab === t ? " on" : ""}`, onClick: () => { setTab(t); setScreen("home"); } }, t))));
  let main;
  if (screen === "play" && hand) main = h(Play, { rest, hand, cards, busy, send, end });
  else if (screen === "settled" && result) main = h(Settled, { result, onAgain: start, onHome: () => setScreen("home") });
  else if (tab !== "首页") main = h("div", { className: "yg-home" }, h("h2", null, tab), h("p", { className: "yg-lab" }, `「${tab}」还没做，在后面的票里。`));
  else main = h("div", { className: "yg-home", "aria-label": "首页" },
    h("h2", null, "计时赛"),
    h("p", { className: "yg-lab" }, "从烙印卡组随机发 5 张，先攻，自由展开；计时从发牌开始。"),
    h("div", { className: "yg-row" },
      h("button", { className: "yg-btn primary big", disabled: busy || !ready, onClick: start }, "开始一手"),
      hand ? h("button", { className: "yg-btn big", onClick: () => setScreen("play") }, "继续这一手") : null));
  return h("div", { className: "yg", "data-ready": ready ? "true" : "false" },
    screen === "play" ? null : header,
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
.yg-tabs { display: flex; gap: 6px; }
.yg-tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 12px; color: #bdbdbd; }
.yg-tab.on { color: #c8ff3d; border-color: #c8ff3d; }
.yg-error { border: 1px solid #ff9a6b; color: #ff9a6b; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; }
.yg-home { display: flex; flex-direction: column; gap: 16px; padding: 24px 4px; max-width: 640px; }
.yg-home h2 { font-size: 20px; }
.yg-grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.yg-stat { border: 1px solid #1f1f1f; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.yg-big-num { font-size: 28px; color: #c8ff3d; }
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
.yg-final .yg-btn { min-height: 46px; }
.yg-modal { position: absolute; inset: 0; background: rgba(0, 0, 0, .82); display: flex; align-items: center; justify-content: center; z-index: 5; }
.yg-prompt { background: #0b0b0b; border: 1px solid #3a3a3a; border-radius: 10px; padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; max-width: 900px; max-height: 90%; overflow: auto; align-items: center; }
.yg-prompt-title { font-size: 15px; font-weight: 600; }
.yg-opts { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; align-items: flex-start; }
.yg-opt { width: 88px; padding: 0; position: relative; background: none; border: 0; border-radius: 4px; height: 128px; margin-bottom: 44px; }
.yg-opt.sel { outline: 2px solid #c8ff3d; outline-offset: 2px; }
.yg-opt .yg-art { height: 128px; }
.yg-opt .yg-name { position: absolute; left: -6px; right: -6px; top: 132px; font-size: 11px; color: #d6d6d6; text-align: center; line-height: 1.3; }
.yg-opt .yg-sub { position: absolute; left: 0; right: 0; top: 168px; font-size: 10px; color: #c8ff3d; text-align: center; }
.yg-big { width: 120px; height: 175px; }
@media (max-width: 900px) { .yg-bottom { grid-template-columns: 1fr; } .yg-grid4 { grid-template-columns: repeat(2, 1fr); } }
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
